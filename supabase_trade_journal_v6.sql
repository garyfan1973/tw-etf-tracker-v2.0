-- 短線操作日誌 v6：加入買賣手續費、證交稅與美股監管費欄位。
-- 請在已執行 v5 後執行此檔。
alter table public.trade_journal_fills
  add column if not exists commission_native numeric not null default 0
    check (commission_native >= 0),
  add column if not exists tax_native numeric not null default 0
    check (tax_native >= 0),
  add column if not exists regulatory_fee_native numeric not null default 0
    check (regulatory_fee_native >= 0);

-- 舊資料沒有費用明細，預設為 0；新資料由前端依市場與商品自動計算。
update public.trade_journal_fills
set commission_native = coalesce(commission_native, 0),
    tax_native = coalesce(tax_native, 0),
    regulatory_fee_native = coalesce(regulatory_fee_native, 0)
where commission_native is null
   or tax_native is null
   or regulatory_fee_native is null;
