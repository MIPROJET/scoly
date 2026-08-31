-- Helper: detect trusted server-side calls
CREATE OR REPLACE FUNCTION public.is_service_request()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    (NULLIF(current_setting('request.jwt.claims', true), '')::json ->> 'role'),
    current_user
  ) IN ('service_role', 'postgres', 'supabase_admin');
$$;

REVOKE EXECUTE ON FUNCTION public.is_service_request() FROM anon, authenticated;

-- 1) article_purchases: clients may only create pending purchases at the real price
CREATE OR REPLACE FUNCTION public.guard_article_purchase_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_price numeric;
  v_premium boolean;
BEGIN
  IF public.is_service_request() OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT price, COALESCE(is_premium, false) INTO v_price, v_premium
  FROM public.articles WHERE id = NEW.article_id;

  IF NOT FOUND OR NOT v_premium OR COALESCE(v_price, 0) <= 0 THEN
    RAISE EXCEPTION 'Article is not purchasable';
  END IF;

  NEW.amount := v_price;
  NEW.status := 'pending';
  NEW.payment_id := NULL;
  NEW.purchased_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_article_purchase_insert ON public.article_purchases;
CREATE TRIGGER trg_guard_article_purchase_insert
BEFORE INSERT ON public.article_purchases
FOR EACH ROW EXECUTE FUNCTION public.guard_article_purchase_insert();

-- 2) coupon_redemptions: validate coupon, order ownership and discount amount
CREATE OR REPLACE FUNCTION public.guard_coupon_redemption_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  v_order_total numeric;
  v_expected numeric;
BEGIN
  IF public.is_service_request() OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  SELECT * INTO c FROM public.coupons WHERE id = NEW.coupon_id;
  IF NOT FOUND
     OR COALESCE(c.is_active, true) = false
     OR (c.valid_from IS NOT NULL AND c.valid_from > now())
     OR (c.valid_until IS NOT NULL AND c.valid_until < now())
     OR (c.max_uses IS NOT NULL AND COALESCE(c.used_count, 0) >= c.max_uses) THEN
    RAISE EXCEPTION 'Coupon is not usable';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.coupon_redemptions r
    WHERE r.coupon_id = NEW.coupon_id AND r.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Coupon already redeemed';
  END IF;

  IF NEW.order_id IS NULL THEN
    RAISE EXCEPTION 'Order is required';
  END IF;

  SELECT total_amount INTO v_order_total
  FROM public.orders WHERE id = NEW.order_id AND user_id = NEW.user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order does not belong to the user';
  END IF;

  v_expected := public.compute_coupon_discount(c.code, v_order_total);
  NEW.discount_amount := v_expected;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_coupon_redemption_insert ON public.coupon_redemptions;
CREATE TRIGGER trg_guard_coupon_redemption_insert
BEFORE INSERT ON public.coupon_redemptions
FOR EACH ROW EXECUTE FUNCTION public.guard_coupon_redemption_insert();

-- 3) loyalty_rewards: only the redeem RPC (SECURITY DEFINER) may create rewards
DROP POLICY IF EXISTS "Users can redeem rewards" ON public.loyalty_rewards;

CREATE OR REPLACE FUNCTION public.guard_loyalty_reward_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_service_request() OR public.has_role(auth.uid(), 'admin') THEN
    RETURN NEW;
  END IF;

  IF NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.reward_type IS DISTINCT FROM OLD.reward_type
     OR NEW.points_spent IS DISTINCT FROM OLD.points_spent
     OR NEW.coupon_code IS DISTINCT FROM OLD.coupon_code
     OR NEW.expires_at IS DISTINCT FROM OLD.expires_at THEN
    RAISE EXCEPTION 'Only reward usage can be updated';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_loyalty_reward_update ON public.loyalty_rewards;
CREATE TRIGGER trg_guard_loyalty_reward_update
BEFORE UPDATE ON public.loyalty_rewards
FOR EACH ROW EXECUTE FUNCTION public.guard_loyalty_reward_update();

-- 4) referrals: no self-referral, server-generated codes, one open code per user
CREATE UNIQUE INDEX IF NOT EXISTS referrals_referral_code_key
  ON public.referrals (referral_code);

CREATE OR REPLACE FUNCTION public.guard_referral_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_service_request()
     OR public.can_manage_module(auth.uid(), 'referrals', 'manage') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NULL OR NEW.referrer_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed';
  END IF;

  IF NEW.referred_id IS NOT NULL THEN
    RAISE EXCEPTION 'Referred user cannot be set by the referrer';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.referrals r
    WHERE r.referrer_id = NEW.referrer_id AND r.referred_id IS NULL
  ) THEN
    RAISE EXCEPTION 'An open referral code already exists';
  END IF;

  NEW.referral_code := public.generate_referral_code();
  NEW.status := 'pending';
  NEW.reward_given := false;
  NEW.completed_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_referral_insert ON public.referrals;
CREATE TRIGGER trg_guard_referral_insert
BEFORE INSERT ON public.referrals
FOR EACH ROW EXECUTE FUNCTION public.guard_referral_insert();

-- 5) Session revocation is handled by an edge function with the service role only
REVOKE EXECUTE ON FUNCTION public.revoke_blocked_session(uuid) FROM anon, authenticated;