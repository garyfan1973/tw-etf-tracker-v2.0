(function () {
  "use strict";

  const $ = id => document.getElementById(id);
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[char]));
  const marketMeta = {
    TW:{label:"台灣", flag:"🇹🇼", currency:"TWD"}, US:{label:"美國", flag:"🇺🇸", currency:"USD"},
    JP:{label:"日本", flag:"🇯🇵", currency:"JPY"}, KS:{label:"韓國", flag:"🇰🇷", currency:"KRW"}
  };

  const companies = [
    {id:"tw2330",market:"TW",symbol:"2330",name:"台積電",exchange:"TWSE",domain:"tsmc.com",tags:["晶圓代工","CoWoS","先進製程"],role:"將 GPU、CPU 與 ASIC 設計轉成先進製程晶片，並提供先進封裝能力。"},
    {id:"tw2454",market:"TW",symbol:"2454",name:"聯發科",exchange:"TWSE",domain:"mediatek.com",tags:["ASIC","高速互連","晶片設計"],role:"提供 ASIC、網通與邊緣 AI 晶片設計能力。"},
    {id:"tw3443",market:"TW",symbol:"3443",name:"創意",exchange:"TWSE",domain:"guc-asic.com",tags:["ASIC","IP","設計服務"],role:"協助雲端與晶片公司完成客製 ASIC 設計與量產。"},
    {id:"tw3661",market:"TW",symbol:"3661",name:"世芯-KY",exchange:"TWSE",domain:"alchip.com",tags:["AI ASIC","先進製程","設計服務"],role:"高階 AI 與 HPC ASIC 設計服務。"},
    {id:"tw3711",market:"TW",symbol:"3711",name:"日月光投控",exchange:"TWSE",domain:"aseglobal.com",tags:["封裝","測試","SiP"],role:"晶片封裝、測試與系統級封裝服務。"},
    {id:"tw6239",market:"TW",symbol:"6239",name:"力成",exchange:"TWSE",domain:"pti.com.tw",tags:["記憶體封測","測試","封裝"],role:"記憶體與邏輯晶片封裝測試。"},
    {id:"tw3037",market:"TW",symbol:"3037",name:"欣興",exchange:"TWSE",domain:"unimicron.com",tags:["ABF 載板","PCB","HDI"],role:"承載高階晶片並連接主機板的 ABF 載板與 PCB。"},
    {id:"tw8046",market:"TW",symbol:"8046",name:"南電",exchange:"TWSE",domain:"nanyapcb.com.tw",tags:["ABF 載板","BT 載板","PCB"],role:"高階 IC 載板與印刷電路板。"},
    {id:"tw3189",market:"TW",symbol:"3189",name:"景碩",exchange:"TWSE",domain:"kinsus.com.tw",tags:["IC 載板","ABF","封裝基板"],role:"處理晶片與系統板之間的電性與機械連接。"},
    {id:"tw2383",market:"TW",symbol:"2383",name:"台光電",exchange:"TWSE",domain:"emctw.com",tags:["CCL","低損耗材料","高速傳輸"],role:"提供高速 PCB 所需低損耗銅箔基板。"},
    {id:"tw6274",market:"TW",symbol:"6274",name:"台燿",exchange:"TPEx",domain:"tuc.com.tw",tags:["CCL","高頻材料","伺服器"],role:"高速交換器與 AI 伺服器 PCB 的關鍵材料。"},
    {id:"tw2368",market:"TW",symbol:"2368",name:"金像電",exchange:"TWSE",domain:"gce.com.tw",tags:["伺服器 PCB","網通 PCB","多層板"],role:"製造伺服器與高速網路設備多層 PCB。"},
    {id:"tw4958",market:"TW",symbol:"4958",name:"臻鼎-KY",exchange:"TWSE",domain:"zdtco.com",tags:["PCB","HDI","軟板"],role:"大型 PCB 與高密度互連板供應商。"},
    {id:"tw2345",market:"TW",symbol:"2345",name:"智邦",exchange:"TWSE",domain:"accton.com",tags:["交換器","800G","資料中心網路"],role:"設計製造資料中心高速交換器與網路設備。"},
    {id:"tw3081",market:"TW",symbol:"3081",name:"聯亞",exchange:"TPEx",domain:"landmarkopto.com.tw",tags:["雷射晶片","磷化銦","光通訊"],role:"高速光收發模組上游雷射與光電晶片。"},
    {id:"tw3363",market:"TW",symbol:"3363",name:"上詮",exchange:"TPEx",domain:"foci.com.tw",tags:["光纖元件","FAU","CPO"],role:"提供光纖陣列與光耦合元件。"},
    {id:"tw6442",market:"TW",symbol:"6442",name:"光聖",exchange:"TWSE",domain:"ezconn.com",tags:["光連接器","光模組元件","資料中心"],role:"高速光通訊連接與模組零組件。"},
    {id:"tw3665",market:"TW",symbol:"3665",name:"貿聯-KY",exchange:"TWSE",domain:"bizlinktech.com",tags:["高速線材","連接器","電源線束"],role:"連接伺服器內外電力與高速訊號的線束系統。"},
    {id:"tw2308",market:"TW",symbol:"2308",name:"台達電",exchange:"TWSE",domain:"deltaww.com",tags:["電源","散熱","資料中心基礎設施"],role:"把機房電力高效率轉換並供應到機櫃與伺服器。"},
    {id:"tw2301",market:"TW",symbol:"2301",name:"光寶科",exchange:"TWSE",domain:"liteon.com",tags:["伺服器電源","電源管理","雲端"],role:"伺服器與資料中心電源供應及電源管理。"},
    {id:"tw3211",market:"TW",symbol:"3211",name:"順達",exchange:"TPEx",domain:"dynapack.com.tw",tags:["BBU","電池模組","備援電力"],role:"在斷電或尖峰用電時提供機櫃級短時備援。"},
    {id:"tw3017",market:"TW",symbol:"3017",name:"奇鋐",exchange:"TWSE",domain:"avc.co",tags:["散熱","液冷","風扇"],role:"移除 GPU 與伺服器的高密度熱量。"},
    {id:"tw3653",market:"TW",symbol:"3653",name:"健策",exchange:"TWSE",domain:"jentech.com.tw",tags:["均熱片","水冷板","散熱"],role:"以均熱片與液冷零件把晶片熱量導出。"},
    {id:"tw8996",market:"TW",symbol:"8996",name:"高力",exchange:"TWSE",domain:"kaori.com.tw",tags:["熱交換器","液冷","板式換熱"],role:"在液冷迴路與機房冷卻系統間交換熱量。"},
    {id:"tw6831",market:"TW",symbol:"6831",name:"邁科",exchange:"TWSE",domain:"mikipulley.com.tw",tags:["散熱模組","伺服器","熱管理"],role:"提供高功率運算系統的熱管理零組件。"},
    {id:"tw8210",market:"TW",symbol:"8210",name:"勤誠",exchange:"TWSE",domain:"chenbro.com",tags:["伺服器機殼","機櫃","機構件"],role:"保護、承載並安排伺服器內部零件與風道。"},
    {id:"tw2059",market:"TW",symbol:"2059",name:"川湖",exchange:"TWSE",domain:"king-slide.com",tags:["伺服器滑軌","機構件","機櫃"],role:"讓重型伺服器可安全拉出維護並固定於機櫃。"},
    {id:"tw2327",market:"TW",symbol:"2327",name:"國巨*",exchange:"TWSE",domain:"yageo.com",tags:["電阻","電容","被動元件"],role:"濾波、穩壓與保護高速高功率電子系統。"},
    {id:"tw2492",market:"TW",symbol:"2492",name:"華新科",exchange:"TWSE",domain:"passivecomponent.com",tags:["MLCC","電阻","被動元件"],role:"提供主機板、電源與加速卡需要的被動元件。"},
    {id:"tw2472",market:"TW",symbol:"2472",name:"立隆電",exchange:"TWSE",domain:"lelon.com",tags:["鋁電容","固態電容","電源"],role:"平滑電源雜訊並承受伺服器高功率負載。"},
    {id:"tw3026",market:"TW",symbol:"3026",name:"禾伸堂",exchange:"TWSE",domain:"holy-stone.com.tw",tags:["MLCC","電子材料","被動元件"],role:"供應積層陶瓷電容與電子材料。"},
    {id:"tw6669",market:"TW",symbol:"6669",name:"緯穎",exchange:"TWSE",domain:"wiwynn.com",tags:["AI 伺服器","雲端 ODM","機櫃整合"],role:"為大型雲端業者設計、製造並整合伺服器與機櫃。"},
    {id:"tw2382",market:"TW",symbol:"2382",name:"廣達",exchange:"TWSE",domain:"quantatw.com",tags:["AI 伺服器","ODM","資料中心"],role:"大規模製造 AI 伺服器、運算節點與整機櫃。"},
    {id:"tw3231",market:"TW",symbol:"3231",name:"緯創",exchange:"TWSE",domain:"wistron.com",tags:["AI 伺服器","系統整合","ODM"],role:"提供伺服器設計製造與全球供應鏈整合。"},
    {id:"tw2317",market:"TW",symbol:"2317",name:"鴻海",exchange:"TWSE",domain:"foxconn.com",tags:["AI 伺服器","機櫃","製造服務"],role:"從主板、伺服器到整櫃提供大規模製造整合。"},
    {id:"tw2376",market:"TW",symbol:"2376",name:"技嘉",exchange:"TWSE",domain:"gigabyte.com",tags:["伺服器","GPU 平台","主機板"],role:"提供 GPU 伺服器、主機板與整機系統。"},
    {id:"tw6690",market:"TW",symbol:"6690",name:"安碁資訊",exchange:"TPEx",domain:"acercsi.com",tags:["MSSP","SOC","IT／OT 資安"],role:"提供 7×24 SOC、MDR、雲端與 OT 資安監控，以及事件應變服務。"},

    {id:"usNVDA",market:"US",symbol:"NVDA",name:"NVIDIA",exchange:"NASDAQ",domain:"nvidia.com",tags:["GPU","NVLink","AI 平台"],role:"提供加速運算 GPU、互連、網路與軟體平台。"},
    {id:"usAMD",market:"US",symbol:"AMD",name:"AMD",exchange:"NASDAQ",domain:"amd.com",tags:["GPU","CPU","加速器"],role:"提供 EPYC CPU、Instinct GPU 與資料中心加速平台。"},
    {id:"usAVGO",market:"US",symbol:"AVGO",name:"Broadcom",exchange:"NASDAQ",domain:"broadcom.com",tags:["ASIC","交換器晶片","高速互連"],role:"提供客製 AI ASIC、交換器晶片與連接技術。"},
    {id:"usMRVL",market:"US",symbol:"MRVL",name:"Marvell",exchange:"NASDAQ",domain:"marvell.com",tags:["ASIC","網路晶片","光 DSP"],role:"提供雲端 ASIC、資料中心交換與光通訊晶片。"},
    {id:"usARM",market:"US",symbol:"ARM",name:"Arm",exchange:"NASDAQ",domain:"arm.com",tags:["CPU IP","架構授權","低功耗"],role:"提供資料中心 CPU 核心架構與 IP。"},
    {id:"usQCOM",market:"US",symbol:"QCOM",name:"Qualcomm",exchange:"NASDAQ",domain:"qualcomm.com",tags:["邊緣 AI","加速器","晶片設計"],role:"將 AI 推論帶到邊緣裝置與終端。"},
    {id:"usTSM",market:"US",symbol:"TSM",name:"TSMC ADR",exchange:"NYSE",domain:"tsmc.com",tags:["晶圓代工","ADR","先進製程"],role:"台積電於美國交易的 ADR。"},
    {id:"usGFS",market:"US",symbol:"GFS",name:"GlobalFoundries",exchange:"NASDAQ",domain:"gf.com",tags:["晶圓代工","特殊製程","連接晶片"],role:"製造網通、電源與特殊製程半導體。"},
    {id:"usINTC",market:"US",symbol:"INTC",name:"Intel",exchange:"NASDAQ",domain:"intel.com",tags:["CPU","晶圓代工","先進封裝"],role:"提供伺服器 CPU、加速器、晶圓代工與封裝。"},
    {id:"usMU",market:"US",symbol:"MU",name:"Micron",exchange:"NASDAQ",domain:"micron.com",tags:["HBM","DRAM","NAND"],role:"提供 GPU 鄰近的高頻寬記憶體及系統記憶體。"},
    {id:"usWDC",market:"US",symbol:"WDC",name:"Western Digital",exchange:"NASDAQ",domain:"westerndigital.com",tags:["儲存","HDD","資料中心"],role:"提供大規模資料中心儲存裝置。"},
    {id:"usSNDK",market:"US",symbol:"SNDK",name:"SanDisk",exchange:"NASDAQ",domain:"sandisk.com",tags:["NAND","SSD","快閃儲存"],role:"提供 NAND 與高速快閃儲存產品。"},
    {id:"usASML",market:"US",symbol:"ASML",name:"ASML",exchange:"NASDAQ",domain:"asml.com",tags:["EUV","曝光機","半導體設備"],role:"先進製程微影與 EUV 曝光設備核心供應商。"},
    {id:"usAMAT",market:"US",symbol:"AMAT",name:"Applied Materials",exchange:"NASDAQ",domain:"appliedmaterials.com",tags:["沉積","蝕刻","封裝設備"],role:"提供晶圓製程與先進封裝設備。"},
    {id:"usLRCX",market:"US",symbol:"LRCX",name:"Lam Research",exchange:"NASDAQ",domain:"lamresearch.com",tags:["蝕刻","沉積","記憶體設備"],role:"先進邏輯與記憶體製程的蝕刻沉積設備。"},
    {id:"usKLAC",market:"US",symbol:"KLAC",name:"KLA",exchange:"NASDAQ",domain:"kla.com",tags:["檢測","量測","良率"],role:"檢查製程缺陷並協助提升晶圓與封裝良率。"},
    {id:"usTER",market:"US",symbol:"TER",name:"Teradyne",exchange:"NASDAQ",domain:"teradyne.com",tags:["半導體測試","ATE","驗證"],role:"以自動測試設備確認晶片功能、速度與可靠度。"},
    {id:"usANET",market:"US",symbol:"ANET",name:"Arista Networks",exchange:"NYSE",domain:"arista.com",tags:["資料中心交換器","Ethernet","AI 網路"],role:"連接大量 GPU 節點並管理資料中心 Ethernet 網路。"},
    {id:"usCRDO",market:"US",symbol:"CRDO",name:"Credo",exchange:"NASDAQ",domain:"credosemi.com",tags:["SerDes","AEC","高速連接"],role:"提供高速 SerDes、DSP 與主動式電纜晶片。"},
    {id:"usCOHR",market:"US",symbol:"COHR",name:"Coherent",exchange:"NYSE",domain:"coherent.com",tags:["雷射","光元件","收發模組"],role:"提供雷射、光學材料與高速光通訊元件。"},
    {id:"usLITE",market:"US",symbol:"LITE",name:"Lumentum",exchange:"NASDAQ",domain:"lumentum.com",tags:["雷射","光通訊","雲端網路"],role:"提供光收發模組使用的雷射與光電元件。"},
    {id:"usCIEN",market:"US",symbol:"CIEN",name:"Ciena",exchange:"NYSE",domain:"ciena.com",tags:["光網路","傳輸設備","資料中心互連"],role:"連接資料中心之間的高速光傳輸網路。"},
    {id:"usGLW",market:"US",symbol:"GLW",name:"Corning",exchange:"NYSE",domain:"corning.com",tags:["光纖","玻璃材料","連接"],role:"提供資料中心高密度光纖與光學材料。"},
    {id:"usDELL",market:"US",symbol:"DELL",name:"Dell Technologies",exchange:"NYSE",domain:"dell.com",tags:["AI 伺服器","整機系統","企業基礎設施"],role:"向企業提供 AI 伺服器、儲存與整套基礎設施。"},
    {id:"usMSFT",market:"US",symbol:"MSFT",name:"Microsoft",exchange:"NASDAQ",domain:"microsoft.com",tags:["Azure","雲端 AI","資料中心"],role:"建置大規模 AI 資料中心並向客戶提供算力。"},
    {id:"usAMZN",market:"US",symbol:"AMZN",name:"Amazon",exchange:"NASDAQ",domain:"amazon.com",tags:["AWS","雲端 AI","自研晶片"],role:"以 AWS 提供 AI 算力並開發自有加速晶片。"},
    {id:"usGOOGL",market:"US",symbol:"GOOGL",name:"Alphabet",exchange:"NASDAQ",domain:"abc.xyz",tags:["Google Cloud","TPU","資料中心"],role:"設計 TPU 並經由 Google Cloud 提供 AI 服務。"},
    {id:"usAAPL",market:"US",symbol:"AAPL",name:"Apple",exchange:"NASDAQ",domain:"apple.com",tags:["Apple Intelligence","裝置端 AI","作業系統"],role:"把生成式 AI、個人情境與隱私運算整合進 iPhone、iPad、Mac 與系統級應用。"},
    {id:"usMETA",market:"US",symbol:"META",name:"Meta Platforms",exchange:"NASDAQ",domain:"meta.com",tags:["Meta AI","Llama","推薦與廣告"],role:"以 Llama、Meta AI 與推薦系統把 AI 導入社群、通訊、廣告與智慧眼鏡。"},
    {id:"usPLTR",market:"US",symbol:"PLTR",name:"Palantir",exchange:"NASDAQ",domain:"palantir.com",tags:["AIP","企業決策","資料作業系統"],role:"用 AIP、Foundry 與 Apollo 將企業資料、模型、權限與實際工作流程連接。"},
    {id:"usNOW",market:"US",symbol:"NOW",name:"ServiceNow",exchange:"NYSE",domain:"servicenow.com",tags:["AI Agents","企業工作流","Now Platform"],role:"把 AI Agent、知識與自動化嵌入 IT、客服、人資與企業工作流程。"},
    {id:"usCRM",market:"US",symbol:"CRM",name:"Salesforce",exchange:"NYSE",domain:"salesforce.com",tags:["Agentforce","CRM","企業 AI"],role:"以 Agentforce、Data Cloud 與 CRM 資料讓 AI Agent 執行銷售、客服與行銷工作。"},
    {id:"usSNOW",market:"US",symbol:"SNOW",name:"Snowflake",exchange:"NYSE",domain:"snowflake.com",tags:["Cortex AI","資料雲","企業資料"],role:"在治理後的企業資料上提供 Cortex AI、模型服務與資料應用開發能力。"},
    {id:"usDDOG",market:"US",symbol:"DDOG",name:"Datadog",exchange:"NASDAQ",domain:"datadoghq.com",tags:["AI Observability","LLM 監控","DevOps"],role:"監控 AI 應用、模型呼叫、基礎設施與使用者體驗，協助團隊找出品質與成本異常。"},
    {id:"usADBE",market:"US",symbol:"ADBE",name:"Adobe",exchange:"NASDAQ",domain:"adobe.com",tags:["Firefly","創意軟體","文件 AI"],role:"把生成式影像、影片、設計與文件智慧整合進 Creative Cloud 與 Acrobat。"},
    {id:"usORCL",market:"US",symbol:"ORCL",name:"Oracle",exchange:"NYSE",domain:"oracle.com",tags:["OCI AI","資料庫","企業應用"],role:"以資料庫、OCI AI 與 Fusion 應用把模型能力帶入企業資料與核心營運系統。"},
    {id:"usPANW",market:"US",symbol:"PANW",name:"Palo Alto Networks",exchange:"NASDAQ",domain:"paloaltonetworks.com",tags:["網路安全","雲端安全","SecOps／身分"],role:"以整合平台保護網路、雲端工作負載、安全營運與人機身分。"},
    {id:"usCRWD",market:"US",symbol:"CRWD",name:"CrowdStrike",exchange:"NASDAQ",domain:"crowdstrike.com",tags:["端點安全","XDR","雲端／身分"],role:"以雲端原生 Falcon 平台整合端點、雲端、身分、資料與威脅情報。"},
    {id:"usFTNT",market:"US",symbol:"FTNT",name:"Fortinet",exchange:"NASDAQ",domain:"fortinet.com",tags:["防火牆","SASE","Security Fabric"],role:"以 FortiGate、FortiOS 與 Security Fabric 整合網路、安全與 SecOps。"},
    {id:"usZS",market:"US",symbol:"ZS",name:"Zscaler",exchange:"NASDAQ",domain:"zscaler.com",tags:["Zero Trust","SASE／SSE","資料安全"],role:"透過雲端 Zero Trust Exchange 保護使用者、裝置、分支與工作負載存取。"},
    {id:"usNET",market:"US",symbol:"NET",name:"Cloudflare",exchange:"NYSE",domain:"cloudflare.com",tags:["應用安全","Zero Trust","邊緣網路"],role:"在全球邊緣網路提供應用程式、API、網路與 Zero Trust 安全服務。"},
    {id:"usOKTA",market:"US",symbol:"OKTA",name:"Okta",exchange:"NASDAQ",domain:"okta.com",tags:["身分安全","IAM","AI Agent 身分"],role:"管理員工、客戶、機器與 AI Agent 的驗證、授權、治理與存取。"},
    {id:"usRBRK",market:"US",symbol:"RBRK",name:"Rubrik",exchange:"NYSE",domain:"rubrik.com",tags:["資料安全","備份復原","Cyber Resilience"],role:"保護企業資料並提供勒索軟體偵測、不可變備份與事件後快速復原。"},

    {id:"jp285A",market:"JP",symbol:"285A",name:"鎧俠控股",exchange:"TSE",domain:"kioxia-holdings.com",tags:["NAND","SSD","記憶體"],role:"大型 NAND Flash 與企業級 SSD 供應商。"},
    {id:"jp4062",market:"JP",symbol:"4062",name:"Ibiden",exchange:"TSE",domain:"ibiden.com",tags:["IC 載板","封裝基板","高階 PCB"],role:"供應高階 CPU／GPU 所需封裝基板。"},
    {id:"jp5706",market:"JP",symbol:"5706",name:"三井金屬",exchange:"TSE",domain:"mitsui-kinzoku.com",tags:["銅箔","載板材料","電子材料"],role:"提供高階載板與 PCB 使用的電子材料。"},
    {id:"jp6723",market:"JP",symbol:"6723",name:"瑞薩電子",exchange:"TSE",domain:"renesas.com",tags:["控制晶片","電源管理","MCU"],role:"提供伺服器周邊控制、電源管理與嵌入式晶片。"},
    {id:"jp6857",market:"JP",symbol:"6857",name:"Advantest",exchange:"TSE",domain:"advantest.com",tags:["半導體測試","ATE","AI 晶片"],role:"測試高階運算與記憶體晶片是否符合規格。"},
    {id:"jp6920",market:"JP",symbol:"6920",name:"Lasertec",exchange:"TSE",domain:"lasertec.co.jp",tags:["EUV 光罩檢測","量測","設備"],role:"檢測先進製程 EUV 光罩與光罩胚。"},
    {id:"jp6976",market:"JP",symbol:"6976",name:"太陽誘電",exchange:"TSE",domain:"yuden.co.jp",tags:["MLCC","電感","被動元件"],role:"供應高可靠度電容與電感元件。"},
    {id:"jp6981",market:"JP",symbol:"6981",name:"村田製作所",exchange:"TSE",domain:"murata.com",tags:["MLCC","電源模組","被動元件"],role:"提供高密度伺服器需要的微型被動元件與模組。"},
    {id:"jp8035",market:"JP",symbol:"8035",name:"東京威力科創",exchange:"TSE",domain:"tel.com",tags:["蝕刻","沉積","塗佈顯影"],role:"提供晶圓製造多道關鍵製程設備。"},
    {id:"jp4704",market:"JP",symbol:"4704",name:"趨勢科技",exchange:"TSE Prime",domain:"trendmicro.com",tags:["XDR","雲端安全","企業資安平台"],role:"以 TrendAI Vision One 保護端點、雲端、網路、郵件與安全營運。"},

    {id:"ks005930",market:"KS",symbol:"005930",name:"三星電子",exchange:"KRX",domain:"samsung.com",tags:["HBM","DRAM","晶圓代工"],role:"同時提供記憶體、晶圓代工與系統半導體。"},
    {id:"ks000660",market:"KS",symbol:"000660",name:"SK 海力士",exchange:"KRX",domain:"skhynix.com",tags:["HBM","DRAM","NAND"],role:"AI GPU 高頻寬記憶體的重要供應商。"},
    {id:"ks009150",market:"KS",symbol:"009150",name:"三星電機",exchange:"KRX",domain:"samsungsem.com",tags:["MLCC","封裝基板","被動元件"],role:"供應 MLCC、封裝基板與電子模組。"},

    {id:"tw2303",market:"TW",symbol:"2303",name:"聯電",exchange:"TWSE",domain:"umc.com",tags:["晶圓代工","特殊製程","成熟製程"],role:"以成熟與特殊製程承接電源、網通、控制與周邊晶片，是 AI 系統不可缺的製造底座。"},
    {id:"tw2337",market:"TW",symbol:"2337",name:"旺宏",exchange:"TWSE",domain:"macronix.com",tags:["NOR Flash","記憶體","儲存"],role:"提供 NOR Flash 與嵌入式記憶體，支援伺服器韌體、控制器與工業 AI 裝置。"},
    {id:"tw2344",market:"TW",symbol:"2344",name:"華邦電",exchange:"TWSE",domain:"winbond.com",tags:["記憶體","DRAM","Flash"],role:"供應特殊型 DRAM、Flash 與嵌入式記憶體，服務伺服器與邊緣裝置。"},
    {id:"tw2356",market:"TW",symbol:"2356",name:"英業達",exchange:"TWSE",domain:"inventec.com",tags:["AI 伺服器","ODM","資料中心"],role:"整合伺服器、儲存與網通設備，承接雲端資料中心的設計與量產。"},
    {id:"tw2357",market:"TW",symbol:"2357",name:"華碩",exchange:"TWSE",domain:"asus.com",tags:["GPU 伺服器","工作站","AI PC"],role:"提供 GPU 伺服器、工作站、主機板與 AI PC，連接企業與消費端算力需求。"},
    {id:"tw2360",market:"TW",symbol:"2360",name:"致茂",exchange:"TWSE",domain:"chroma.com.tw",tags:["測試設備","電源測試","半導體設備"],role:"以自動化測試設備驗證電源、晶片與電子系統的效能、可靠度與安全性。"},
    {id:"tw2377",market:"TW",symbol:"2377",name:"微星",exchange:"TWSE",domain:"msi.com",tags:["GPU 平台","主機板","AI PC"],role:"提供 GPU 平台、主機板與工作站，讓高效能運算落地到專業與消費市場。"},
    {id:"tw2379",market:"TW",symbol:"2379",name:"瑞昱",exchange:"TWSE",domain:"realtek.com",tags:["網路晶片","乙太網路","連接"],role:"供應乙太網路、Wi-Fi、交換器與周邊連接晶片，支撐 AI 伺服器與終端設備。"},
    {id:"tw2395",market:"TW",symbol:"2395",name:"研華",exchange:"TWSE",domain:"advantech.com",tags:["邊緣 AI","工業電腦","系統整合"],role:"把 AI 推論整合進工業電腦、邊緣設備與智慧製造現場。"},
    {id:"tw2408",market:"TW",symbol:"2408",name:"南亞科",exchange:"TWSE",domain:"nanya.com",tags:["DRAM","記憶體","伺服器"],role:"提供 DRAM 與記憶體解決方案，承接 AI 伺服器與通用運算的資料暫存需求。"},
    {id:"tw2449",market:"TW",symbol:"2449",name:"京元電子",exchange:"TWSE",domain:"kyec.com.tw",tags:["晶片測試","封裝","AI 測試"],role:"提供晶圓測試、成品測試與封裝服務，協助高效能與 AI 晶片完成量產驗證。"},
    {id:"tw2451",market:"TW",symbol:"2451",name:"創見",exchange:"TWSE",domain:"transcend-info.com",tags:["記憶體模組","SSD","工業儲存"],role:"提供記憶體模組、SSD 與工業級儲存，支援伺服器、邊緣 AI 與嵌入式系統。"},
    {id:"tw2455",market:"TW",symbol:"2455",name:"全新",exchange:"TWSE",domain:"vpec.com.tw",tags:["砷化鎵","光電元件","射頻"],role:"以化合物半導體製程供應射頻、光電與高速通訊所需的晶片。"},
    {id:"tw2467",market:"TW",symbol:"2467",name:"志聖",exchange:"TWSE",domain:"csun.com.tw",tags:["半導體設備","封裝設備","自動化"],role:"提供晶圓、封裝與 PCB 製程設備，支援產線自動化與良率提升。"},
    {id:"tw3005",market:"TW",symbol:"3005",name:"神基",exchange:"TWSE",domain:"getac.com",tags:["邊緣運算","工業電腦","強固型設備"],role:"以強固型電腦與邊緣運算設備，把 AI 推論帶到工業、公共安全與現場環境。"},
    {id:"tw3006",market:"TW",symbol:"3006",name:"晶豪科",exchange:"TWSE",domain:"etron.com.tw",tags:["記憶體","DRAM","控制晶片"],role:"供應記憶體與控制晶片，涵蓋消費電子、工業設備與邊緣運算應用。"},
    {id:"tw3023",market:"TW",symbol:"3023",name:"信邦",exchange:"TWSE",domain:"sinbon.com.tw",tags:["連接器","線束","高速傳輸"],role:"提供伺服器、電源與網通設備使用的線束、連接器與整合配線。"},
    {id:"tw3030",market:"TW",symbol:"3030",name:"德律",exchange:"TWSE",domain:"trl.com.tw",tags:["自動檢測","PCB 測試","AOI"],role:"以自動光學與電性檢測設備檢查 PCB、封裝與電子產品品質。"},
    {id:"tw3044",market:"TW",symbol:"3044",name:"健鼎",exchange:"TWSE",domain:"tripod-tech.com",tags:["PCB","伺服器板","多層板"],role:"製造高層數、多層與伺服器用 PCB，承載高速訊號與高功率電流。"},
    {id:"tw3105",market:"TW",symbol:"3105",name:"穩懋",exchange:"TPEx",domain:"winsemi.com.tw",tags:["化合物半導體","砷化鎵","射頻"],role:"以化合物半導體代工支援射頻、光通訊與高速連接應用。"},
    {id:"tw3131",market:"TW",symbol:"3131",name:"弘塑",exchange:"TPEx",domain:"gptc.com.tw",tags:["半導體設備","濕製程","清洗"],role:"提供先進封裝與晶圓製程的清洗、濕製程與自動化設備。"},
    {id:"tw3264",market:"TW",symbol:"3264",name:"欣銓",exchange:"TPEx",domain:"ardentec.com.tw",tags:["晶圓測試","成品測試","車用晶片"],role:"提供晶圓與成品測試，驗證邏輯、記憶體、網通與高效能晶片。"},
    {id:"tw3265",market:"TW",symbol:"3265",name:"台星科",exchange:"TPEx",domain:"sigurd.com.tw",tags:["封裝測試","記憶體","邏輯晶片"],role:"提供晶圓測試、封裝與成品測試服務，支援記憶體與邏輯晶片量產。"},
    {id:"tw3374",market:"TW",symbol:"3374",name:"精材",exchange:"TPEx",domain:"pspcorp.com.tw",tags:["晶圓級封裝","CIS","封裝"],role:"提供晶圓級與特殊封裝，協助影像、感測與高效能晶片縮小尺寸並提升整合度。"},
    {id:"tw3376",market:"TW",symbol:"3376",name:"新日興",exchange:"TWSE",domain:"szs.com.tw",tags:["精密機構件","金屬件","伺服器零件"],role:"以精密金屬與機構件支援伺服器、儲存設備與高階電子產品。"},
    {id:"tw3491",market:"TW",symbol:"3491",name:"昇達科",exchange:"TPEx",domain:"ubest.com.tw",tags:["微波元件","毫米波","衛星通訊"],role:"提供高頻微波與毫米波元件，支援資料中心互連、衛星與高速通訊網路。"},
    {id:"tw3532",market:"TW",symbol:"3532",name:"台勝科",exchange:"TWSE",domain:"globalwafers.com",tags:["矽晶圓","半導體材料","晶圓"],role:"供應半導體製造使用的矽晶圓，是先進與成熟製程的材料基礎。"},
    {id:"tw3533",market:"TW",symbol:"3533",name:"嘉澤",exchange:"TWSE",domain:"lotes.cc",tags:["連接器","伺服器插槽","高速介面"],role:"提供 CPU 插槽、記憶體插槽與高速連接器，連接伺服器主板與關鍵模組。"},
    {id:"tw3583",market:"TW",symbol:"3583",name:"辛耘",exchange:"TWSE",domain:"scientech.com.tw",tags:["半導體設備","濕製程","先進封裝"],role:"提供晶圓與先進封裝的濕製程、清洗與自動化設備。"},
    {id:"tw3706",market:"TW",symbol:"3706",name:"神達",exchange:"TWSE",domain:"mitac.com",tags:["AI 伺服器","雲端 ODM","系統整合"],role:"設計與製造伺服器、儲存及邊緣運算系統，服務雲端與企業客戶。"},
    {id:"tw4915",market:"TW",symbol:"4915",name:"致伸",exchange:"TWSE",domain:"primax.com.tw",tags:["影像模組","感測器","人機介面"],role:"提供影像、感測與人機介面模組，支援邊緣 AI、智慧裝置與車用應用。"},
    {id:"tw4966",market:"TW",symbol:"4966",name:"譜瑞-KY",exchange:"TPEx",domain:"paradetech.com",tags:["高速介面","Retimer","顯示晶片"],role:"提供高速介面、Retimer 與顯示連接晶片，維持 AI 系統的訊號完整性。"},
    {id:"tw5269",market:"TW",symbol:"5269",name:"祥碩",exchange:"TWSE",domain:"asmedia.com.tw",tags:["PCIe Switch","高速介面","晶片設計"],role:"提供 PCIe Switch、橋接與高速介面晶片，擴充 GPU、SSD 與網路裝置的連接能力。"},
    {id:"tw5274",market:"TW",symbol:"5274",name:"信驊",exchange:"TWSE",domain:"aspeedtech.com",tags:["BMC","伺服器管理","遠端管理"],role:"提供伺服器管理控制器，負責遠端監控、韌體更新與硬體健康管理。"},
    {id:"tw5289",market:"TW",symbol:"5289",name:"宜鼎",exchange:"TWSE",domain:"innodisk.com",tags:["工業記憶體","SSD","邊緣 AI"],role:"提供工業級記憶體、SSD 與嵌入式儲存，支援邊緣 AI 長時間穩定運作。"},
    {id:"tw5347",market:"TW",symbol:"5347",name:"世界先進",exchange:"TPEx",domain:"vis.com.tw",tags:["晶圓代工","特殊製程","電源管理"],role:"以成熟與特殊製程生產電源管理、顯示與周邊控制晶片。"},
    {id:"tw5434",market:"TW",symbol:"5434",name:"崇越",exchange:"TWSE",domain:"topco-global.com",tags:["半導體材料","矽晶圓","化學品"],role:"供應晶圓廠所需的材料、化學品與設備整合服務。"},
    {id:"tw5536",market:"TW",symbol:"5536",name:"聖暉*",exchange:"TPEx",domain:"acter.com.tw",tags:["無塵室","廠務工程","資料中心"],role:"建置晶圓廠、封裝廠與資料中心的無塵室、機電與廠務系統。"},
    {id:"tw6139",market:"TW",symbol:"6139",name:"亞翔",exchange:"TPEx",domain:"lkmc.com.tw",tags:["無塵室工程","廠務","半導體建廠"],role:"提供高科技廠房與資料中心的無塵室、機電及整合工程。"},
    {id:"tw6223",market:"TW",symbol:"6223",name:"旺矽",exchange:"TPEx",domain:"mpi-corporation.com",tags:["探針卡","晶圓測試","半導體測試"],role:"提供探針卡與測試介面，協助 AI、記憶體與高效能晶片完成晶圓測試。"},
    {id:"tw6257",market:"TW",symbol:"6257",name:"矽格",exchange:"TPEx",domain:"sigurd.com.tw",tags:["晶圓測試","封裝測試","測試服務"],role:"提供晶圓、成品測試與封裝服務，支援通訊、記憶體與邏輯晶片。"},
    {id:"tw6285",market:"TW",symbol:"6285",name:"啟碁",exchange:"TWSE",domain:"wnc.com.tw",tags:["網通設備","Wi-Fi","資料中心"],role:"設計與製造無線網路、企業網通與資料中心連接設備。"},
    {id:"tw6415",market:"TW",symbol:"6415",name:"矽力*-KY",exchange:"TWSE",domain:"silergy.com",tags:["電源管理 IC","PMIC","電源效率"],role:"提供電源管理與類比 IC，提升 GPU、伺服器與終端設備的供電效率。"},
    {id:"tw6510",market:"TW",symbol:"6510",name:"精測",exchange:"TPEx",domain:"winway.com.tw",tags:["探針卡","測試介面","AI 晶片測試"],role:"提供高階探針卡與測試介面，支援先進製程與高效能晶片驗證。"},
    {id:"tw6515",market:"TW",symbol:"6515",name:"穎崴",exchange:"TWSE",domain:"winway.com.tw",tags:["測試座","探針卡","IC 測試"],role:"提供高階測試座、探針與測試介面，服務 AI、HPC 與先進封裝晶片。"},
    {id:"tw6640",market:"TW",symbol:"6640",name:"均華",exchange:"TPEx",domain:"gudeng.com",tags:["封裝設備","半導體設備","自動化"],role:"提供封裝、晶圓與自動化設備，支援高密度封裝與產線效率提升。"},

    {id:"usBE",market:"US",symbol:"BE",name:"Bloom Energy",exchange:"NYSE",domain:"bloomenergy.com",tags:["燃料電池","資料中心電力","微電網"],role:"以燃料電池與分散式能源提供資料中心穩定、低碳的現場電力。"},
    {id:"usADI",market:"US",symbol:"ADI",name:"Analog Devices",exchange:"NASDAQ",domain:"analog.com",tags:["電源管理","類比 IC","感測"],role:"提供電源、感測與訊號鏈晶片，連接 AI 伺服器的電力、熱與設備遙測。"},
    {id:"usAEHR",market:"US",symbol:"AEHR",name:"Aehr Test Systems",exchange:"NASDAQ",domain:"aehr.com",tags:["半導體測試","Burn-in","功率晶片"],role:"提供晶片老化與可靠度測試設備，支援功率、車用與高效能半導體量產。"},
    {id:"usALAB",market:"US",symbol:"ALAB",name:"Astera Labs",exchange:"NASDAQ",domain:"asteralabs.com",tags:["PCIe","CXL","資料中心互連"],role:"提供 PCIe、CXL 與資料中心互連晶片，協助 GPU、CPU、記憶體與網路設備高速溝通。"},
    {id:"usENTG",market:"US",symbol:"ENTG",name:"Entegris",exchange:"NASDAQ",domain:"entegris.com",tags:["半導體材料","過濾","晶圓製程"],role:"提供高純度材料、過濾與晶圓搬運解決方案，維持先進製程的潔淨度與良率。"},
    {id:"usFORM",market:"US",symbol:"FORM",name:"FormFactor",exchange:"NASDAQ",domain:"formfactor.com",tags:["探針卡","晶圓測試","半導體測試"],role:"提供探針卡與晶圓測試介面，驗證 GPU、HBM 與高效能晶片。"},
    {id:"usNVMI",market:"US",symbol:"NVMI",name:"Nova",exchange:"NASDAQ",domain:"nova.co.il",tags:["製程量測","半導體設備","良率"],role:"以光學與材料量測設備協助先進製程控制、缺陷分析與良率提升。"},
    {id:"usONTO",market:"US",symbol:"ONTO",name:"Onto Innovation",exchange:"NYSE",domain:"ontoinnovation.com",tags:["檢測","量測","先進封裝"],role:"提供晶圓、封裝與缺陷檢測設備，支援先進封裝與高良率製造。"},
    {id:"usRMBS",market:"US",symbol:"RMBS",name:"Rambus",exchange:"NASDAQ",domain:"rambus.com",tags:["記憶體介面","HBM","高速 IP"],role:"提供記憶體介面與高速 IP，協助 CPU、GPU 與 HBM 提升資料傳輸效率。"},
    {id:"usSITM",market:"US",symbol:"SITM",name:"SiTime",exchange:"NASDAQ",domain:"sitime.com",tags:["時脈元件","時序控制","資料中心"],role:"提供高精度時脈與時序元件，維持 AI 伺服器、網路與儲存系統同步。"},
    {id:"usSMTC",market:"US",symbol:"SMTC",name:"Semtech",exchange:"NASDAQ",domain:"semtech.com",tags:["訊號完整性","SerDes","資料中心"],role:"提供高速連接、訊號完整性與資料中心網路晶片，延伸 AI 叢集的傳輸距離。"}
  ];
  const companyById = new Map(companies.map(company => [company.id, company]));
  const logoFallback = new Set([
    "tw3443","tw3661","tw6239","tw3037","tw8046","tw3189","tw2383","tw6274","tw2368","tw4958",
    "tw2345","tw3081","tw6442","tw2301","tw8996","tw8210","tw2059","tw2492","tw2472","tw3026",
    "tw2382","tw3231","tw3363","tw6831","tw6690","usGLW","jp4062","jp6976","jp8035"
  ]);

  const stages = [
    {id:"compute",number:"01",icon:"▦",color:"#6c63dc",title:"運算晶片與加速器",short:"算力核心",role:"GPU、CPU 與客製 ASIC 執行模型訓練、推論與系統控制，是 AI 伺服器的算力來源。",products:["GPU","CPU","AI ASIC","DPU","控制晶片"],interfaces:["NVLink","PCIe 6.0","CXL","UALink"],communication:"CPU 分派工作，GPU／ASIC 大量平行運算；DPU 卸載網路、儲存與安全工作。",companyIds:["usNVDA","usAMD","usAVGO","usMRVL","usARM","usQCOM","tw2454","tw3443","tw3661","jp6723","tw2379","tw2455","tw4966","tw5269","usALAB","usRMBS"]},
    {id:"memory",number:"02",icon:"▤",color:"#e7576b",title:"記憶體與儲存",short:"餵資料給晶片",role:"HBM 把模型參數高速送入 GPU；DRAM 暫存工作資料，NAND／SSD 保存模型、資料集與檢查點。",products:["HBM3E／HBM4","DDR5","NAND","NVMe SSD","HDD"],interfaces:["HBM Interface","DDR5","PCIe／NVMe","SAS"],communication:"HBM 透過超寬匯流排貼近 GPU，SSD 經 PCIe／NVMe 將資料送入主記憶體。",companyIds:["ks000660","ks005930","usMU","jp285A","usSNDK","usWDC","tw2337","tw2344","tw2408","tw2451","tw3006","tw5289","usRMBS"]},
    {id:"foundry",number:"03",icon:"◎",color:"#168fa1",title:"晶圓代工與製程",short:"把設計做成晶片",role:"將電路設計轉成數十億顆電晶體，先進節點提高效能與能源效率，成熟製程則承擔周邊控制。",products:["先進邏輯製程","特殊製程","矽光子","晶圓級整合"],interfaces:["GDSII","PDK","IP Library","Wafer"],communication:"晶片設計公司交付版圖，晶圓廠依製程設計套件與光罩完成製造，再送往封裝測試。",companyIds:["tw2330","usTSM","usINTC","usGFS","ks005930","tw2303","tw3105","tw3532","tw5347"]},
    {id:"equipment",number:"04",icon:"⌁",color:"#ad7b2a",title:"半導體設備與材料",short:"製程的工具箱",role:"曝光、沉積、蝕刻、清洗、檢測與量測設備決定晶片能否縮小、堆疊並維持良率。",products:["EUV 曝光","蝕刻／沉積","光罩檢測","製程量測","電子材料"],interfaces:["Recipe","Wafer Handling","EUV Mask","Process Control"],communication:"設備依晶圓廠製程配方逐層加工，檢測資料再回饋製程控制系統修正參數。",companyIds:["usASML","usAMAT","usLRCX","usKLAC","jp8035","jp6920","jp5706","tw2360","tw2467","tw3030","tw3131","tw3583","tw5434","tw6640","usENTG","usNVMI","usONTO"]},
    {id:"packaging",number:"05",icon:"▣",color:"#d47732",title:"先進封裝與測試",short:"把晶粒組成系統",role:"將 GPU、HBM 與 I/O 晶粒高密度整合；測試則篩出失效晶片，確保速度、功耗與可靠度。",products:["2.5D／3D 封裝","CoWoS","Chiplet","探針測試","ATE"],interfaces:["UCIe","Interposer","Micro-bump","ATE Pattern"],communication:"中介層讓 GPU 與 HBM 以短距離寬頻連接，成品再經電性、熱與壓力測試。",companyIds:["tw2330","tw3711","tw6239","usTER","jp6857","usKLAC","tw2449","tw3264","tw3265","tw3374","tw6223","tw6257","tw6510","tw6515","tw6640","usAEHR","usFORM"]},
    {id:"board",number:"06",icon:"╫",color:"#258b62",title:"載板、PCB 與高速線材",short:"訊號與電力道路",role:"載板承接晶粒，PCB 連接整台伺服器，高速線材與連接器把訊號延伸到交換器與其他節點。",products:["ABF 載板","伺服器 PCB","CCL","AEC／DAC","高速連接器"],interfaces:["PCIe","SerDes","I²C","Power Bus"],communication:"差動高速訊號沿低損耗材料傳輸；電源層與控制匯流排同步供電、監控各模組。",companyIds:["tw3037","tw8046","tw3189","tw2383","tw6274","tw2368","tw4958","tw3665","jp4062","jp5706","tw3023","tw3044","tw3533","tw4915","tw4966"]},
    {id:"network",number:"07",icon:"⇄",color:"#0e9ab1",title:"光通訊與網路",short:"讓 GPU 組成叢集",role:"交換器、NIC、DPU、光模組與光纖把數千顆 GPU 連成低延遲、高頻寬的訓練叢集。",products:["400G／800G 光模組","交換器","NIC／DPU","SerDes／DSP","CPO"],interfaces:["Ethernet","InfiniBand","RoCE","800G／1.6T"],communication:"GPU 資料先經 NIC／DPU，再由交換器路由；跨機櫃以光模組把電訊號轉成光訊號。",companyIds:["usNVDA","usAVGO","usMRVL","usANET","usCRDO","usCOHR","usLITE","usCIEN","usGLW","tw2345","tw3081","tw3363","tw6442","tw2379","tw3491","tw4966","tw5269","tw6285","usALAB","usRMBS","usSITM","usSMTC"]},
    {id:"power",number:"08",icon:"ϟ",color:"#e29b26",title:"電源、BBU 與電力管理",short:"穩定供應高功率",role:"將機房高壓電轉成伺服器需要的低壓直流電；BBU 在斷電或尖峰時維持運作。",products:["PSU","Power Shelf","VRM","BBU","UPS"],interfaces:["48V DC","PMBus","12V Busbar","Telemetry"],communication:"電源架依 PMBus 回報狀態，VRM 在晶片附近快速調壓，BBU 接手瞬間電力缺口。",companyIds:["tw2308","tw2301","tw3211","jp6723","tw6415","usBE","usADI"]},
    {id:"thermal",number:"09",icon:"❄",color:"#2b83c5",title:"散熱與液冷",short:"把熱搬出機房",role:"冷板、均熱片、風扇與 CDU 將高功率 GPU 的熱量帶離晶片，避免降頻或故障。",products:["冷板","CDU","熱交換器","均熱片","高壓風扇"],interfaces:["Coolant Loop","Quick Disconnect","BMC Sensor","PWM"],communication:"感測器將溫度傳給 BMC，系統動態調整泵浦、風扇與功率；熱液經 CDU 交換到設施水路。",companyIds:["tw3017","tw3653","tw8996","tw6831","tw2308"]},
    {id:"mechanical",number:"10",icon:"▥",color:"#68798b",title:"機殼、機櫃與滑軌",short:"承載與維護",role:"機構件固定高價零件、建立風道、承受整機重量，並讓維修人員能安全抽換設備。",products:["伺服器機殼","整機櫃","滑軌","盲插接頭","Busbar"],interfaces:["OCP Rack","EIA-310","Blind-mate","Rack PDU"],communication:"機櫃定義電力、網路與冷卻入口；滑軌與盲插介面讓節點在不中斷其他設備下維護。",companyIds:["tw8210","tw2059","tw6669","tw2382","tw2317","tw2356","tw2357","tw3005","tw3376","tw3706","tw5536","tw6139"]},
    {id:"passives",number:"11",icon:"≋",color:"#9b6b3f",title:"被動元件與連接器",short:"穩壓、濾波、保護",role:"電容、電阻、電感與連接器遍布主板、加速卡與電源，抑制雜訊並保持訊號和電壓穩定。",products:["MLCC","鋁質電容","電阻","電感","高速連接器"],interfaces:["Power Integrity","Signal Integrity","Board-to-board","High-current"],communication:"被動元件不處理資料，但直接影響電源完整性、訊號品質與整機可靠度。",companyIds:["tw2327","tw2492","tw2472","tw3026","jp6976","jp6981","ks009150","tw3665","tw3023","tw3533"]},
    {id:"system",number:"12",icon:"▧",color:"#5467b6",title:"伺服器 ODM／OEM",short:"把零件變成系統",role:"依雲端業者需求整合主板、GPU、網路、電源、散熱與韌體，完成驗證、量產與全球交付。",products:["GPU Server","Compute Tray","NVL Rack","Storage Server","Rack Integration"],interfaces:["BMC／Redfish","OCP","NVLink Fabric","Rack Management"],communication:"BMC 監控硬體，管理軟體協調運算、網路與能源；整櫃驗證確保節點能共同工作。",companyIds:["tw6669","tw2382","tw3231","tw2317","tw2376","usDELL","tw2356","tw2357","tw2377","tw2395","tw3005","tw3706","tw5274"]},
    {id:"cloud",number:"13",icon:"☁",color:"#6c63dc",title:"雲端與資料中心",short:"把算力變成服務",role:"雲端服務商規劃叢集、機房與軟體平台，將底層硬體包裝成模型訓練、推論與 API 服務。",products:["GPU Cloud","AI Platform","自研加速器","模型服務","資料中心"],interfaces:["Kubernetes","CUDA／ROCm","API","Scheduler"],communication:"排程器分配 GPU，分散式軟體同步模型參數，雲端 API 再把運算能力提供給企業與開發者。",companyIds:["usMSFT","usAMZN","usGOOGL","usNVDA","usDELL"]},
    {id:"security",number:"14",icon:"◇",color:"#7b61d1",title:"資安、身分與營運韌性",short:"守住 AI 攻擊面",role:"保護模型、資料、API、端點、雲端工作負載與人機身分，並在攻擊發生時偵測、回應與復原。",products:["Zero Trust／SASE","XDR／SIEM／SOAR","CNAPP","IAM／PAM","資料備份與復原"],interfaces:["Telemetry／Logs","Identity／OAuth","Policy API","EDR Agent","SOC／MDR"],communication:"身分與政策先決定誰能存取；端點、網路與雲端持續回傳遙測，SOC 關聯告警並自動隔離，資料平台負責事件後復原。",companyIds:["usCRWD","usPANW","usFTNT","usZS","usNET","usOKTA","usRBRK","jp4704","tw6690"]},
    {id:"software",number:"15",icon:"✦",color:"#d04f91",title:"AI 軟體、平台與應用",short:"把模型變成收入",role:"將模型能力嵌入裝置、消費平台、企業資料與工作流程，透過訂閱、廣告、雲端用量或硬體生態完成 AI 商業化。",products:["AI Agent","企業工作流","資料與模型平台","裝置端 AI","創意與開發工具"],interfaces:["Model API","Agent Protocol","Data Connector","App Intent","Telemetry"],communication:"資料平台提供治理後的企業資料，模型與 Agent 透過 API 呼叫工具，應用層把結果送進既有工作流程、終端裝置與使用者介面。",companyIds:["usPLTR","usAAPL","usMETA","usMSFT","usGOOGL","usAMZN","usNOW","usCRM","usSNOW","usDDOG","usADBE","usORCL"]}
  ];
  const stageById = new Map(stages.map(stage => [stage.id, stage]));
  const securityCompanyIds = ["usCRWD","usPANW","usFTNT","usZS","usNET","usOKTA","usRBRK","jp4704","tw6690"];
  const softwareCompanyIds = ["usPLTR","usAAPL","usMETA","usMSFT","usGOOGL","usAMZN","usNOW","usCRM","usSNOW","usDDOG","usADBE","usORCL"];
  const securityLayers = [
    ["01 / IDENTITY","身分與特權","驗證人、機器與 AI Agent；以最小權限、持續驗證與特權控管降低帳號被接管的風險。"],
    ["02 / ENDPOINT & SOC","端點與安全營運","從伺服器與員工裝置蒐集行為遙測，透過 XDR、SIEM、SOAR 與 MDR 偵測並回應攻擊。"],
    ["03 / NETWORK & SASE","網路與 Zero Trust","在使用者、分支、API 與私有應用之間執行政策，阻止橫向移動並縮小可見攻擊面。"],
    ["04 / CLOUD & AI","雲端工作負載與 AI","從程式碼、容器、模型到執行期持續檢查弱點、權限、資料流與異常活動。"],
    ["05 / DATA RESILIENCE","資料安全與營運韌性","辨識敏感資料、阻止外洩，並用不可變備份與演練過的復原流程降低勒索軟體衝擊。"]
  ];
  const softwareLayers = [
    ["01 / DEVICE & OS","裝置、作業系統與個人 AI","把推論放到手機與電腦端，結合個人情境、隱私運算與系統級入口。"],
    ["02 / CONSUMER PLATFORM","搜尋、社群、廣告與助理","以龐大流量和內容資料訓練推薦與生成模型，再透過廣告、訂閱與互動變現。"],
    ["03 / ENTERPRISE AGENTS","企業 Agent 與工作流","讓模型能讀取企業權限內資料、呼叫工具並執行銷售、客服、IT 與營運流程。"],
    ["04 / DATA & MODEL CLOUD","資料、模型與治理平台","整理企業資料、提供模型服務與治理，決定 AI 能否安全地進入正式生產環境。"],
    ["05 / BUILD & OBSERVE","開發、創意與可觀測性","協助開發 AI 應用、生成內容並監控模型品質、延遲、成本與錯誤。"]
  ];

  const serverParts = {
    mainboard:{icon:"╫",title:"高速主機板",stage:"board",summary:"承載 CPU、加速卡、記憶體與控制晶片，並把電力與高速訊號分配到各模組。",data:"PCIe／CXL",power:"多相 VRM"},
    cpu:{icon:"▣",title:"CPU／Host Processor",stage:"compute",summary:"負責作業系統、資料前處理、排程與控制，並把大量平行工作交給 GPU。",data:"PCIe 6.0／CXL",power:"350–500W 級"},
    gpu:{icon:"▦",title:"GPU 加速器＋HBM",stage:"compute",summary:"Tensor Core 類運算單元執行模型矩陣計算；周圍 HBM 以超寬頻寬持續供應模型參數。",data:"NVLink／HBM",power:"700W+ 級"},
    network:{icon:"⇄",title:"NIC／DPU 網路卡",stage:"network",summary:"把訓練資料送往其他 GPU 節點，並卸載封包處理、儲存與資安工作。",data:"Ethernet／InfiniBand",power:"PCIe／12V"},
    security:{icon:"◇",title:"BMC／Root of Trust",stage:"security",summary:"驗證韌體與開機鏈、隔離管理平面並記錄硬體遙測，避免攻擊者從伺服器底層取得持久權限。",data:"Redfish／SPDM／Telemetry",power:"待機電源／TPM"},
    optical:{icon:"◈",title:"800G 光收發模組",stage:"network",summary:"把交換器或 NIC 的高速電訊號轉成光訊號，用光纖跨機櫃傳輸。",data:"800G／1.6T",power:"低壓直流"},
    storage:{icon:"▰",title:"NVMe SSD",stage:"memory",summary:"保存資料集、模型權重與訓練檢查點，並以 PCIe 高速送入系統。",data:"PCIe／NVMe",power:"12V／3.3V"},
    power:{icon:"ϟ",title:"高效率 PSU",stage:"power",summary:"將機櫃電力轉換為伺服器穩定直流電，並透過遙測回報負載、溫度與故障。",data:"PMBus",power:"3–5.5kW 級"},
    bbu:{icon:"▥",title:"BBU 備援電池",stage:"power",summary:"在電網短暫中斷或負載突升時接手供電，避免訓練工作立即停止。",data:"BMS／PMBus",power:"48V DC"},
    cooling:{icon:"≋",title:"液冷歧管與冷板",stage:"thermal",summary:"冷卻液直接帶走 GPU 與 CPU 熱量，再由 CDU 將熱交換至機房水路。",data:"溫度／流量感測",power:"泵浦控制"},
    fans:{icon:"❄",title:"高壓風扇牆",stage:"thermal",summary:"建立前後風道，冷卻仍採氣冷的記憶體、電源、SSD 與板上元件。",data:"PWM／Tach",power:"12V／48V"},
    rail:{icon:"═",title:"伺服器滑軌",stage:"mechanical",summary:"承受重型 GPU 伺服器重量，讓機器能抽出維護並精準推回機櫃。",data:"機械介面",power:"不適用"}
  };

  const relationNodes = [
    {id:"usASML",x:80,y:95},{id:"usAMAT",x:80,y:205},{id:"jp8035",x:80,y:315},
    {id:"tw2330",x:255,y:95},{id:"usINTC",x:255,y:205},{id:"usGFS",x:255,y:315},
    {id:"ks000660",x:255,y:440},{id:"usMU",x:410,y:440},{id:"ks005930",x:565,y:440},
    {id:"usNVDA",x:445,y:80},{id:"usAMD",x:445,y:190},{id:"usAVGO",x:445,y:300},
    {id:"tw3711",x:625,y:85},{id:"tw3037",x:625,y:195},{id:"tw2308",x:625,y:305},
    {id:"tw2382",x:805,y:70},{id:"tw6669",x:805,y:180},{id:"usDELL",x:805,y:290},{id:"usANET",x:805,y:400},
    {id:"usMSFT",x:980,y:110},{id:"usAMZN",x:980,y:240},{id:"usGOOGL",x:980,y:370},
    {id:"usPANW",x:120,y:620},{id:"usCRWD",x:285,y:620},{id:"usFTNT",x:450,y:620},
    {id:"usZS",x:615,y:620},{id:"usNET",x:780,y:620},{id:"usRBRK",x:945,y:620},
    {id:"usAAPL",x:120,y:790},{id:"usMETA",x:285,y:790},{id:"usPLTR",x:450,y:790},
    {id:"usNOW",x:615,y:790},{id:"usSNOW",x:780,y:790},{id:"usCRM",x:945,y:790}
  ];
  const relations = [
    {from:"usASML",to:"tw2330",type:"supply",label:"EUV 曝光設備"},{from:"usAMAT",to:"tw2330",type:"supply",label:"製程／封裝設備"},{from:"jp8035",to:"tw2330",type:"supply",label:"晶圓製程設備"},
    {from:"tw2330",to:"usNVDA",type:"cooperate",label:"先進製程與封裝生態"},{from:"tw2330",to:"usAMD",type:"cooperate",label:"高效能晶片製造"},{from:"tw2330",to:"usAVGO",type:"cooperate",label:"ASIC 製造生態"},
    {from:"tw2330",to:"usINTC",type:"compete",label:"先進製程／代工"},{from:"tw2330",to:"usGFS",type:"compete",label:"晶圓代工"},{from:"usINTC",to:"usGFS",type:"compete",label:"晶圓代工"},
    {from:"ks000660",to:"usNVDA",type:"supply",label:"HBM 記憶體"},{from:"usMU",to:"usNVDA",type:"supply",label:"HBM／DRAM"},{from:"ks000660",to:"usMU",type:"compete",label:"HBM／DRAM"},{from:"usMU",to:"ks005930",type:"compete",label:"記憶體"},{from:"ks000660",to:"ks005930",type:"compete",label:"HBM／DRAM"},
    {from:"usNVDA",to:"usAMD",type:"compete",label:"AI 加速器平台"},{from:"usNVDA",to:"usAVGO",type:"compete",label:"GPU 與客製 ASIC 路線"},
    {from:"tw2330",to:"tw3711",type:"cooperate",label:"封裝測試生態"},{from:"tw3711",to:"tw3037",type:"cooperate",label:"封裝與載板整合"},
    {from:"usNVDA",to:"tw2382",type:"cooperate",label:"GPU 伺服器平台"},{from:"usNVDA",to:"tw6669",type:"cooperate",label:"雲端伺服器平台"},{from:"tw3037",to:"tw2382",type:"supply",label:"載板／PCB 環節"},{from:"tw2308",to:"tw2382",type:"supply",label:"電源與散熱環節"},{from:"tw2308",to:"tw6669",type:"supply",label:"資料中心電力環節"},
    {from:"tw2382",to:"tw6669",type:"compete",label:"雲端伺服器 ODM"},{from:"tw6669",to:"usDELL",type:"compete",label:"AI 系統與整機"},{from:"tw2382",to:"usDELL",type:"compete",label:"伺服器方案"},
    {from:"tw2382",to:"usMSFT",type:"supply",label:"雲端硬體生態"},{from:"tw6669",to:"usAMZN",type:"supply",label:"雲端硬體生態"},{from:"usDELL",to:"usMSFT",type:"cooperate",label:"企業 AI 基礎設施"},
    {from:"usAVGO",to:"usANET",type:"supply",label:"交換器晶片"},{from:"usANET",to:"usMSFT",type:"supply",label:"資料中心網路"},{from:"usANET",to:"usGOOGL",type:"supply",label:"AI 網路生態"},
    {from:"usMSFT",to:"usAMZN",type:"compete",label:"雲端 AI"},{from:"usAMZN",to:"usGOOGL",type:"compete",label:"雲端 AI"},{from:"usMSFT",to:"usGOOGL",type:"compete",label:"雲端 AI"},
    {from:"usPANW",to:"usCRWD",type:"compete",label:"XDR、雲端安全與 SecOps"},{from:"usPANW",to:"usFTNT",type:"compete",label:"網路安全與 SASE"},
    {from:"usFTNT",to:"usZS",type:"compete",label:"SASE／Zero Trust"},{from:"usZS",to:"usNET",type:"compete",label:"SSE、Zero Trust 與應用安全"},
    {from:"usPANW",to:"usRBRK",type:"compete",label:"雲端資料安全與營運韌性"},{from:"usCRWD",to:"usRBRK",type:"compete",label:"資料保護與事件復原"},
    {from:"usAAPL",to:"usMETA",type:"compete",label:"個人 AI 助理與裝置入口"},{from:"usMETA",to:"usGOOGL",type:"compete",label:"模型、搜尋、推薦與廣告"},
    {from:"usPLTR",to:"usNOW",type:"compete",label:"企業 AI Agent 與工作流"},{from:"usNOW",to:"usCRM",type:"compete",label:"企業 Agent 與流程自動化"},
    {from:"usSNOW",to:"usMSFT",type:"compete",label:"企業資料與 AI 平台"},{from:"usPLTR",to:"usSNOW",type:"cooperate",label:"資料平台與企業 AI 應用生態"}
  ];

  let selectedStage = "compute";
  let chartRange = "6m";
  let companyLimit = 18;
  const quoteCache = new Map();

  function stockUrl(company) {
    const params = new URLSearchParams({view:"kline",market:company.market,symbol:company.symbol,name:company.name});
    return `tracker.html?${params.toString()}`;
  }

  function renderFlow() {
    const groups = [
      ["A / DESIGN","晶片設計與 IP"],["B / MAKE","晶圓製造與設備"],["C / INTEGRATE","封裝、載板與測試"],["D / BUILD","零組件與伺服器"],["E / SCALE","網路、機櫃與雲端"],["F / PROTECT","身分、資安與韌性"],["G / MONETIZE","軟體、平台與應用"]
    ];
    $("chainFlow").innerHTML = groups.map(([small,strong]) => `<div class="flow-step"><small>${small}</small><strong>${strong}</strong></div>`).join("");
  }

  function showStageCompanies(stageId, companyId="") {
    const company = companyId ? companyById.get(companyId) : null;
    $("marketFilter").value = "all";
    $("stageFilter").value = stageId;
    $("companySearch").value = company?.name || "";
    companyLimit = 18;
    renderCompanies();
    $("companyAtlas").scrollIntoView({behavior:"smooth",block:"start"});
  }

  function showSecurityCompanies(companyId="") { showStageCompanies("security", companyId); }
  function showSoftwareCompanies(companyId="") { showStageCompanies("software", companyId); }

  function renderSecuritySpotlight() {
    $("securityStack").innerHTML = securityLayers.map(([index,title,copy]) => `<div class="cyber-layer"><div class="cyber-layer-title"><span>${esc(index)}</span><strong>${esc(title)}</strong></div><p>${esc(copy)}</p></div>`).join("");
    $("securityCompanies").innerHTML = securityCompanyIds.map(id => companyById.get(id)).filter(Boolean).map(company => `<button type="button" class="cyber-company${company.id === "usCRWD" ? " featured" : ""}" data-security-company="${company.id}">${logoMarkup(company)}<span><strong>${esc(company.name)}${company.id === "usCRWD" ? " · XDR 核心" : ""}</strong><small>${marketMeta[company.market].flag} ${esc(company.exchange)} · ${esc(company.tags[0])}</small></span><span>${esc(company.symbol)} ↗</span></button>`).join("");
    $("securityCompanies").querySelectorAll(".company-logo img").forEach(image => image.addEventListener("error", event => event.currentTarget.parentElement.classList.add("fallback"), {once:true}));
    $("securityCompanies").querySelectorAll("[data-security-company]").forEach(button => button.addEventListener("click", () => showSecurityCompanies(button.dataset.securityCompany)));
    $("openSecurityStage").addEventListener("click", () => {
      selectStage("security");
      showSecurityCompanies();
    });
  }

  function renderSoftwareSpotlight() {
    $("softwareStack").innerHTML = softwareLayers.map(([index,title,copy]) => `<div class="cyber-layer"><div class="cyber-layer-title"><span>${esc(index)}</span><strong>${esc(title)}</strong></div><p>${esc(copy)}</p></div>`).join("");
    $("softwareCompanies").innerHTML = softwareCompanyIds.map(id => companyById.get(id)).filter(Boolean).map(company => `<button type="button" class="cyber-company" data-software-company="${company.id}">${logoMarkup(company)}<span><strong>${esc(company.name)}</strong><small>${marketMeta[company.market].flag} ${esc(company.exchange)} · ${esc(company.tags[0])}</small></span><span>${esc(company.symbol)} ↗</span></button>`).join("");
    $("softwareCompanies").querySelectorAll(".company-logo img").forEach(image => image.addEventListener("error", event => event.currentTarget.parentElement.classList.add("fallback"), {once:true}));
    $("softwareCompanies").querySelectorAll("[data-software-company]").forEach(button => button.addEventListener("click", () => showSoftwareCompanies(button.dataset.softwareCompany)));
    $("openSoftwareStage").addEventListener("click", () => {
      selectStage("software");
      showSoftwareCompanies();
    });
  }

  function renderStages() {
    $("stageGrid").innerHTML = stages.map(stage => `<button type="button" class="stage-card${stage.id === selectedStage ? " active" : ""}" data-stage="${stage.id}" style="--stage-color:${stage.color}">
      <span class="stage-icon">${stage.icon}</span><small>${stage.number}</small><h3>${stage.title}</h3><p>${stage.role.slice(0,54)}…</p><span class="stage-products">${stage.products.slice(0,3).map(item => `<span>${item}</span>`).join("")}</span>
    </button>`).join("");
    $("stageGrid").querySelectorAll("[data-stage]").forEach(button => button.addEventListener("click", () => selectStage(button.dataset.stage)));
  }

  function renderStageDetail() {
    const stage = stageById.get(selectedStage);
    const names = stage.companyIds.map(id => companyById.get(id)).filter(Boolean);
    $("stageDetail").innerHTML = `<span class="detail-number">${stage.number}</span><h3>${stage.title}</h3><p>${stage.role}</p>
      <div class="detail-block"><span>PRODUCTS / 主要產品</span><strong>${stage.products.join("、")}</strong></div>
      <div class="detail-block"><span>HOW IT TALKS / 如何溝通</span><p>${stage.communication}</p><div class="interface-list">${stage.interfaces.map(item => `<b>${item}</b>`).join("")}</div></div>
      <div class="detail-block"><span>REPRESENTATIVE COMPANIES / 代表公司</span><div class="detail-companies">${names.slice(0,12).map(company => `<button type="button" data-company="${company.id}">${marketMeta[company.market].flag} ${esc(company.name)}</button>`).join("")}</div></div>`;
    $("stageDetail").querySelectorAll("[data-company]").forEach(button => button.addEventListener("click", () => {
      const company = companyById.get(button.dataset.company);
      $("companySearch").value = company.name;
      $("marketFilter").value = "all";
      $("stageFilter").value = "all";
      renderCompanies();
      $("companyAtlas").scrollIntoView({behavior:"smooth",block:"start"});
    }));
  }

  function selectStage(id) {
    if (!stageById.has(id)) return;
    selectedStage = id;
    renderStages();
    renderStageDetail();
  }

  function logoMarkup(company) {
    if (logoFallback.has(company.id)) return `<span class="company-logo fallback" role="img" aria-label="${esc(company.name)} logo"><span>${esc(company.name.slice(0,2))}</span></span>`;
    const url = `https://www.google.com/s2/favicons?domain_url=${encodeURIComponent(`https://${company.domain}`)}&sz=128`;
    return `<span class="company-logo"><img src="${url}" alt="${esc(company.name)} logo" loading="lazy"><span>${esc(company.name.slice(0,2))}</span></span>`;
  }

  function priceFormat(value, market) {
    if (!Number.isFinite(Number(value))) return "—";
    const digits = market === "US" ? 2 : Number(value) < 100 ? 2 : 0;
    return Number(value).toLocaleString("zh-TW", {minimumFractionDigits:digits,maximumFractionDigits:digits});
  }

  function companyStages(companyId) {
    return stages.filter(stage => stage.companyIds.includes(companyId));
  }

  function filteredCompanies() {
    const term = $("companySearch").value.trim().toLowerCase();
    const market = $("marketFilter").value;
    const stage = $("stageFilter").value;
    return companies.filter(company => {
      if (market !== "all" && company.market !== market) return false;
      if (stage !== "all" && !stageById.get(stage)?.companyIds.includes(company.id)) return false;
      const haystack = `${company.name} ${company.symbol} ${company.tags.join(" ")} ${company.role}`.toLowerCase();
      return !term || haystack.includes(term);
    });
  }

  function companyCard(company) {
    const meta = marketMeta[company.market];
    const stageNames = companyStages(company.id).map(stage => stage.short).slice(0,2);
    return `<article class="company-card" data-company-card="${company.id}">
      <div class="company-head">${logoMarkup(company)}<div class="company-name"><strong>${esc(company.name)}</strong><small>${esc(company.exchange)} · ${esc(meta.currency)}</small></div><span class="market-badge">${meta.flag} ${meta.label}</span></div>
      <div class="quote-row"><div class="quote-price"><span>最近收盤</span><strong class="quote-last"><span class="loading-line" style="width:92px"></span></strong></div><div class="quote-change flat"><span class="loading-line" style="width:70px"></span></div></div>
      <div class="sparkline"><span class="loading-line" style="display:block;height:62px"></span></div>
      <div class="company-tags">${[...stageNames,...company.tags].slice(0,4).map(tag => `<span>${esc(tag)}</span>`).join("")}</div>
      <div class="company-foot"><small class="quote-date">載入行情中</small><div><button type="button" data-company-research="${company.id}">研究</button><a href="${stockUrl(company)}" target="_blank" rel="noopener">${esc(company.symbol)} 個股資訊 ↗</a></div></div>
    </article>`;
  }

  async function loadQuote(company) {
    const key = `${company.market}/${company.symbol}`;
    if (quoteCache.has(key)) return quoteCache.get(key);
    const promise = fetch(`price-history/${encodeURIComponent(company.market)}/${encodeURIComponent(company.symbol)}.json`, {cache:"default"})
      .then(response => response.ok ? response.json() : Promise.reject(new Error("no quote")))
      .then(payload => ({rows:Array.isArray(payload.rows) ? payload.rows.filter(row => Number.isFinite(Number(row.close))) : [],currency:payload.currency || marketMeta[company.market].currency}))
      .catch(() => ({rows:[],currency:marketMeta[company.market].currency}));
    quoteCache.set(key, promise);
    return promise;
  }

  function sparklineSvg(rows, tone) {
    if (rows.length < 2) return '<div class="sparkline-empty">暫無足夠線圖資料</div>';
    const width = 320, height = 68, pad = 4;
    const closes = rows.map(row => Number(row.close));
    const min = Math.min(...closes), max = Math.max(...closes), span = max - min || 1;
    const points = closes.map((value,index) => `${pad + index / Math.max(1,closes.length - 1) * (width - pad * 2)},${pad + (max - value) / span * (height - pad * 2)}`);
    const line = tone === "down" ? "#168b59" : tone === "up" ? "#d94b4b" : "#778391";
    const fill = tone === "down" ? "#168b59" : tone === "up" ? "#d94b4b" : "#778391";
    const area = `${pad},${height-pad} ${points.join(" ")} ${width-pad},${height-pad}`;
    return `<svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="${chartRange === "6m" ? "六個月" : "一年"}收盤價趨勢"><defs><linearGradient id="g-${Math.random().toString(36).slice(2)}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${fill}" stop-opacity=".18"/><stop offset="1" stop-color="${fill}" stop-opacity="0"/></linearGradient></defs><polygon points="${area}" fill="${fill}" opacity=".08"/><polyline points="${points.join(" ")}" fill="none" stroke="${line}" stroke-width="2" vector-effect="non-scaling-stroke"/><circle cx="${points[points.length-1].split(",")[0]}" cy="${points[points.length-1].split(",")[1]}" r="2.5" fill="${line}"/></svg>`;
  }

  async function hydrateCompanyCard(company) {
    const card = document.querySelector(`[data-company-card="${CSS.escape(company.id)}"]`);
    if (!card) return;
    const quote = await loadQuote(company);
    if (!card.isConnected) return;
    const rows = quote.rows;
    if (!rows.length) {
      card.querySelector(".quote-last").textContent = "—";
      card.querySelector(".quote-change").textContent = "行情暫缺";
      card.querySelector(".sparkline").innerHTML = '<div class="sparkline-empty">尚無本地行情資料</div>';
      card.querySelector(".quote-date").textContent = "可進個股頁查看";
      return;
    }
    const latest = rows[rows.length - 1], previous = rows[rows.length - 2] || latest;
    const change = Number(latest.close) - Number(previous.close);
    const pct = Number(previous.close) ? change / Number(previous.close) * 100 : 0;
    const tone = change > 0 ? "up" : change < 0 ? "down" : "flat";
    const startDate = new Date(`${latest.date}T00:00:00`);
    startDate.setDate(startDate.getDate() - (chartRange === "6m" ? 183 : 365));
    const visible = rows.filter(row => new Date(`${row.date}T00:00:00`) >= startDate);
    card.querySelector(".quote-last").textContent = priceFormat(latest.close, company.market);
    const changeBox = card.querySelector(".quote-change");
    changeBox.className = `quote-change ${tone}`;
    changeBox.innerHTML = `<div>${change > 0 ? "+" : ""}${priceFormat(change, company.market)}</div><div>${pct > 0 ? "+" : ""}${pct.toFixed(2)}%</div>`;
    card.querySelector(".sparkline").innerHTML = sparklineSvg(visible, tone);
    card.querySelector(".quote-date").textContent = `${latest.date} · ${quote.currency}`;
  }

  function renderCompanies() {
    const filtered = filteredCompanies();
    const rows = filtered.slice(0, companyLimit);
    $("companyCount").textContent = `顯示 ${rows.length} / ${filtered.length} 家（資料庫 ${companies.length} 家）`;
    $("companyGrid").innerHTML = rows.length ? rows.map(companyCard).join("") : '<div class="sparkline-empty" style="grid-column:1/-1;padding:45px">找不到符合條件的公司。</div>';
    $("companyMore").hidden = rows.length >= filtered.length;
    $("companyMore").textContent = `再顯示 ${Math.min(18, filtered.length - rows.length)} 家`;
    $("companyGrid").querySelectorAll(".company-logo img").forEach(image => image.addEventListener("error", () => image.parentElement.classList.add("fallback"), {once:true}));
    rows.forEach(hydrateCompanyCard);
  }

  function setupCompanyFilters() {
    $("stageFilter").insertAdjacentHTML("beforeend", stages.map(stage => `<option value="${stage.id}">${stage.number} ${stage.title}</option>`).join(""));
    const resetAndRender = () => { companyLimit = 18; renderCompanies(); };
    $("companySearch").addEventListener("input", resetAndRender);
    $("marketFilter").addEventListener("change", resetAndRender);
    $("stageFilter").addEventListener("change", resetAndRender);
    $("companyMore").addEventListener("click", () => { companyLimit += 18; renderCompanies(); });
    document.querySelectorAll("[data-range]").forEach(button => button.addEventListener("click", () => {
      chartRange = button.dataset.range;
      document.querySelectorAll("[data-range]").forEach(item => item.classList.toggle("active", item === button));
      renderCompanies();
    }));
  }

  function renderPartInspector(key) {
    const part = serverParts[key] || serverParts.gpu;
    const stage = stageById.get(part.stage);
    $("partInspector").innerHTML = `<div class="part-visual">${part.icon}</div><div><span class="eyebrow">SERVER COMPONENT</span><h3>${part.title}</h3><p>${part.summary}</p><div class="part-metrics"><div><span>資料／控制介面</span><strong>${part.data}</strong></div><div><span>電力／機械介面</span><strong>${part.power}</strong></div></div><a href="#supplyChain" data-part-stage="${part.stage}"><span>查看「${stage.title}」供應鏈</span><span>→</span></a></div>`;
    $("partInspector").querySelector("[data-part-stage]").addEventListener("click", () => selectStage(part.stage));
  }

  function setupServer() {
    const scene = $("serverScene"), model = $("serverModel");
    let rotationX = 58, rotationY = -28, scale = .86, drag = null;
    const apply = () => { model.style.setProperty("--rx", `${rotationX}deg`); model.style.setProperty("--ry", `${rotationY}deg`); model.style.setProperty("--scale", scale.toFixed(2)); };
    scene.addEventListener("pointerdown", event => { if (event.target.closest(".server-part")) return; drag = {x:event.clientX,y:event.clientY,rx:rotationX,ry:rotationY}; scene.setPointerCapture(event.pointerId); });
    scene.addEventListener("pointermove", event => { if (!drag) return; rotationY = drag.ry + (event.clientX - drag.x) * .28; rotationX = Math.max(15,Math.min(78,drag.rx - (event.clientY - drag.y) * .22)); apply(); });
    scene.addEventListener("pointerup", () => { drag = null; });
    scene.addEventListener("pointercancel", () => { drag = null; });
    scene.addEventListener("wheel", event => { event.preventDefault(); scale = Math.max(.55,Math.min(1.25,scale - event.deltaY * .0008)); apply(); }, {passive:false});
    document.querySelectorAll("[data-view]").forEach(button => button.addEventListener("click", () => {
      const view = button.dataset.view;
      ({front:[72,0,.9],top:[15,0,.82],side:[60,-84,.82]})[view].forEach((value,index) => { if (index===0) rotationX=value; else if (index===1) rotationY=value; else scale=value; });
      apply();
    }));
    $("explodeToggle").addEventListener("click", event => { const active = !model.classList.contains("exploded"); model.classList.toggle("exploded",active); event.currentTarget.setAttribute("aria-pressed",String(active)); });
    $("serverReset").addEventListener("click", () => { rotationX=58;rotationY=-28;scale=.86;model.classList.remove("exploded");$("explodeToggle").setAttribute("aria-pressed","false");apply(); });
    model.querySelectorAll("[data-part]").forEach(button => button.addEventListener("click", event => {
      event.stopPropagation();
      model.querySelectorAll("[data-part]").forEach(item => item.classList.toggle("active",item.dataset.part === button.dataset.part));
      scale = Math.max(scale,1.02); apply(); renderPartInspector(button.dataset.part);
    }));
    renderPartInspector("gpu");
  }

  function curve(a,b) {
    const bend = Math.max(25,Math.abs(b.x-a.x)*.32);
    return `M ${a.x} ${a.y} C ${a.x+bend} ${a.y}, ${b.x-bend} ${b.y}, ${b.x} ${b.y}`;
  }

  function renderRelationGraph(filter="all", activeId="") {
    const nodeMap = new Map(relationNodes.map(node => [node.id,node]));
    const visibleEdges = relations.filter(edge => filter === "all" || edge.type === filter);
    const neighborIds = new Set([activeId]);
    visibleEdges.forEach(edge => { if (edge.from === activeId) neighborIds.add(edge.to); if (edge.to === activeId) neighborIds.add(edge.from); });
    const svg = `<svg viewBox="0 0 1060 880" role="img" aria-label="AI 供應鏈公司競合關係圖">
      <defs><marker id="arrow-supply" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#67c8d1"/></marker><marker id="arrow-cooperate" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto"><path d="M0,0 L7,3.5 L0,7 Z" fill="#927be3"/></marker></defs>
      <text class="relation-label" x="45" y="28">設備</text><text class="relation-label" x="220" y="28">製造／記憶體</text><text class="relation-label" x="410" y="28">晶片平台</text><text class="relation-label" x="590" y="28">封裝／零組件</text><text class="relation-label" x="770" y="28">系統／網路</text><text class="relation-label" x="945" y="28">雲端</text><text class="relation-label" x="45" y="550">資安平台競爭帶</text><text class="relation-label" x="45" y="720">AI 軟體與應用競合帶</text>
      ${visibleEdges.map(edge => { const a=nodeMap.get(edge.from),b=nodeMap.get(edge.to); if(!a||!b)return""; const dim=activeId&&!neighborIds.has(edge.from)&&!neighborIds.has(edge.to); return `<path class="relation-edge ${edge.type}${dim?" dim":""}" d="${curve(a,b)}" ${edge.type!=="compete"?`marker-end="url(#arrow-${edge.type})"`:""}><title>${esc(edge.label)}</title></path>`; }).join("")}
      ${relationNodes.map(node => { const company=companyById.get(node.id); if(!company)return""; const dim=activeId&&!neighborIds.has(node.id); return `<g class="relation-node${node.id===activeId?" active":""}${dim?" dim":""}" data-relation-node="${node.id}" tabindex="0" role="button" aria-label="${esc(company.name)}"><circle cx="${node.x}" cy="${node.y}" r="34"></circle><text x="${node.x}" y="${node.y-2}">${esc(company.name.length>9?company.name.slice(0,9):company.name)}</text><text x="${node.x}" y="${node.y+13}" fill="#7895a3">${esc(company.symbol)}</text></g>`; }).join("")}
    </svg>`;
    $("relationCanvas").innerHTML = svg;
    $("relationCanvas").querySelectorAll("[data-relation-node]").forEach(node => {
      const activate = () => renderRelationGraph(filter,node.dataset.relationNode);
      node.addEventListener("click",activate); node.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();activate();}});
    });
    renderRelationDetail(activeId || "usNVDA",filter);
  }

  function relationTypeLabel(type) { return ({supply:"供應",cooperate:"合作",compete:"競爭"})[type] || type; }
  function renderRelationDetail(id,filter) {
    const company = companyById.get(id) || companyById.get("usNVDA");
    const connected = relations.filter(edge => (edge.from===company.id||edge.to===company.id)&&(filter==="all"||edge.type===filter));
    $("relationDetail").innerHTML = `${logoMarkup(company)}<h3>${esc(company.name)}</h3><p>${esc(company.role)}</p><div class="relation-list">${connected.length?connected.slice(0,7).map(edge=>{const other=companyById.get(edge.from===company.id?edge.to:edge.from);return `<div class="relation-item"><span>${relationTypeLabel(edge.type)}</span><strong>${esc(other?.name||"")} · ${esc(edge.label)}</strong></div>`;}).join(""):'<div class="relation-item"><strong>此篩選下暫無其他關係。</strong></div>'}</div><a href="${stockUrl(company)}" target="_blank" rel="noopener"><span>${esc(company.symbol)} 個股資訊</span><span>↗</span></a>`;
    $("relationDetail").querySelector(".company-logo img")?.addEventListener("error", event => event.currentTarget.parentElement.classList.add("fallback"), {once:true});
  }

  function setupRelations() {
    let filter="all";
    document.querySelectorAll("[data-relation]").forEach(button => button.addEventListener("click", () => {
      filter=button.dataset.relation;
      document.querySelectorAll("[data-relation]").forEach(item=>item.classList.toggle("active",item===button));
      renderRelationGraph(filter);
    }));
    renderRelationGraph(filter,"usNVDA");
  }

  function init() {
    $("heroCompanyCount").textContent = companies.length;
    renderFlow(); renderStages(); renderStageDetail();
    setupCompanyFilters(); renderCompanies(); renderSecuritySpotlight(); renderSoftwareSpotlight();
    setupServer(); setupRelations();
  }

  window.AIIndustry = {
    companies, companyById, stages, stageById, marketMeta, serverParts, relations,
    loadQuote, stockUrl, logoMarkup, priceFormat, companyStages, selectStage, esc
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
