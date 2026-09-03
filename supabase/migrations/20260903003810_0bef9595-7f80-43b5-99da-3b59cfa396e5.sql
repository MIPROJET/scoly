-- Le catalogue doit rester consultable (achat possible) ; la protection porte sur le fichier.
DROP POLICY IF EXISTS "Authenticated can view free or purchased content" ON public.educational_content;

CREATE POLICY "Authenticated can browse approved content"
ON public.educational_content
FOR SELECT
TO authenticated
USING (is_approved = true);

-- Garantie stricte : un contenu payant ne peut jamais stocker son fichier ici
ALTER TABLE public.educational_content
  ADD CONSTRAINT educational_content_paid_file_hidden
  CHECK (file_url IS NULL OR COALESCE(is_free, false) = true);