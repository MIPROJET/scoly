CREATE INDEX IF NOT EXISTS idx_articles_status_published_at ON public.articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_status_views ON public.articles (status, views DESC);
CREATE INDEX IF NOT EXISTS idx_products_active_created ON public.products (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_ads_active_priority ON public.advertisements (is_active, priority DESC);
CREATE INDEX IF NOT EXISTS idx_smart_kits_active_status_created ON public.smart_kits (is_active, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_smart_kit_items_kit ON public.smart_kit_items (kit_id);