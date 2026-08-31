-- Public directory data is served by the public_schools view (safe columns only).
-- Ensure the view is readable by everyone browsing the site.
GRANT SELECT ON public.public_schools TO anon;
GRANT SELECT ON public.public_schools TO authenticated;

-- Remove full-row read access (exposes email, phone, address) for anonymous
-- and regular authenticated users. Full details stay available to admins and
-- school owners via the remaining policies.
DROP POLICY IF EXISTS "Public can view validated schools" ON public.schools;
DROP POLICY IF EXISTS "Authenticated can view validated schools" ON public.schools;