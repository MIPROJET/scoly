REVOKE EXECUTE ON FUNCTION public.guard_article_purchase_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_coupon_redemption_insert() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_loyalty_reward_update() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_referral_insert() FROM anon, authenticated;