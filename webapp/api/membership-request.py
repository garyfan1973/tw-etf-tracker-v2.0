"""Notify the site owner when a new member asks for manual approval."""
from email.message import EmailMessage
from email.utils import formataddr
from http.server import BaseHTTPRequestHandler
import json
import os
import smtplib
import ssl
import urllib.error
import urllib.request
import re


SUPABASE_URL = os.getenv("SUPABASE_URL", "https://amoaxayfsmaxqwecceso.supabase.co").rstrip("/")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "sb_publishable_3tk0vmHcqmrWAqCvUWCNzw_TfdcS9wb")


class ApiError(Exception):
    def __init__(self, status, detail):
        super().__init__(str(detail))
        self.status = status
        self.detail = detail


def bearer_token(value):
    match = re.fullmatch(r"Bearer\s+([^\s]+)", value or "", re.I)
    return match.group(1) if match else ""


def json_request(url, method="GET", headers=None, payload=None, timeout=15):
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


def auth_headers(token):
    return {"apikey": SUPABASE_ANON_KEY, "Authorization": "Bearer " + token}


def call_rpc(name, token):
    return json_request(SUPABASE_URL + "/rest/v1/rpc/" + name,
                        method="POST", headers=auth_headers(token), payload={})


def send_notification(user):
    recipient = os.getenv("MEMBERSHIP_REVIEW_EMAIL", os.getenv("GMAIL_USER", "")).strip()
    gmail_user = os.getenv("GMAIL_USER", "").strip()
    app_password = os.getenv("GMAIL_APP_PASSWORD", "").replace(" ", "").strip()
    from_name = os.getenv("GMAIL_FROM_NAME", "投資研究工作台").strip() or "投資研究工作台"
    if not recipient or not gmail_user or not app_password:
        raise RuntimeError("會員審核通知服務尚未完成設定")

    email = EmailMessage()
    email["Subject"] = "投資研究工作台：新會員申請審核"
    email["From"] = formataddr((from_name, gmail_user))
    email["To"] = recipient
    email.set_content(
        "有一位新會員完成註冊並等待人工審核。\n\n"
        "Email：{email}\n"
        "User ID：{user_id}\n\n"
        "請在 Supabase SQL Editor 依 README 的會員開通範例設定 access_level：\n"
        "general = 一般功能；full = 全功能（含 AI）。\n"
        "審核完成後，請通知對方重新整理網站或重新登入。"
        .format(email=user.get("email", ""), user_id=user.get("id", ""))
    )
    with smtplib.SMTP_SSL("smtp.gmail.com", 465, context=ssl.create_default_context(), timeout=20) as smtp:
        smtp.login(gmail_user, app_password)
        smtp.send_message(email)


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        token = bearer_token(self.headers.get("Authorization"))
        if not token:
            return self.send_json({"ok": False, "error": "請先登入會員"}, 401)
        try:
            user = json_request(SUPABASE_URL + "/auth/v1/user", headers=auth_headers(token))
            review = call_rpc("request_membership_review", token) or {}
            if review.get("accessLevel") != "pending":
                return self.send_json({"ok": True, "accessLevel": review.get("accessLevel")})
            if not review.get("shouldNotify"):
                return self.send_json({"ok": True, "pending": True, "notified": False})
            send_notification(user or {})
            call_rpc("mark_membership_request_notified", token)
            self.send_json({"ok": True, "pending": True, "notified": True})
        except ApiError as error:
            if error.status in (401, 403):
                return self.send_json({"ok": False, "error": "登入狀態已失效，請重新登入"}, 401)
            self.send_json({"ok": False, "error": "會員審核通知暫時無法送出"}, 502)
        except RuntimeError as error:
            self.send_json({"ok": False, "error": str(error)}, 503)
        except Exception:
            self.send_json({"ok": False, "error": "會員審核通知暫時無法送出"}, 500)

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
