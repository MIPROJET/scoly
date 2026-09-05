-- Admin view of every referent: orders, balance and activity history, with a date filter.
CREATE OR REPLACE FUNCTION public.get_referents_overview(_from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS TABLE(
  user_id uuid,
  full_name text,
  email text,
  phone text,
  created_at timestamptz,
  school_name text,
  city text,
  zone_name text,
  orders_count integer,
  orders_amount numeric,
  referrals_count integer,
  total_earned numeric,
  total_withdrawn numeric,
  available_balance numeric,
  last_activity_at timestamptz
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from timestamptz := COALESCE(_from, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE(_to, 'infinity'::timestamptz);
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'super_admin'::app_role)
       OR public.has_role(auth.uid(),'commercial'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  RETURN QUERY
  WITH refs AS (
    SELECT DISTINCT ur.user_id AS uid FROM public.user_roles ur WHERE ur.role = 'referent'::app_role
  ),
  attributed AS (
    SELECT r.uid, o.id AS order_id, o.total_amount, o.created_at
    FROM refs r
    JOIN public.orders o
      ON o.user_id = r.uid
      OR o.user_id IN (SELECT rf.referred_id FROM public.referrals rf WHERE rf.referrer_id = r.uid AND rf.referred_id IS NOT NULL)
    WHERE o.created_at >= v_from AND o.created_at <= v_to
  )
  SELECT
    r.uid,
    NULLIF(TRIM(COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'')), '') AS full_name,
    p.email,
    p.phone,
    p.created_at,
    s.name AS school_name,
    s.city AS city,
    z.name AS zone_name,
    COALESCE((SELECT COUNT(*)::int FROM attributed a WHERE a.uid = r.uid), 0),
    COALESCE((SELECT SUM(a.total_amount) FROM attributed a WHERE a.uid = r.uid), 0),
    COALESCE((SELECT COUNT(*)::int FROM public.referrals rf WHERE rf.referrer_id = r.uid AND rf.created_at >= v_from AND rf.created_at <= v_to), 0),
    COALESCE((SELECT SUM(c.commission_amount) FROM public.commissions c WHERE c.vendor_id = r.uid AND c.status = 'paid' AND c.created_at >= v_from AND c.created_at <= v_to), 0)
      + COALESCE((SELECT SUM(rr.amount) FROM public.referral_rewards rr WHERE rr.user_id = r.uid AND rr.created_at >= v_from AND rr.created_at <= v_to), 0),
    COALESCE((SELECT SUM(w.amount) FROM public.withdrawal_requests w WHERE w.user_id = r.uid AND w.status IN ('paid','processing','validated')), 0),
    GREATEST(
      COALESCE((SELECT SUM(c.commission_amount) FROM public.commissions c WHERE c.vendor_id = r.uid AND c.status = 'paid'), 0)
      + COALESCE((SELECT SUM(rr.amount) FROM public.referral_rewards rr WHERE rr.user_id = r.uid), 0)
      - COALESCE((SELECT SUM(w.amount) FROM public.withdrawal_requests w WHERE w.user_id = r.uid AND w.status IN ('paid','processing','validated')), 0),
      0),
    GREATEST(
      COALESCE((SELECT MAX(a.created_at) FROM attributed a WHERE a.uid = r.uid), '-infinity'::timestamptz),
      COALESCE((SELECT MAX(al.created_at) FROM public.audit_logs al WHERE al.user_id = r.uid), '-infinity'::timestamptz)
    )
  FROM refs r
  LEFT JOIN public.profiles p ON p.id = r.uid
  LEFT JOIN public.schools s ON s.admin_user_id = r.uid
  LEFT JOIN public.commercial_zones cz ON cz.user_id = r.uid
  LEFT JOIN public.zones z ON z.id = cz.zone_id
  ORDER BY 2 NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION public.get_referents_overview(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referents_overview(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_referent_detail(_referent_id uuid, _from timestamptz DEFAULT NULL, _to timestamptz DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_from timestamptz := COALESCE(_from, '-infinity'::timestamptz);
  v_to   timestamptz := COALESCE(_to, 'infinity'::timestamptz);
  v_orders jsonb;
  v_activities jsonb;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT (public.has_role(auth.uid(),'admin'::app_role)
       OR public.has_role(auth.uid(),'super_admin'::app_role)
       OR public.has_role(auth.uid(),'commercial'::app_role)) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_orders
  FROM (
    SELECT jsonb_build_object(
      'id', o.id,
      'reference', UPPER(SUBSTRING(o.id::text, 1, 8)),
      'total_amount', o.total_amount,
      'status', o.status,
      'payment_method', o.payment_method,
      'created_at', o.created_at,
      'is_own', (o.user_id = _referent_id)
    ) AS x
    FROM public.orders o
    WHERE (o.user_id = _referent_id
        OR o.user_id IN (SELECT rf.referred_id FROM public.referrals rf WHERE rf.referrer_id = _referent_id AND rf.referred_id IS NOT NULL))
      AND o.created_at >= v_from AND o.created_at <= v_to
    LIMIT 500
  ) t;

  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'created_at' DESC), '[]'::jsonb) INTO v_activities
  FROM (
    SELECT jsonb_build_object('type','audit','label', al.action || ' — ' || al.entity_type, 'amount', NULL, 'created_at', al.created_at) AS x
    FROM public.audit_logs al
    WHERE al.user_id = _referent_id AND al.created_at >= v_from AND al.created_at <= v_to
    UNION ALL
    SELECT jsonb_build_object('type','referral','label','Parrainage ' || COALESCE(rf.status,'pending'), 'amount', NULL, 'created_at', rf.created_at)
    FROM public.referrals rf
    WHERE rf.referrer_id = _referent_id AND rf.created_at >= v_from AND rf.created_at <= v_to
    UNION ALL
    SELECT jsonb_build_object('type','reward','label','Récompense ' || rr.reward_type, 'amount', rr.amount, 'created_at', rr.created_at)
    FROM public.referral_rewards rr
    WHERE rr.user_id = _referent_id AND rr.created_at >= v_from AND rr.created_at <= v_to
    UNION ALL
    SELECT jsonb_build_object('type','withdrawal','label','Retrait ' || w.status, 'amount', w.amount, 'created_at', w.created_at)
    FROM public.withdrawal_requests w
    WHERE w.user_id = _referent_id AND w.created_at >= v_from AND w.created_at <= v_to
    UNION ALL
    SELECT jsonb_build_object('type','commission','label','Commission ' || c.status, 'amount', c.commission_amount, 'created_at', c.created_at)
    FROM public.commissions c
    WHERE c.vendor_id = _referent_id AND c.created_at >= v_from AND c.created_at <= v_to
    LIMIT 500
  ) t;

  RETURN jsonb_build_object('orders', v_orders, 'activities', v_activities);
END;
$$;

REVOKE ALL ON FUNCTION public.get_referent_detail(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_referent_detail(uuid, timestamptz, timestamptz) TO authenticated;

-- Performance: indexes supporting the referent views and the traffic dashboard.
CREATE INDEX IF NOT EXISTS idx_orders_user_created ON public.orders (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals (referrer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created ON public.audit_logs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_withdrawal_user ON public.withdrawal_requests (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON public.referral_rewards (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_created ON public.visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_active_created ON public.products (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON public.user_roles (role, user_id);