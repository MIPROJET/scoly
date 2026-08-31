-- 1) Tighten SELECT policy on educational_content for authenticated users
DROP POLICY IF EXISTS "Authenticated can view approved content" ON public.educational_content;

CREATE POLICY "Authenticated can view approved accessible content"
ON public.educational_content
FOR SELECT
TO authenticated
USING (
  is_approved = true
  AND (
    COALESCE(is_free, false) = true
    OR author_id = auth.uid()
    OR public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.article_purchases ap
      WHERE ap.article_id = educational_content.id
        AND ap.user_id = auth.uid()
        AND ap.status = 'completed'
    )
  )
);

-- 2) Remove direct API read access to file_url; use get_educational_content_file_url()
REVOKE SELECT ON public.educational_content FROM anon, authenticated;

GRANT SELECT (
  id, author_id, title, description, content_type, subject, grade_level,
  preview_url, price, is_free, is_approved, downloads, rating_avg, rating_count,
  created_at, updated_at
) ON public.educational_content TO anon, authenticated;

GRANT INSERT, UPDATE, DELETE ON public.educational_content TO authenticated;
GRANT ALL ON public.educational_content TO service_role;
