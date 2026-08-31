-- Public (anon) read access to non-sensitive school columns so kit listings can show school names
DROP POLICY IF EXISTS "Public can view validated schools" ON public.schools;
CREATE POLICY "Public can view validated schools"
ON public.schools FOR SELECT TO anon
USING (is_active = true AND is_verified = true);

GRANT SELECT (id, name, code, type, city, region, website, logo_url, is_verified, is_active, student_count, created_at, updated_at, admin_user_id) ON public.schools TO anon;
GRANT SELECT (id, name, code, type, city, region, website, logo_url, is_verified, is_active, student_count, created_at, updated_at, admin_user_id) ON public.schools TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.schools TO authenticated;
GRANT ALL ON public.schools TO service_role;