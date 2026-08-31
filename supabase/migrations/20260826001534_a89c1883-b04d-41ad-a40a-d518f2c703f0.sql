DROP POLICY IF EXISTS "Authenticated can view approved accessible content" ON public.educational_content;

CREATE POLICY "Authenticated can view approved content"
ON public.educational_content
FOR SELECT
TO authenticated
USING (is_approved = true);
