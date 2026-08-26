-- 會員晨報設定、批次分析與逐檔寄送紀錄。

create table if not exists public.morning_report_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.morning_report_symbols (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null check (market in ('TW', 'US')),
  asset_type text not null check (asset_type in ('stock', 'etf')),
  symbol text not null,
  asset_name text not null,
  sort_order integer not null default 0 check (sort_order between 0 and 19),
  created_at timestamptz not null default now(),
  unique (user_id, market, symbol)
);

create index if not exists morning_report_symbols_user_order_idx
  on public.morning_report_symbols (user_id, sort_order, created_at);

create table if not exists public.morning_report_runs (
  id uuid primary key default gen_random_uuid(),
  report_date date not null unique,
  status text not null default 'running' check (status in ('running', 'completed', 'partial', 'error')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  symbol_count integer not null default 0,
  sent_count integer not null default 0,
  error_count integer not null default 0,
  error_message text
);

create table if not exists public.morning_report_results (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.morning_report_runs(id) on delete cascade,
  report_date date not null,
  market text not null check (market in ('TW', 'US')),
  symbol text not null,
  asset_name text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'error')),
  model text,
  analysis jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (report_date, market, symbol)
);

create table if not exists public.morning_report_deliveries (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.morning_report_runs(id) on delete cascade,
  report_date date not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  market text not null check (market in ('TW', 'US')),
  symbol text not null,
  subject text,
  status text not null default 'pending' check (status in ('pending', 'sent', 'error')),
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (report_date, user_id, market, symbol)
);

create index if not exists morning_report_deliveries_run_status_idx
  on public.morning_report_deliveries (run_id, status);
create index if not exists morning_report_deliveries_user_idx
  on public.morning_report_deliveries (user_id);
create index if not exists morning_report_results_run_idx
  on public.morning_report_results (run_id);

alter table public.morning_report_settings enable row level security;
alter table public.morning_report_symbols enable row level security;
alter table public.morning_report_runs enable row level security;
alter table public.morning_report_results enable row level security;
alter table public.morning_report_deliveries enable row level security;

revoke all on public.morning_report_settings from anon, authenticated;
revoke all on public.morning_report_symbols from anon, authenticated;
revoke all on public.morning_report_runs from anon, authenticated;
revoke all on public.morning_report_results from anon, authenticated;
revoke all on public.morning_report_deliveries from anon, authenticated;
grant select on public.morning_report_settings to authenticated;
grant select on public.morning_report_symbols to authenticated;

drop policy if exists "Members view their morning report settings" on public.morning_report_settings;
create policy "Members view their morning report settings"
  on public.morning_report_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Members view their morning report symbols" on public.morning_report_symbols;
create policy "Members view their morning report symbols"
  on public.morning_report_symbols for select
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.get_morning_report_settings()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_enabled boolean := false;
  v_symbols jsonb := '[]'::jsonb;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;

  select enabled into v_enabled
  from public.morning_report_settings
  where user_id = v_user;
  v_enabled := coalesce(v_enabled, false);

  select coalesce(jsonb_agg(jsonb_build_object(
    'market', market,
    'assetType', asset_type,
    'symbol', symbol,
    'assetName', asset_name
  ) order by sort_order, created_at), '[]'::jsonb)
  into v_symbols
  from public.morning_report_symbols
  where user_id = v_user;

  return jsonb_build_object('enabled', v_enabled, 'symbols', v_symbols);
end;
$$;

create or replace function public.save_morning_report_settings(
  p_symbols jsonb,
  p_enabled boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_count integer;
  v_item jsonb;
  v_market text;
  v_asset_type text;
  v_symbol text;
  v_asset_name text;
  v_order integer := 0;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED'; end if;
  if not exists (
    select 1 from public.ai_feature_access
    where user_id = v_user
      and enabled
      and (expires_at is null or expires_at > now())
  ) then raise exception 'FEATURE_NOT_ENABLED'; end if;
  if jsonb_typeof(coalesce(p_symbols, '[]'::jsonb)) <> 'array' then
    raise exception 'INVALID_SYMBOLS';
  end if;

  v_count := jsonb_array_length(coalesce(p_symbols, '[]'::jsonb));
  if v_count > 20 then raise exception 'MORNING_REPORT_LIMIT_REACHED'; end if;
  if coalesce(p_enabled, true) and v_count = 0 then raise exception 'MORNING_REPORT_SYMBOL_REQUIRED'; end if;

  delete from public.morning_report_symbols where user_id = v_user;
  for v_item in select value from jsonb_array_elements(coalesce(p_symbols, '[]'::jsonb)) loop
    v_market := upper(trim(coalesce(v_item->>'market', '')));
    v_asset_type := lower(trim(coalesce(v_item->>'assetType', '')));
    v_symbol := upper(trim(coalesce(v_item->>'symbol', '')));
    v_asset_name := trim(coalesce(v_item->>'assetName', ''));
    if v_market not in ('TW', 'US')
       or v_asset_type not in ('stock', 'etf')
       or v_symbol !~ '^[0-9A-Z.\-\^]{1,20}$'
       or char_length(v_asset_name) not between 1 and 160 then
      raise exception 'INVALID_SYMBOL';
    end if;
    insert into public.morning_report_symbols
      (user_id, market, asset_type, symbol, asset_name, sort_order)
    values
      (v_user, v_market, v_asset_type, v_symbol, left(v_asset_name, 160), v_order);
    v_order := v_order + 1;
  end loop;

  insert into public.morning_report_settings (user_id, enabled, updated_at)
  values (v_user, coalesce(p_enabled, true), now())
  on conflict (user_id) do update
    set enabled = excluded.enabled, updated_at = excluded.updated_at;

  return jsonb_build_object('enabled', coalesce(p_enabled, true), 'count', v_count);
exception
  when unique_violation then raise exception 'DUPLICATE_SYMBOL';
end;
$$;

revoke all on function public.get_morning_report_settings() from public, anon;
revoke all on function public.save_morning_report_settings(jsonb, boolean) from public, anon;
grant execute on function public.get_morning_report_settings() to authenticated;
grant execute on function public.save_morning_report_settings(jsonb, boolean) to authenticated;

comment on table public.morning_report_settings is '具 AI 線圖分析權限會員的晨報啟用狀態。';
comment on table public.morning_report_symbols is '會員晨報標的，最多 20 檔；透過原子 RPC 更新。';
comment on table public.morning_report_results is '每日每檔標的只產生一次的一般／盤後 AI 分析結果。';
comment on table public.morning_report_deliveries is '晨報逐會員逐標的寄送狀態；不保存 Email 地址。';
