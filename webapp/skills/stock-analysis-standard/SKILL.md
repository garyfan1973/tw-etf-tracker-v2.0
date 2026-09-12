---
name: stock-analysis-standard
description: Analyze an uploaded stock or ETF chart with a standardized integrated report covering technical structure, current fundamentals and industry drivers, valuation, and actionable fast-, short-, medium-, and long-term strategies. Use by default when the user uploads a stock/ETF K-line chart or asks for a comprehensive individual-stock analysis; do not use when the user explicitly requests stock-chart-analyst or stock-chart-strategy.
---

# Stock Analysis Standard

Produce a practical Traditional Chinese report grounded in visible chart evidence and current, cited fundamental data. Separate observations from inference and scenarios from facts.

## Evidence rules

- Read the screenshot first. Identify ticker/company, market, chart timeframe, latest visible date and price, and available overlays or indicators.
- Never invent a price, moving average, volume, indicator value, support/resistance, earnings figure, valuation multiple, news item, or date. Use `約` or a range when pixels are unclear; say `圖中未顯示／無法辨識` when unavailable.
- For Taiwan charts, default to red as up and green as down when the app follows local convention. Do not infer MACD meaning from histogram color alone; use labels, DIF/Signal relationships, and bar expansion or contraction.
- Current fundamentals, valuation, industry conditions, news, earnings, and catalysts require fresh verification from primary or authoritative sources. Cite them near the claim and state the data period. Prefer filings, investor relations, exchange disclosures, official statistics, and reputable market-data sources.
- If the ticker is not identifiable, ask for it. If live sources are unavailable, complete the technical section and label the fundamental section as unverified rather than filling gaps from memory.
- Do not promise returns or a direction. Distinguish rebound from reversal, oversold from a buy signal, support test from confirmed bottom, and valuation support from a guaranteed floor.

## Analysis workflow

1. Start with a concise verdict: current state, whether entry is acceptable now, the dominant thesis, and the largest risk.
2. Diagnose technicals from price structure before indicators.
3. Verify current fundamentals, industry context, catalysts, valuation, and downside considerations.
4. Convert the evidence into price zones and conditional plans for fast, short, medium, and long horizons.
5. Adapt to the user's position, average cost, desired horizon, and proposed bid when supplied. Never let a failed fast trade silently become a long-term holding.

## Required output

### 一、技術面現況診斷

Cover only evidence that is visible or verifiable:

- **型態與均線架構：** Identify patterns such as head-and-shoulders, W bottom, range, breakout, false breakout, or trend channel only when sufficiently formed. Explain price relative to MA5, MA10, MA20, and MA60; assess bullish/bearish order, clustering, slope, and visible rollover. Mention扣抵 only when the chart provides enough dates/prices to support it.
- **成交量能：** Interpret price-volume behavior, including volume-confirmed breakout, shrinking-volume pullback/base, divergence, high-volume stall, or high-volume support failure. Treat intraday volume as incomplete when applicable.
- **指標訊號：** Report visible KD/KDJ, MACD, RSI, Bollinger Bands, or other indicators with readable values and cross/momentum direction. Indicators confirm the price structure; they do not replace it.
- **關鍵價位：** Give support, resistance, and invalidation as practical zones. Prefer recent highs/lows, high-volume areas, gaps, moving averages, consolidation boundaries, and round-number levels.

### 二、基本面與產業重點

- **產業週期與供需：** Explain the company's core products, industry-cycle phase, supply/demand direction, pricing, inventory, capacity, customer concentration, or relevant macro sensitivity.
- **營收動能與催化劑：** Summarize the latest reported revenue/earnings trend and period, margin or cash-flow quality when material, capex, new capacity/products, customer developments, corporate actions, and dated catalysts. Separate confirmed catalysts from market expectations.
- **評價與下檔支撐：** Compare current P/E, forward P/E, P/B, EV/EBITDA, yield, or another sector-appropriate measure with the company's history and peers when data is available. Explain cyclicality and one-off distortions. Describe a valuation zone as a reference, never as a hard floor.
- End with a fundamental judgment: `偏多／中性／偏空`, the key variable to monitor, and what would invalidate the view.

### 三、快閃／短中長操作策略建議

#### 快閃策略（當沖／隔日沖／事件快打）

Always specify:

- **進場點位（低吸／突破）：** price zone plus required trigger, such as support holding, volume contraction, reclaim, or volume-confirmed breakout.
- **獲利了結點：** first resistance/fast exit and an optional stronger second target.
- **防守停損點：** exact price or chart-based invalidation, plus whether closing-price or intraday execution is intended.
- **報酬風險：** estimate reward/risk from the proposed zones when the numbers are readable; reject trades with poor asymmetry or unclear invalidation.
- State whether this is trend-following or counter-trend and whether small size, staged entries, or no chase is appropriate.

#### 中長期操作總結表

Use this exact column structure, adapting the content to the chart and verified fundamentals:

| 週期 | 策略方針 | 進出場點位參考 | 風險控管 |
|---|---|---|---|
| 短期（1～4 週） | 區間震盪／破位順勢／其他 | 明確區間、低吸或突破條件、短壓 | 關鍵防守與停損點 |
| 中期（1～3 季） | 右側波段／均線發散跟隨／其他 | 第一階段與加碼條件 | 頸線、季線或基本面失效條件 |
| 長期（1 年以上） | 價值投資／週期逢低配置／其他 | 合理評價或分批建倉區間 | 產業與基本面反轉指標 |

Close with:

- **持股者：** action tied to average cost when known.
- **空手者：** wait, trial entry, or confirmed entry condition.
- **追蹤清單：** the 2–4 most important prices, dates, filings, or business indicators.
- **總評：** one of `可積極布局／可小量試單／等待確認／不宜介入`, with a one-sentence reason.

## Scope and mode selection

- Give the full three-part report by default for a chart upload, even if the user supplies no additional text.
- If the user asks a narrow follow-up, answer that question without mechanically repeating the full report.
- If the user explicitly invokes `$stock-chart-analyst`, defer to its fast-trade format.
- If the user explicitly invokes `$stock-chart-strategy`, defer to its concise technical-scenario format.
