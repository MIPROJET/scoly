-- 1) product-sources : forcer la convention dossier = uid pour toute écriture non-admin
DROP POLICY IF EXISTS "product-sources folder ownership" ON storage.objects;
CREATE POLICY "product-sources folder ownership"
ON storage.objects
AS RESTRICTIVE
FOR ALL
TO authenticated
USING (
  bucket_id <> 'product-sources'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR ((storage.foldername(name))[1] = (auth.uid())::text AND owner = auth.uid())
)
WITH CHECK (
  bucket_id <> 'product-sources'
  OR has_role(auth.uid(), 'admin'::app_role)
  OR ((storage.foldername(name))[1] = (auth.uid())::text AND owner = auth.uid())
);

-- 2) referent_applications : retirer l'accès large des modérateurs aux données personnelles
DROP POLICY IF EXISTS "Staff can read applications" ON public.referent_applications;
CREATE POLICY "Staff can read applications"
ON public.referent_applications
FOR SELECT
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR submitted_by = (SELECT auth.uid())
  OR assigned_commercial_id = (SELECT auth.uid())
  OR sponsor_referent_id = (SELECT auth.uid())
);

DROP POLICY IF EXISTS "Staff can update applications" ON public.referent_applications;
CREATE POLICY "Staff can update applications"
ON public.referent_applications
FOR UPDATE
TO authenticated
USING (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR assigned_commercial_id = (SELECT auth.uid())
  OR (submitted_by = (SELECT auth.uid()) AND status = ANY (ARRAY['pending'::text, 'rejected'::text]))
)
WITH CHECK (
  has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR assigned_commercial_id = (SELECT auth.uid())
  OR (submitted_by = (SELECT auth.uid()) AND status = ANY (ARRAY['pending'::text, 'submitted'::text, 'rejected'::text]))
);