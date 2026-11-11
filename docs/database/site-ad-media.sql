-- PREPARED ONLY. Requires approval before application to the shared project.
-- Public marketing assets only. Upload grants are issued by the authenticated admin API.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('site-ad-media','site-ad-media',true,31457280,
       array['image/jpeg','image/png','image/webp','video/mp4'])
on conflict(id) do update set public=excluded.public,
 file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- Deliberately no anon/authenticated write policy. The admin API signs new random paths.
commit;
