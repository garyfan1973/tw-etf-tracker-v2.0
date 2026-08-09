-- 短線操作日誌
-- 請在 Supabase SQL Editor 執行；此檔不會由程式自動執行。
create table if not exists public.trade_journal_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_date date not null default current_date,
  entry_date date,
  exit_date date,
  asset_type text not null check (asset_type in ('etf', 'stock')),
  market text not null check (market in ('tw', 'us')),
  symbol text not null,
  asset_name text,
  action text not null check (action in ('buy', 'sell', 'watch')),
  status text not null default 'planned' check (status in ('planned', 'open', 'closed', 'cancelled')),
  shares numeric check (shares is null or shares > 0),
  entry_price numeric check (entry_price is null or entry_price >= 0),
  exit_price numeric check (exit_price is null or exit_price >= 0),
  stop_loss numeric check (stop_loss is null or stop_loss >= 0),
  target_price numeric check (target_price is null or target_price >= 0),
  currency text not null default 'TWD' check (currency in ('TWD', 'USD')),
  pnl_native numeric,
  pnl_twd numeric,
  fx_rate numeric check (fx_rate is null or fx_rate > 0),
  fx_fetched_at timestamptz,
  thesis text,
  review text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trade_journal_entries_user_date_idx
  on public.trade_journal_entries (user_id, trade_date desc, created_at desc);

alter table public.trade_journal_entries enable row level security;

drop policy if exists "Users can manage their own trade journal" on public.trade_journal_entries;
create policy "Users can manage their own trade journal"
  on public.trade_journal_entries
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.trade_journal_entries to authenticated;
grant usage, select on sequence public.trade_journal_entries_id_seq to authenticated;

-- 每筆實際進出明細；同一操作日誌可有多次買進與賣出。
create table if not exists public.trade_journal_fills (
  id bigint generated always as identity primary key,
  journal_id bigint not null references public.trade_journal_entries(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  fill_date date not null,
  side text not null check (side in ('buy', 'sell')),
  shares numeric not null check (shares > 0),
  price numeric not null check (price >= 0),
  currency text not null default 'TWD' check (currency in ('TWD', 'USD')),
  fx_rate numeric check (fx_rate is null or fx_rate > 0),
  fx_fetched_at timestamptz,
  created_at timestamptz not null default now(),
  unique (journal_id, fill_date, side, shares, price)
);

create index if not exists trade_journal_fills_user_journal_date_idx
  on public.trade_journal_fills (user_id, journal_id, fill_date, created_at);

alter table public.trade_journal_fills enable row level security;

drop policy if exists "Users can manage their own trade journal fills" on public.trade_journal_fills;
create policy "Users can manage their own trade journal fills"
  on public.trade_journal_fills
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

grant select, insert, update, delete on table public.trade_journal_fills to authenticated;
grant usage, select on sequence public.trade_journal_fills_id_seq to authenticated;
