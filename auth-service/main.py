import hashlib
import hmac
import logging
import os
import secrets
from datetime import datetime, timedelta, timezone
from pathlib import Path

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

engine = create_engine(os.environ["AUTH_DATABASE_URL"],
                       connect_args={"connect_timeout": 5})
JWT_SECRET = os.environ["JWT_SECRET"]
INTERNAL_KEY = os.environ["INTERNAL_API_KEY"]

NOTIFY_URL = os.getenv("NOTIFY_URL", "http://notification-service:8004")
DEBUG_RETURN_OTP = os.getenv("DEBUG_RETURN_OTP") == "1"

# Token đặt lại mật khẩu ký bằng khóa RIÊNG, nên không thể dùng làm access token
# cho các service khác (payment-service chỉ biết JWT_SECRET).
RESET_SECRET = JWT_SECRET + ":pwd-reset"
OTP_TTL_SECONDS = 300          # OTP có hiệu lực 5 phút
OTP_MAX_ATTEMPTS = 5           # nhập sai tối đa 5 lần
RESEND_COOLDOWN_SECONDS = 60   # tối thiểu 60s giữa 2 lần gửi OTP
RESET_TOKEN_MINUTES = 10       # từ lúc nhập đúng OTP đến lúc đổi mật khẩu

log = logging.getLogger("auth-service")

app = FastAPI(title="Auth Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class LoginReq(BaseModel):
    username: str
    password: str


class Amount(BaseModel):
    amount: int = Field(gt=0)


def user_id_from(authorization: str | None) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Thiếu token")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn")
    return int(payload["sub"])


def require_internal(key: str | None):
    if key != INTERNAL_KEY:
        raise HTTPException(403, "Forbidden")


@app.post("/auth/login")
def login(body: LoginReq):
    # crypt() của pgcrypto kiểm tra bcrypt ngay trong DB, khớp hash trong init.sql
    with engine.connect() as c:
        user = c.execute(text(
            "SELECT id FROM users "
            "WHERE username = :u AND password_hash = crypt(:p, password_hash)"
        ), {"u": body.username, "p": body.password}).mappings().first()
    if not user:
        raise HTTPException(401, "Sai username hoặc password")
    token = jwt.encode(
        {"sub": str(user["id"]),
         "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        JWT_SECRET, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer"}


@app.get("/users/me")
def me(authorization: str | None = Header(None)):
    uid = user_id_from(authorization)
    with engine.connect() as c:
        u = c.execute(text(
            "SELECT id, username, full_name, phone, email, balance "
            "FROM users WHERE id = :id"), {"id": uid}).mappings().first()
    if not u:
        raise HTTPException(401, "User không tồn tại")
    return dict(u)


@app.post("/internal/accounts/{user_id}/debit")
def debit(user_id: int, body: Amount, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    with engine.begin() as c:
        row = c.execute(text(
            "UPDATE users SET balance = balance - :a "
            "WHERE id = :id AND balance >= :a RETURNING balance"),
            {"a": body.amount, "id": user_id}).first()
    if not row:
        raise HTTPException(402, "Số dư không đủ")
    return {"balance": row[0]}


@app.post("/internal/accounts/{user_id}/credit")   # dùng để hoàn tiền
def credit(user_id: int, body: Amount, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    with engine.begin() as c:
        row = c.execute(text(
            "UPDATE users SET balance = balance + :a WHERE id = :id RETURNING balance"),
            {"a": body.amount, "id": user_id}).first()
    if not row:
        raise HTTPException(404, "User không tồn tại")
    return {"balance": row[0]}

# =====================================================
# Quên mật khẩu: gửi OTP qua email -> xác thực OTP -> đặt mật khẩu mới
# =====================================================
class ForgotReq(BaseModel):
    email: str = Field(min_length=3, max_length=100)


class VerifyResetReq(BaseModel):
    email: str = Field(min_length=3, max_length=100)
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class ResetReq(BaseModel):
    reset_token: str
    new_password: str = Field(min_length=6, max_length=72)   # bcrypt chỉ dùng 72 byte đầu


def _otp_hash(user_id: int, otp: str) -> str:
    # HMAC theo user + khóa bí mật: DB bị lộ cũng khó dò ngược 6 chữ số
    return hmac.new(JWT_SECRET.encode(), f"{user_id}:{otp}".encode(),
                    hashlib.sha256).hexdigest()


def _send_email(to: str, subject: str, body: str) -> bool:
    try:
        r = httpx.post(f"{NOTIFY_URL}/internal/notify/email",
                       json={"to": to, "subject": subject, "body": body},
                       headers={"X-Internal-Key": INTERNAL_KEY}, timeout=15)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


@app.post("/auth/forgot-password")
def forgot_password(body: ForgotReq):
    """Luôn trả 200 với cùng một nội dung dù email có tồn tại hay không,
    để không lộ email nào đã đăng ký."""
    email = body.email.strip().lower()
    resp = {"message": "Nếu email tồn tại trong hệ thống, mã OTP đã được gửi.",
            "expires_in_seconds": OTP_TTL_SECONDS}
    otp = None
    with engine.begin() as c:
        user = c.execute(text(
            "SELECT id, email FROM users WHERE lower(email) = :e ORDER BY id LIMIT 1"),
            {"e": email}).mappings().first()
        if not user:
            return resp
        recent = c.execute(text(
            "SELECT 1 FROM password_reset_otps WHERE user_id = :u "
            f"AND created_at > now() - interval '{RESEND_COOLDOWN_SECONDS} seconds'"),
            {"u": user["id"]}).first()
        if recent:           # bấm gửi quá nhanh: bỏ qua, không spam email
            return resp
        otp = f"{secrets.randbelow(10**6):06d}"
        c.execute(text(     # OTP cũ chưa dùng mất hiệu lực
            "UPDATE password_reset_otps SET used = TRUE "
            "WHERE user_id = :u AND used = FALSE"), {"u": user["id"]})
        c.execute(text(
            "INSERT INTO password_reset_otps (user_id, code_hash, expires_at) "
            f"VALUES (:u, :h, now() + interval '{OTP_TTL_SECONDS} seconds')"),
            {"u": user["id"], "h": _otp_hash(user["id"], otp)})
        to = user["email"]

    if not _send_email(to, "Mã OTP đặt lại mật khẩu iBanking",
                       f"Mã OTP đặt lại mật khẩu của bạn là {otp}. "
                       f"Có hiệu lực {OTP_TTL_SECONDS // 60} phút, chỉ dùng được một lần. "
                       "Nếu không phải bạn yêu cầu, hãy bỏ qua email này."):
        log.error("Không gửi được email OTP quên mật khẩu cho user %s", user["id"])
    if DEBUG_RETURN_OTP:
        resp["debug_otp"] = otp
    return resp


@app.post("/auth/verify-reset-otp")
def verify_reset_otp(body: VerifyResetReq):
    email = body.email.strip().lower()
    err = None   # (mã HTTP, thông báo) - raise SAU khi commit để việc đếm lần sai không bị rollback
    token = None
    with engine.begin() as c:
        row = c.execute(text(
            "SELECT o.id, o.user_id, o.code_hash, o.attempts, "
            "       (o.expires_at > now()) AS valid "
            "FROM password_reset_otps o JOIN users u ON u.id = o.user_id "
            "WHERE lower(u.email) = :e AND o.used = FALSE "
            "ORDER BY o.id DESC LIMIT 1 FOR UPDATE OF o"),
            {"e": email}).mappings().first()
        if not row:
            err = (400, "OTP không hợp lệ, vui lòng yêu cầu mã mới")
        elif not row["valid"]:
            c.execute(text("UPDATE password_reset_otps SET used = TRUE WHERE id = :id"),
                      {"id": row["id"]})
            err = (410, "OTP đã hết hạn, vui lòng yêu cầu mã mới")
        elif not hmac.compare_digest(_otp_hash(row["user_id"], body.otp), row["code_hash"]):
            attempts = row["attempts"] + 1
            locked = attempts >= OTP_MAX_ATTEMPTS
            c.execute(text(
                "UPDATE password_reset_otps SET attempts = :a, used = :locked WHERE id = :id"),
                {"a": attempts, "locked": locked, "id": row["id"]})
            err = (429, "Nhập sai quá nhiều lần, vui lòng yêu cầu mã mới") if locked \
                else (400, f"OTP sai, còn {OTP_MAX_ATTEMPTS - attempts} lần thử")
        else:
            c.execute(text(
                "UPDATE password_reset_otps SET used = TRUE, verified_at = now() "
                "WHERE id = :id"), {"id": row["id"]})
            token = jwt.encode(
                {"sub": str(row["user_id"]), "rid": row["id"], "purpose": "pwd_reset",
                 "exp": datetime.now(timezone.utc) + timedelta(minutes=RESET_TOKEN_MINUTES)},
                RESET_SECRET, algorithm="HS256")
    if err:
        raise HTTPException(*err)
    return {"reset_token": token, "expires_in_seconds": RESET_TOKEN_MINUTES * 60}


@app.post("/auth/reset-password")
def reset_password(body: ResetReq):
    bad = HTTPException(400, "Phiên đặt lại mật khẩu không hợp lệ hoặc đã hết hạn")
    try:
        payload = jwt.decode(body.reset_token, RESET_SECRET, algorithms=["HS256"])
        if payload.get("purpose") != "pwd_reset":
            raise bad
        uid, rid = int(payload["sub"]), int(payload["rid"])
    except (jwt.PyJWTError, KeyError, ValueError):
        raise bad

    with engine.begin() as c:
        # khóa dòng: dùng cùng một token hai lần đồng thời chỉ có một lần thành công
        row = c.execute(text(
            "SELECT id FROM password_reset_otps "
            "WHERE id = :rid AND user_id = :u "
            "AND verified_at IS NOT NULL AND consumed_at IS NULL FOR UPDATE"),
            {"rid": rid, "u": uid}).first()
        if not row:
            raise bad
        user = c.execute(text(
            "UPDATE users SET password_hash = crypt(:p, gen_salt('bf', 10)) "
            "WHERE id = :u RETURNING email"),
            {"p": body.new_password, "u": uid}).mappings().first()
        if not user:
            raise bad
        c.execute(text(
            "UPDATE password_reset_otps SET consumed_at = now() WHERE id = :rid"),
            {"rid": rid})
        c.execute(text(     # vô hiệu mọi OTP còn lại của user này
            "UPDATE password_reset_otps SET used = TRUE WHERE user_id = :u AND used = FALSE"),
            {"u": uid})

    _send_email(user["email"], "Mật khẩu iBanking đã được thay đổi",
                "Mật khẩu tài khoản iBanking của bạn vừa được đặt lại. "
                "Nếu không phải bạn thực hiện, hãy liên hệ hỗ trợ ngay.")
    return {"message": "Đặt lại mật khẩu thành công"}