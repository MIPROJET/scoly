CREATE OR REPLACE FUNCTION public.get_provider_quota_status()
RETURNS TABLE(provider text, daily_limit int, sent_today int, failed_today int, remaining int, usage_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH limits(provider, daily_limit) AS (
    VALUES ('brevo'::text, 300), ('resend'::text, 100)
  ),
  today AS (
    SELECT provider, sent_count, failed_count
    FROM public.email_provider_daily_stats
    WHERE stat_date = CURRENT_DATE
  )
  SELECT l.provider, l.daily_limit,
         COALESCE(t.sent_count, 0) AS sent_today,
         COALESCE(t.failed_count, 0) AS failed_today,
         GREATEST(l.daily_limit - COALESCE(t.sent_count, 0), 0) AS remaining,
         ROUND(LEAST(COALESCE(t.sent_count, 0)::numeric / l.daily_limit * 100, 100), 1) AS usage_pct
  FROM limits l
  LEFT JOIN today t ON t.provider = l.provider
  WHERE public.has_role(auth.uid(), 'admin'::app_role)
     OR public.has_role(auth.uid(), 'super_admin'::app_role);
$$;

REVOKE EXECUTE ON FUNCTION public.get_provider_quota_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_provider_quota_status() TO authenticated, service_role;