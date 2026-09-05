-- Single cached counter endpoint for the public homepage (replaces ~8 count queries per visit).
CREATE OR REPLACE FUNCTION public.get_public_counters()
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'products', (SELECT COUNT(*) FROM public.products WHERE is_active = true),
    'articles', (SELECT COUNT(*) FROM public.articles WHERE status = 'published'),
    'profiles', (SELECT COUNT(*) FROM public.profiles),
    'resources', (SELECT COUNT(*) FROM public.resources),
    'partners', (SELECT COUNT(*) FROM public.vendor_settings WHERE is_verified = true),
    'schools', (SELECT COUNT(*) FROM public.schools WHERE is_active = true)
  );
$$;

REVOKE ALL ON FUNCTION public.get_public_counters() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_counters() TO anon, authenticated;

-- Indexes supporting those counters and the catalogue listing.
CREATE INDEX IF NOT EXISTS idx_articles_status_published ON public.articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products (category_id, is_active);
CREATE INDEX IF NOT EXISTS idx_vendor_settings_verified ON public.vendor_settings (is_verified);