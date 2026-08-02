# 主動式 ETF 每日加減碼追蹤

追蹤主動式 ETF（預設 00981A 主動統一台股增長）的每日完整持股，並自動算出
**新增 / 加碼 / 減碼 / 剔除**，用網頁查詢。

資料來源：
- 持股：MoneyDJ 每日持股揭露（`Basic0007B`），含完整持股與資料日期。
- 行情：TWSE OpenAPI 上市個股日成交（全部）＋ TPEx 上櫃個股日成交，
  每檔附開盤／最高／最低／收盤／前日收盤／振幅／成交量。

## 完整持股看得到什麼

主表精簡欄位：個股、權重%、收盤、漲跌幅、成交量(張)。
**點任一列會往下展開**，顯示該股當日：市場別、幣別、開盤／最高／最低、前日收盤、
漲跌、振幅、行情日、產業別與主要產品／業務。電腦版會盡量以單行呈現，手機版自動改為多行；漲跌用台股慣例（紅漲綠跌）。

**跨市場持股**：主動式 ETF（如 00990A）會持有美股/日股/韓股等，會標上市場別
（美股/日股/…／無代號者標「海外」）。
- 台股行情來自 TWSE/TPEx。
- 海外行情來自 **Yahoo Finance**（免金鑰）：美股、日股（.T）、韓股（.KS）都可取得
  開高低收/漲跌/振幅/成交量，明細會標**幣別**（USD/JPY/KRW）與**行情日**。
- 幣別不換算台幣；海外「行情日」是當地交易日，可能與台灣資料日差一個時區/交易日。
- 少數 MoneyDJ 未提供代號的海外股（如 INFINEON、SERVICENOW）仍無法查價，顯示「—」。
- 成交量一律以「千股」為單位（台股即『張』）。
- 公司產業與業務摘要存於 `webapp/company_profiles.json`，由 `fetch_company_profiles.py` 每日更新；台股使用證交所公開資料，海外股使用公開公司介紹資料。

## 每天怎麼用

1. 收盤後（建議傍晚，持股才更新）執行一次：

   ```bash
   cd ~/00981A-tracker
   python3 fetch.py
   ```

   會做三件事：抓當日持股 → 存成 `data/00981A_<日期>.json` 快照 → 更新
   `webapp/data.js`。

2. 用瀏覽器開啟 `webapp/index.html`（直接雙擊即可，不需要開伺服器）。
   - 上方選 **基準日 / 目標日**，就能看兩天之間的加減碼。
   - 預設是「最新一天 vs 前一天」。
   - 可搜尋個股或代號、點表頭排序。
   - 頂端可切換到 **配息日曆**（`dividends.html`）。
   - 個人交易表單可用 ETF 代號或名稱搜尋，清單由官方上市／上櫃 ETF 資料建立。

## 配息日曆（dividends.html）

- **即將到來**：列出已公告的未來除息／發放日與金額。
- **互動月曆**：藍＝除息日、綠＝發放日；上一月／下一月／今天切換。
- **點任一天**：顯示當天配息明細（每單位配息、年化配息率）。
- 可用上方晶片篩選只看某幾檔 ETF。
- 資料來源：MoneyDJ 配息揭露（`Basic0005`），含歷次與已公告未來配息。

> 第一次執行只有一天資料，所以還沒有可比對的「前一交易日」，隔天再跑就會出現加減碼。

## 加減碼怎麼判定

以**持有股數**變動為準（最能反映經理人實際操作，不受股價漲跌影響）：

| 狀態 | 條件 |
|------|------|
| 新增 | 今天有、前一交易日沒有 |
| 剔除 | 前一交易日有、今天沒有 |
| 加碼 | 持有股數增加 |
| 減碼 | 持有股數減少 |

## 要加追蹤其他主動式 ETF

編輯 `fetch.py` 最上面的 `ETFS`，把代號打開即可，例如：

```python
ETFS = {
    "00981A": "主動統一台股增長",
    "00980A": "主動野村臺灣智慧優選",
    "00982A": "主動群益台灣強棒",
}
```

## 自動化（選用）

想每天自動抓，可用 macOS 的 crontab（每個交易日 17:30 為例）：

```bash
crontab -e
# 加入這行
30 17 * * 1-5 cd ~/00981A-tracker && /usr/bin/python3 fetch.py >> cron.log 2>&1
```

## 部署（GitHub + Vercel，資料存 JSON）

網站是純靜態（HTML + `webapp/data.js`），不需要資料庫。

- **持久化**：`data/*.json` 快照與 `webapp/data.js` 都進版控，GitHub repo 就是資料庫。
- **自動更新**：`.github/workflows/update-data.yml` 每個交易日 17:30（台灣）在 GitHub
  雲端先更新 `webapp/etf_directory.json`，再跑 `fetch.py`，把新資料 commit 回 repo。
- **自動部署**：Vercel 綁定此 repo，一有 push 就自動重新部署，任何裝置都看到最新。

### Vercel 首次設定（一次性）

1. 到 vercel.com 用 GitHub 登入 → Add New → Project → Import 這個 repo。
2. **Root Directory** 改成 `webapp`（重要，網站檔在這個資料夾）。
3. Framework Preset 保持 Other、不用 build。按 Deploy。
4. 完成後每次 repo 有新 commit（含雲端排程的自動更新）就會自動重新部署。

## 之後要改功能（修改流程）

可以直接開新的對話請 Claude 幫忙改，不必回到原本那次對話。只要告訴它：
本地路徑 `~/00981A-tracker`（或 repo `garyfan1973/tw-etf-tracker`）＋你想改什麼。

> ⚠️ **一定要先 `git pull`**：GitHub Actions 每個交易日會自動 commit 更新資料，
> 所以本地會落後於雲端。不先 pull 就改容易產生衝突。

標準步驟：

```bash
cd ~/00981A-tracker
git pull origin main            # 1. 先同步雲端的自動更新（重要）
# 2. 改程式或網頁（fetch.py / webapp/*）
python3 fetch.py                # 3. 需要的話重新產生資料，本地驗證
open webapp/index.html          #    用瀏覽器看結果
git add -A
git commit -m "feat(scope)：說明"  # 4. 提交（type 用 feat/fix/docs/refactor/chore）
git push                        # 5. 推上去 → Vercel 自動重新部署
```

推上去後 Vercel 會自動重新部署，所有裝置看到新版，不用額外動作。

若在**別台電腦**：先 `git clone https://github.com/garyfan1973/tw-etf-tracker.git`
（要 push 回去，該台需有 GitHub 登入權限）。

## 會員功能（Supabase，Email + 密碼）

登入後可建立個人「關注 ETF」清單，並用「⭐ 只看我的」快速篩選。純前端，
靠 Supabase Auth + RLS（每人只能存取自己的資料），網站仍是靜態、照放 Vercel。

- 設定檔：`webapp/config.js` 放 Supabase **Project URL** 與 **publishable(anon) key**
  （公開金鑰，可安全放前端；**切勿**放 service_role/secret key）。未設定時會員功能自動關閉。
- 資料表：`watchlist(user_id, etf_code)`，已開 RLS，政策為使用者只能讀寫自己的列。
- 相關檔案：`webapp/auth.js`（登入/註冊/登出、關注清單 CRUD）。
- 個人清單可加入**任意 ETF 代號**（方案 B）。新增時會**即時**呼叫後端
  `/api/etf?code=XXXX`（Vercel Serverless Function，`webapp/api/etf.py`）當場查驗：
  查無就跳錯不加入、查到就當下抓出持股/台股報價/配息並顯示，不必等隔天。
- 之後由雲端排程的 `fetch.py` 把所有會員關注的代號一起納入每日更新（含海外報價與
  歷史快照），讀 Supabase RPC `all_watchlist_codes()`（公開 anon key，不需 service_role）。
- 需在 Supabase 建立這個唯讀函式（只回傳代號、不外洩誰關注什麼）：

  ```sql
  create or replace function public.all_watchlist_codes()
  returns setof text language sql security definer set search_path = public
  as $$ select distinct etf_code from public.watchlist; $$;
  grant execute on function public.all_watchlist_codes() to anon, authenticated;
  ```
- 追蹤清單與名稱快取：`data/tracked.json`、`data/etf_names.json`（自動維護）。

## 注意

- 僅供個人研究參考，非投資建議；資料以官方揭露為準。
- 若某天 MoneyDJ 改版導致抓不到，程式會提示，不會覆蓋既有快照。
