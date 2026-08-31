
drop policy if exists "Authors manage premium article media" on storage.objects;
create policy "Authors manage premium article media"
on storage.objects for all to authenticated
using (
  bucket_id = 'article-premium-media'
  and (owner = auth.uid() or public.has_role(auth.uid(), 'admin'))
)
with check (
  bucket_id = 'article-premium-media'
  and (owner = auth.uid() or public.has_role(auth.uid(), 'admin'))
);

drop policy if exists "Users can update their notifications" on public.notifications;
create policy "Users can update their notifications"
on public.notifications for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
