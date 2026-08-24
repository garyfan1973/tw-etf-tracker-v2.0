-- 擴充既有持股交易，保留 etf_code 供舊版前端與排程相容。
alter table public.portfolio_transactions
  add column if not exists symbol text,
  add column if not exists market text not null default 'tw',
  add column if not exists asset_type text not null default 'etf',
  add column if not exists asset_name text,
  add column if not exists exchange text,
  add column if not exists currency text not null default 'TWD';

update public.portfolio_transactions
set symbol = upper(etf_code)
where symbol is null or btrim(symbol) = '';

alter table public.portfolio_transactions
  alter column symbol set not null;

alter table public.portfolio_transactions
  drop constraint if exists portfolio_transactions_market_check,
  add constraint portfolio_transactions_market_check
    check (market in ('tw', 'us')),
  drop constraint if exists portfolio_transactions_asset_type_check,
  add constraint portfolio_transactions_asset_type_check
    check (asset_type in ('etf', 'stock')),
  drop constraint if exists portfolio_transactions_currency_check,
  add constraint portfolio_transactions_currency_check
    check (currency in ('TWD', 'USD'));

create index if not exists portfolio_transactions_user_asset_idx
  on public.portfolio_transactions (user_id, market, asset_type, symbol, trade_date);

revoke all on table public.portfolio_transactions from anon;
grant select, insert, update, delete on table public.portfolio_transactions to authenticated;

comment on column public.portfolio_transactions.etf_code is
  '舊版相容欄位；新程式以 symbol 為主，寫入時仍同步保存相同值。';
comment on column public.portfolio_transactions.market is 'tw 或 us';
comment on column public.portfolio_transactions.asset_type is 'etf 或 stock';
comment on column public.portfolio_transactions.currency is '交易原幣：TWD 或 USD';
