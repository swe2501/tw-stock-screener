-- REVIEW / ISOLATED STAGING FIRST. NOT applied to any database by Codex.
-- Personal research storage only; never use these payloads to grant benefits/points.
begin;
create table public.member_research_documents (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check(kind in ('journal','research','private_screen')),
  revision bigint not null default 1 check(revision>0),
  payload jsonb not null check(jsonb_typeof(payload)='object' and octet_length(payload::text)<=8388608),
  updated_at timestamptz not null default now(),
  primary key(user_id,kind)
);
alter table public.member_research_documents enable row level security;
revoke all on public.member_research_documents from public,anon,authenticated;
grant select,delete on public.member_research_documents to authenticated;
grant all on public.member_research_documents to service_role;
create policy member_read_own on public.member_research_documents for select to authenticated
  using (user_id=(select auth.uid()));
create policy member_delete_own on public.member_research_documents for delete to authenticated
  using (user_id=(select auth.uid()));

-- Optimistic concurrency: expected revision 0 creates a document; conflicts are
-- explicit. Caller must fetch and resolve; never automatically overwrite with
-- whichever device last reconnects. No caller-supplied owner ID is accepted.
create function public.save_member_research_document(p_kind text,p_expected_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); current_revision bigint; saved public.member_research_documents%rowtype;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('journal','research','private_screen')
    or p_expected_revision is null or p_expected_revision<0
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>8388608 then raise exception 'MEMBER_INPUT_INVALID'; end if;
  perform pg_advisory_xact_lock(hashtextextended('research-document:'||u::text||':'||p_kind,0));
  select revision into current_revision from public.member_research_documents
    where user_id=u and kind=p_kind for update;
  if coalesce(current_revision,0)<>p_expected_revision then
    raise exception 'MEMBER_DOCUMENT_CONFLICT';
  end if;
  if current_revision is null then
    insert into public.member_research_documents(user_id,kind,revision,payload)
      values(u,p_kind,1,p_payload) returning * into saved;
  else
    update public.member_research_documents set revision=revision+1,payload=p_payload,updated_at=now()
      where user_id=u and kind=p_kind returning * into saved;
  end if;
  return jsonb_build_object('kind',saved.kind,'revision',saved.revision,'updated_at',saved.updated_at);
end $$;
revoke all on function public.save_member_research_document(text,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_member_research_document(text,bigint,jsonb) to authenticated;
commit;
-- This draft alone does not enable cloud sync. Frontend migration/conflict UI,
-- offline queue, account-switch cancellation, private image storage and isolated
-- two-user/two-device RLS tests remain prerequisites. No localStorage auto-upload.
