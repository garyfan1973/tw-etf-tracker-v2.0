-- 短線操作日誌 v4：修正一般買進後賣出的損益方向。
-- 請在已執行 supabase_trade_journal_v3.sql 後執行此檔。
-- 正確公式：（賣出價 - 買進價）× 股數。
update public.trade_journal_entries
set pnl_native = (exit_price - entry_price) * shares
where entry_price is not null
  and exit_price is not null
  and shares is not null;

update public.trade_journal_entries
set pnl_twd = case
  when currency = 'USD' and fx_rate is not null then pnl_native * fx_rate
  else pnl_native
end
where pnl_native is not null;
