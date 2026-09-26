-- 會員人工審核與功能分級。
-- access_level: pending（待審核）、general（一般功能）、full（含 AI）、rejected（拒絕）。

create table if not exists public.member_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_level text not null default 'pending'
    check (access_level in ('pending', 'general', 'full', 'rejected')),
  note text,
  requested_at timestamptz not null default now(),
  last_requested_at timestamptz,
  last_notified_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists member_access_level_idx
  on public.member_access (access_level, updated_at desc);

alter table public.member_access enable row level security;
revoke all on public.member_access from anon, authenticated;
grant select on public.member_access to authenticated;

drop policy if exists "Members can view their membership status" on public.member_access;
create policy "Members can view their membership status"
  on public.member_access for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.handle_new_member_access()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.member_access (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_member_access on auth.users;
create trigger on_auth_user_created_member_access
  after insert on auth.users
  for each row execute function public.handle_new_member_access();

revoke all on function public.handle_new_member_access() from public, anon, authenticated;

create or replace function public.get_member_access()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_access public.member_access%rowtype;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_access
  from public.member_access
  where user_id = v_user;

  if not found then
    return jsonb_build_object('accessLevel', 'pending', 'status', 'pending');
  end if;

  return jsonb_build_object(
    'accessLevel', v_access.access_level,
    'status', v_access.access_level,
    'requestedAt', v_access.requested_at,
    'reviewedAt', v_access.reviewed_at
  );
end;
$$;

create or replace function public.is_approved_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.member_access
    where user_id = auth.uid()
      and access_level in ('general', 'full')
  );
$$;

create or replace function public.is_full_member()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.member_access
    where user_id = auth.uid()
      and access_level = 'full'
  );
$$;

create or replace function public.request_membership_review()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_access public.member_access%rowtype;
  v_notify boolean;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  insert into public.member_access (user_id)
  values (v_user)
  on conflict (user_id) do nothing;

  select * into v_access
  from public.member_access
  where user_id = v_user
  for update;

  v_notify := v_access.access_level = 'pending'
    and (v_access.last_notified_at is null or v_access.last_notified_at < now() - interval '24 hours');

  update public.member_access
  set last_requested_at = now(), updated_at = now()
  where user_id = v_user;

  return jsonb_build_object(
    'accessLevel', v_access.access_level,
    'status', v_access.access_level,
    'shouldNotify', v_notify
  );
end;
$$;

create or replace function public.mark_membership_request_notified()
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  update public.member_access
  set last_notified_at = now(), updated_at = now()
  where user_id = auth.uid()
    and access_level = 'pending';
end;
$$;

revoke all on function public.get_member_access() from public, anon;
revoke all on function public.is_approved_member() from public, anon;
revoke all on function public.is_full_member() from public, anon;
revoke all on function public.request_membership_review() from public, anon;
revoke all on function public.mark_membership_request_notified() from public, anon;
grant execute on function public.get_member_access() to authenticated;
grant execute on function public.is_approved_member() to authenticated;
grant execute on function public.is_full_member() to authenticated;
grant execute on function public.request_membership_review() to authenticated;
grant execute on function public.mark_membership_request_notified() to authenticated;

-- Approved members can use personal non-AI features.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('public', 'watchlist'),
      ('public', 'holdings'),
      ('public', 'portfolio_transactions'),
      ('public', 'portfolio_daily_snapshots'),
      ('public', 'trade_journal_entries'),
      ('public', 'trade_journal_fills')
    ) as tables(schema_name, table_name)
  loop
    execute format('drop policy if exists "Approved members only" on %I.%I', item.schema_name, item.table_name);
    execute format(
      'create policy "Approved members only" on %I.%I as restrictive for all to authenticated using (public.is_approved_member()) with check (public.is_approved_member())',
      item.schema_name, item.table_name
    );
  end loop;
end $$;

-- AI data and strategy quotas are restricted to full members.
do $$
declare
  item record;
begin
  for item in
    select * from (values
      ('public', 'ai_feature_access'),
      ('public', 'chart_analysis_requests'),
      ('public', 'chart_analysis_email_log'),
      ('public', 'morning_report_settings'),
      ('public', 'morning_report_symbols'),
      ('strategy_private', 'requests')
    ) as tables(schema_name, table_name)
  loop
    execute format('drop policy if exists "Full members only" on %I.%I', item.schema_name, item.table_name);
    execute format(
      'create policy "Full members only" on %I.%I as restrictive for all to authenticated using (public.is_full_member()) with check (public.is_full_member())',
      item.schema_name, item.table_name
    );
  end loop;
end $$;

-- Preserve the site owner's access while leaving all existing AI quota data intact.
insert into public.member_access (user_id, access_level, note, reviewed_at)
select id, 'full', '網站管理者', now()
from auth.users
where lower(email) = lower('garyfan1973@gmail.com')
on conflict (user_id) do update
set access_level = 'full', note = '網站管理者', reviewed_at = coalesce(member_access.reviewed_at, excluded.reviewed_at), updated_at = now();

comment on table public.member_access is '會員人工審核與功能分級；一般會員不含 AI，全功能會員可使用 AI。';
