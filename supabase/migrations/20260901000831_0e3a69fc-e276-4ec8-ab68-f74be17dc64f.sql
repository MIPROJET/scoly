-- 1. Orders: server-authoritative total_amount
CREATE OR REPLACE FUNCTION public.order_server_total(_order_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    COALESCE((SELECT SUM(oi.total_price) FROM public.order_items oi WHERE oi.order_id = _order_id), 0)
    - public.compute_coupon_discount(
        (SELECT o.coupon_code FROM public.orders o WHERE o.id = _order_id),
        COALESCE((SELECT SUM(oi.total_price) FROM public.order_items oi WHERE oi.order_id = _order_id), 0)
      ),
    0);
$$;

REVOKE ALL ON FUNCTION public.order_server_total(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.order_server_total(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.guard_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_subtotal numeric;
  v_is_privileged boolean;
BEGIN
  v_is_privileged := public.is_service_request()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'super_admin'::app_role);

  SELECT COALESCE(SUM(total_price), 0) INTO v_subtotal
    FROM public.order_items WHERE order_id = NEW.id;

  NEW.discount_amount := public.compute_coupon_discount(NEW.coupon_code, v_subtotal);

  IF v_is_privileged THEN
    -- Staff/service paths keep manual pricing flexibility (refunds, manual orders)
    IF v_subtotal > 0 AND TG_OP = 'UPDATE' AND NEW.total_amount IS NULL THEN
      NEW.total_amount := GREATEST(v_subtotal - COALESCE(NEW.discount_amount, 0), 0);
    END IF;
    RETURN NEW;
  END IF;

  -- Customer paths: the total is ALWAYS derived from the (server-priced) items.
  -- On INSERT there are no items yet, so the order starts at 0 and becomes
  -- payable only once items are inserted (recompute_order_total).
  NEW.total_amount := GREATEST(v_subtotal - COALESCE(NEW.discount_amount, 0), 0);
  RETURN NEW;
END;
$$;

-- Keep the after-items recompute authoritative for every caller
CREATE OR REPLACE FUNCTION public.recompute_order_total()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id UUID;
  v_order_user UUID;
  v_coupon TEXT;
  v_items_total NUMERIC;
  v_discount NUMERIC;
BEGIN
  v_order_id := COALESCE(NEW.order_id, OLD.order_id);
  SELECT user_id, coupon_code INTO v_order_user, v_coupon
    FROM public.orders WHERE id = v_order_id;

  IF v_order_user IS NULL THEN RETURN NULL; END IF;

  -- Only recompute for customer-driven changes; staff/service keep manual control
  IF public.is_service_request()
     OR public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'super_admin'::app_role) THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(total_price), 0) INTO v_items_total
    FROM public.order_items WHERE order_id = v_order_id;

  v_discount := public.compute_coupon_discount(v_coupon, v_items_total);

  UPDATE public.orders
     SET discount_amount = v_discount,
         total_amount = GREATEST(0, v_items_total - v_discount)
   WHERE id = v_order_id;
  RETURN NULL;
END;
$$;

-- 2. article_purchases: no client-declared paid purchases
DROP POLICY IF EXISTS "Users can create article purchases" ON public.article_purchases;
CREATE POLICY "Users can create pending article purchases"
ON public.article_purchases
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = user_id
  AND COALESCE(status, 'pending') = 'pending'
  AND payment_id IS NULL
  AND purchased_at IS NULL
  AND EXISTS (
    SELECT 1 FROM public.articles a
    WHERE a.id = article_id
      AND COALESCE(a.is_premium, false) = true
      AND COALESCE(a.price, 0) > 0
  )
);

-- 3. delivery_proofs: only for orders actually assigned to the delivery user
DROP POLICY IF EXISTS "Delivery users can create proofs" ON public.delivery_proofs;
CREATE POLICY "Delivery users can create proofs for assigned orders"
ON public.delivery_proofs
FOR INSERT
TO authenticated
WITH CHECK (
  (SELECT auth.uid()) = delivery_user_id
  AND EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_id
      AND o.delivery_user_id = (SELECT auth.uid())
      AND o.assigned_at IS NOT NULL
  )
);