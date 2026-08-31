-- 1) Archive table for heavy inline media
CREATE TABLE IF NOT EXISTS public.media_archive (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_id uuid NOT NULL,
  field text NOT NULL,
  payload text NOT NULL,
  byte_size integer NOT NULL DEFAULT 0,
  migrated_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.media_archive TO authenticated;
GRANT ALL ON public.media_archive TO service_role;

ALTER TABLE public.media_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage media archive" ON public.media_archive;
CREATE POLICY "Admins manage media archive"
  ON public.media_archive FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'super_admin'::app_role));

CREATE INDEX IF NOT EXISTS idx_media_archive_source ON public.media_archive(source_table, source_id);

-- 2) Offload advertisements base64 media
INSERT INTO public.media_archive (source_table, source_id, field, payload, byte_size)
SELECT 'advertisements', id, 'media_url', media_url, pg_column_size(media_url)
FROM public.advertisements
WHERE media_url LIKE 'data:%';

UPDATE public.advertisements SET media_url = NULL WHERE media_url LIKE 'data:%';

-- 3) Offload articles jsonb media containing base64
INSERT INTO public.media_archive (source_table, source_id, field, payload, byte_size)
SELECT 'articles', id, 'media', media::text, pg_column_size(media)
FROM public.articles
WHERE media IS NOT NULL AND media::text LIKE '%data:%';

UPDATE public.articles SET media = '[]'::jsonb
WHERE media IS NOT NULL AND media::text LIKE '%data:%';

-- 4) Guard: block new inline base64 payloads in hot tables
CREATE OR REPLACE FUNCTION public.block_inline_base64_media()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_txt text;
BEGIN
  IF TG_TABLE_NAME = 'advertisements' THEN
    v_txt := NEW.media_url;
  ELSIF TG_TABLE_NAME = 'articles' THEN
    v_txt := COALESCE(NEW.cover_image, '') || COALESCE(NEW.media::text, '');
  ELSIF TG_TABLE_NAME = 'products' THEN
    v_txt := COALESCE(NEW.image_url, '') || COALESCE(array_to_string(NEW.images, ','), '');
  ELSIF TG_TABLE_NAME = 'smart_kits' THEN
    v_txt := NEW.image_url;
  ELSIF TG_TABLE_NAME = 'categories' THEN
    v_txt := NEW.image_url;
  END IF;

  IF v_txt IS NOT NULL AND position('data:' in v_txt) > 0 AND length(v_txt) > 20000 THEN
    RAISE EXCEPTION 'Inline base64 media is not allowed (%): upload the file to Storage and store its URL instead.', TG_TABLE_NAME;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_inline_media ON public.advertisements;
CREATE TRIGGER trg_block_inline_media BEFORE INSERT OR UPDATE ON public.advertisements
FOR EACH ROW EXECUTE FUNCTION public.block_inline_base64_media();

DROP TRIGGER IF EXISTS trg_block_inline_media ON public.articles;
CREATE TRIGGER trg_block_inline_media BEFORE INSERT OR UPDATE ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.block_inline_base64_media();

DROP TRIGGER IF EXISTS trg_block_inline_media ON public.products;
CREATE TRIGGER trg_block_inline_media BEFORE INSERT OR UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.block_inline_base64_media();

DROP TRIGGER IF EXISTS trg_block_inline_media ON public.smart_kits;
CREATE TRIGGER trg_block_inline_media BEFORE INSERT OR UPDATE ON public.smart_kits
FOR EACH ROW EXECUTE FUNCTION public.block_inline_base64_media();

DROP TRIGGER IF EXISTS trg_block_inline_media ON public.categories;
CREATE TRIGGER trg_block_inline_media BEFORE INSERT OR UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.block_inline_base64_media();

-- 5) Extended automatic cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_data()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  DELETE FROM public.login_sessions WHERE created_at < now() - interval '30 days';
  DELETE FROM public.view_tracking WHERE viewed_at < now() - interval '24 hours';
  DELETE FROM public.rate_limits WHERE last_attempt_at < now() - interval '1 day' AND (blocked_until IS NULL OR blocked_until < now());
  DELETE FROM public.notifications WHERE is_read = true AND created_at < now() - interval '30 days';
  DELETE FROM public.audit_logs WHERE created_at < now() - interval '180 days';
  DELETE FROM public.email_logs WHERE created_at < now() - interval '90 days';
  DELETE FROM public.email_campaign_logs WHERE created_at < now() - interval '90 days';
  DELETE FROM public.sms_logs WHERE created_at < now() - interval '90 days';
  DELETE FROM public.security_access_log WHERE created_at < now() - interval '90 days';
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_data() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cleanup_expired_data() FROM anon;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_data() TO service_role;

-- 6) Daily automatic cleanup
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'scoly-daily-cleanup';
SELECT cron.schedule('scoly-daily-cleanup', '15 3 * * *', $$SELECT public.cleanup_expired_data();$$);