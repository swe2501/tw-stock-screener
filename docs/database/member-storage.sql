-- DEPLOYED 2026-10-16 to bruqrbvbjxntgoljxsne after explicit shared-PRODUCTION approval.
-- Initial migration: do not rerun against existing objects. See docs/member-db-status.md for verification.
-- Member-owned avatar writes and private trading screenshots. Review existing
-- buckets/policies first; never change an existing bucket's visibility here.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('member-avatars','member-avatars',true,5242880,array['image/webp'])
on conflict(id) do nothing;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('member-trade-images','member-trade-images',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do nothing;
do $$ begin
  if exists(select 1 from storage.buckets where id='member-trade-images' and public) then
    raise exception 'member-trade-images must be private; existing visibility requires review';
  end if;
end $$;
create policy member_avatar_insert_own on storage.objects for insert to authenticated
with check(bucket_id='member-avatars' and name=(select auth.uid())::text||'/avatar.webp');
create policy member_avatar_update_own on storage.objects for update to authenticated
using(bucket_id='member-avatars' and name=(select auth.uid())::text||'/avatar.webp')
with check(bucket_id='member-avatars' and name=(select auth.uid())::text||'/avatar.webp');
create policy member_avatar_read_own on storage.objects for select to authenticated
using(bucket_id='member-avatars' and name=(select auth.uid())::text||'/avatar.webp');
create policy member_trade_image_read_own on storage.objects for select to authenticated
using(bucket_id='member-trade-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy member_trade_image_insert_own on storage.objects for insert to authenticated
with check(bucket_id='member-trade-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy member_trade_image_update_own on storage.objects for update to authenticated
using(bucket_id='member-trade-images' and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='member-trade-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy member_trade_image_delete_own on storage.objects for delete to authenticated
using(bucket_id='member-trade-images' and (storage.foldername(name))[1]=(select auth.uid())::text);
commit;
