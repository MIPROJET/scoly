-- 1) Storage: exclude advertisement-media from broad user policies
DROP POLICY IF EXISTS "Users can upload to their own folder" ON storage.objects;
CREATE POLICY "Users can upload to their own folder"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND bucket_id = ANY (ARRAY['product-images','article-images','article-media'])
  AND (
    (storage.foldername(name))[1] = (auth.uid())::text
    OR public.has_role(auth.uid(), 'admin'::app_role)
  )
);

DROP POLICY IF EXISTS "Users can update their own files" ON storage.objects;
CREATE POLICY "Users can update their own files"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = ANY (ARRAY['product-images','article-images','article-media'])
  AND (owner = auth.uid() OR (storage.foldername(name))[1] = (auth.uid())::text OR public.has_role(auth.uid(),'admin'::app_role))
)
WITH CHECK (
  bucket_id = ANY (ARRAY['product-images','article-images','article-media'])
  AND (owner = auth.uid() OR (storage.foldername(name))[1] = (auth.uid())::text OR public.has_role(auth.uid(),'admin'::app_role))
);

-- Admin-only update/delete for advertisement-media
DROP POLICY IF EXISTS "Admins update advertisement-media" ON storage.objects;
CREATE POLICY "Admins update advertisement-media"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'advertisement-media' AND public.has_role(auth.uid(),'admin'::app_role))
WITH CHECK (bucket_id = 'advertisement-media' AND public.has_role(auth.uid(),'admin'::app_role));

DROP POLICY IF EXISTS "Admins delete advertisement-media" ON storage.objects;
CREATE POLICY "Admins delete advertisement-media"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'advertisement-media' AND public.has_role(auth.uid(),'admin'::app_role));

-- 2) article_share_counts: writes only through SECURITY DEFINER RPC
REVOKE INSERT, UPDATE, DELETE ON public.article_share_counts FROM anon, authenticated;
GRANT SELECT ON public.article_share_counts TO anon, authenticated;
GRANT ALL ON public.article_share_counts TO service_role;

-- 3) Revoke anon EXECUTE on SECURITY DEFINER functions that are not public entry points
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'execute')
      AND p.proname NOT IN (
        'confirm_newsletter_subscription','unsubscribe_newsletter','get_article_content',
        'get_educational_content_file_url','get_resource_file_url',
        'increment_article_views','increment_product_views','has_role'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
  END LOOP;
END $$;

-- Ensure PUBLIC cannot execute privileged definer functions
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
  END LOOP;
END $$;

-- Re-grant the intended public entry points
GRANT EXECUTE ON FUNCTION public.confirm_newsletter_subscription(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_article_content(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_educational_content_file_url(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_resource_file_url(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO anon, authenticated;
