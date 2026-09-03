DROP POLICY IF EXISTS "Authenticated can view approved content" ON public.educational_content;

CREATE POLICY "Authenticated can view free or purchased content"
ON public.educational_content
FOR SELECT
TO authenticated
USING (
  is_approved = true
  AND (
    COALESCE(is_free, false) = true
    OR author_id = (SELECT auth.uid())
    OR public.has_role((SELECT auth.uid()), 'admin'::app_role)
    OR public.has_role((SELECT auth.uid()), 'moderator'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.article_purchases ap
      WHERE ap.article_id = educational_content.id
        AND ap.user_id = (SELECT auth.uid())
        AND ap.status = 'completed'
    )
  )
);

-- Défense en profondeur : aucune ligne payante ne doit conserver de fichier en clair
UPDATE public.educational_content SET file_url = NULL
WHERE COALESCE(is_free, false) = false AND file_url IS NOT NULL;