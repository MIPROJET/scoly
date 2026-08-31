CREATE OR REPLACE FUNCTION public.get_provider_quota_status()
 RETURNS TABLE(provider text, daily_limit integer, sent_today integer, failed_today integer, remaining integer, usage_pct numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'insufficient_privilege: admin role required';
  END IF;

  RETURN QUERY
  WITH limits(provider, daily_limit) AS (
    VALUES ('brevo'::text, 300), ('resend'::text, 100)
  ),
  today AS (
    SELECT s.provider, s.sent_count, s.failed_count
    FROM public.email_provider_daily_stats s
    WHERE s.stat_date = CURRENT_DATE
  )
  SELECT l.provider, l.daily_limit,
         COALESCE(t.sent_count, 0) AS sent_today,
         COALESCE(t.failed_count, 0) AS failed_today,
         GREATEST(l.daily_limit - COALESCE(t.sent_count, 0), 0) AS remaining,
         ROUND(LEAST(COALESCE(t.sent_count, 0)::numeric / l.daily_limit * 100, 100), 1) AS usage_pct
  FROM limits l
  LEFT JOIN today t ON t.provider = l.provider;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_provider_quota_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_quota_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_provider_quota_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_quota_status() TO service_role;

CREATE OR REPLACE FUNCTION public.get_email_provider_daily_stats()
 RETURNS TABLE(stat_date date, provider text, sent_count integer, failed_count integer, updated_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL
     OR NOT (public.has_role(auth.uid(), 'admin'::app_role)
             OR public.has_role(auth.uid(), 'super_admin'::app_role)) THEN
    RAISE EXCEPTION 'insufficient_privilege: admin role required';
  END IF;

  RETURN QUERY
  SELECT s.stat_date, s.provider, s.sent_count, s.failed_count, s.updated_at
  FROM public.email_provider_daily_stats s
  ORDER BY s.stat_date DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_email_provider_daily_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_provider_daily_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_email_provider_daily_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_provider_daily_stats() TO service_role;