# 台股 ETF 持股與績效追蹤

這是一個以台股 ETF 為主的個人投資追蹤工具，整合 ETF 持股、每日加減碼、行情、配息、三大法人、融資融券、K 線、股東分佈與個人交易紀錄。

目前公開市場資料以 JSON 保存並由 GitHub Actions 定期更新；個人交易、關注清單與績效快照則使用 Supabase 保存。

## 目前功能

完整系統架構、元件責任與資料流請參閱：[系統架構圖](docs/system-architecture.md)，也可查看[簡報級 SVG 架構圖](docs/system-architecture.svg)或[PNG 簡報圖片](docs/system-architecture-presentation-v3.png)。

### ETF 持股資訊

- 顯示 ETF 合計持有股數、投入成本、現值、損益與報酬率。
- 顯示各筆買入明細，支援收合與展開。
- 支援買入、賣出與 FIFO（先進先出）持股計算。
- 支援定期定額資料：買入日期可留白，展開時標示「定期定額」。
- 買入手續費依 `webapp/portfolio_config.json` 設定計算，目前預設為國泰費率 0.0399%，最低 1 元。
- 顯示最近除息、下次除息與依持股推算的配息金額。
- 非股票部位，例如現金、期貨、選擇權或債券，會在「其他資產」區塊獨立顯示，不混入股票行情與加減碼計算。

### 加減碼

以持有股數變化判定：

| 狀態 | 判定條件 |
| --- | --- |
| 新增 | 目標日有、比較日前沒有 |
| 剔除 | 比較日有、目標日沒有 |
| 加碼 | 目標日持有股數增加 |
| 減碼 | 目標日持有股數減少 |

加減碼頁面提供圖表與表格檢視，可搜尋個股、依欄位排序，並顯示估算金額與股數。

### 行情與 K 線

- 台股行情使用指定日期的上市／上櫃盤後資料。
- 海外成分股使用 Yahoo Finance 日線資料。
- 顯示開盤、最高、最低、收盤、前日收盤、漲跌、漲跌幅、振幅與成交量。
- K 線圖支援日線，並可查看 ETF 或成分股。
- 滑鼠移到 K 棒時可查看當日開高低收與成交量。
- 批次只會使用與快照日期相同的行情；指定日期查不到時留空，不使用前一天或其他日期行情代替。

### 配息日曆

- 顯示除息日、發放日、每股／每單位配息。
- 顯示最近除息與下次除息資訊。
- 依除息日前持股數推算最近一次配息金額。
- 依目前持股數推算尚未除息的預計可配息金額。
- 顯示台灣與美國國定假日，並以不同顏色區分。

### 三大法人

- 顯示 ETF 本身與持股成分近三個交易日的三大法人買賣超。
- 可查看外資、投信、自營商及合計資料。
- 交易所原始資料以買賣超股數提供，畫面上的金額為「買賣超股數 × 當日收盤價」估算。
- 上市資料使用 TWSE T86；上櫃資料使用 TPEx 公開資料，若來源暫時無法取得則可能缺漏。

### 融資融券

- 顯示融資與融券餘額，單位為張。
- 資、券使用不同顏色與標籤，數字靠右對齊。
- 顯示最近日期的資料，並可查看融資融券餘額變化趨勢圖。
- 趨勢圖可切換 ETF 本身或其成分股。

### 股東分佈與 ETF 總覽

- 顯示持股級距的人數占比與持股占比。
- 滑鼠移到級距時，可查看換算後的股東人數與持股張數。
- ETF 總覽包含基金規模、受益人數、最近配息、分類及主動／被動、高息等屬性。
- 股東分佈資料來自 TDCC 公開資料；資料頻率依官方公布週期更新。

### 個人功能

- Supabase Auth Email／密碼登入。
- 我的關注 ETF 清單。
- 個人交易紀錄：買入、賣出、編輯、刪除與日期／ETF 條件查詢。
- 短線操作日誌：獨立記錄台灣／美國 ETF 與股票的操作計畫、買進日／賣出日、進出場價格、停損／目標、狀態與事後檢討，不與個人交易紀錄或公開 ETF 清單連動。
- FIFO 持股計算。
- 每日績效快照，可查詢日期區間、切換含息／不含息報酬率，並查看報酬率曲線與明細。

## 頁面

所有頁面位於 `webapp/`：

| 頁面 | 檔案 |
| --- | --- |
| 持股資訊／加減碼 | `portfolio.html` |
| 配息日曆 | `dividends.html` |
| 交易紀錄 | `transactions.html` |
| 短線操作日誌 | `journal.html` |
| 績效與報酬率 | `performance.html` |
| K 線圖 | `kline.html` |
| 首頁 | `index.html` |

## 資料來源

- ETF 持股與配息：MoneyDJ ETF 每日持股／配息揭露。
- 台股上市行情：TWSE 公開盤後資料。
- 台股上櫃行情：TPEx 公開資料。
- 三大法人：TWSE T86 與 TPEx 公開資料。
- 融資融券：TWSE MI_MARGN 與 TPEx 公開資料。
- 海外行情：Yahoo Finance 日線資料。
- ETF 清單：官方上市／上櫃 ETF 資料。
- 短線日誌標的清單：台灣使用 TWSE／TPEx，美國使用 Nasdaq Trader 公開掛牌清單；清單是一次性手動更新，日誌仍允許自行輸入清單外代號。
- 公司產業與業務摘要：公開公司資料，保存於 `webapp/company_profiles.json`。
- ETF 總覽：證交所 ETF 公開資料。
- 股東分佈：TDCC 公開資料。

行情批次有嚴格日期校驗：每個行情欄位的 `quoteDate` 必須等於該份 ETF 快照的日期，避免把前一天或前幾天的行情誤標成最新資料。

## 本機測試

請使用真正的 repo 路徑：

```bash
cd /Users/garyfan/.codex/tw-etf-tracker-v2.0/webapp
python3 -m http.server 8002
```

瀏覽器網址：

```text
http://localhost:8002/index.html
http://localhost:8002/portfolio.html
http://localhost:8002/transactions.html
http://localhost:8002/dividends.html
http://localhost:8002/performance.html
http://localhost:8002/kline.html
```

測試完在終端機按 `Ctrl + C` 停止伺服器。

## 更新資料

手動更新：

```bash
cd /Users/garyfan/.codex/tw-etf-tracker-v2.0
python3 fetch_etf_list.py
python3 fetch_trade_assets.py
python3 fetch.py
python3 fetch_company_profiles.py
```

`fetch.py` 會：

1. 抓取 ETF 當日持股。
2. 保存 `data/<ETF代號>_<日期>.json` 歷史快照。
3. 依指定日期抓取行情、三大法人與融資融券。
4. 更新 `webapp/data.js`。
5. 回補既有快照的同日行情。
6. 執行行情日期一致性檢查。

如果來源沒有提供指定日期的資料，程式會保留空值，不會拿其他日期的資料代替。

## GitHub Actions 自動更新

工作流程位於 `.github/workflows/update-data.yml`，目前每天執行五次：

- 台灣時間 19:30
- 台灣時間 20:00
- 台灣時間 20:30
- 台灣時間 21:00
- 台灣時間 21:30

GitHub Actions 會依序：

1. 更新 ETF 清單。
2. 執行 `fetch.py` 更新持股、行情、配息與參考資料。
3. 更新公司產業資料。
4. 執行 `record_daily_snapshots.py` 寫入 Supabase 績效快照。
5. 有資料變更時 commit 並 push 回 GitHub。

也可以在 GitHub repo 的 Actions 頁面手動執行 `更新 ETF 資料`。

需要注意：GitHub Actions 的執行時間是 UTC cron，workflow 內已換算為台灣時間。不同日期若來源尚未更新，該次執行可能沒有新快照。

## GitHub 與 Vercel 部署

GitHub repository：

```text
https://github.com/garyfan1973/tw-etf-tracker-v2.0
```

Vercel 設定：

1. 將此 GitHub repo 匯入 Vercel。
2. Root Directory 設為 `webapp`。
3. Framework Preset 使用 Other，不需要 build command。
4. Production Branch 設為 `main`。

推送到 `main` 後，Vercel 會自動部署正式網站；非 `main` 分支會產生 Preview Deployment，可先測試大型功能，再合併到 `main`。

## 修改流程

小型修改可以直接在 `main` 進行；大型功能建議使用獨立分支：

```bash
cd /Users/garyfan/.codex/tw-etf-tracker-v2.0
git pull origin main
git switch -c feature/功能名稱

# 修改程式並在本機測試
git add -A
git commit -m "feat(scope): 說明修改內容"
git push -u origin feature/功能名稱
```

分支推送後可使用 Vercel Preview 網址測試。確認無誤後再建立 Pull Request，合併到 `main`，正式網站才會更新。

GitHub Actions 會自動更新資料並提交，因此每次修改程式前務必先執行：

```bash
git pull origin main
```

若本機有未提交修改，先確認並保存，再進行同步，避免覆蓋本機工作。

## Supabase 設定

目前 Supabase 用於：

- `watchlist`：使用者關注 ETF。
- `portfolio_transactions`：個人買入／賣出交易。
- `trade_journal_entries`：個人短線操作計畫與檢討（需執行 `supabase_trade_journal.sql`；既有舊版資料表請依序執行 `supabase_trade_journal_v2.sql`、`supabase_trade_journal_v3.sql`、`supabase_trade_journal_v4.sql`）。標的可獨立記錄台灣／美國 ETF 與股票，不依賴公開 ETF 清單，並保存已結算損益與美元／台幣匯率。
- `portfolio_daily_snapshots`：每日績效快照。

前端設定檔為 `webapp/config.js`，只可放 Project URL 與 publishable／anon key；絕對不可放入 `service_role` 或 Secret key。

每日績效快照需要先執行：

```text
supabase_portfolio_daily_snapshots.sql
```

並在 GitHub repo 的 Settings → Secrets and variables → Actions 設定：

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

`SUPABASE_SERVICE_ROLE_KEY` 只能放在 GitHub Secret，不能放入前端、JSON 或 Git repository。

### 本地測試的重要注意事項

目前本地版 `webapp/config.js` 連接正式 Supabase 專案，因此：

- 本地查詢資料通常不會修改資料庫。
- 本地新增、編輯、刪除交易會影響正式資料。
- 本地新增或移除關注 ETF 也會影響正式資料。
- 執行每日快照批次也可能寫入正式資料庫。

測試交易功能前，建議建立獨立的 Supabase 測試專案，或只測試查詢與畫面功能，避免誤改正式投資資料。

## 新增追蹤 ETF

固定追蹤清單位於 `fetch.py` 的 `ETFS`。若要加入固定 ETF，可在該字典加入代號與名稱：

```python
ETFS = {
    "00981A": "主動統一台股增長",
    "00982A": "主動群益台灣強棒",
    "00980A": "主動野村臺灣智慧優選",
}
```

會員關注清單中的 ETF 也會由每日批次透過 Supabase `all_watchlist_codes()` 納入更新。

## 目錄說明

```text
.
├── data/                         # ETF 歷史快照與配息 JSON
├── fetch.py                      # 主資料抓取與快照產生
├── fetch_etf_list.py             # 更新 ETF 清單
├── fetch_trade_assets.py         # 一次性／手動更新短線日誌標的清單
├── fetch_company_profiles.py     # 更新公司產業資料
├── record_daily_snapshots.py     # 寫入 Supabase 績效快照
├── supabase_*.sql                # Supabase 資料表與函式 SQL
├── .github/workflows/             # GitHub Actions 排程
└── webapp/                       # 靜態網站與前端資料
```

## 資料與投資風險聲明

本專案僅供個人研究與紀錄使用，不構成投資建議。行情、持股與配息資料以來源當時提供的內容為準；法人金額、配息金額與含息報酬率部分屬於依公開資料推算的估算值，請勿視為券商對帳單或實際入帳金額。
