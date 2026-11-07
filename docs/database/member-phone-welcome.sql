-- PREPARED ONLY. Requires member-voucher-levels.sql. Campaign starts DISABLED.
-- Apply with the shared database owner; this does not enable SMS.
begin;
create table public.member_phone_welcome_policy(
 id boolean primary key default true check(id), active boolean not null default false,
 starts_at timestamptz, phone_salt uuid not null default gen_random_uuid(),
 check(not active or starts_at is not null)
);
insert into public.member_phone_welcome_policy(id) values(true);
-- Permanent reservations, including after unbinding/account deletion; no raw phone.
create table public.member_verified_phone_owners(
 phone_key text primary key,
 user_id uuid references auth.users(id) on delete set null,
 reserved_at timestamptz not null default now()
);
create index member_verified_phone_owner on public.member_verified_phone_owners(user_id);
create table public.member_phone_welcome_receipts(
 user_id uuid primary key references auth.users(id) on delete cascade,
 phone_key text not null unique,
 reward_id uuid not null unique references public.member_rewards(id),
 created_at timestamptz not null default now()
);
alter table public.member_phone_welcome_policy enable row level security;
alter table public.member_verified_phone_owners enable row level security;
alter table public.member_phone_welcome_receipts enable row level security;
revoke all on public.member_phone_welcome_policy,public.member_verified_phone_owners,public.member_phone_welcome_receipts from public,anon,authenticated;
grant all on public.member_phone_welcome_policy,public.member_verified_phone_owners,public.member_phone_welcome_receipts to service_role;
insert into public.member_voucher_definitions(id,title,tier,active,allowed_features)
 values('phone-welcome-observation-v1','市場觀察員・5 天功能體驗券','observation',false,array['fhedge','breadth']);

create function public._member_verified_phone_key(p_phone text) returns text
language plpgsql stable security definer set search_path='' as $$
declare normalized text; salt uuid;
begin
 normalized:=regexp_replace(coalesce(p_phone,''),'[[:space:]()+-]','','g');
 if normalized !~ '^[1-9][0-9]{7,14}$' then raise exception 'MEMBER_PHONE_INVALID';end if;
 select phone_salt into salt from public.member_phone_welcome_policy where id;
 return md5(salt::text||':'||normalized);
end $$;

-- Actual Auth confirmation only; never trust user_metadata or pending phone_change.
create function public._member_reserve_verified_phone() returns trigger
language plpgsql security definer set search_path='' as $$
declare k text; owner uuid;
begin
 if new.phone_confirmed_at is null or coalesce(new.phone,'')='' then return new;end if;
 k:=public._member_verified_phone_key(new.phone);
 perform pg_advisory_xact_lock(hashtextextended('verified-phone:'||k,0));
 select user_id into owner from public.member_verified_phone_owners where phone_key=k;
 if found and owner is distinct from new.id then raise exception 'MEMBER_PHONE_ALREADY_BOUND';end if;
 if not found then insert into public.member_verified_phone_owners(phone_key,user_id) values(k,new.id);end if;
 return new;
end $$;
-- Existing duplicates require a human review; never arbitrarily reassign ownership.
do $$ begin
 if exists(select 1 from auth.users where phone_confirmed_at is not null and coalesce(phone,'')<>''
  group by public._member_verified_phone_key(phone) having count(*)>1) then
  raise exception 'MEMBER_PHONE_DUPLICATES_REVIEW_REQUIRED';
 end if;
end $$;
insert into public.member_verified_phone_owners(phone_key,user_id)
 select public._member_verified_phone_key(phone),id from auth.users
 where phone_confirmed_at is not null and coalesce(phone,'')<>'';
create trigger member_unique_verified_phone after insert or update of phone,phone_confirmed_at on auth.users
 for each row execute function public._member_reserve_verified_phone();

create function public.member_phone_welcome_status() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=auth.uid(); person auth.users%rowtype; policy public.member_phone_welcome_policy%rowtype;
 receipt public.member_phone_welcome_receipts%rowtype; reward public.member_rewards%rowtype; live boolean; eligible boolean;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select * into person from auth.users where id=u;
 if not found then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 select * into policy from public.member_phone_welcome_policy where id;
 live:=policy.active and exists(select 1 from public.member_voucher_definitions where id='phone-welcome-observation-v1' and active)
  and not exists(select 1 from unnest(array['fhedge','breadth']) f where not exists(select 1 from public.member_feature_catalog c where c.feature=f and c.member_research and c.voucher_enabled));
 select * into receipt from public.member_phone_welcome_receipts where user_id=u;
 select * into reward from public.member_rewards where id=receipt.reward_id;
 eligible:=live and person.created_at>=policy.starts_at and receipt.user_id is null;
 return jsonb_build_object('version',1,'active',live,'eligible',eligible,
  'phone_verified',person.phone_confirmed_at is not null and coalesce(person.phone,'')<>'',
  'reward_id',receipt.reward_id,'reward_status',reward.status,'title','市場觀察員・5 天功能體驗券','duration_days',5,
  'activation_deadline',reward.activation_deadline,'server_time',now());
end $$;
create function public.claim_member_phone_welcome() returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); person auth.users%rowtype; k text; r uuid; s jsonb;
begin
 if u is null then raise exception 'MEMBER_VERIFY_REQUIRED';end if;
 perform pg_advisory_xact_lock(hashtextextended('phone-welcome:'||u,0));
 select reward_id into r from public.member_phone_welcome_receipts where user_id=u;
 if found then return public.member_phone_welcome_status()||jsonb_build_object('duplicate',true);end if;
 select * into person from auth.users where id=u for update;
 if not found or person.phone_confirmed_at is null or coalesce(person.phone,'')='' then raise exception 'MEMBER_PHONE_VERIFY_REQUIRED';end if;
 s:=public.member_phone_welcome_status();
 if not coalesce((s->>'eligible')::boolean,false) then raise exception 'MEMBER_PHONE_WELCOME_UNAVAILABLE';end if;
 k:=public._member_verified_phone_key(person.phone);
 perform pg_advisory_xact_lock(hashtextextended('verified-phone:'||k,0));
 if not exists(select 1 from public.member_verified_phone_owners where phone_key=k and user_id=u)
  or exists(select 1 from public.member_phone_welcome_receipts where phone_key=k) then raise exception 'MEMBER_PHONE_ALREADY_BOUND';end if;
 r:=public._member_issue_voucher(u,'phone-welcome-observation-v1',5,'phone-welcome-v1:'||u);
 insert into public.member_phone_welcome_receipts(user_id,phone_key,reward_id) values(u,k,r);
 return public.member_phone_welcome_status()||jsonb_build_object('duplicate',false);
end $$;
revoke all on function public._member_verified_phone_key(text),public._member_reserve_verified_phone(),public.member_phone_welcome_status(),public.claim_member_phone_welcome() from public,anon,authenticated;
grant execute on function public.member_phone_welcome_status(),public.claim_member_phone_welcome() to authenticated;
commit;
