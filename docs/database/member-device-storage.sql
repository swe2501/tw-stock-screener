-- Apply after member-device-policy.sql; existing bucket ownership policies remain.
-- The device gate is inactive while the shared policy switch is disabled.
begin;
create function public.member_device_storage_allowed() returns boolean
language plpgsql stable security invoker set search_path='' as $$
begin
 perform public.member_device_require();
 return true;
end $$;
revoke all on function public.member_device_storage_allowed() from public,anon;
grant execute on function public.member_device_storage_allowed() to authenticated;
create policy member_device_storage_admission on storage.objects
as restrictive for all to authenticated
using (bucket_id not in ('member-trade-images','member-avatars') or (select public.member_device_storage_allowed()))
with check (bucket_id not in ('member-trade-images','member-avatars') or (select public.member_device_storage_allowed()));
commit;
