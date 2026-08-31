-- =========================
-- 1. VISITS
-- =========================
CREATE TABLE IF NOT EXISTS public.visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text NOT NULL,
  path text NOT NULL DEFAULT '/',
  referrer text,
  country_code text,
  country_name text,
  continent text,
  region text,
  city text,
  device_type text,
  browser text,
  language text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.visits TO authenticated;
GRANT ALL ON public.visits TO service_role;

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can read visits" ON public.visits;
CREATE POLICY "Staff can read visits"
ON public.visits FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'super_admin')
  OR public.has_role(auth.uid(), 'moderator')
);

CREATE INDEX IF NOT EXISTS idx_visits_created_at ON public.visits (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_visits_country ON public.visits (country_code);
CREATE INDEX IF NOT EXISTS idx_visits_path ON public.visits (path);
CREATE INDEX IF NOT EXISTS idx_visits_session ON public.visits (session_id);

-- =========================
-- 2. SITE COUNTERS (seeded at 3897)
-- =========================
CREATE TABLE IF NOT EXISTS public.site_counters (
  key text PRIMARY KEY,
  value bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.site_counters TO anon, authenticated;
GRANT ALL ON public.site_counters TO service_role;

ALTER TABLE public.site_counters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Counters are publicly readable" ON public.site_counters;
CREATE POLICY "Counters are publicly readable"
ON public.site_counters FOR SELECT TO anon, authenticated USING (true);

INSERT INTO public.site_counters (key, value)
VALUES ('total_visits', 3897)
ON CONFLICT (key) DO NOTHING;

-- =========================
-- 3. RECORD VISIT
-- =========================
CREATE OR REPLACE FUNCTION public.record_visit(
  _session_id text,
  _path text,
  _referrer text DEFAULT NULL,
  _country_code text DEFAULT NULL,
  _country_name text DEFAULT NULL,
  _continent text DEFAULT NULL,
  _region text DEFAULT NULL,
  _city text DEFAULT NULL,
  _device_type text DEFAULT NULL,
  _browser text DEFAULT NULL,
  _language text DEFAULT NULL,
  _user_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _total bigint;
  _is_new boolean;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM public.visits
    WHERE session_id = _session_id
      AND created_at > now() - interval '30 minutes'
  ) INTO _is_new;

  INSERT INTO public.visits (
    session_id, path, referrer, country_code, country_name, continent,
    region, city, device_type, browser, language, user_id
  ) VALUES (
    _session_id, COALESCE(_path, '/'), _referrer, _country_code, _country_name, _continent,
    _region, _city, _device_type, _browser, _language, _user_id
  );

  IF _is_new THEN
    UPDATE public.site_counters
      SET value = value + 1, updated_at = now()
      WHERE key = 'total_visits'
      RETURNING value INTO _total;
  ELSE
    SELECT value INTO _total FROM public.site_counters WHERE key = 'total_visits';
  END IF;

  RETURN COALESCE(_total, 3897);
END;
$$;

REVOKE ALL ON FUNCTION public.record_visit(text,text,text,text,text,text,text,text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_visit(text,text,text,text,text,text,text,text,text,text,text,uuid) TO service_role;

-- =========================
-- 4. TRAFFIC STATS
-- =========================
CREATE OR REPLACE FUNCTION public.get_traffic_overview(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _from timestamptz := now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1));
  _result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'super_admin')
    OR public.has_role(auth.uid(), 'moderator')
  ) THEN
    RAISE EXCEPTION 'Accès refusé';
  END IF;

  SELECT jsonb_build_object(
    'total_counter', (SELECT value FROM public.site_counters WHERE key = 'total_visits'),
    'page_views', (SELECT count(*) FROM public.visits WHERE created_at >= _from),
    'unique_visitors', (SELECT count(DISTINCT session_id) FROM public.visits WHERE created_at >= _from),
    'countries_count', (SELECT count(DISTINCT country_code) FROM public.visits WHERE created_at >= _from AND country_code IS NOT NULL),
    'by_day', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT date_trunc('day', created_at)::date AS day,
               count(*) AS views,
               count(DISTINCT session_id) AS visitors
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 1
      ) t), '[]'::jsonb),
    'by_country', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(country_name, 'Inconnu') AS country,
               country_code, count(*) AS views,
               count(DISTINCT session_id) AS visitors
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50
      ) t), '[]'::jsonb),
    'by_continent', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(continent, 'Inconnu') AS continent, count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC
      ) t), '[]'::jsonb),
    'by_city', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(city, 'Inconnu') AS city,
               COALESCE(country_name, '') AS country,
               count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 50
      ) t), '[]'::jsonb),
    'by_page', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT path, count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC LIMIT 25
      ) t), '[]'::jsonb),
    'by_device', COALESCE((
      SELECT jsonb_agg(t) FROM (
        SELECT COALESCE(device_type, 'inconnu') AS device, count(*) AS views
        FROM public.visits WHERE created_at >= _from
        GROUP BY 1 ORDER BY 2 DESC
      ) t), '[]'::jsonb)
  ) INTO _result;

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_traffic_overview(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_traffic_overview(integer) TO authenticated, service_role;

-- =========================
-- 5. SMS LOGS: channel + country
-- =========================
ALTER TABLE public.sms_logs
  ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'sms',
  ADD COLUMN IF NOT EXISTS country_code text,
  ADD COLUMN IF NOT EXISTS dial_code text,
  ADD COLUMN IF NOT EXISTS order_id uuid;

CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON public.sms_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_logs_order ON public.sms_logs (order_id);

-- =========================
-- 6. PERFORMANCE INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user ON public.orders (user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (status);
CREATE INDEX IF NOT EXISTS idx_orders_delivery_user ON public.orders (delivery_user_id);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_products_active_created ON public.products (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products (category_id);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products (is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON public.payments (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_user ON public.payments (user_id);
CREATE INDEX IF NOT EXISTS idx_articles_status_published ON public.articles (status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON public.notifications (user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_logs_created_at ON public.email_logs (created_at DESC);