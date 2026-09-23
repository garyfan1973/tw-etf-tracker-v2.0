(function () {
  "use strict";

  const api = window.AIIndustry;
  if (!api) return;
  const $ = id => document.getElementById(id);
  const esc = api.esc;

  const architectures = [
    {
      id:"nvidia", index:"A", short:"機櫃級 GPU", title:"NVIDIA NVL72：把整櫃當成一顆巨大 GPU",
      subtitle:"以 GB200 官方配置為代表；GB300 延續 72 GPU／36 Grace CPU 的全液冷機櫃方向。", badge:"SCALE-UP FIRST",
      nodes:[
        {title:"36× Grace CPU",note:"Host / control"},{title:"72× Blackwell GPU",note:"13.4 TB HBM3E",accent:true},{title:"9× NVLink switch tray",note:"單一 NVLink domain"},
        {title:"BlueField / SuperNIC",note:"網路與基礎設施卸載"},{title:"800G Fabric",note:"InfiniBand / Ethernet"},{title:"Liquid cooling",note:"冷板、CDU、歧管"}
      ],
      facts:[
        ["運算域","72 GPU / 36 Grace CPU"],["Scale-up","第五代 NVLink；整櫃 130 TB/s"],["記憶體","GB200 NVL72 共 13.4 TB HBM3E"],["熱設計","全液冷機櫃"],["軟體護城河","CUDA、NCCL、Mission Control"],["核心取捨","整櫃密度與效能高，電力、液冷與整合複雜度也高"]
      ],
      focus:["compute","memory","packaging","network","power","thermal","system"],
      sources:[
        ["NVIDIA GB200 NVL72 官方規格","https://www.nvidia.com/en-us/data-center/gb200-nvl72/"],
        ["NVIDIA 多節點調校指南","https://docs.nvidia.com/multi-node-nvlink-systems/multi-node-tuning-guide/overview.html"]
      ]
    },
    {
      id:"amd", index:"B", short:"開放式 GPU 節點", title:"AMD MI350：8-GPU UBB 節點向外擴充",
      subtitle:"以標準 OCP UBB 2.0 整合八顆 MI350 系列 OAM，透過 Infinity Fabric 在節點內互連。", badge:"OPEN NODE",
      nodes:[
        {title:"2× EPYC CPU",note:"PCIe Gen5 host"},{title:"8× MI350 OAM",note:"2.3 TB HBM3E",accent:true},{title:"Infinity Fabric",note:"8 GPU fully connected"},
        {title:"400G NIC / Storage",note:"可選 PCIe switch"},{title:"Ethernet Fabric",note:"跨節點 scale-out"},{title:"Air / DLC",note:"氣冷或直接液冷"}
      ],
      facts:[
        ["運算域","8 顆 MI350X / MI355X OAM"],["Scale-up","第四代 Infinity Fabric"],["記憶體","8-GPU 平台共 2.3 TB HBM3E"],["熱設計","標準氣冷到高密度直接液冷"],["軟體生態","ROCm 與開放式軟體堆疊"],["核心取捨","標準化與選擇彈性較高，跨節點效率更依賴網路與軟體成熟度"]
      ],
      focus:["compute","memory","board","network","thermal","system"],
      sources:[
        ["AMD Instinct MI350 官方平台","https://www.amd.com/en/products/accelerators/instinct/mi350.html"],
        ["AMD MI350 系統驗收指南","https://instinct.docs.amd.com/projects/system-acceptance/en/latest/gpus/mi350x.html"]
      ]
    },
    {
      id:"custom", index:"C", short:"雲端自研 ASIC", title:"TPU／Trainium：晶片、網路與雲端服務共同設計",
      subtitle:"不是單一標準機型，而是大型雲端把 ASIC、HBM、專有互連、排程器與服務介面一起最佳化。", badge:"VERTICAL STACK",
      nodes:[
        {title:"Custom ASIC",note:"TPU / Trainium",accent:true},{title:"On-package HBM",note:"模型與 KV cache"},{title:"Proprietary scale-up",note:"ICI / NeuronLink"},
        {title:"Cloud host / IPU",note:"資料與基礎設施卸載"},{title:"DC scale-out",note:"Jupiter / EFA"},{title:"Managed service",note:"JAX / PyTorch / Neuron"}
      ],
      facts:[
        ["運算域","TPU7x：最高 9,216 chips/pod；Trn2 UltraServer：64 chips"],["Scale-up","Google ICI／AWS NeuronLink"],["記憶體","TPU7x 192 GiB/chip；Trn2 UltraServer 6 TB HBM"],["部署方式","主要由雲端業者封裝成託管算力"],["軟體生態","JAX／PyTorch on TPU；AWS Neuron SDK"],["核心取捨","特定工作負載效率與垂直整合高，可攜性與外部採購選擇較少"]
      ],
      focus:["compute","memory","foundry","packaging","network","cloud"],
      sources:[
        ["Google Cloud TPU7x 官方文件","https://docs.cloud.google.com/tpu/docs/tpu7x"],
        ["AWS EC2 Trn2 官方頁面","https://aws.amazon.com/ec2/instance-types/trn2/"]
      ]
    }
  ];

  const stageResearch = {
    compute:{value:"每瓦算力、軟體生態與 scale-up 效率共同決定平台黏著度。",bottleneck:"先進製程、HBM 供應與封裝產能必須同時到位。",watch:"新平台量產節奏、記憶體容量、互連頻寬、軟體相容性。",risk:"平台轉換、客戶自研 ASIC、出口限制與供應集中。",question:"效能提升來自更多晶片，還是每瓦與系統效率真的改善？",sources:[["NVIDIA 資料中心平台","https://www.nvidia.com/en-us/data-center/"],["AMD Instinct 平台","https://www.amd.com/en/products/accelerators/instinct.html"]]},
    memory:{value:"模型愈大、上下文愈長，HBM 容量與頻寬愈直接影響 GPU 利用率。",bottleneck:"堆疊良率、先進封裝搭配與認證週期限制有效供給。",watch:"HBM 世代切換、單顆容量、頻寬、主要供應商擴產與認證。",risk:"供需反轉、產品良率落差、客戶議價與傳統記憶體循環。",question:"新增位元供給能否快過每顆加速器的 HBM 搭載量成長？",sources:[["SK hynix HBM","https://www.skhynix.com/product/enterprise/hbm.go"],["Micron HBM","https://www.micron.com/products/memory/hbm"]]},
    foundry:{value:"節點微縮與先進封裝讓同樣功耗容納更多運算與 I/O。",bottleneck:"先進節點設備、良率爬坡、光罩與封裝共同限制交付。",watch:"先進節點營收占比、晶圓產能、良率、資本支出與客戶集中度。",risk:"高額固定成本、地緣風險、節點延遲與需求預估偏差。",question:"新增資本支出是在解除長期瓶頸，還是提前堆出週期性過剩？",sources:[["TSMC 技術平台","https://www.tsmc.com/english/dedicatedFoundry/technology"]]},
    equipment:{value:"關鍵設備的精度、產能與製程控制能力決定先進節點良率。",bottleneck:"EUV、蝕刻、沉積與量測多為寡占，交期與服務能力同樣重要。",watch:"晶圓廠資本支出、訂單能見度、服務營收與先進封裝設備需求。",risk:"半導體資本支出循環、出口規則、客戶延後驗收。",question:"訂單成長來自前段微縮，還是先進封裝與背面供電的新步驟？",sources:[["ASML EUV 技術","https://www.asml.com/en/technology/lithography-principles/euv-lithography-systems"],["Applied Materials AI","https://www.appliedmaterials.com/us/en/markets/ai.html"]]},
    packaging:{value:"把 GPU、HBM 與 chiplet 放得更近，降低資料搬移的延遲與能耗。",bottleneck:"中介層尺寸、基板、堆疊良率、熱管理與測試時間彼此牽制。",watch:"先進封裝產能、面積與層數、良率、測試時數、基板供需。",risk:"擴產過快、封裝架構替代、單一大客戶與良率爬坡。",question:"瓶頸是在封裝設備、材料、基板，還是最終測試時間？",sources:[["TSMC 3DFabric","https://3dfabric.tsmc.com/english/dedicatedFoundry/technology/3DFabric.htm"],["UCIe Consortium","https://www.uciexpress.org/"]]},
    board:{value:"高速低損耗材料與高層數設計，決定訊號能否在更長距離保持完整。",bottleneck:"高階 CCL、ABF、良率與大尺寸板翹曲控制。",watch:"層數、材料等級、ASP、良率、800G／1.6T 與新平台認證。",risk:"規格降階、材料替代、擴產後價格壓力。",question:"新平台的價值提升來自面積變大、層數增加，還是材料升級？",sources:[["PCI-SIG 規格概覽","https://pcisig.com/pci-express-6.0-specification"],["OCP Server Project","https://www.opencompute.org/projects/server"]]},
    network:{value:"叢集規模愈大，GPU 間通訊與尾端延遲愈容易成為整體瓶頸。",bottleneck:"高速 DSP、雷射、光纖耦合、交換器晶片與網路調校。",watch:"800G／1.6T 出貨、交換器埠速、光模組良率、scale-out 網路占比。",risk:"規格轉換、客戶自製、銅連接延伸、價格快速下滑。",question:"網路升級是埠數增加，還是每埠速度與光學內容同步提升？",sources:[["Ethernet Alliance Roadmap","https://ethernetalliance.org/technology/roadmap"],["NVIDIA Spectrum-X","https://www.nvidia.com/en-us/networking/spectrum-x/"]]},
    power:{value:"更高轉換效率與機櫃級電力管理，直接決定可部署算力與營運成本。",bottleneck:"高功率電源架、busbar、BBU、變壓器與電網接入皆可能卡住。",watch:"機櫃功率、轉換效率、48V/800V 架構、BBU 搭載率與資料中心電力建置。",risk:"平台規格變更、安全認證、原材料與專案遞延。",question:"電力升級是零件 ASP 上升，還是需要整個配電架構重做？",sources:[["OCP Open Rack","https://www.opencompute.org/projects/open-rack"]]},
    thermal:{value:"溫度愈低且分布愈均勻，晶片愈能維持時脈並降低故障率。",bottleneck:"冷板、快接頭、CDU 與設施水路必須整體驗證且不能漏液。",watch:"液冷滲透率、單櫃熱密度、CDU 容量、快接頭與冷板內容價值。",risk:"漏液責任、標準分裂、氣冷改善延後液冷採用。",question:"液冷價值落在零件、模組，還是機房端整體解決方案？",sources:[["NVIDIA 液冷資料中心","https://www.nvidia.com/en-us/data-center/liquid-cooled-data-center/"]]},
    mechanical:{value:"高密度整櫃的承重、盲插與可維護性，決定部署速度與停機成本。",bottleneck:"新機櫃尺寸、重量、管線與 busbar 需要共同設計和認證。",watch:"整櫃出貨、滑軌載重、客製化比例、OCP 規格變動。",risk:"規格頻繁改版、專案遞延、低價競爭與鋼材成本。",question:"產品是一般機構件，還是具認證與共同設計門檻的關鍵模組？",sources:[["OCP Open Rack","https://www.opencompute.org/projects/open-rack"]]},
    passives:{value:"數量龐大的電容、電阻與連接器維持電源與訊號完整性。",bottleneck:"高溫、高頻、高電流規格與長時間可靠度認證。",watch:"單機用量、車規／伺服器等級產品比重、稼動率與高階產品 ASP。",risk:"多數品項同質化、庫存循環、原材料與價格競爭。",question:"AI 伺服器增加的是高階規格含量，還是只有一般用量？",sources:[["Murata Data Center Solutions","https://www.murata.com/en-global/applications/data-center"]]},
    system:{value:"把跨供應商零件驗證成可量產、可維護的伺服器與整櫃。",bottleneck:"GPU 配額、韌體、散熱、電力與整櫃測試任何一項都會拖延認列。",watch:"AI 伺服器營收比、整櫃占比、出貨節奏、存貨與應收帳款。",risk:"低毛利、客戶集中、零件缺料、設計變更與交付遞延。",question:"成長來自單價更高，還是整櫃整合與服務帶來更好價值？",sources:[["NVIDIA MGX","https://www.nvidia.com/en-us/data-center/products/mgx/"]]},
    cloud:{value:"將硬體利用率、排程、軟體與商業模式結合，最後把算力轉為服務收入。",bottleneck:"電力、機房、晶片供給、網路與實際工作負載需求要同時匹配。",watch:"資本支出、AI 雲端收入、折舊年限、利用率、模型推論成本。",risk:"投資回收期拉長、價格競爭、自研晶片切換與需求不及預期。",question:"資本支出增加後，利用率與每單位算力收入能否同步提升？",sources:[["Google AI Hypercomputer","https://cloud.google.com/ai-hypercomputer"],["AWS AI Infrastructure","https://aws.amazon.com/ai/infrastructure/"]]},
  };

  const scenarios = [
    {id:"hbm",title:"HBM 供給再度吃緊",label:"供給瓶頸",thesis:"每顆加速器搭載容量上升快過有效位元供給，交期與封裝配套重新拉長。",assumptions:["AI 加速器需求維持強勁","新 HBM 世代良率爬坡慢於預期","先進封裝產能無法完全替代記憶體瓶頸"],confidence:"中",direct:[["memory","HBM 價格與產品組合"],["packaging","堆疊、封裝與測試"]],indirect:[["equipment","擴產設備需求"],["foundry","邏輯與 HBM 配套"]],pressure:[["compute","平台出貨受限"],["system","組裝與認列遞延"]],companies:["ks000660","usMU","ks005930","tw2330","tw3711"],caveat:"若新增產能與良率改善更快，價格與交期壓力可能迅速逆轉。"},
    {id:"power",title:"單櫃功率密度再上修",label:"基礎設施重構",thesis:"算力密度提升迫使資料中心從伺服器級零件，升級到機櫃與設施級電力／液冷設計。",assumptions:["機櫃級加速平台持續提高功耗","資料中心電網接入仍受限制","客戶願意用效率換取更高前期資本支出"],confidence:"中高",direct:[["power","PSU、Power Shelf、BBU"],["thermal","冷板、CDU、熱交換"]],indirect:[["mechanical","機櫃、滑軌、盲插"],["passives","高電流與高可靠元件"]],pressure:[["cloud","建置週期與資本負擔"],["system","驗證複雜度提高"]],companies:["tw2308","tw3017","tw3653","tw8996","tw3211","tw2059"],caveat:"若推論效率與低功耗晶片改善更快，單位算力用電上升不一定等於總功耗同比例成長。"},
    {id:"optics",title:"800G 加速轉向 1.6T",label:"網路升級",thesis:"更大叢集與更快 GPU 需要更高埠速，光學、交換器、低損耗 PCB 與高速連接同步升級。",assumptions:["scale-out 流量成長快於拓撲優化","1.6T 產品通過大型客戶驗證","光學良率與功耗達到部署門檻"],confidence:"中",direct:[["network","光模組、DSP、交換器"],["board","低損耗材料與高速 PCB"]],indirect:[["equipment","光電製程與測試"],["passives","高速連接與電源完整性"]],pressure:[["system","重新驗證與 BOM 成本"],["power","光學功耗與散熱"]],companies:["usAVGO","usMRVL","usANET","usCRDO","tw2345","tw3081","tw3363","tw2383"],caveat:"銅連接距離延伸、CPO 時程改變或網路壓縮技術，都會改變光學內容提升速度。"},
    {id:"capex",title:"雲端資本支出擴張",label:"需求上行",thesis:"大型雲端同步擴充訓練與推論基礎設施，需求從晶片向伺服器、網路與機房外溢。",assumptions:["AI 服務使用量持續成長","雲端業者維持充足現金流","電力與供應鏈可支撐建置計畫"],confidence:"中",direct:[["compute","GPU／ASIC 平台"],["system","伺服器與整櫃整合"]],indirect:[["foundry","先進製程與封裝"],["network","叢集網路擴充"]],pressure:[["power","電網與配電瓶頸"],["thermal","液冷施工與驗證"]],companies:["usMSFT","usAMZN","usGOOGL","usNVDA","tw2382","tw6669","tw2317"],caveat:"資本支出公告不等於同期間營收；交付、驗收與折舊會造成時間差。"},
    {id:"inference",title:"工作負載轉向推論效率",label:"需求重組",thesis:"採購決策從峰值訓練效能，轉向每 token 成本、延遲、記憶體容量與軟體可部署性。",assumptions:["推論用量快於訓練成長","企業更重視總持有成本","量化與小模型降低部分峰值算力需求"],confidence:"中",direct:[["compute","多元加速器與 ASIC"],["memory","容量、頻寬與 KV cache"]],indirect:[["cloud","排程與託管服務"],["network","推論叢集東西向流量"]],pressure:[["system","產品組合快速切換"],["thermal","每瓦效率改變散熱內容"]],companies:["usNVDA","usAMD","usAVGO","usAMZN","usGOOGL","tw3443","tw3661"],caveat:"訓練與推論並非零和；test-time compute 也可能讓高階推論算力需求再度上升。"}
  ];

  let selectedArchitecture = "nvidia";
  let selectedScenario = "hbm";
  let pulseRange = "3m";
  let pulseData = null;
  let lastDrawerTrigger = null;

  function architectureColumns(nodes) {
    const groups = [nodes.slice(0,2), nodes.slice(2,4), nodes.slice(4,6)];
    const labels = ["COMPUTE", "INTERCONNECT", "FACILITY"];
    return groups.map((group,index) => `<div class="arch-column"><div class="arch-column-title">${labels[index]}</div>${group.map(node => `<div class="arch-node${node.accent ? " accent" : ""}"><strong>${esc(node.title)}</strong><small>${esc(node.note)}</small></div>`).join("")}</div>`).join('<div class="arch-arrow" aria-hidden="true">→</div>');
  }

  function renderArchitectures() {
    $("architectureTabs").innerHTML = architectures.map(item => `<button type="button" role="tab" aria-selected="${item.id === selectedArchitecture}" class="architecture-tab${item.id === selectedArchitecture ? " active" : ""}" data-architecture="${item.id}"><span class="arch-index">${item.index}</span><span><strong>${esc(item.short)}</strong><small>${esc(item.title.split("：")[0])}</small></span></button>`).join("");
    const item = architectures.find(entry => entry.id === selectedArchitecture) || architectures[0];
    $("architectureWorkbench").innerHTML = `<div class="arch-head"><div><span class="eyebrow">REFERENCE ARCHITECTURE</span><h3>${esc(item.title)}</h3><p>${esc(item.subtitle)}</p></div><span class="arch-badge">${esc(item.badge)}</span></div><div class="arch-body"><div class="arch-diagram">${architectureColumns(item.nodes)}</div><div class="arch-facts">${item.facts.map(([label,value]) => `<div class="arch-fact"><span>${esc(label)}</span><strong>${esc(value)}</strong></div>`).join("")}<div class="arch-focus"><span>供應鏈敏感環節</span><div>${item.focus.map(id => { const stage=api.stageById.get(id); return `<button type="button" data-focus-stage="${id}">${esc(stage.title)}</button>`; }).join("")}</div></div><div class="arch-sources">${item.sources.map(([label,url]) => `<a href="${url}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join("")}</div></div></div>`;
  }

  function renderStageResearch(stageId) {
    const stage = api.stageById.get(stageId) || api.stages[0];
    const row = stageResearch[stage.id];
    if (!row) return;
    $("stageResearchPanel").innerHTML = `<div class="stage-research-head"><div><span class="eyebrow">DEEP DIVE / ${stage.number}</span><h3>${esc(stage.title)}研究框架</h3></div><p>把產品名單轉成可持續追蹤的研究問題；指標是方向性觀察，不代表單一公司的財務預測。</p></div><div class="stage-research-grid"><div class="stage-research-card"><span>VALUE DRIVER / 價值來源</span><strong>${esc(row.value)}</strong></div><div class="stage-research-card"><span>BOTTLENECK / 潛在瓶頸</span><p>${esc(row.bottleneck)}</p></div><div class="stage-research-card"><span>WHAT TO WATCH / 追蹤指標</span><p>${esc(row.watch)}</p></div><div class="stage-research-card risk"><span>RISK / 主要風險</span><p>${esc(row.risk)}</p></div><div class="stage-research-card question" style="grid-column:1/-1"><span>NEXT QUESTION / 下一個研究問題</span><strong>${esc(row.question)}</strong></div></div><div class="stage-sources"><span>官方延伸閱讀</span>${row.sources.map(([label,url]) => `<a href="${url}" target="_blank" rel="noopener">${esc(label)} ↗</a>`).join("")}</div>`;
  }

  function returnFor(rows, range) {
    if (!rows || rows.length < 2) return null;
    const latest = rows[rows.length - 1];
    const days = {"1m":30,"3m":91,"6m":183,"1y":365}[range] || 91;
    const cutoff = new Date(`${latest.date}T00:00:00`);
    cutoff.setDate(cutoff.getDate() - days);
    let base = rows[0];
    for (const row of rows) {
      if (new Date(`${row.date}T00:00:00`) <= cutoff) base = row;
      else break;
    }
    const baseClose = Number(base.close), lastClose = Number(latest.close);
    return baseClose ? (lastClose / baseClose - 1) * 100 : null;
  }

  function median(values) {
    const sorted = values.filter(Number.isFinite).sort((a,b) => a-b);
    if (!sorted.length) return null;
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2;
  }

  function fmtPct(value) {
    if (!Number.isFinite(value)) return "—";
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  }

  async function loadPulse() {
    const quotes = await Promise.all(api.companies.map(async company => [company.id, await api.loadQuote(company)]));
    pulseData = new Map(quotes);
    renderPulse();
  }

  function renderPulse() {
    if (!pulseData) return;
    const rows = api.stages.map(stage => {
      const values = stage.companyIds.map(id => returnFor(pulseData.get(id)?.rows, pulseRange)).filter(Number.isFinite);
      return {stage, value:median(values), breadth:values.length ? values.filter(value => value > 0).length / values.length * 100 : null, count:values.length};
    });
    const ranked = [...rows].sort((a,b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
    const best = ranked[0], broadest = [...rows].sort((a,b) => (b.breadth ?? -1)-(a.breadth ?? -1))[0];
    const coverage = new Set(api.stages.flatMap(stage => stage.companyIds).filter(id => pulseData.get(id)?.rows?.length)).size;
    const dates = [...pulseData.values()].map(quote => quote.rows?.at(-1)?.date).filter(Boolean).sort();
    $("pulseAsOf").textContent = dates.length ? `各市場最近資料：${dates[0]} ～ ${dates[dates.length-1]}` : "暫無行情日期";
    $("pulseSummary").innerHTML = `<div class="pulse-kpi"><span>LEADING STAGE / 動能領先</span><strong>${esc(best.stage.short)}</strong><small>${fmtPct(best.value)} · ${pulseRange.toUpperCase()}</small></div><div class="pulse-kpi"><span>STRONGEST BREADTH / 廣度最佳</span><strong>${esc(broadest.stage.short)}</strong><small>${Number.isFinite(broadest.breadth) ? broadest.breadth.toFixed(0) : "—"}% 公司為正報酬</small></div><div class="pulse-kpi"><span>PRICE COVERAGE / 行情覆蓋</span><strong>${coverage} 家</strong><small>台／美／日／韓代表公司</small></div>`;
    const order = $("pulseChart").dataset.sorted === "true" ? ranked : rows;
    const maxAbs = Math.max(1,...rows.map(row => Math.abs(row.value || 0)));
    $("pulseChart").innerHTML = order.map(row => {
      const width = Math.min(50,Math.abs(row.value || 0)/maxAbs*50);
      const left = (row.value || 0) >= 0 ? 50 : 50-width;
      return `<button type="button" class="pulse-row" data-pulse-stage="${row.stage.id}" style="border:0;width:100%;color:inherit;background-color:transparent;text-align:left"><span class="pulse-name"><i>${row.stage.icon}</i><strong>${row.stage.number} ${esc(row.stage.title)}</strong></span><span class="pulse-track"><i class="pulse-bar${(row.value || 0)<0 ? " negative" : ""}" style="left:${left}%;width:${width}%"></i></span><span class="pulse-return ${(row.value || 0)>=0 ? "up" : "down"}">${fmtPct(row.value)}</span><span class="pulse-breadth">廣度 ${Number.isFinite(row.breadth) ? row.breadth.toFixed(0) : "—"}%</span><span class="pulse-count">${row.count} 家</span></button>`;
    }).join("");
  }

  function renderScenarios() {
    $("scenarioTabs").innerHTML = scenarios.map(item => `<button type="button" role="tab" aria-selected="${item.id===selectedScenario}" class="scenario-tab${item.id===selectedScenario ? " active" : ""}" data-scenario="${item.id}">${esc(item.title)}</button>`).join("");
    const item = scenarios.find(entry => entry.id === selectedScenario) || scenarios[0];
    const impactColumn = (title,kind,rows) => `<div class="impact-column ${kind}"><span>${title}</span>${rows.map(([id,note]) => { const stage=api.stageById.get(id); return `<div class="impact-stage"><strong>${esc(stage.title)}</strong><small>${esc(note)}</small></div>`; }).join("")}</div>`;
    $("scenarioWorkbench").innerHTML = `<div class="scenario-thesis"><span class="scenario-label">假設情境 · ${esc(item.label)}</span><h3>${esc(item.title)}</h3><p>${esc(item.thesis)}</p><div class="scenario-assumptions">${item.assumptions.map(text => `<div>${esc(text)}</div>`).join("")}</div><div class="scenario-confidence"><span>情境判讀信心</span><strong>${esc(item.confidence)}</strong></div></div><div class="scenario-path"><div class="impact-flow">${impactColumn("DIRECT / 直接敏感", "direct", item.direct)}<div class="impact-arrow">→</div>${impactColumn("SECOND ORDER / 次級傳導", "indirect", item.indirect)}<div class="impact-arrow">→</div>${impactColumn("FRICTION / 可能承壓", "pressure", item.pressure)}</div><div class="scenario-companies"><span>觀察公司（點選開啟研究）</span><div class="scenario-company-list">${item.companies.map(id => { const company=api.companyById.get(id); return company ? `<button type="button" data-company-research="${id}">${api.marketMeta[company.market].flag} ${esc(company.name)}</button>` : ""; }).join("")}</div></div><p class="scenario-caveat">反證條件：${esc(item.caveat)}</p></div>`;
  }

  function sparkline(rows) {
    if (!rows || rows.length < 2) return "";
    const last = rows[rows.length-1];
    const cutoff = new Date(`${last.date}T00:00:00`); cutoff.setDate(cutoff.getDate()-365);
    const visible = rows.filter(row => new Date(`${row.date}T00:00:00`) >= cutoff);
    const values = visible.map(row => Number(row.close));
    const min=Math.min(...values),max=Math.max(...values),span=max-min||1,w=560,h=130,p=5;
    const points=values.map((value,index)=>`${p+index/Math.max(1,values.length-1)*(w-p*2)},${p+(max-value)/span*(h-p*2)}`).join(" ");
    const tone=values.at(-1)>=values[0]?"#d94b4b":"#168b59";
    return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="一年收盤價走勢"><polygon points="${p},${h-p} ${points} ${w-p},${h-p}" fill="${tone}" opacity=".08"></polygon><polyline points="${points}" fill="none" stroke="${tone}" stroke-width="2" vector-effect="non-scaling-stroke"></polyline></svg>`;
  }

  function metrics(rows) {
    if (!rows?.length) return null;
    const latest=rows.at(-1),previous=rows.at(-2)||latest;
    const cutoff=new Date(`${latest.date}T00:00:00`);cutoff.setDate(cutoff.getDate()-365);
    const year=rows.filter(row=>new Date(`${row.date}T00:00:00`)>=cutoff);
    const prices=year.map(row=>Number(row.close));
    const high=Math.max(...prices),low=Math.min(...prices),last=Number(latest.close);
    let peak=-Infinity,maxDrawdown=0;
    prices.forEach(price=>{peak=Math.max(peak,price);maxDrawdown=Math.min(maxDrawdown,(price/peak-1)*100);});
    return {latest,change:last-Number(previous.close),r1m:returnFor(rows,"1m"),r3m:returnFor(rows,"3m"),r6m:returnFor(rows,"6m"),r1y:returnFor(rows,"1y"),position:high===low?100:(last-low)/(high-low)*100,maxDrawdown,high,low};
  }

  async function openDrawer(companyId, trigger) {
    const company=api.companyById.get(companyId); if(!company)return;
    lastDrawerTrigger=trigger||document.activeElement;
    $("researchDrawer").classList.add("open");$("researchDrawer").setAttribute("aria-hidden","false");document.body.classList.add("drawer-open");
    $("drawerContent").innerHTML='<div class="drawer-loading">正在計算價格動能與同業資料…</div>';
    const quote=await api.loadQuote(company),stat=metrics(quote.rows);
    const primaryStage=api.companyStages(company.id)[0]||api.stages[0];
    const peers=primaryStage.companyIds.map(id=>api.companyById.get(id)).filter(Boolean);
    const peerRows=await Promise.all(peers.map(async peer=>({company:peer,stat:metrics((await api.loadQuote(peer)).rows)})));
    const tone=value=>!Number.isFinite(value)?"":value>=0?"up":"down";
    const kpi=(label,value,className="")=>`<div class="drawer-kpi"><span>${label}</span><strong class="${className}">${value}</strong></div>`;
    const price=stat?api.priceFormat(stat.latest.close,company.market):"—";
    $("drawerContent").innerHTML=`<div class="drawer-company">${api.logoMarkup(company)}<div><h2 id="drawerTitle">${esc(company.name)}</h2><p>${api.marketMeta[company.market].flag} ${esc(company.exchange)} · ${esc(company.symbol)} · ${esc(quote.currency)}</p></div></div><div class="drawer-role">${esc(company.role)}</div><div class="drawer-kpis">${kpi("最近收盤",price)}${kpi("1 個月",fmtPct(stat?.r1m),tone(stat?.r1m))}${kpi("3 個月",fmtPct(stat?.r3m),tone(stat?.r3m))}${kpi("6 個月",fmtPct(stat?.r6m),tone(stat?.r6m))}${kpi("1 年",fmtPct(stat?.r1y),tone(stat?.r1y))}${kpi("52 週區間位置",Number.isFinite(stat?.position)?`${stat.position.toFixed(0)}%`:"—")}${kpi("1 年最大回撤",fmtPct(stat?.maxDrawdown),"down")}</div><div class="drawer-chart">${sparkline(quote.rows)||'<div class="sparkline-empty">行情資料不足</div>'}</div><div class="drawer-section"><h3>${esc(primaryStage.title)}同業價格比較</h3><div class="peer-table-wrap"><table class="peer-table"><thead><tr><th>公司</th><th>市場</th><th>1M</th><th>3M</th><th>6M</th><th>1Y</th><th>52W 位置</th></tr></thead><tbody>${peerRows.map(row=>`<tr class="${row.company.id===company.id?"current":""}"><td><button type="button" data-peer-company="${row.company.id}">${esc(row.company.name)} · ${esc(row.company.symbol)}</button></td><td>${api.marketMeta[row.company.market].flag}</td><td class="${tone(row.stat?.r1m)}">${fmtPct(row.stat?.r1m)}</td><td class="${tone(row.stat?.r3m)}">${fmtPct(row.stat?.r3m)}</td><td class="${tone(row.stat?.r6m)}">${fmtPct(row.stat?.r6m)}</td><td class="${tone(row.stat?.r1y)}">${fmtPct(row.stat?.r1y)}</td><td>${Number.isFinite(row.stat?.position)?`${row.stat.position.toFixed(0)}%`:"—"}</td></tr>`).join("")}</tbody></table></div></div><div class="drawer-foot"><span>以網站既有收盤價衍生；未含匯率、股利、估值與基本面。最大回撤為近一年高點至其後低點。</span><a href="${api.stockUrl(company)}" target="_blank" rel="noopener">開啟 ${esc(company.symbol)} 個股頁 ↗</a></div>`;
    $("drawerContent").querySelector(".company-logo img")?.addEventListener("error",event=>event.currentTarget.parentElement.classList.add("fallback"),{once:true});
    $("researchDrawer").querySelector(".drawer-close").focus();
  }

  function closeDrawer() {
    $("researchDrawer").classList.remove("open");$("researchDrawer").setAttribute("aria-hidden","true");document.body.classList.remove("drawer-open");lastDrawerTrigger?.focus?.();
  }

  function setupEvents() {
    document.addEventListener("click", event => {
      const architecture=event.target.closest("[data-architecture]");
      if(architecture){selectedArchitecture=architecture.dataset.architecture;renderArchitectures();return;}
      const focus=event.target.closest("[data-focus-stage]");
      if(focus){api.selectStage(focus.dataset.focusStage);renderStageResearch(focus.dataset.focusStage);$("supplyChain").scrollIntoView({behavior:"smooth"});return;}
      const stage=event.target.closest("[data-stage]");
      if(stage) renderStageResearch(stage.dataset.stage);
      const pulseStage=event.target.closest("[data-pulse-stage]");
      if(pulseStage){api.selectStage(pulseStage.dataset.pulseStage);renderStageResearch(pulseStage.dataset.pulseStage);$("supplyChain").scrollIntoView({behavior:"smooth"});return;}
      const scenario=event.target.closest("[data-scenario]");
      if(scenario){selectedScenario=scenario.dataset.scenario;renderScenarios();return;}
      const research=event.target.closest("[data-company-research]");
      if(research){openDrawer(research.dataset.companyResearch,research);return;}
      const peer=event.target.closest("[data-peer-company]");
      if(peer){openDrawer(peer.dataset.peerCompany,peer);return;}
      if(event.target.closest("[data-drawer-close]")) closeDrawer();
    });
    document.querySelectorAll("[data-pulse-range]").forEach(button=>button.addEventListener("click",()=>{pulseRange=button.dataset.pulseRange;document.querySelectorAll("[data-pulse-range]").forEach(item=>item.classList.toggle("active",item===button));renderPulse();}));
    $("pulseSort").addEventListener("click",()=>{$("pulseChart").dataset.sorted="true";renderPulse();});
    $("pulseReset").addEventListener("click",()=>{$("pulseChart").dataset.sorted="false";renderPulse();});
    document.querySelectorAll("[data-server-mode]").forEach(button=>button.addEventListener("click",()=>{const model=$("serverModel");model.classList.remove("mode-data","mode-power","mode-cooling");if(button.dataset.serverMode!=="all")model.classList.add(`mode-${button.dataset.serverMode}`);document.querySelectorAll("[data-server-mode]").forEach(item=>item.classList.toggle("active",item===button));}));
    document.addEventListener("keydown",event=>{if(event.key==="Escape"&&$("researchDrawer").classList.contains("open"))closeDrawer();});
  }

  function init() {
    renderArchitectures();renderStageResearch("compute");renderScenarios();setupEvents();
    const pulse=$("chainPulse");
    if("IntersectionObserver" in window){const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();loadPulse();}},{rootMargin:"500px"});observer.observe(pulse);}else loadPulse();
  }

  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
