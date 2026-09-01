-- 1) article_purchases: amount must equal the article's current price
DROP POLICY IF EXISTS "Users can create pending article purchases" ON public.article_purchases;
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
    WHERE a.id = article_purchases.article_id
      AND COALESCE(a.is_premium, false) = true
      AND COALESCE(a.price, 0) > 0
      AND article_purchases.amount = a.price
  )
);

-- 2) orders: consolidate duplicate SELECT policies into one
DROP POLICY IF EXISTS "Orders visible to owner delivery or staff" ON public.orders;
DROP POLICY IF EXISTS "Orders readable by owner assigned delivery or staff" ON public.orders;
CREATE POLICY "Orders readable by owner assigned delivery or staff"
ON public.orders
FOR SELECT
TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    delivery_user_id = (SELECT auth.uid())
    AND assigned_at IS NOT NULL
    AND customer_confirmed_at IS NULL
    AND status <> ALL (ARRAY['delivered'::order_status, 'cancelled'::order_status])
    AND created_at > (now() - interval '30 days')
  )
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR has_role((SELECT auth.uid()), 'moderator'::app_role)
  OR has_role((SELECT auth.uid()), 'comptable'::app_role)
  OR has_role((SELECT auth.uid()), 'commercial'::app_role)
);

-- 3) order_items: single SELECT policy following parent order visibility
DROP POLICY IF EXISTS "Order items follow parent order visibility" ON public.order_items;
DROP POLICY IF EXISTS "Users can view their order items" ON public.order_items;
CREATE POLICY "Order items follow parent order visibility"
ON public.order_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.user_id = (SELECT auth.uid())
        OR (
          o.delivery_user_id = (SELECT auth.uid())
          AND o.assigned_at IS NOT NULL
          AND o.customer_confirmed_at IS NULL
          AND o.status <> ALL (ARRAY['delivered'::order_status, 'cancelled'::order_status])
          AND o.created_at > (now() - interval '30 days')
        )
        OR has_role((SELECT auth.uid()), 'admin'::app_role)
        OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
        OR has_role((SELECT auth.uid()), 'moderator'::app_role)
        OR has_role((SELECT auth.uid()), 'comptable'::app_role)
        OR has_role((SELECT auth.uid()), 'commercial'::app_role)
      )
  )
);

-- 4) payments: single SELECT policy for authenticated users
DROP POLICY IF EXISTS "Payments visible to owner or finance staff" ON public.payments;
DROP POLICY IF EXISTS "Users can view their own recent payments" ON public.payments;
CREATE POLICY "Payments readable by owner or finance staff"
ON public.payments
FOR SELECT
TO authenticated
USING (
  (user_id = (SELECT auth.uid()) AND created_at > (now() - interval '365 days'))
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR has_role((SELECT auth.uid()), 'comptable'::app_role)
);