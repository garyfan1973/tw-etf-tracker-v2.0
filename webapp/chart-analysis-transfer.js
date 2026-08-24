(function () {
  "use strict";

  const DB_NAME = "investment-research-ai-transfer";
  const STORE_NAME = "pending-chart";
  const RECORD_KEY = "latest";
  const MAX_AGE_MS = 15 * 60 * 1000;

  function openDatabase() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("無法開啟線圖暫存空間"));
    });
  }

  async function withStore(mode, callback) {
    const database = await openDatabase();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, mode);
        const store = transaction.objectStore(STORE_NAME);
        let result;
        transaction.oncomplete = () => resolve(result);
        transaction.onerror = () => reject(transaction.error || new Error("線圖暫存操作失敗"));
        transaction.onabort = () => reject(transaction.error || new Error("線圖暫存操作已中止"));
        Promise.resolve(callback(store)).then(value => { result = value; }).catch(error => {
          transaction.abort();
          reject(error);
        });
      });
    } finally {
      database.close();
    }
  }

  function requestResult(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("讀取線圖暫存失敗"));
    });
  }

  async function saveTransfer(record) {
    if (!record?.blob || !record?.userId) throw new Error("線圖或會員資料不完整");
    await withStore("readwrite", store => requestResult(store.put({ ...record, createdAt: Date.now() }, RECORD_KEY)));
  }

  async function takeTransfer(userId) {
    if (!userId) return null;
    return withStore("readwrite", async store => {
      const record = await requestResult(store.get(RECORD_KEY));
      if (!record) return null;
      await requestResult(store.delete(RECORD_KEY));
      if (record.userId !== userId || Date.now() - Number(record.createdAt || 0) > MAX_AGE_MS) return null;
      return record;
    });
  }

  function nextFrame() {
    return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function canvasBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("線圖圖片轉換失敗")), "image/jpeg", .92);
    });
  }

  function imageFromUrl(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("瀏覽器無法產生 K 線圖片"));
      image.src = url;
    });
  }

  function serializeChartSvg(sourceSvg) {
    const clone = sourceSvg.cloneNode(true);
    const sourceNodes = [sourceSvg, ...sourceSvg.querySelectorAll("*")];
    const cloneNodes = [clone, ...clone.querySelectorAll("*")];
    const properties = ["display", "visibility", "opacity", "fill", "stroke", "stroke-width", "stroke-dasharray", "stroke-linecap", "stroke-linejoin", "font-family", "font-size", "font-weight"];
    sourceNodes.forEach((sourceNode, index) => {
      const cloneNode = cloneNodes[index];
      if (!cloneNode) return;
      const computed = getComputedStyle(sourceNode);
      properties.forEach(property => {
        const value = computed.getPropertyValue(property);
        if (value) cloneNode.style.setProperty(property, value);
      });
    });
    clone.querySelector("#chartHit")?.remove();
    clone.querySelector("#hoverLine")?.remove();
    clone.querySelector("#hoverHorizontalLine")?.remove();
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    const viewBox = sourceSvg.viewBox.baseVal;
    clone.setAttribute("width", String(viewBox.width));
    clone.setAttribute("height", String(viewBox.height));
    return { markup: new XMLSerializer().serializeToString(clone), width: viewBox.width, height: viewBox.height };
  }

  async function captureElement(element) {
    if (!element?.querySelector("#chartBox svg")) throw new Error("目前沒有可擷取的 K 線圖");
    if (typeof window.html2canvas !== "function") throw new Error("線圖截圖元件載入失敗，請重新整理後再試");
    if (document.fonts?.ready) await document.fonts.ready;
    const originalStyle = element.getAttribute("style");
    const captureWidth = Math.min(1200, Math.max(900, Math.ceil(element.scrollWidth), Math.ceil(element.getBoundingClientRect().width)));
    element.style.width = `${captureWidth}px`;
    element.style.maxWidth = "none";
    await nextFrame();
    try {
      const width = Math.ceil(Math.max(element.scrollWidth, element.getBoundingClientRect().width));
      const chartWrap = element.querySelector(".kline-chart-wrap");
      const chartSvg = element.querySelector("#chartBox svg");
      const rootRect = element.getBoundingClientRect();
      const headerHeight = Math.max(1, Math.ceil(chartWrap.getBoundingClientRect().top - rootRect.top));
      const serializedChart = serializeChartSvg(chartSvg);
      const estimatedHeight = headerHeight + width * serializedChart.height / serializedChart.width;
      const scale = Math.min(2, 2200 / Math.max(width, estimatedHeight));
      const background = getComputedStyle(document.documentElement).getPropertyValue("--card").trim() || "#ffffff";
      const headerCanvas = await window.html2canvas(element, {
        backgroundColor: background,
        width,
        height: headerHeight,
        scale,
        logging: false,
        ignoreElements: node => node.matches?.(".kline-chart-wrap, [data-ai-chart-capture]")
      });
      const chartUrl = URL.createObjectURL(new Blob([serializedChart.markup], { type: "image/svg+xml;charset=utf-8" }));
      try {
        const chartImage = await imageFromUrl(chartUrl);
        const chartHeight = Math.max(1, Math.round(headerCanvas.width * serializedChart.height / serializedChart.width));
        const canvas = document.createElement("canvas");
        canvas.width = headerCanvas.width;
        canvas.height = headerCanvas.height + chartHeight;
        const context = canvas.getContext("2d", { alpha: false });
        context.fillStyle = background;
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(headerCanvas, 0, 0);
        context.drawImage(chartImage, 0, headerCanvas.height, canvas.width, chartHeight);
        return await canvasBlob(canvas);
      } finally {
        URL.revokeObjectURL(chartUrl);
      }
    } finally {
      if (originalStyle == null) element.removeAttribute("style");
      else element.setAttribute("style", originalStyle);
    }
  }

  function safeFilePart(value) {
    return String(value || "chart").replace(/[^0-9A-Za-z_-]+/g, "-").replace(/^-+|-+$/g, "") || "chart";
  }

  function initCaptureButton() {
    const button = document.querySelector("[data-ai-chart-capture]");
    const captureTarget = document.querySelector("#aiChartCapture");
    if (!button || !captureTarget) return;
    let activeAsset = window.MarketChart?.currentAsset || null;
    let busy = false;
    const renderAccess = () => { button.hidden = !window.ETFAuth?.canUseChartAnalysis(); };
    document.addEventListener("marketchart:datachange", event => { activeAsset = event.detail?.asset || activeAsset; });
    document.addEventListener("etfauth:change", renderAccess);
    renderAccess();
    button.addEventListener("click", async () => {
      if (busy) return;
      const user = window.ETFAuth?.user();
      if (!user || !window.ETFAuth?.canUseChartAnalysis()) {
        button.hidden = true;
        return;
      }
      busy = true;
      button.disabled = true;
      const original = button.innerHTML;
      button.textContent = "正在擷取線圖…";
      try {
        const blob = await captureElement(captureTarget);
        if (window.ETFAuth?.user()?.id !== user.id) throw new Error("會員狀態已變更，請重新操作");
        const symbol = activeAsset?.symbol || window.MarketChart?.currentAsset?.symbol || "";
        const name = `${safeFilePart(symbol)}-${new Date().toISOString().slice(0, 10)}-technical-chart.jpg`;
        await saveTransfer({ blob, name, symbol, userId: user.id });
        location.href = "chart-analysis.html?source=kline";
      } catch (error) {
        window.alert(error.message || "線圖擷取失敗，請稍後再試");
        button.innerHTML = original;
        button.disabled = false;
        busy = false;
      }
    });
  }

  window.ChartAnalysisTransfer = { save: saveTransfer, take: takeTransfer };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initCaptureButton);
  else initCaptureButton();
})();
