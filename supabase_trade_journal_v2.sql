-- 短線操作日誌 v2：標的完全獨立於公開 ETF 清單，可記錄台／美 ETF 與個股。
-- 既有資料會保留；舊資料暫以台灣 ETF 標記，請依需要在日誌頁編輯修正。
alter table public.trade_journal_entries
  add column if not exists asset_type text,
  add column if not exists market text,
  add column if not exists symbol text,
  add column if not exists asset_name text,
  add column if not exists etf_code text;

update public.trade_journal_entries
set asset_type = coalesce(asset_type, 'etf'),
    market = coalesce(market, 'tw'),
    symbol = coalesce(symbol, etf_code)
where asset_type is null or market is null or symbol is null;

alter table public.trade_journal_entries
  alter column asset_type set default 'etf',
  alter column asset_type set not null,
  alter column market set default 'tw',
  alter column market set not null,
  alter column symbol set not null,
  alter column etf_code drop not null;

alter table public.trade_journal_entries
  drop constraint if exists trade_journal_entries_asset_type_check,
  drop constraint if exists trade_journal_entries_market_check;

alter table public.trade_journal_entries
  add constraint trade_journal_entries_asset_type_check check (asset_type in ('etf', 'stock')),
  add constraint trade_journal_entries_market_check check (market in ('tw', 'us'));
