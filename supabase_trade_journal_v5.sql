-- 短線操作日誌 v5：新增可分批進出、FIFO 配對的交易明細。
-- 請在已執行 v2、v3、v4 後執行此檔。
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

-- 將舊版單筆日誌盡量轉成明細；可重複執行，不會重複插入相同明細。
insert into public.trade_journal_fills
  (journal_id, user_id, fill_date, side, shares, price, currency, fx_rate, fx_fetched_at)
select id, user_id, coalesce(entry_date, trade_date), 'buy', shares, entry_price,
       coalesce(currency, case when market = 'us' then 'USD' else 'TWD' end),
       case when coalesce(currency, case when market = 'us' then 'USD' else 'TWD' end) = 'USD' then fx_rate else 1 end,
       fx_fetched_at
from public.trade_journal_entries e
where e.shares is not null and e.entry_price is not null
  and not exists (
    select 1 from public.trade_journal_fills f
    where f.journal_id = e.id and f.side = 'buy'
      and f.fill_date = coalesce(e.entry_date, e.trade_date)
      and f.shares = e.shares and f.price = e.entry_price
  );

insert into public.trade_journal_fills
  (journal_id, user_id, fill_date, side, shares, price, currency, fx_rate, fx_fetched_at)
select id, user_id, coalesce(exit_date, trade_date), 'sell', shares, exit_price,
       coalesce(currency, case when market = 'us' then 'USD' else 'TWD' end),
       case when coalesce(currency, case when market = 'us' then 'USD' else 'TWD' end) = 'USD' then fx_rate else 1 end,
       fx_fetched_at
from public.trade_journal_entries e
where e.shares is not null and e.exit_price is not null
  and not exists (
    select 1 from public.trade_journal_fills f
    where f.journal_id = e.id and f.side = 'sell'
      and f.fill_date = coalesce(e.exit_date, e.trade_date)
      and f.shares = e.shares and f.price = e.exit_price
  );
