-- 1) ORDERS: consolidate permissive SELECT policies into one
DROP POLICY IF EXISTS "Users can view their own orders" ON public.orders;
DROP POLICY IF EXISTS "Moderators can view all orders" ON public.orders;
DROP POLICY IF EXISTS "Delivery users can view active assigned orders" ON public.orders;
DROP POLICY IF EXISTS "Anon cannot access orders" ON public.orders;

CREATE POLICY "Orders readable by owner assigned delivery or staff"
ON public.orders FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (
    delivery_user_id = (SELECT auth.uid())
    AND assigned_at IS NOT NULL
    AND customer_confirmed_at IS NULL
    AND status <> ALL (ARRAY['delivered'::order_status, 'cancelled'::order_status])
    AND created_at > (now() - interval '30 days')
  )
  OR has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
  OR has_role((SELECT auth.uid()), 'moderator'::app_role)
  OR has_role((SELECT auth.uid()), 'comptable'::app_role)
  OR has_role((SELECT auth.uid()), 'commercial'::app_role)
);

REVOKE ALL ON public.orders FROM anon;

-- 2) EMAIL CAMPAIGN LOGS: admin/super_admin only, no anon reach
DROP POLICY IF EXISTS "Admins view logs" ON public.email_campaign_logs;
DROP POLICY IF EXISTS "Restrict email_campaign_logs read to admins" ON public.email_campaign_logs;

CREATE POLICY "Admins view campaign logs"
ON public.email_campaign_logs FOR SELECT TO authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
);

CREATE POLICY "Restrict campaign logs to admins"
ON public.email_campaign_logs AS RESTRICTIVE FOR ALL TO anon, authenticated
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role)
  OR has_role((SELECT auth.uid()), 'super_admin'::app_role)
)
WITH CHECK (false);

REVOKE ALL ON public.email_campaign_logs FROM anon;

-- 3) STORAGE product-sources: verify real vendor ownership, not only folder name
DROP POLICY IF EXISTS "Vendors can read their own product-sources files" ON storage.objects;

CREATE POLICY "Vendors read own product-sources files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-sources'
  AND (storage.foldername(name))[1] = (auth.uid())::text
  AND owner = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.vendor_settings vs WHERE vs.user_id = auth.uid()
  )
);

-- 4) REALTIME: remove shared announcements topic, private topics only
DROP POLICY IF EXISTS "Users read own or global realtime topics" ON realtime.messages;

CREATE POLICY "Users read only their own realtime topic"
ON realtime.messages FOR SELECT TO authenticated
USING (realtime.topic() = ('private:' || (auth.uid())::text));