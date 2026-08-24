"""Authenticated AI technical-chart analysis for entitled Supabase members."""
from http.server import BaseHTTPRequestHandler
import base64
import binascii
import json
import os
import re
import urllib.error
import urllib.request


OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses"
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5.4")
SUPABASE_URL = os.getenv("SUPABASE_URL", "https://amoaxayfsmaxqwecceso.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "sb_publishable_3tk0vmHcqmrWAqCvUWCNzw_TfdcS9wb")
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 3_500_000
VALID_MODES = {"general", "fast", "overnight", "low-entry"}


SYSTEM_PROMPT = """你是台股與 ETF 短線技術線圖分析師。你只根據使用者上傳截圖中可見的證據分析，不主動查網路，也不補造即時行情、價格、指標、成交量、支撐或壓力。

重要規則：
1. 預設採台灣顯示慣例：紅 K／紅量為上漲，綠 K／綠量為下跌。MACD 不可只靠顏色判斷，必須讀 DIF、Signal 與柱狀體關係。
2. 看不清楚的數字必須說「約」、給區間或明確說無法辨識；不得假裝精準。
3. 區分反彈與反轉、測試支撐與確認落底、超賣與買進訊號。不得保證上漲或宣稱絕對底部。
4. 若截圖顯示剛開盤，提醒成交量尚未完整且波動雜訊較大；接近收盤才提高量價與收盤位置權重。
5. 先讀最近 3–5 根 K 棒，再將狀態歸類為：強勢多頭、多頭拉回、高檔震盪、區間整理、弱勢反彈、空頭反彈、弱勢下跌、加速下殺、資訊不足。
6. K 棒需判讀長紅／長綠、十字、上下影線、吞噬、跳空、連續 K、突破前高、跌破前低、假突破與停損 K；單一長下影線不等於落底。
7. 可見時判讀 MA5、MA10、MA20、MA60。MA5 是極短節奏，MA10 是短趨勢，MA20 是波段重要邊界，MA60 是中期趨勢。站回 MA5 但仍低於 MA10／20，可能只是假性弱反彈。
8. 量價關係：突破帶量、拉回量縮較健康；爆量破支撐、爆量綠 K、無量反彈偏弱。若放量跌穿預定低接價，必須說明這是支撐失守，不是便宜價。
9. KD/KDJ 必須讀數值與方向。K<20 是超賣、K>80 是過熱，不是自動買賣訊號；低檔 K 上彎、黃金交叉且價格守住支撐才較有意義。
10. MACD：動能改善包括綠柱縮短、DIF 上升、DIF 上穿 Signal；動能惡化包括綠柱擴大、DIF 下跌、DIF 低於 Signal。反彈而 MACD 惡化仍屬逆勢反彈。
11. 布林中軌通常等同 MA20；下軌不是自動買點，上軌不是自動賣點。沿下軌走且中軌下彎仍是弱勢。
12. 支撐與壓力用合理區間，不做假精準。來源優先是近期高低、爆量區、MA5/10/20、布林帶、整數與缺口。
13. 快閃交易偏好靠近清楚支撐、失效距離小且到第一壓力仍有空間；逆勢交易只能小量試單、不追價。
14. 隔日沖必須提供掛買、成交後防守、隔日第一賣點、強勢第二賣點與放棄條件，不可把失敗短單默默轉長抱。
15. 回覆是技術決策輔助，不是獲利保證。資訊不足時降低評分並直接說缺少什麼。

請以繁體中文輸出，內容直接、專業、好讀。所有價位都必須能在截圖中找到依據。"""


RESULT_SCHEMA = {
    "type": "object",
    "properties": {
        "readable": {"type": "boolean"},
        "imageQualityNote": {"type": "string"},
        "conclusion": {"type": "string"},
        "marketState": {"type": "string", "enum": [
            "強勢多頭", "多頭拉回", "高檔震盪", "區間整理", "弱勢反彈",
            "空頭反彈", "弱勢下跌", "加速下殺", "資訊不足"
        ]},
        "thesis": {"type": "string"},
        "technicalPoints": {
            "type": "array", "minItems": 1, "maxItems": 9,
            "items": {
                "type": "object",
                "properties": {
                    "label": {"type": "string"},
                    "analysis": {"type": "string"},
                    "tone": {"type": "string", "enum": ["bullish", "bearish", "neutral", "warning"]}
                },
                "required": ["label", "analysis", "tone"],
                "additionalProperties": False
            }
        },
        "supportZones": {"type": "array", "maxItems": 4, "items": {"type": "string"}},
        "resistanceZones": {"type": "array", "maxItems": 4, "items": {"type": "string"}},
        "tradePlan": {
            "type": "object",
            "properties": {
                "entry": {"type": "string"},
                "defense": {"type": "string"},
                "firstTarget": {"type": "string"},
                "secondTarget": {"type": "string"},
                "strongResistance": {"type": "string"},
                "positionSizing": {"type": "string"}
            },
            "required": ["entry", "defense", "firstTarget", "secondTarget", "strongResistance", "positionSizing"],
            "additionalProperties": False
        },
        "rating": {"type": "string", "enum": ["⭐⭐⭐⭐⭐", "⭐⭐⭐⭐☆", "⭐⭐⭐☆☆", "⭐⭐☆☆☆", "⭐☆☆☆☆"]},
        "invalidation": {"type": "string"},
        "riskNotes": {"type": "array", "minItems": 1, "maxItems": 5, "items": {"type": "string"}}
    },
    "required": [
        "readable", "imageQualityNote", "conclusion", "marketState", "thesis", "technicalPoints",
        "supportZones", "resistanceZones", "tradePlan", "rating", "invalidation", "riskNotes"
    ],
    "additionalProperties": False
}


def json_request(url, method="GET", headers=None, payload=None, timeout=30):
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8") if payload is not None else None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if body is not None:
        request_headers["Content-Type"] = "application/json"
    request = urllib.request.Request(url, data=body, headers=request_headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            detail = json.loads(raw)
        except ValueError:
            detail = {"message": raw or "HTTP {}".format(error.code)}
        raise ApiError(error.code, detail)


class ApiError(Exception):
    def __init__(self, status, detail):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


def bearer_token(value):
    match = re.fullmatch(r"Bearer\s+([^\s]+)", value or "", re.I)
    return match.group(1) if match else ""


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("請提供有效的分析內容")
    mode = str(payload.get("mode") or "general")
    if mode not in VALID_MODES:
        raise ValueError("分析模式不正確")
    image_data = str(payload.get("imageData") or "")
    match = re.fullmatch(r"data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=_-]+)", image_data)
    if not match or match.group(1) not in ALLOWED_IMAGE_TYPES:
        raise ValueError("只接受 JPG、PNG 或 WebP 線圖")
    try:
        decoded = base64.b64decode(match.group(2), altchars=b"-_", validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("圖片內容無法讀取")
    if not decoded or len(decoded) > MAX_IMAGE_BYTES:
        raise ValueError("處理後圖片需小於 3.5 MB")
    symbol = str(payload.get("symbol") or "").strip().upper()[:20]
    timing = str(payload.get("screenshotTiming") or "").strip()[:40]
    proposed = payload.get("proposedPrice")
    if proposed in (None, ""):
        proposed = None
    else:
        try:
            proposed = float(proposed)
        except (TypeError, ValueError):
            raise ValueError("預計買進價格式不正確")
        if proposed <= 0 or proposed > 10000000:
            raise ValueError("預計買進價超出合理範圍")
    return {"mode": mode, "imageData": image_data, "symbol": symbol,
            "screenshotTiming": timing, "proposedPrice": proposed, "imageBytes": len(decoded)}


def build_user_prompt(data):
    mode_labels = {
        "general": "一般技術分析",
        "fast": "快閃／搶反彈",
        "overnight": "隔日沖",
        "low-entry": "低接掛價"
    }
    lines = ["請分析這張技術線圖。", "分析模式：{}。".format(mode_labels[data["mode"]])]
    if data["symbol"]:
        lines.append("使用者填寫的標的：{}（只作標示，不可用它補造即時行情）。".format(data["symbol"]))
    if data["screenshotTiming"]:
        lines.append("截圖時間情境：{}。".format(data["screenshotTiming"]))
    if data["proposedPrice"] is not None:
        lines.append("使用者預計買進價：{}，請判斷它是合理低接、過近、難成交，或已落在失守支撐下方。".format(data["proposedPrice"]))
    lines.append("只分析截圖中看得到的項目；看不清楚就明說，不可猜數字。")
    return "\n".join(lines)


def supabase_headers(token):
    return {"apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer {}".format(token)}


def verify_user(token):
    return json_request(SUPABASE_URL + "/auth/v1/user", headers=supabase_headers(token), timeout=15)


def call_rpc(name, token, payload):
    return json_request(SUPABASE_URL + "/rest/v1/rpc/" + name, method="POST",
                        headers=supabase_headers(token), payload=payload, timeout=20)


def extract_output_text(response):
    for item in response.get("output") or []:
        if item.get("type") != "message":
            continue
        for content in item.get("content") or []:
            if content.get("type") == "output_text" and content.get("text"):
                return content["text"]
            if content.get("type") == "refusal":
                raise ValueError(content.get("refusal") or "模型無法分析這張圖片")
    raise ValueError("模型沒有回傳可讀取的分析結果")


def analyze_chart(data, api_key):
    payload = {
        "model": OPENAI_MODEL,
        "store": False,
        "max_output_tokens": 2600,
        "input": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": [
                {"type": "input_text", "text": build_user_prompt(data)},
                {"type": "input_image", "image_url": data["imageData"], "detail": "original"}
            ]}
        ],
        "text": {"format": {"type": "json_schema", "name": "stock_chart_analysis",
                             "strict": True, "schema": RESULT_SCHEMA}}
    }
    response = json_request(OPENAI_RESPONSES_URL, method="POST",
                            headers={"Authorization": "Bearer {}".format(api_key)},
                            payload=payload, timeout=100)
    result = json.loads(extract_output_text(response))
    return result, response.get("model") or OPENAI_MODEL, response.get("usage") or {}


def public_error(error):
    detail = error.detail if isinstance(error, ApiError) else {}
    message = detail.get("message") if isinstance(detail, dict) else ""
    mappings = {
        "AUTH_REQUIRED": (401, "請先登入會員"),
        "FEATURE_NOT_ENABLED": (403, "此會員尚未開通 AI 線圖分析"),
        "FEATURE_ACCESS_EXPIRED": (403, "AI 線圖分析權限已到期"),
        "DAILY_LIMIT_REACHED": (429, "今日分析額度已用完，請明日再試")
    }
    for code, response in mappings.items():
        if code in message:
            return response
    if isinstance(error, ApiError) and error.status in (401, 403):
        return 401, "登入狀態已失效，請重新登入"
    return 502, "分析服務暫時無法完成，請稍後再試"


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        request_id = None
        token = bearer_token(self.headers.get("Authorization"))
        if not token:
            return self.send_json({"ok": False, "error": "請先登入會員"}, 401)
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return self.send_json({"ok": False, "error": "分析服務尚未完成設定"}, 503)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 5_000_000:
                raise ValueError("上傳內容過大")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            data = validate_payload(payload)
            verify_user(token)
            quota = call_rpc("consume_chart_analysis_quota", token, {
                "p_mode": data["mode"], "p_symbol": data["symbol"] or None,
                "p_screenshot_timing": data["screenshotTiming"] or None,
                "p_proposed_price": data["proposedPrice"]
            })
            request_id = quota["requestId"]
            result, model, usage = analyze_chart(data, api_key)
            call_rpc("finish_chart_analysis_request", token, {
                "p_request_id": request_id, "p_status": "completed", "p_model": model,
                "p_result": result, "p_error_message": None
            })
            self.send_json({"ok": True, "analysis": result, "quota": {
                "dailyLimit": quota["dailyLimit"], "used": quota["used"],
                "remaining": quota["remaining"]
            }, "usage": {"inputTokens": usage.get("input_tokens"),
                            "outputTokens": usage.get("output_tokens")}})
        except ValueError as error:
            if request_id:
                self.finish_error(token, request_id, str(error))
            self.send_json({"ok": False, "error": str(error)}, 400)
        except ApiError as error:
            if request_id:
                self.finish_error(token, request_id, "upstream_error")
            status, message = public_error(error)
            self.send_json({"ok": False, "error": message}, status)
        except Exception:
            if request_id:
                self.finish_error(token, request_id, "unexpected_error")
            self.send_json({"ok": False, "error": "分析服務暫時無法完成，請稍後再試"}, 500)

    def finish_error(self, token, request_id, message):
        try:
            call_rpc("finish_chart_analysis_request", token, {
                "p_request_id": request_id, "p_status": "error", "p_model": OPENAI_MODEL,
                "p_result": None, "p_error_message": message
            })
        except Exception:
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "POST, OPTIONS")
        self.end_headers()

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)
