# 跨市場投資研究工作台

這是一個整合台股、台灣 ETF、美股與美國 ETF 的個人投資研究工具。所有標的共用完整 K 線、技術指標、財報、消息與個人交易圖層；ETF 另提供持股、每日加減碼、配息、三大法人、融資融券及股東分佈。會員功能包含多市場持股、交易日誌、績效追蹤、AI 線圖分析與平日 Email 晨報。

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

- 可依代號或名稱搜尋台股、台灣 ETF、美股與美國 ETF。
- 台股行情使用指定日期的上市／上櫃盤後資料。
- 海外成分股使用 Yahoo Finance 日線資料。
- 顯示開盤、最高、最低、收盤、前日收盤、漲跌、漲跌幅、振幅與成交量。
- 所有市場標的使用同一套 K 線圖，支援 MA、VOL5／VOL10、布林通道、KD、MACD、RSI、縮放平移與期間切換。
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
- 個人交易紀錄：支援台灣／美國市場、股票／ETF 的買入、賣出、編輯與刪除，並以 TWD、USD 分開計算持股成本、現值與損益。
- 台股手續費與交易稅可自動估算，美股支援零股與自行填寫交易成本；賣出依 FIFO 回沖買進批次。
- 短線操作日誌：獨立記錄台灣／美國 ETF 與股票的操作計畫、買進日／賣出日、進出場價格、停損／目標、狀態與事後檢討，不與個人交易紀錄或公開 ETF 清單連動。
- 每日績效快照，可查詢日期區間、切換含息／不含息報酬率，並查看報酬率曲線與明細。
- 限定會員 AI 線圖綜合分析：上傳 JPG／PNG／WebP 線圖，選擇一般、快閃、隔日沖或低接模式；後端依標的補入除息、近期消息及可取得的法人／融資券／集保資料，產生結構化綜合判讀、支撐壓力、交易計畫與風險提醒。
- AI 分析結果保存在 Supabase；線圖保存五天，期間可由歷史紀錄重新檢視、匯出 PDF 或寄送 Email，逾期後仍保留文字分析。
- 會員 AI 晨報：最多設定 20 檔台灣／美國股票或 ETF，每日 06:30、07:30、08:30 依實際行情日期補跑盤後綜合分析；只有新交易資料才寄送 PDF，且不扣除互動式分析額度。

## 頁面

所有頁面位於 `webapp/`：

| 頁面 | 檔案 |
| --- | --- |
| 個股資訊／完整 K 線 | `tracker.html?view=overview` |
| 指數資訊 | `market-index.html` |
| 匯市資訊／匯率試算 | `forex.html` |
| 美國公債資訊／殖利率曲線 | `bonds.html` |
| 聯準會政策／利率與資產負債表 | `fed-policy.html` |
| 本週財經影音 | `videos.html` |
| 限定會員 AI 線圖分析 | `chart-analysis.html` |
| 會員 AI 晨報設定 | `morning-report-settings.html` |
| ETF 持股資訊／加減碼 | `tracker.html` |
| 配息日曆 | `dividends.html` |
| 我的持股 | `portfolio.html` |
| 交易紀錄 | `transactions.html` |
| 短線操作日誌 | `journal.html` |
| 績效與報酬率 | `performance.html` |
| 舊 K 線網址（自動導向市場研究） | `kline.html` |
| 首頁 | `index.html` |

## 資料來源

- ETF 持股與配息：MoneyDJ ETF 每日持股／配息揭露。
- 台股上市行情：TWSE 公開盤後資料。
- 台股上櫃行情：TPEx 公開資料。
- 三大法人：TWSE T86 與 TPEx 公開資料。
- 融資融券：TWSE MI_MARGN 與 TPEx 公開資料。
- 台股財報：公開資訊觀測站，使用 2013 年至今的營收、營業利益、淨利、基本 EPS 與現金流量表；畫面名稱簡化為「EPS」及各項現金流。
- 海外個股財報：Yahoo Finance，EPS 使用基本 EPS，並補充營業／投資／融資現金流、自由現金流與期末現金（依資料來源可用性顯示）。
- 海外行情：Yahoo Finance 日線資料。
- 首頁市場總覽：台灣加權、電子與金融指數採臺灣證券交易所資料，櫃買指數採證券櫃檯買賣中心資料；主圖搭配近 40 個交易日收盤與官方成交金額。
- 全球指數、Russell 2000、VIX、美元指數、原油與主要貨幣參考匯率：Yahoo Finance 日線資料，由 `fetch_macro_markets.py` 每日整理至 `webapp/market_data.json`；台灣加權指數成交金額以證交所大盤統計資訊覆蓋，並保留近一年官方歷史資料。
- 美國公債殖利率曲線：美國財政部 Daily Treasury Par Yield Curve Rates，由 `fetch_macro_markets.py` 每日更新。
- 聯準會政策：FRED 的政策利率、總資產、公債、MBS、準備金與 ON RRP 序列，搭配聯準會官方貨幣政策 RSS 與 FOMC 日程，由 `fetch_fed_policy.py` 更新。
- 財經影音：六個指定 YouTube 官方頻道的 RSS，只保留最近七天公開影片，由 `fetch_financial_videos.py` 每兩小時更新。
- 總經新聞：中央社財經／國際 RSS，加上經濟日報與工商時報首頁標題，保留最近五天內容，由 `fetch_macro_news.py` 每兩小時更新。
- K 線歷史行情：Yahoo Finance 兩年日線 OHLCV，依市場與代號保存於 `webapp/price-history/`；市場研究開啟標的時會再合併最新行情，上市台股最新月份以臺灣證券交易所官方 OHLCV 覆蓋。
- ETF 清單：官方上市／上櫃 ETF 資料。
- 短線日誌標的清單：台灣使用 TWSE／TPEx，美國使用 Nasdaq Trader 公開掛牌清單；清單是一次性手動更新，日誌仍允許自行輸入清單外代號。
- 公司產業與業務摘要：公開公司資料，保存於 `webapp/company_profiles.json`。
- ETF 總覽：證交所 ETF 公開資料。
- 股東分佈：TDCC 公開資料。

行情批次有嚴格日期校驗：每個行情欄位的 `quoteDate` 必須等於該份 ETF 快照的日期，避免把前一天或前幾天的行情誤標成最新資料。

## 本機啟動與測試

純前端頁面可直接使用 Python 靜態伺服器：

```bash
cd /Users/garyfan/.codex/tw-etf-tracker-v2.0/webapp
python3 -m http.server 8002
```

主要入口：

```text
http://localhost:8002/index.html
http://localhost:8002/tracker.html?view=overview
http://localhost:8002/portfolio.html
http://localhost:8002/transactions.html
http://localhost:8002/dividends.html
http://localhost:8002/performance.html
http://localhost:8002/chart-analysis.html
http://localhost:8002/morning-report-settings.html
```

測試完在終端機按 `Ctrl + C` 停止伺服器。`webapp/api/` 下的 Vercel Functions 不會由 Python 靜態伺服器執行；要完整測試行情／財報 API、AI 分析及 Email 寄送，請使用 Vercel 開發環境或已部署的 Preview。

複製 `.env.example` 為 `webapp/.env.local`（若從專案根目錄啟動開發環境，也可放在根目錄）後按需設定：

| 環境變數 | 用途 |
| --- | --- |
| `OPENAI_API_KEY` | 伺服器端 AI 線圖分析 |
| `OPENAI_MODEL` | 選用的 OpenAI 模型；未設定時預設 `gpt-5.4` |
| `GMAIL_USER` | 寄送分析 PDF 與晨報的 Gmail 帳號 |
| `GMAIL_APP_PASSWORD` | Gmail App Password，不是一般登入密碼 |
| `GMAIL_FROM_NAME` | 寄件者顯示名稱 |
| `SUPABASE_URL` | 晨報批次與伺服器端授權使用的 Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 晨報批次與每日績效快照使用，僅限伺服器端／GitHub Secrets |

任何 Secret 都不可提交到 Git，`SUPABASE_SERVICE_ROLE_KEY` 也不可放入瀏覽器程式。

首次啟用 AI 功能時，請依功能套用下列 Supabase migration：

1. `supabase_chart_analysis.sql`：會員權限、每日額度與分析紀錄。
2. `supabase_chart_analysis_history.sql`：線圖歷史與五天保存期限。
3. `supabase_chart_analysis_email.sql`：PDF Email 寄送紀錄與每日限制。
4. `supabase_morning_reports.sql`：晨報設定、分析結果與寄送狀態。

以 Email 開通會員與設定每日額度的範例：

```sql
insert into public.ai_feature_access (user_id, enabled, daily_limit, note)
select id, true, 5, 'AI 線圖分析會員'
from auth.users
where lower(email) = lower('member@example.com')
on conflict (user_id) do update
set enabled = excluded.enabled,
    daily_limit = excluded.daily_limit,
    note = excluded.note,
    updated_at = now();
```

停用時將該會員的 `enabled` 改為 `false`；也可設定 `expires_at` 控制到期日。

執行全部單元測試：

```bash
python3 -m unittest discover -s tests -v
```

## 更新資料

手動更新：

```bash
cd /Users/garyfan/.codex/tw-etf-tracker-v2.0
python3 fetch_etf_list.py
python3 fetch_trade_assets.py
python3 fetch.py
python3 fetch_price_history.py
python3 fetch_macro_markets.py
python3 fetch_company_profiles.py
python3 fetch_fed_policy.py
python3 fetch_financial_videos.py
python3 fetch_macro_news.py
```

`fetch.py` 會：

1. 抓取 ETF 當日持股。
2. 保存 `data/<ETF代號>_<日期>.json` 歷史快照。
3. 依指定日期抓取行情、三大法人與融資融券。
4. 更新 `webapp/data.js`。
5. 回補既有快照的同日行情。
6. 執行行情日期一致性檢查。

如果來源沒有提供指定日期的資料，程式會保留空值，不會拿其他日期的資料代替。

`fetch_price_history.py` 首次以 `--full` 匯入最多兩年資料，之後每日只抓近一個月並合併更新：

```bash
python3 fetch_price_history.py --full
```

K 線圖支援 MA5／10／20／60／120／240、布林通道、MACD、RSI、KD，以及 1 個月至 2 年的快捷區間。滑鼠滾輪或觸控板可縮放，拖曳可平移時間區間。

## GitHub Actions 自動更新

工作流程位於 `.github/workflows/`，分為三條：

| 工作流程 | 排程（台灣時間） | 用途 |
| --- | --- | --- |
| `update-data.yml` | 每日 19:30、20:00、20:30、21:00、21:30；週一至週五 05:20 再補抓美股收盤 | ETF、行情、K 線、總經市場、公司資料與績效快照 |
| `update-financial-content.yml` | 每兩小時 | 聯準會政策、財經影音與總經新聞 |
| `morning-report.yml` | 週一至週五 06:30 | 產生會員 AI 晨報並逐檔寄送 PDF |

主要資料工作流會依序：

1. 更新 ETF 清單。
2. 執行 `fetch.py` 更新持股、行情、配息與參考資料。
3. 增量更新兩年 K 線歷史行情。
4. 更新指數、匯率、美國公債與公司產業資料。
5. 執行 `record_daily_snapshots.py` 寫入 Supabase 績效快照。
6. 有資料變更時 commit 並 push 回 GitHub。

三條工作流都支援從 GitHub repo 的 Actions 頁面手動執行。晨報另提供 `dry_run`（只產生分析與 PDF、不寄信）及 `force`（忽略當日完成紀錄並重跑）選項。

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
- `portfolio_transactions`：台灣／美國股票與 ETF 的個人買入／賣出交易；多市場欄位需套用 `supabase_portfolio_multi_market.sql`。
- `trade_journal_entries`／`trade_journal_fills`：個人短線操作計畫與多筆進出明細（需執行 `supabase_trade_journal.sql`；既有舊版資料表請依序執行 `supabase_trade_journal_v2.sql`、`supabase_trade_journal_v3.sql`、`supabase_trade_journal_v4.sql`、`supabase_trade_journal_v5.sql`、`supabase_trade_journal_v6.sql`）。標的可獨立記錄台灣／美國 ETF 與股票，不依賴公開 ETF 清單，並以 FIFO 保存分批進出、交易成本與淨損益。
- `portfolio_daily_snapshots`：每日績效快照。
- `ai_feature_access`／`chart_analysis_requests`／`chart_analysis_email_log`：AI 會員權限、每日用量、分析歷史與 Email 紀錄。
- `morning_report_settings`／`morning_report_symbols`：會員晨報開關與最多 20 檔標的設定。
- `morning_report_runs`／`morning_report_results`／`morning_report_deliveries`：每日晨報批次、逐檔分析結果與寄送狀態；資料庫不保存收件 Email 地址。

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
├── fetch_price_history.py        # 兩年日線 OHLCV 匯入與增量更新
├── fetch_etf_list.py             # 更新 ETF 清單
├── fetch_macro_markets.py        # 更新指數、匯率與美國公債資料
├── fetch_fed_policy.py           # 更新聯準會政策資料
├── fetch_financial_videos.py     # 更新最近七天財經影音
├── fetch_macro_news.py           # 更新最近五天總經新聞
├── fetch_trade_assets.py         # 一次性／手動更新短線日誌標的清單
├── fetch_company_profiles.py     # 更新公司產業資料
├── record_daily_snapshots.py     # 寫入 Supabase 績效快照
├── scripts/morning_report.py     # 產生並寄送會員 AI 晨報
├── tests/                        # Python 單元測試
├── supabase_*.sql                # Supabase 資料表與函式 SQL
├── .github/workflows/             # GitHub Actions 排程
└── webapp/                       # 靜態網站與前端資料
    └── price-history/            # 各市場、各代號的兩年行情 JSON
```

## 資料與投資風險聲明

本專案僅供個人研究與紀錄使用，不構成投資建議。行情、持股與配息資料以來源當時提供的內容為準；法人金額、配息金額與含息報酬率部分屬於依公開資料推算的估算值，請勿視為券商對帳單或實際入帳金額。
