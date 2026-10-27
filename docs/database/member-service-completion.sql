-- PREPARED ONLY: requires separate approval for the shared Taiwan stock2 database.
-- After member-ai-points, research-documents, learning-verification and task-bulk-claim.
-- No administrator is assigned, no campaign/payment/AI switch is enabled.
begin;
create table if not exists public.member_service_admins(
 user_id uuid primary key references auth.users(id), scopes text[] not null default '{}',active boolean not null default false,
 check(scopes<@array['support','finance','rules','audit']::text[])
);
create table if not exists public.member_service_audit(
 id uuid primary key default gen_random_uuid(),request_id uuid not null,actor_id uuid not null references auth.users(id),
 user_id uuid references auth.users(id),action text not null,reason text not null,reference text,
 before_data jsonb not null default '{}',after_data jsonb not null default '{}',created_at timestamptz not null default clock_timestamp(),
 unique(actor_id,request_id)
);
create table if not exists public.member_case_messages(
 id uuid primary key default gen_random_uuid(),ticket_id uuid not null references public.member_feedback_tickets(id),
 user_id uuid not null references auth.users(id),author_id uuid not null references auth.users(id),
 author_kind text not null check(author_kind in ('member','support','status')),body text not null check(length(body) between 1 and 5000),
 request_id uuid not null,created_at timestamptz not null default clock_timestamp(),unique(author_id,request_id)
);
create table if not exists public.member_case_files(
 id uuid primary key default gen_random_uuid(),message_id uuid not null references public.member_case_messages(id),
 ticket_id uuid not null references public.member_feedback_tickets(id),user_id uuid not null references auth.users(id),
 name text not null,mime text not null,content bytea not null check(octet_length(content)<=1048576),
 created_at timestamptz not null default clock_timestamp()
);
alter table public.member_case_messages add column if not exists status_before text;
alter table public.member_case_messages add column if not exists status_after text;
create table if not exists public.member_rule_versions(
 id uuid primary key default gen_random_uuid(),scope text not null,item_id text not null,version bigint generated always as identity,
 terms jsonb not null,announcement text not null,effective_at timestamptz not null default clock_timestamp(),
 actor_id uuid references auth.users(id),created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.member_benefit_terms(
 reward_id uuid primary key references public.member_rewards(id),user_id uuid not null references auth.users(id),
 terms jsonb not null,origin text not null,created_at timestamptz not null default clock_timestamp()
);
create table if not exists public.member_identity_recovery(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),request_id uuid not null,
 provider text not null,status text not null default 'prepared' check(status in ('prepared','completed','cancelled')),
 original_identity text,created_at timestamptz not null default clock_timestamp(),updated_at timestamptz not null default clock_timestamp(),unique(user_id,request_id)
);
-- Reconciliation input for a future verified payment worker. This does NOT create
-- checkout, accept payment, issue points or send refunds; members cannot write it.
create table if not exists public.member_payment_orders(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id),order_key text not null unique,
 provider_event_key text not null unique,status text not null check(status in ('pending','paid','refunded','failed')),
 expected_amount numeric(18,2) not null check(expected_amount>0),paid_amount numeric(18,2),currency text not null default 'TWD',paid_currency text,
 points bigint not null check(points>0),created_at timestamptz not null default clock_timestamp(),verified_at timestamptz
);
alter table public.member_point_ledger add column if not exists balance_after bigint;
alter table public.member_point_ledger add column if not exists transaction_key text;
alter table public.member_point_ledger add column if not exists reversal_of uuid references public.member_point_ledger(id);
alter table public.member_point_ledger add column if not exists rule_snapshot jsonb;
create unique index if not exists member_ledger_reversal_once on public.member_point_ledger(reversal_of) where reversal_of is not null;
create index if not exists member_case_messages_ticket on public.member_case_messages(ticket_id,created_at,id);

create or replace function public._member_service_admin(p_scope text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.member_service_admins where user_id=auth.uid() and active and p_scope=any(scopes))
$$;
create or replace function public._member_service_recent() returns boolean
language plpgsql stable set search_path='' as $$
declare claims jsonb;v jsonb;stamp numeric;
begin
 begin claims:=nullif(current_setting('request.jwt.claims',true),'')::jsonb;exception when others then return false;end;
 if jsonb_typeof(claims->'amr')<>'array' then return false;end if;
 for v in select * from jsonb_array_elements(claims->'amr') loop
  if v->>'method' in ('password','oauth','otp','totp','mfa/totp') and coalesce(v->>'timestamp','')~'^\d+(\.\d+)?$' then
   stamp:=(v->>'timestamp')::numeric;
   if stamp between extract(epoch from clock_timestamp())-600 and extract(epoch from clock_timestamp())+30 then return true;end if;
  end if;
 end loop;return false;
end $$;
create or replace function public._member_ledger_capture() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||new.user_id,0));
 new.balance_after:=coalesce((select sum(points) from public.member_point_ledger where user_id=new.user_id and pool=new.pool),0)+new.points;
 if new.balance_after<0 then raise exception 'MEMBER_INSUFFICIENT_POINTS';end if;
 new.transaction_key:=coalesce(new.transaction_key,regexp_replace(new.source_event_key,':stored$',''));
 if new.source_event_key like 'task:%' then select to_jsonb(d) into new.rule_snapshot from public.member_task_definitions d where id=split_part(new.source_event_key,':',3);end if;
 return new;
end $$;
drop trigger if exists member_ledger_capture on public.member_point_ledger;
create trigger member_ledger_capture before insert on public.member_point_ledger for each row execute function public._member_ledger_capture();
-- Preserve present entitlements before any future catalog administration, without modifying a reward.
insert into public.member_benefit_terms(reward_id,user_id,terms,origin)
 select id,user_id,to_jsonb(r)-'user_id','existing_at_migration' from public.member_rewards r on conflict do nothing;
create or replace function public._member_capture_reward() returns trigger
language plpgsql security definer set search_path='' as $$
begin insert into public.member_benefit_terms(reward_id,user_id,terms,origin) values(new.id,new.user_id,to_jsonb(new)-'user_id','issued') on conflict do nothing;return new;end $$;
drop trigger if exists member_capture_reward on public.member_rewards;
create trigger member_capture_reward after insert on public.member_rewards for each row execute function public._member_capture_reward();
-- Establish a clearly labelled baseline, not a fabricated past announcement.
insert into public.member_rule_versions(scope,item_id,terms,announcement)
 select 'task',id,to_jsonb(d),'建立規則紀錄的當下快照；不代表今天改價或啟用。' from public.member_task_definitions d
 where not exists(select 1 from public.member_rule_versions v where v.scope='task' and v.item_id=d.id);
insert into public.member_rule_versions(scope,item_id,terms,announcement)
 select 'exchange',id,to_jsonb(d),'建立規則紀錄的當下快照；不代表今天改價或啟用。' from public.member_exchange_definitions d
 where not exists(select 1 from public.member_rule_versions v where v.scope='exchange' and v.item_id=d.id);

do $$ declare t text;begin
 foreach t in array array['member_service_admins','member_service_audit','member_case_messages','member_case_files','member_rule_versions','member_benefit_terms','member_identity_recovery','member_payment_orders'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant all on public.%I to service_role',t);
 end loop;
end $$;

create or replace function public.member_service_access() returns jsonb
language plpgsql security definer set search_path='' as $$
declare scopes text[];begin
 if auth.uid() is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select a.scopes into scopes from public.member_service_admins a where a.user_id=auth.uid() and active;
 return jsonb_build_object('version',1,'scopes',coalesce(scopes,'{}'),'recent',public._member_service_recent(),'server_time',clock_timestamp());
end $$;

create or replace function public.member_ledger_page(p_pool text default 'task',p_before timestamptz default null,p_before_id uuid default null,p_until timestamptz default null,p_start date default null,p_end date default null,p_kind text default 'all') returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();rows jsonb;cutoff timestamptz:=coalesce(p_until,clock_timestamp());begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_pool is null or p_kind is null or p_pool not in ('task','stored','ai','all') or p_kind not in ('all','earned','used') or (p_start is not null and p_end is not null and p_start>p_end) or ((p_before is null)<>(p_before_id is null)) then raise exception 'MEMBER_INPUT_INVALID';end if;
 if p_pool='ai' then
  select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') into rows from
   (select id,kind,ai_delta,points_delta,balance_after,description,detail,created_at,request_id as transaction_key from public.member_ai_ledger
    where user_id=u and created_at<=cutoff and (p_before is null or (created_at,id)<(p_before,p_before_id))
     and (p_start is null or (created_at at time zone 'Asia/Taipei')::date>=p_start) and (p_end is null or (created_at at time zone 'Asia/Taipei')::date<=p_end)
     and (p_kind='all' or (p_kind='earned' and ai_delta>0) or (p_kind='used' and ai_delta<0)) order by created_at desc,id desc limit 51)q;
 else
  select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') into rows from
   (select l.id,l.pool,l.points,l.description,l.source_event_key,l.created_at,l.balance_after,coalesce(l.transaction_key,regexp_replace(l.source_event_key,':stored$','')) as transaction_key,l.reversal_of,l.rule_snapshot,
      (select a.reference from public.member_service_audit a where a.user_id=u and a.after_data->>'ledger_id'=l.id::text limit 1) as reference,
      (select id from public.member_point_ledger r where r.user_id=u and r.reversal_of=l.id limit 1) as reversed_by,
      (select reward_id from public.member_point_exchanges e where e.user_id=u and ('points-exchange:'||u||':'||e.request_id)=regexp_replace(l.source_event_key,':stored$','') limit 1) as reward_id,
      case when l.balance_after is not null then 'recorded' else 'historical_unavailable' end as balance_basis
    from public.member_point_ledger l where user_id=u and (p_pool='all' or pool=p_pool) and created_at<=cutoff and (p_before is null or (created_at,id)<(p_before,p_before_id))
     and (p_start is null or (created_at at time zone 'Asia/Taipei')::date>=p_start) and (p_end is null or (created_at at time zone 'Asia/Taipei')::date<=p_end)
     and (p_kind='all' or (p_kind='earned' and points>0) or (p_kind='used' and points<0)) order by created_at desc,id desc limit 51)q;
 end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(rows) with ordinality x where x.ordinality<=50),'has_more',jsonb_array_length(rows)>50,'until',cutoff,'version',1);
end $$;

create or replace function public.member_case_list(p_before timestamptz default null,p_before_id uuid default null,p_admin boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();rows jsonb;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_admin and not public._member_service_admin('support') then raise exception 'MEMBER_ADMIN_REQUIRED';end if;
 if (p_before is null)<>(p_before_id is null) then raise exception 'MEMBER_INPUT_INVALID';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') into rows from
 (select id,ticket_number,subject,status,created_at from public.member_feedback_tickets where (user_id=u or p_admin) and (p_before is null or (created_at,id)<(p_before,p_before_id)) order by created_at desc,id desc limit 51)q;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(rows) with ordinality x where x.ordinality<=50),'has_more',jsonb_array_length(rows)>50);
end $$;
create or replace function public.member_case_detail(p_ticket uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare t public.member_feedback_tickets%rowtype;messages jsonb;begin
 select * into t from public.member_feedback_tickets where id=p_ticket and (user_id=auth.uid() or public._member_service_admin('support'));
 if not found then raise exception 'MEMBER_CASE_UNAVAILABLE';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by created_at,id),'[]') into messages from
 (select m.id,m.author_kind,m.body,m.created_at,m.status_before,m.status_after,(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'bytes',octet_length(f.content))),'[]') from public.member_case_files f where f.message_id=m.id) as files from public.member_case_messages m where ticket_id=t.id)q;
 return jsonb_build_object('ticket',to_jsonb(t)-'user_id'-'request_id','account_id',case when public._member_service_admin('support') then t.user_id else null end,'messages',messages);
end $$;
create or replace function public.member_case_file(p_file uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare f public.member_case_files%rowtype;begin
 select * into f from public.member_case_files where id=p_file and (user_id=auth.uid() or public._member_service_admin('support'));
 if not found then raise exception 'MEMBER_CASE_UNAVAILABLE';end if;
 return jsonb_build_object('id',f.id,'name',f.name,'mime',f.mime,'data',encode(f.content,'base64'));
end $$;
create or replace function public.member_case_reply(p_ticket uuid,p_request uuid,p_body text,p_files jsonb default '[]',p_status text default null,p_staff boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();t public.member_feedback_tickets%rowtype;m public.member_case_messages%rowtype;x jsonb;bytes bytea;mime text;before_status text;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_staff and (not public._member_service_admin('support') or not public._member_service_recent()) then raise exception 'MEMBER_ADMIN_REAUTH_REQUIRED';end if;
 if p_staff is null or p_request is null or length(trim(coalesce(p_body,''))) not between 1 and 5000 or p_files is null or jsonb_typeof(p_files)<>'array' or jsonb_array_length(p_files)>3 or octet_length(p_files::text)>4400000 then raise exception 'MEMBER_INPUT_INVALID';end if;
 if p_status is not null and (not p_staff or p_status not in ('received','in_progress','waiting','completed')) then raise exception 'MEMBER_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('member-case-author:'||u,0));
 perform pg_advisory_xact_lock(hashtextextended('member-case:'||p_ticket,0));
 select * into t from public.member_feedback_tickets where id=p_ticket and (user_id=u or p_staff) for update;
 if not found then raise exception 'MEMBER_CASE_UNAVAILABLE';end if;
 select * into m from public.member_case_messages where author_id=u and request_id=p_request;
 if found then if m.ticket_id<>p_ticket then raise exception 'MEMBER_REQUEST_CONFLICT';end if;return jsonb_build_object('id',m.id,'duplicate',true);end if;
 if (select count(*) from public.member_case_messages where ticket_id=p_ticket)>=500 then raise exception 'MEMBER_CASE_LIMIT';end if;
 if (select count(*) from public.member_case_messages where author_id=u and created_at>clock_timestamp()-interval '1 minute')>=10 then raise exception 'MEMBER_CASE_RATE_LIMIT';end if;
 if (select count(*) from public.member_case_files where ticket_id=p_ticket)+jsonb_array_length(p_files)>20 then raise exception 'MEMBER_CASE_FILE_LIMIT';end if;
 perform pg_advisory_xact_lock(hashtextextended('member-case-files:'||t.user_id,0));
 if coalesce((select sum(octet_length(content)) from public.member_case_files where user_id=t.user_id),0)+octet_length(p_files::text)>30000000 then raise exception 'MEMBER_CASE_FILE_LIMIT';end if;
 insert into public.member_case_messages(ticket_id,user_id,author_id,author_kind,body,request_id) values(t.id,t.user_id,u,case when p_staff then 'support' else 'member' end,trim(p_body),p_request) returning * into m;
 for x in select * from jsonb_array_elements(p_files) loop
  mime:=x->>'mime';begin bytes:=decode(x->>'data','base64');exception when others then raise exception 'MEMBER_CASE_FILE_INVALID';end;
  if bytes is null or octet_length(bytes) not between 12 and 1048576 or length(coalesce(x->>'name','')) not between 1 and 120 or mime is null
    or not ((mime='image/png' and encode(substring(bytes from 1 for 8),'hex')='89504e470d0a1a0a') or (mime='image/jpeg' and encode(substring(bytes from 1 for 3),'hex')='ffd8ff') or (mime='image/webp' and substring(bytes from 1 for 4)=convert_to('RIFF','UTF8') and substring(bytes from 9 for 4)=convert_to('WEBP','UTF8'))) then raise exception 'MEMBER_CASE_FILE_INVALID';end if;
  insert into public.member_case_files(message_id,ticket_id,user_id,name,mime,content) values(m.id,t.id,t.user_id,x->>'name',mime,bytes);
 end loop;
 before_status:=t.status;
 update public.member_feedback_tickets set status=coalesce(p_status,case when p_staff then 'waiting' when status='completed' then 'in_progress' else status end) where id=t.id;
 update public.member_case_messages set status_before=before_status,status_after=(select status from public.member_feedback_tickets where id=t.id) where id=m.id;
 if p_staff then insert into public.member_service_audit(request_id,actor_id,user_id,action,reason,reference,before_data,after_data) values(p_request,u,t.user_id,'case_reply',trim(p_body),t.id::text,jsonb_build_object('status',before_status),jsonb_build_object('message_id',m.id,'status',(select status from public.member_feedback_tickets where id=t.id)));end if;
 return jsonb_build_object('id',m.id,'duplicate',false);
end $$;

create or replace function public.member_identity_recovery_begin(p_request uuid,p_provider text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.member_identity_recovery%rowtype;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if not public._member_service_recent() then raise exception 'MEMBER_RECENT_LOGIN_REQUIRED';end if;
 if p_request is null or p_provider is null or p_provider not in ('google','apple','facebook','line') then raise exception 'MEMBER_INPUT_INVALID';end if;
 insert into public.member_identity_recovery(user_id,request_id,provider) values(u,p_request,p_provider) on conflict(user_id,request_id) do nothing;
 select * into r from public.member_identity_recovery where user_id=u and request_id=p_request;
 if r.provider<>p_provider then raise exception 'MEMBER_REQUEST_CONFLICT';end if;return to_jsonb(r)-'user_id';
end $$;
create or replace function public.member_identity_recovery_status(p_request uuid default null,p_cancel boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();rows jsonb;begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 if p_cancel then update public.member_identity_recovery set status='cancelled',updated_at=clock_timestamp() where user_id=u and request_id=p_request and status='prepared';end if;
 -- Completion is observed from Auth's identity table, never a browser completed flag.
 update public.member_identity_recovery r set status='completed',updated_at=clock_timestamp() where user_id=u and status='prepared' and exists(select 1 from auth.identities i where i.user_id=u and i.created_at>=r.created_at and (i.provider=r.provider or (r.provider='line' and i.provider in ('custom:line','custom:line-web'))));
 select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc),'[]') into rows from (select request_id,provider,status,created_at,updated_at from public.member_identity_recovery where user_id=u order by created_at desc limit 20)q;return rows;
end $$;

create or replace function public.member_admin_adjust(p_user uuid,p_request uuid,p_delta bigint,p_reason text,p_reference text,p_reverse uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();r public.member_point_ledger%rowtype;prior public.member_service_audit%rowtype;original public.member_point_ledger%rowtype;bal bigint;begin
 if not public._member_service_admin('finance') then raise exception 'MEMBER_ADMIN_REQUIRED';end if;
 if not public._member_service_recent() then raise exception 'MEMBER_RECENT_LOGIN_REQUIRED';end if;
 if p_user is null or p_request is null or p_delta is null or p_delta=0 or (p_delta< -1000000 or p_delta>1000000) or length(trim(coalesce(p_reason,''))) not between 5 and 300 or length(trim(coalesce(p_reference,''))) not between 1 and 200 then raise exception 'MEMBER_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('point-wallet:'||p_user,0));
 select * into prior from public.member_service_audit where actor_id=u and request_id=p_request;
 if found then if prior.user_id<>p_user or prior.action<>'point_adjust' then raise exception 'MEMBER_REQUEST_CONFLICT';end if;return prior.after_data||jsonb_build_object('duplicate',true);end if;
 if p_reverse is not null then select * into original from public.member_point_ledger where id=p_reverse and user_id=p_user and pool='task';if not found or original.points<>-p_delta or original.reversal_of is not null then raise exception 'MEMBER_REVERSAL_INVALID';end if;end if;
 bal:=public._member_pool_balance(p_user,'task');if bal+p_delta<0 then raise exception 'MEMBER_INSUFFICIENT_POINTS';end if;
 insert into public.member_point_ledger(user_id,description,points,pool,source_event_key,reversal_of,transaction_key) values(p_user,trim(p_reason),p_delta,'task','admin:'||u||':'||p_request,p_reverse,'admin:'||p_request) returning * into r;
 insert into public.member_service_audit(request_id,actor_id,user_id,action,reason,reference,before_data,after_data) values(p_request,u,p_user,'point_adjust',trim(p_reason),p_reference,jsonb_build_object('balance',bal),jsonb_build_object('ledger_id',r.id,'points',r.points,'balance',r.balance_after));
 return jsonb_build_object('ledger_id',r.id,'points',r.points,'balance',r.balance_after,'duplicate',false);
end $$;

create or replace function public.member_admin_catalog(p_scope text,p_item text,p_request uuid,p_expected jsonb,p_title text,p_points integer,p_active boolean,p_reason text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();prior jsonb;old_request public.member_service_audit%rowtype;current_terms jsonb;next_terms jsonb;v uuid;begin
 if not public._member_service_admin('rules') then raise exception 'MEMBER_ADMIN_REQUIRED';end if;
 if not public._member_service_recent() then raise exception 'MEMBER_RECENT_LOGIN_REQUIRED';end if;
 if p_scope is null or p_scope not in ('task','exchange') or length(coalesce(p_item,'')) not between 1 and 100 or p_request is null or p_active is null or length(trim(coalesce(p_title,''))) not between 1 and 120 or p_points is null or p_points not between 1 and (case when p_scope='task' then 10000 else 1000000 end) or length(trim(coalesce(p_reason,''))) not between 5 and 1000 then raise exception 'MEMBER_INPUT_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended('member-catalog:'||p_scope||':'||p_item,0));
 select * into old_request from public.member_service_audit where actor_id=u and request_id=p_request;
 if found then if old_request.action<>'catalog_change' or old_request.reference<>p_scope||':'||p_item then raise exception 'MEMBER_REQUEST_CONFLICT';end if;return old_request.after_data||jsonb_build_object('duplicate',true);end if;
 if p_scope='task' then select to_jsonb(d) into current_terms from public.member_task_definitions d where id=p_item for update;
 else select to_jsonb(d) into current_terms from public.member_exchange_definitions d where id=p_item for update;end if;
 if current_terms is null then raise exception 'MEMBER_CATALOG_UNAVAILABLE';end if;
 if current_terms is distinct from p_expected then raise exception 'MEMBER_CATALOG_CHANGED';end if;
 next_terms:=current_terms||jsonb_build_object('title',trim(p_title),'points',p_points,'active',p_active);
 insert into public.member_rule_versions(scope,item_id,terms,announcement,actor_id) values(p_scope,p_item,next_terms,trim(p_reason),u) returning id into v;
 if p_scope='task' then update public.member_task_definitions set title=trim(p_title),points=p_points,active=p_active where id=p_item;
 else update public.member_exchange_definitions set title=trim(p_title),points=p_points,active=p_active where id=p_item;end if;
 insert into public.member_service_audit(request_id,actor_id,action,reason,reference,before_data,after_data) values(p_request,u,'catalog_change',trim(p_reason),p_scope||':'||p_item,current_terms,next_terms||jsonb_build_object('version_id',v));
 return next_terms||jsonb_build_object('version_id',v,'duplicate',false);
end $$;
create or replace function public.member_rules_page(p_before bigint default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;begin
 if auth.uid() is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by version desc),'[]') into rows from (select id,scope,item_id,version,terms,announcement,effective_at from public.member_rule_versions where effective_at<=clock_timestamp() and (p_before is null or version<p_before) order by version desc limit 51)q;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(rows) with ordinality x where x.ordinality<=50),'has_more',jsonb_array_length(rows)>50);
end $$;
create or replace function public.member_admin_overview() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if not (public._member_service_admin('audit') or public._member_service_admin('finance') or public._member_service_admin('support') or public._member_service_admin('rules')) then raise exception 'MEMBER_ADMIN_REQUIRED';end if;
 return jsonb_build_object('server_time',clock_timestamp(),
 'negative_wallets',(select count(*) from (select user_id,pool from public.member_point_ledger group by user_id,pool having sum(points)<0)s),
 'large_awards_today',(select count(*) from public.member_point_ledger where points>10000 and created_at>clock_timestamp()-interval '1 day'),
 'failed_mail',(select count(*) from public.member_notification_outbox where status='failed'),
 'stale_mail',(select count(*) from public.member_notification_outbox where status in ('pending','sending') and created_at<clock_timestamp()-interval '1 day'),
 'stored_without_order',(select count(*) from public.member_point_ledger l where pool='stored' and source_event_key like 'stored:%' and not exists(select 1 from public.member_payment_orders o where o.user_id=l.user_id and 'stored:'||o.order_key=l.source_event_key and o.verified_at is not null)),
 'payment_mismatches',(select count(*) from public.member_payment_orders o where status in ('paid','refunded') and (verified_at is null or paid_amount is distinct from expected_amount or paid_currency is distinct from currency or
  coalesce((select sum(points) from public.member_point_ledger l where l.user_id=o.user_id and l.pool='stored' and (l.source_event_key='stored:'||o.order_key or (o.status='refunded' and l.reversal_of in (select id from public.member_point_ledger where user_id=o.user_id and source_event_key='stored:'||o.order_key)))),0)<>case when o.status='paid' then o.points else 0 end)),
 'payment_reconciliation','not_enabled',
 'tasks',case when public._member_service_admin('rules') then (select coalesce(jsonb_agg(to_jsonb(d) order by sort),'[]') from public.member_task_definitions d) else '[]'::jsonb end,
 'exchanges',case when public._member_service_admin('rules') then (select coalesce(jsonb_agg(to_jsonb(d) order by id),'[]') from public.member_exchange_definitions d) else '[]'::jsonb end);
end $$;
create or replace function public.member_admin_account(p_user uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb;begin
 if not (public._member_service_admin('finance') or public._member_service_admin('support') or public._member_service_admin('audit')) then raise exception 'MEMBER_ADMIN_REQUIRED';end if;
 select jsonb_build_object('id',id,'name',coalesce(raw_user_meta_data->>'display_name','未設定暱稱'),'created_at',created_at,'task_points',public._member_pool_balance(id,'task'),'stored_points',public._member_pool_balance(id,'stored')) into r from auth.users where id=p_user;
 if r is null then raise exception 'MEMBER_ACCOUNT_UNAVAILABLE';end if;
 return r;
end $$;
create or replace function public.member_admin_audit(p_before timestamptz default null,p_before_id uuid default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rows jsonb;begin
 if not public._member_service_admin('audit') then raise exception 'MEMBER_ADMIN_REQUIRED';end if;
 select coalesce(jsonb_agg(to_jsonb(q) order by created_at desc,id desc),'[]') into rows from (select * from public.member_service_audit where p_before is null or (created_at,id)<(p_before,p_before_id) order by created_at desc,id desc limit 51)q;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(rows) with ordinality x where x.ordinality<=50),'has_more',jsonb_array_length(rows)>50);
end $$;

create or replace function public.member_data_export_page(p_section text,p_after uuid default null,p_until timestamptz default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid();table_name text;col text;rows jsonb;cutoff timestamptz:=coalesce(p_until,clock_timestamp());begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select a.t,a.c into table_name,col from (values
 ('ledger','member_point_ledger','created_at'),('ai','member_ai_ledger','created_at'),('rewards','member_rewards','created_at'),('coupons','member_coupons','created_at'),
 ('tickets','member_feedback_tickets','created_at'),('messages','member_case_messages','created_at'),('task_work','member_task_work','recorded_at'),('screens','member_screen_records','recorded_at'),
 ('identity_recovery','member_identity_recovery','created_at'),('entitlements','member_entitlements','created_at'),('redemptions','member_code_redemptions','created_at'),('payment_orders','member_payment_orders','created_at'))a(s,t,c) where a.s=p_section;
 if table_name is not null then
  execute format('select coalesce(jsonb_agg(to_jsonb(q) order by id),''[]'') from (select * from public.%I where user_id=$1 and %I<=$2 and ($3 is null or id>$3) order by id limit 101)q',table_name,col) into rows using u,cutoff,p_after;
 elsif p_section='learning' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_learning_completions where user_id=u)q;
 elsif p_section='challenges' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_learning_weekly_results where user_id=u)q;
 elsif p_section='benefit_terms' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_benefit_terms where user_id=u)q;
 elsif p_section='task_claims' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_task_claims where user_id=u)q;
 elsif p_section='bulk_receipts' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_task_bulk_receipts where user_id=u)q;
 elsif p_section='exchanges' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_point_exchanges where user_id=u)q;
 elsif p_section='watchlist' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.watchlist where user_id=u)q;
 elsif p_section='ai_settings' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_ai_wallets where user_id=u)q;
 elsif p_section='referral_codes' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_referral_codes where user_id=u)q;
 elsif p_section='referrals' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select referrer_code,verified_at,created_at,case when invitee_user_id=u then 'joined' else 'invited' end as direction from public.member_referrals where invitee_user_id=u or inviter_user_id=u)q;
 elsif p_section='adjustments' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select id,action,reason,reference,before_data,after_data,created_at from public.member_service_audit where user_id=u)q;
 elsif p_section='documents' then select coalesce(jsonb_agg(to_jsonb(q)),'[]') into rows from (select * from public.member_research_documents where user_id=u)q;
 elsif p_section='files' then
  select coalesce(jsonb_agg(to_jsonb(q) order by id),'[]') into rows from (select id,message_id,ticket_id,name,mime,encode(content,'base64') as data,created_at from public.member_case_files where user_id=u and created_at<=cutoff and (p_after is null or id>p_after) order by id limit 11)q;
  return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(rows) with ordinality x where x.ordinality<=10),'has_more',jsonb_array_length(rows)>10,'until',cutoff);
 else raise exception 'MEMBER_INPUT_INVALID';end if;
 -- Non-UUID sections have a natural bounded catalog/account scope; do not truncate them.
 if table_name is null then return jsonb_build_object('rows',rows,'has_more',false,'until',cutoff);end if;
 return jsonb_build_object('rows',(select coalesce(jsonb_agg(x.value order by x.ordinality),'[]') from jsonb_array_elements(rows) with ordinality x where x.ordinality<=100),'has_more',jsonb_array_length(rows)>100,'until',cutoff);
end $$;

do $$ declare f record;begin
 for f in select oid::regprocedure as signature,proname from pg_proc where pronamespace='public'::regnamespace and proname=any(array['_member_service_admin','_member_service_recent','_member_ledger_capture','_member_capture_reward','member_service_access','member_ledger_page','member_case_list','member_case_detail','member_case_file','member_case_reply','member_identity_recovery_begin','member_identity_recovery_status','member_admin_adjust','member_admin_catalog','member_rules_page','member_admin_overview','member_admin_account','member_admin_audit','member_data_export_page']) loop
  execute format('revoke all on function %s from public,anon,authenticated',f.signature);
  if left(f.proname,1)<>'_' then execute format('grant execute on function %s to authenticated',f.signature);end if;
 end loop;
end $$;
commit;
