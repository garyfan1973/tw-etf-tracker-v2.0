-- Independent daily allowance for the conversational investment-strategy page.
-- The table lives outside exposed API schemas; members can only reach it via
-- the narrowly scoped RPC below.
create schema if not exists strategy_private;

create table if not exists strategy_private.requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  symbol text not null,
  market text not null check (market in ('TW', 'US')),
  created_at timestamptz not null default now()
);

create index if not exists strategy_requests_user_day_idx
  on strategy_private.requests (user_id, created_at desc);

alter table strategy_private.requests enable row level security;

drop policy if exists strategy_requests_own_select on strategy_private.requests;
create policy strategy_requests_own_select on strategy_private.requests
  for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists strategy_requests_own_insert on strategy_private.requests;
create policy strategy_requests_own_insert on strategy_private.requests
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

grant usage on schema strategy_private to authenticated;
grant select, insert on strategy_private.requests to authenticated;

create or replace function public.consume_investment_strategy_quota(
  p_symbol text,
  p_market text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_access boolean;
  v_used integer;
  v_request_id uuid;
  v_limit constant integer := 30;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not public.is_full_member() then
    raise exception 'FEATURE_NOT_ENABLED';
  end if;
  if p_market not in ('TW', 'US') or p_symbol !~ '^[0-9A-Z.^_-]{1,20}$' then
    raise exception 'INVALID_SYMBOL';
  end if;

  -- Investment strategy is a paid-key feature too: authentication alone is
  -- not sufficient. Reuse the manually managed AI allowlist and expiry.
  select exists (
    select 1
    from public.ai_feature_access
    where user_id = v_user
      and enabled
      and (expires_at is null or expires_at > pg_catalog.now())
  ) into v_access;
  if not v_access then
    raise exception 'FEATURE_NOT_ENABLED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 8145));
  select count(*)::integer into v_used
  from strategy_private.requests
  where user_id = v_user
    and (created_at at time zone 'Asia/Taipei')::date =
        (pg_catalog.now() at time zone 'Asia/Taipei')::date;
  if v_used >= v_limit then
    raise exception 'DAILY_LIMIT_REACHED';
  end if;

  insert into strategy_private.requests (user_id, symbol, market)
  values (v_user, p_symbol, p_market)
  returning id into v_request_id;

  return pg_catalog.jsonb_build_object(
    'requestId', v_request_id,
    'dailyLimit', v_limit,
    'used', v_used + 1,
    'remaining', v_limit - v_used - 1
  );
end;
$$;

revoke all on function public.consume_investment_strategy_quota(text, text) from public, anon;
grant execute on function public.consume_investment_strategy_quota(text, text) to authenticated;
