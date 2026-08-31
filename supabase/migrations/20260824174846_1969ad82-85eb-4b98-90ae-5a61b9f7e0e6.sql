-- 1) Column-level protection for school contact details
REVOKE SELECT ON public.schools FROM authenticated;
REVOKE SELECT ON public.schools FROM anon;

GRANT SELECT (
  id, name, code, type, city, region, website, logo_url,
  admin_user_id, is_verified, is_active, student_count,
  created_at, updated_at
) ON public.schools TO authenticated;

GRANT ALL ON public.schools TO service_role;
GRANT EXECUTE ON FUNCTION public.get_school_contact(uuid) TO authenticated;

-- 2) Lock down internal SECURITY DEFINER helpers (backend/service use only)
REVOKE EXECUTE ON FUNCTION public.schedule_email_retry(text, uuid, integer, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_email_provider_daily_stats() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scoly_suggest_category_id(text, text, text, text, text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.can_manage_module(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(uuid, text, text) FROM anon;
