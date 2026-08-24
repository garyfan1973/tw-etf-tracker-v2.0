-- 限定會員 AI 線圖分析：權限、每日額度與分析紀錄。
-- 請在 Supabase SQL Editor 執行一次。開通會員時，只需在 ai_feature_access 新增該會員 UUID。

create table if not exists public.ai_feature_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  daily_limit integer not null default 5 check (daily_limit between 1 and 100),
  expires_at timestamptz,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chart_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  mode text not null check (mode in ('general', 'fast', 'overnight', 'low-entry')),
  symbol text,
  screenshot_timing text,
  proposed_price numeric,
  status text not null default 'pending' check (status in ('pending', 'completed', 'error')),
  model text,
  result jsonb,
  error_message text
);

create index if not exists chart_analysis_requests_user_created_idx
  on public.chart_analysis_requests (user_id, created_at desc);

alter table public.ai_feature_access enable row level security;
alter table public.chart_analysis_requests enable row level security;

revoke all on public.ai_feature_access from anon, authenticated;
revoke all on public.chart_analysis_requests from anon, authenticated;
grant select on public.ai_feature_access to authenticated;
grant select on public.chart_analysis_requests to authenticated;

drop policy if exists "Members can view their chart analysis access" on public.ai_feature_access;
create policy "Members can view their chart analysis access"
  on public.ai_feature_access for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members can view their chart analyses" on public.chart_analysis_requests;
create policy "Members can view their chart analyses"
  on public.chart_analysis_requests for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_chart_analysis_quota()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_access public.ai_feature_access%rowtype;
  v_used integer := 0;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  select * into v_access
  from public.ai_feature_access
  where user_id = v_user;

  if not found then
    return jsonb_build_object('enabled', false, 'dailyLimit', 0, 'used', 0, 'remaining', 0);
  end if;

  select count(*)::integer into v_used
  from public.chart_analysis_requests
  where user_id = v_user
    and timezone('Asia/Taipei', created_at)::date = timezone('Asia/Taipei', now())::date;

  return jsonb_build_object(
    'enabled', v_access.enabled and (v_access.expires_at is null or v_access.expires_at > now()),
    'dailyLimit', v_access.daily_limit,
    'used', v_used,
    'remaining', greatest(v_access.daily_limit - v_used, 0),
    'expiresAt', v_access.expires_at
  );
end;
$$;

create or replace function public.consume_chart_analysis_quota(
  p_mode text,
  p_symbol text default null,
  p_screenshot_timing text default null,
  p_proposed_price numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_access public.ai_feature_access%rowtype;
  v_used integer := 0;
  v_request_id uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_mode not in ('general', 'fast', 'overnight', 'low-entry') then
    raise exception 'INVALID_MODE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user::text, 0));
  select * into v_access
  from public.ai_feature_access
  where user_id = v_user
  for update;

  if not found or not v_access.enabled then
    raise exception 'FEATURE_NOT_ENABLED';
  end if;
  if v_access.expires_at is not null and v_access.expires_at <= now() then
    raise exception 'FEATURE_ACCESS_EXPIRED';
  end if;

  select count(*)::integer into v_used
  from public.chart_analysis_requests
  where user_id = v_user
    and timezone('Asia/Taipei', created_at)::date = timezone('Asia/Taipei', now())::date;

  if v_used >= v_access.daily_limit then
    raise exception 'DAILY_LIMIT_REACHED';
  end if;

  insert into public.chart_analysis_requests
    (user_id, mode, symbol, screenshot_timing, proposed_price)
  values
    (v_user, p_mode, nullif(left(trim(coalesce(p_symbol, '')), 20), ''),
     nullif(left(trim(coalesce(p_screenshot_timing, '')), 40), ''), p_proposed_price)
  returning id into v_request_id;

  return jsonb_build_object(
    'requestId', v_request_id,
    'dailyLimit', v_access.daily_limit,
    'used', v_used + 1,
    'remaining', greatest(v_access.daily_limit - v_used - 1, 0)
  );
end;
$$;

create or replace function public.finish_chart_analysis_request(
  p_request_id uuid,
  p_status text,
  p_model text default null,
  p_result jsonb default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if p_status not in ('completed', 'error') then
    raise exception 'INVALID_STATUS';
  end if;
  if p_status = 'completed' and (
    p_result is null
    or jsonb_typeof(p_result) <> 'object'
    or not (p_result ?& array[
      'readable', 'imageQualityNote', 'conclusion', 'marketState', 'thesis',
      'technicalPoints', 'supportZones', 'resistanceZones', 'tradePlan',
      'rating', 'invalidation', 'riskNotes'
    ])
  ) then
    raise exception 'INVALID_RESULT';
  end if;
  if p_result is not null and octet_length(p_result::text) > 50000 then
    raise exception 'RESULT_TOO_LARGE';
  end if;

  update public.chart_analysis_requests
  set status = p_status,
      model = nullif(left(trim(coalesce(p_model, '')), 80), ''),
      result = case when p_status = 'completed' then p_result else null end,
      error_message = case when p_status = 'error' then left(coalesce(p_error_message, '分析失敗'), 300) else null end
  where id = p_request_id
    and user_id = v_user
    and status = 'pending';

  if not found then
    raise exception 'REQUEST_NOT_FOUND';
  end if;
end;
$$;

revoke all on function public.get_chart_analysis_quota() from public, anon;
revoke all on function public.consume_chart_analysis_quota(text, text, text, numeric) from public, anon;
revoke all on function public.finish_chart_analysis_request(uuid, text, text, jsonb, text) from public, anon;
grant execute on function public.get_chart_analysis_quota() to authenticated;
grant execute on function public.consume_chart_analysis_quota(text, text, text, numeric) to authenticated;
grant execute on function public.finish_chart_analysis_request(uuid, text, text, jsonb, text) to authenticated;

comment on table public.ai_feature_access is '限定會員 AI 線圖分析權限；由管理員透過 Dashboard 維護。';
comment on table public.chart_analysis_requests is 'AI 線圖分析額度與結果紀錄，不保存原始圖片。';
