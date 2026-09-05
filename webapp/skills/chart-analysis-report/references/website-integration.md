# 網站接入規格

本規格以投資研究工作台 `webapp/api/chart-analysis.py` 與 `webapp/chart-analysis.js` 為接入對象。

## 共用規範

API 直接載入相鄰部署範圍內的 `webapp/skills/chart-analysis-report/SKILL.md`，採用分析方法與評分規則，再附加 JSON 輸出契約。`chart-report.js` 是互動頁、歷史紀錄與 PDF 的共用呈現器；Email 使用同一份 PDF。不可要求模型同一次輸出 Markdown 與 JSON。

部署時必須包含規範檔，使用單一受版本控制的來源產生或載入指令；勿手動維護兩份不同規則。本機安裝到 Codex 的 skill 不能當作雲端部署的檔案依賴。

## 現有欄位對應

| 報告區域 | 現有欄位／接入工作 |
| --- | --- |
| 結論 | conclusion、marketState、thesis；新結果統一「弱勢反彈」分類，舊紀錄保留原判讀。 |
| 技術面 | technicalPoints；固定六個 label 及順序，analysis 先事實後意義。 |
| 關鍵價位 | keyLevels 的 price／meaning 構成兩欄表格，currency 標示報價幣別；supportZones、resistanceZones 保留供其他既有消費端使用。 |
| 持倉成本 | positionStatus、averageCost、costCurrency 是獨立輸入，costAnalysis 是分析段落。proposedPrice 仍是預計買價。成本輸入隨 reportMeta 儲存在既有 result JSON，不新增資料表欄位。 |
| 操作策略 | tradePlan.holdingAdvice、entry、firstTarget、secondTarget、weakening 及 invalidation 對應六情境。defense、strongResistance、positionSizing 保留舊用途。 |
| 評分 | rating 接受五星至一星或「暫不評分（資訊不足）」，ratingReason 說明理由。readable 與 imageQualityNote 表示品質，不代替偏多評分。 |

新增 input、schema、顯示欄位時，同步處理歷史資料缺值、PDF 與 Email，確保各出口順序與內容一致。不要為格式統一刪除既有風險資訊，可合併到對應段落。

## 會員與一致性

- 沿用目前伺服器端會員權限、有效期限與每日額度檢查；未開通者不得因增加輸出模式繞過檢查。不能僅隱藏前端按鈕。
- 每份新結果的 reportMeta 保存實際 model、promptVersion、schemaVersion、promptHash、inputHash 及成本輸入。指令或快照改變可辨識，但這不等於保證相同結論。
- 一般分析為本 skill 的主要範例；其他現有模式保留其策略語意，不能在未評估前移除。

## 行為驗收案例

1. 僅有使用者 AVGO 文章：標明未驗證原圖；不能把 8/28 自行補成年份或稱最新行情。文章可示範三星風格，但不是數據正確性的驗證基準。
2. 圖片沒有 MACD 前一期：不得由單一期 DIF／Signal 宣稱綠柱縮短。
3. 模糊圖片但同時有完整、同時點系統數據：數據足夠就正常評估，不因圖片模糊自動降星。
4. 圖片與數據皆不足：固定段落仍在，缺值明示，暫不評分，不捏造價區。
5. 同圖僅改持倉成本：只影響成本段與持倉情境；行情事實、關鍵價位、趨勢及星等不應因此改變。
6. 盤中成交量：不得與完整日均量直接比較後稱量縮。
7. 明確偏多／明確破位各一例：可產生四至五星／一至二星，不固定模仿 AVGO 三星弱勢反彈。
8. 未開通、已到期或額度用完：模型請求前拒絕；正常會員才產出分析。
9. 同一有效結果透過網頁、歷史紀錄、PDF 與 Email 呈現：四章節、六技術點、六策略項及成本／評分處理一致。
