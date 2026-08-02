-- 每日投資績效快照
-- 請 Gary 在 Supabase SQL Editor 執行；此檔不會由程式自動執行。
create table if not exists public.portfolio_daily_snapshots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_date date not null,
  etf_code text not null,
  etf_name text not null,
  shares numeric not null default 0,
  price numeric,
  invested_cost numeric not null default 0,
  cost_basis numeric not null default 0,
  market_value numeric,
  unrealized_pnl numeric,
  realized_pnl numeric not null default 0,
  dividend_income numeric not null default 0,
  pnl_ex_dividend numeric,
  pnl_with_dividend numeric,
  return_ex_dividend numeric,
  return_with_dividend numeric,
  source_date date,
  created_at timestamptz not null default now(),
  unique (user_id, snapshot_date, etf_code)
);

create index if not exists portfolio_daily_snapshots_user_date_idx
  on public.portfolio_daily_snapshots (user_id, snapshot_date desc);

create index if not exists portfolio_daily_snapshots_user_etf_date_idx
  on public.portfolio_daily_snapshots (user_id, etf_code, snapshot_date desc);

alter table public.portfolio_daily_snapshots enable row level security;

drop policy if exists "Users can read their own performance snapshots"
  on public.portfolio_daily_snapshots;
create policy "Users can read their own performance snapshots"
  on public.portfolio_daily_snapshots
  for select to authenticated
  using ((select auth.uid()) = user_id);

grant select on table public.portfolio_daily_snapshots to authenticated;
grant select, insert, update on table public.portfolio_daily_snapshots to service_role;
grant usage, select on sequence public.portfolio_daily_snapshots_id_seq to service_role;
