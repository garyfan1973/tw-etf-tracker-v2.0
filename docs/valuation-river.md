# 估值河流圖

入口：`tracker.html?view=overview&market=TW&symbol=2330` → 基本面 → 展開「估值河流圖」。本功能與財務圖表、AI 研究分開載入，不需要 AI 額度。會員入口沿用既有設定。

## 顯示與操作

- 台灣上市／上櫃四位數普通股，支援本益比 P/E、股價淨值比 P/B；ETF 與海外標的暫不適用。
- 五條倍數線與四段色帶，疊加同日官方實際收盤價。倍數依全部可用歷史有效值的第 10、30、50、70、90 百分位設定；遇相同分位值，以歷史中位數的 0.6、0.8、1、1.2、1.4 倍展開。可輸入五個遞增正數，自行套用倍數。
- 1／3／5 年以最後有效行情日為終點。切換顯示期間、縮放與拖曳不改變倍數；切換 P/E、P/B 或按「歷史分位數」才會重新設定倍數。
- 加減按鈕縮放，拖曳平移；圖表取得焦點後用左右鍵查看日期，`+`／`-` 縮放、`Home` 重設。手機支援點選數值及拖曳；頁面仍可上下捲動。
- 數據卡顯示最新收盤、估值倍數、全部可用歷史中位數及最新倍數相對中位數的差異。中位數與倍數取回顧歷史，不能用來宣稱當時能取得的回測訊號。

## 資料口徑

證交所 BWIBBU／STOCK_DAY，以及櫃買中心 peQryStock／tradingStock，逐月取得近五年資料。兩來源都以欄位名稱解析，不依賴固定欄位順序。

只配對同日收盤與估值：參考每股盈餘＝收盤價 ÷ 本益比，參考每股淨值＝收盤價 ÷ 股價淨值比，再乘各固定倍數繪圖。這些是依官方四捨五入倍數推算的參考值，並非財報原始 EPS；也不是以今日 EPS 回填所有歷史。

採官方未還原權息收盤價，避免將拆股調整後的歷史股價和當時估值倍數混用；除權息、拆併股、面額／股本調整仍可能產生跳動。盈餘與淨值的變化不等同營收變化，色帶不是保證的支撐、合理價格或買賣建議。

零、負數、非有限值與未提供的估值不繪製色帶，不補零、不延用其他日期資料。保留有實際收盤、無估值的日期，以中斷色帶但繼續呈現股價。超過 14 個曆日無行情時中斷連線；長假或停牌也可能造成此中斷。

首次查詢可能需一分鐘。API 顯示實際可用期間與資料日期；未成功查詢的月份列入 `failedMonths` 並提示重試。當重抓已保存月份失敗時保留先前資料，但該月份不列為完成；下次再試。資料不足不冒稱完整五年。上市櫃別依既有標的清單，轉板前歷史可能不在目前交易所的資料中。

## 檔案與更新

- `webapp/api/_valuation.py`：官方資料配對、驗證、五年範圍、增量合併與失敗月份追蹤。
- `webapp/api/valuation.py`：GET `/api/valuation?code=2330&market=TW`。完整成功結果在 Vercel CDN 快取六小時；部分成功、格式錯誤及上游失敗不快取。
- `webapp/valuation-river-core.js`：純計算；`valuation-river.js`／`.css`：畫面與互動。展開手風琴才發出查詢，切換標的時忽略先前尚未完成的回應。
- `webapp/price-history/valuation/*.json`：部分常用標的的預存資料，API 以之增量更新；其餘普通股按需查詢。
- `fetch_valuation_history.py`：更新預存標的，重抓最近兩個月及未完成的歷史月份。全部來源失敗時保留原檔。
- 既有 `fetch_price_history.py` 末尾呼叫更新器。資料位於 `price-history/`，沿用 Cloud Run 與 GitHub 備援既有提交清單；分析目錄產生器會忽略 valuation 子目錄。無新增排程或資料庫。

手動回補或新增預存股票：

```bash
python3 fetch_valuation_history.py 2330 6488
```

只更新所有已保存河流圖：

```bash
python3 fetch_valuation_history.py
```

## 驗證

```bash
python3 -m unittest discover -s tests -p 'test_valuation.py' -v
node tests/test_valuation_core.js
python3 -m unittest discover -s tests -v
node --test tests/test_*.js
```

瀏覽器驗證需可執行 Python API 的開發環境；純靜態 HTTP 伺服器不執行 `/api/valuation`。驗證實際 TWSE／TPEx 五年資料、指標／期間切換、倍數格式檢查、縮放、鍵盤游標、手機明暗主題、上游失敗重試及缺漏提示。

官方口徑：[證交所](https://www.twse.com.tw/zh/trading/historical/bwibbu.html)、[櫃買中心](https://www.tpex.org.tw/zh-tw/mainboard/trading/info/stock-pe.html)。
