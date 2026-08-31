
-- 1) Coupons: remove broad read access
DROP POLICY IF EXISTS "Authenticated can view active coupons" ON public.coupons;

-- Server-side helper so checkout can still count a redemption without reading the table
CREATE OR REPLACE FUNCTION public.increment_coupon_usage(_coupon_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  UPDATE public.coupons
  SET used_count = COALESCE(used_count, 0) + 1
  WHERE id = _coupon_id AND is_active = true;

  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_coupon_usage(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_coupon_usage(uuid) TO authenticated;

-- 2) Moderator notes: internal staff only
DROP POLICY IF EXISTS "Vendors can view notes on their products" ON public.moderator_notes;

-- 3) Reduce SECURITY DEFINER exposure to API roles
REVOKE EXECUTE ON FUNCTION public.compute_coupon_discount(text, numeric) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_traffic_overview(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_admin_stats() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_school_contact(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_article_content(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_resource_file_url(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_educational_content_file_url(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.validate_coupon(text, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_password_strength(text) FROM anon, authenticated;
