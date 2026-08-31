-- 1. Storage: replace blanket all-bucket admin delete with public-media-scoped delete
DROP POLICY IF EXISTS "Admins can delete" ON storage.objects;
CREATE POLICY "Admins delete public media buckets"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = ANY (ARRAY['product-images','article-images','article-media','advertisement-media'])
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- 2. vendor_settings: restrictive owner/admin guard + drop anon grant
CREATE POLICY "Vendor settings owner or admin only"
ON public.vendor_settings AS RESTRICTIVE FOR ALL TO authenticated
USING (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role)
);
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.vendor_settings FROM anon;

-- 3. Realtime-published sensitive tables: permanent restrictive scoping
CREATE POLICY "Orders visible to owner delivery or staff"
ON public.orders AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR delivery_user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'moderator'::app_role)
  OR public.has_role(auth.uid(), 'comptable'::app_role)
  OR public.has_role(auth.uid(), 'commercial'::app_role)
);

CREATE POLICY "Order items follow parent order visibility"
ON public.order_items AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        o.user_id = auth.uid()
        OR o.delivery_user_id = auth.uid()
        OR public.has_role(auth.uid(), 'admin'::app_role)
        OR public.has_role(auth.uid(), 'super_admin'::app_role)
        OR public.has_role(auth.uid(), 'moderator'::app_role)
        OR public.has_role(auth.uid(), 'comptable'::app_role)
        OR public.has_role(auth.uid(), 'commercial'::app_role)
      )
  )
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Payments visible to owner or finance staff"
ON public.payments AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
  OR public.has_role(auth.uid(), 'comptable'::app_role)
);

CREATE POLICY "Notifications visible to recipient or admin"
ON public.notifications AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

CREATE POLICY "Internal messages visible to participants or admin"
ON public.internal_messages AS RESTRICTIVE FOR SELECT TO authenticated
USING (
  sender_id = auth.uid()
  OR recipient_id = auth.uid()
  OR public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'super_admin'::app_role)
);

-- Remove anonymous Data API / Realtime privileges on these sensitive tables
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.orders FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.order_items FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.payments FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.notifications FROM anon;
REVOKE SELECT, INSERT, UPDATE, DELETE ON public.internal_messages FROM anon;