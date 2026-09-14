"""Send an authenticated investment-strategy PDF through the configured Gmail account."""
from email.message import EmailMessage
from email.utils import formataddr
from http.server import BaseHTTPRequestHandler
import base64
import binascii
import datetime
import html
import json
import os
import re
import smtplib
import ssl
import urllib.error
import urllib.request


SUPABASE_URL = os.getenv("SUPABASE_URL", "https://amoaxayfsmaxqwecceso.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "sb_publishable_3tk0vmHcqmrWAqCvUWCNzw_TfdcS9wb")
MAX_PDF_BYTES = 3_500_000
EMAIL_PATTERN = re.compile(r"^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$", re.I)


class ApiError(Exception):
    def __init__(self, status, detail):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


def json_request(url, *, headers=None, timeout=20):
    request = urllib.request.Request(url, headers={"Accept": "application/json", **(headers or {})})
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
        raise ApiError(error.code, detail) from error


def bearer_token(value):
    match = re.fullmatch(r"Bearer\s+([^\s]+)", value or "", re.I)
    return match.group(1) if match else ""


def clean_label(value, max_length):
    return re.sub(r"[\r\n\t]+", " ", str(value or "")).strip()[:max_length]


def safe_filename_part(value, fallback="未命名"):
    text = clean_label(value, 80)
    text = re.sub(r"[^\w\u3400-\u9fff.\-]+", "-", text, flags=re.UNICODE).strip("-.")
    return text or fallback


def validate_payload(payload):
    if not isinstance(payload, dict):
        raise ValueError("寄送內容格式不正確")
    recipient = clean_label(payload.get("email"), 254)
    if not EMAIL_PATTERN.fullmatch(recipient):
        raise ValueError("請輸入有效的 Email address")
    symbol = clean_label(payload.get("symbol"), 20).upper()
    if not re.fullmatch(r"[0-9A-Z.\-^]{1,20}", symbol):
        raise ValueError("請先填入有效的股票代號")
    asset_name = clean_label(payload.get("assetName"), 60) or symbol
    date = clean_label(payload.get("date"), 10)
    try:
        datetime.date.fromisoformat(date)
    except ValueError as error:
        raise ValueError("分析日期格式不正確") from error
    encoded = str(payload.get("pdfBase64") or "")
    try:
        pdf = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as error:
        raise ValueError("PDF 附件內容無法讀取") from error
    if not pdf.startswith(b"%PDF-") or len(pdf) > MAX_PDF_BYTES:
        raise ValueError("PDF 附件格式不正確或超過 3.5 MB")
    subject = "{}_{}_{}_投資策略建議".format(safe_filename_part(symbol), safe_filename_part(asset_name), date)
    filename = subject + ".pdf"
    return {"email": recipient, "symbol": symbol, "assetName": asset_name, "date": date,
            "subject": subject, "filename": filename, "pdf": pdf}


def verify_member(token):
    return json_request(SUPABASE_URL + "/auth/v1/user", headers={
        "apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + token
    }, timeout=15)


def send_gmail(data):
    gmail_user = os.getenv("GMAIL_USER", "").strip()
    app_password = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    from_name = os.getenv("GMAIL_FROM_NAME", "投資研究工作台").strip() or "投資研究工作台"
    if not gmail_user or not app_password:
        raise RuntimeError("Gmail 寄信服務尚未完成設定")
    text = ("您好，\n\n附件為 {filename}。\n\n"
            "本投資策略建議依公開資料整理，僅供研究與交易規劃參考，不構成投資建議或獲利保證。")\
        .format(filename=data["filename"])
    message = EmailMessage()
    message["Subject"] = data["subject"]
    message["From"] = formataddr((from_name, gmail_user))
    message["To"] = data["email"]
    message.set_content(text)
    message.add_alternative("""<!doctype html><html><body style="font-family:Arial,'Microsoft JhengHei',sans-serif;color:#1c2430;line-height:1.7">
      <div style="max-width:620px;margin:auto;padding:28px;border:1px solid #e3e7ec;border-radius:14px">
        <h2 style="margin:0 0 18px;color:#3b5bdb">AI 投資策略建議</h2>
        <p>您好，</p><p>附件為 <b>{filename}</b>。</p>
        <p style="color:#6b7684">本建議依公開資料整理，僅供研究與交易規劃參考，不構成投資建議或獲利保證。</p>
      </div></body></html>""".format(filename=html.escape(data["filename"])), subtype="html")
    message.add_attachment(data["pdf"], maintype="application", subtype="pdf", filename=data["filename"])
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=25) as smtp:
        smtp.login(gmail_user, app_password)
        smtp.send_message(message)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        token = bearer_token(self.headers.get("Authorization"))
        if not token:
            return self.send_json({"ok": False, "error": "請先登入會員"}, 401)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0 or length > 4_800_000:
                raise ValueError("寄送內容過大")
            verify_member(token)
            data = validate_payload(json.loads(self.rfile.read(length).decode("utf-8")))
            send_gmail(data)
            self.send_json({"ok": True, "subject": data["subject"]})
        except (ValueError, json.JSONDecodeError) as error:
            self.send_json({"ok": False, "error": str(error)}, 400)
        except ApiError as error:
            status = 401 if error.status in (401, 403) else 502
            message = "登入狀態已失效，請重新登入" if status == 401 else "Email 暫時無法寄出，請稍後再試"
            self.send_json({"ok": False, "error": message}, status)
        except RuntimeError as error:
            self.send_json({"ok": False, "error": str(error)}, 503)
        except Exception:
            self.send_json({"ok": False, "error": "Email 暫時無法寄出，請稍後再試"}, 500)

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
