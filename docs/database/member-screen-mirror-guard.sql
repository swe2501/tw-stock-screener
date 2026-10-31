-- APPLIED 2026-11-01 to bruqrbvbjxntgoljxsne after explicit user approval.
-- Live mirror guard and CAS tests passed inside a rolled-back transaction.
-- No bulk cleanup; removes verified mirrors only on future CAS writes.
begin;
create or replace function public.save_member_research_document(p_kind text,p_expected_revision bigint,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); current_revision bigint; saved public.member_research_documents%rowtype;
begin
  if u is null then raise exception 'MEMBER_VERIFY_REQUIRED'; end if;
  if p_kind is null or p_kind not in ('journal','journal_draft','research','workspace','workspace_draft','workspace_trash','feedback_draft','private_screen')
    or p_expected_revision is null or p_expected_revision<0
    or p_payload is null or jsonb_typeof(p_payload)<>'object'
    or octet_length(p_payload::text)>8388608 then raise exception 'MEMBER_INPUT_INVALID'; end if;
  -- Remove only proven identical server-backed mirrors. Legacy/unknown data stays.
  if p_kind='research' and jsonb_typeof(p_payload->'value')='object'
     and jsonb_typeof(p_payload->'value'->'screen_logs')='array' then
    p_payload:=jsonb_set(p_payload,'{value,screen_logs}',coalesce((
      select jsonb_agg(x.value order by x.ordinality)
      from jsonb_array_elements(p_payload->'value'->'screen_logs') with ordinality x
      where not exists(
        select 1 from public.member_screen_records r
        where r.user_id=u and r.id::text=x.value->>'id' and r.deleted_at is null
          and x.value->>'version'='2' and r.stocks=x.value->'stocks'
          and r.strategies=x.value->'strategies' and r.conditions=x.value->'conditions'
          and r.note=coalesce(x.value->>'note','')
          and r.record_date::text=x.value->>'record_date'
      )
    ),'[]'::jsonb));
  end if;
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

commit;
