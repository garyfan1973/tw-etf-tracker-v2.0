-- 短線操作日誌 v3：保存已結算損益與美元／台幣換算資訊。
-- 請在已執行 supabase_trade_journal_v2.sql 後執行此檔。
alter table public.trade_journal_entries
  add column if not exists currency text,
  add column if not exists pnl_native numeric,
  add column if not exists pnl_twd numeric,
  add column if not exists fx_rate numeric,
  add column if not exists fx_fetched_at timestamptz;

update public.trade_journal_entries
set currency = case when market = 'us' then 'USD' else 'TWD' end
where currency is null;

alter table public.trade_journal_entries
  alter column currency set default 'TWD',
  alter column currency set not null;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_currency_check;

alter table public.trade_journal_entries
  add constraint trade_journal_entries_currency_check check (currency in ('TWD', 'USD'));
