import hashlib, hmac, logging, os, secrets
from pathlib import Path

import httpx
import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

engine = create_engine(os.environ["PAYMENT_DATABASE_URL"],
                       connect_args={"connect_timeout": 5})
JWT_SECRET = os.environ["JWT_SECRET"]
ACCOUNT_URL = os.environ["ACCOUNT_URL"]
TUITION_URL = os.environ["TUITION_URL"]
NOTIFY_URL = os.environ["NOTIFY_URL"]
HDR = {"X-Internal-Key": os.environ["INTERNAL_API_KEY"]}

app = FastAPI(title="Payment Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


def user_id_from(authorization: str | None) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Thiếu token")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn")
    return int(payload["sub"])


def finish(conn, tx_id, status, reason, http_code):
    conn.execute(text(
        "UPDATE transactions SET status=:s, fail_reason=:r, updated_at=now() WHERE id=:id"),
        {"s": status, "r": reason, "id": tx_id})
    return JSONResponse(status_code=http_code, content={"detail": reason})


def notify(to: str, subject: str, body: str) -> bool:
    try:
        r = httpx.post(f"{NOTIFY_URL}/internal/notify/email",
                       json={"to": to, "subject": subject, "body": body},
                       headers=HDR, timeout=15)
        return r.status_code == 200
    except httpx.HTTPError:
        return False


class CreatePaymentReq(BaseModel):
    mssv: str


class OtpReq(BaseModel):
    otp: str


@app.post("/payments", status_code=201)
def create_payment(body: CreatePaymentReq, authorization: str | None = Header(None)):
    uid = user_id_from(authorization)
    try:
        ru = httpx.get(f"{ACCOUNT_URL}/users/me",
                       headers={"Authorization": authorization}, timeout=10)
        rt = httpx.get(f"{TUITION_URL}/api/tuition/{body.mssv}", timeout=10)
    except httpx.HTTPError:
        raise HTTPException(502, "Không gọi được service khác")
    if ru.status_code != 200:
        raise HTTPException(401, "Không xác thực được người dùng")
    if rt.status_code == 404:
        raise HTTPException(404, "Không tìm thấy sinh viên")
    user, fee = ru.json(), rt.json()

    if fee["tuition_id"] is None:
        raise HTTPException(404, "Sinh viên chưa có khoản học phí")
    if fee["status"] != "PENDING":
        raise HTTPException(409, "Học phí đã được thanh toán")
    if user["balance"] < fee["amount"]:
        raise HTTPException(402, "Số dư không đủ")

    for _ in range(3):   # thử lại nếu trúng unique index uq_otp_active_code
        otp = f"{secrets.randbelow(10**6):06d}"
        code_hash = hashlib.sha256(otp.encode()).hexdigest()
        try:
            with engine.begin() as conn:
                tx_id = conn.execute(text(
                    "INSERT INTO transactions (user_id, mssv, tuition_id, tuition_version, amount) "
                    "VALUES (:u, :m, :t, :v, :a) RETURNING id"),
                    {"u": uid, "m": fee["mssv"], "t": fee["tuition_id"],
                     "v": fee["version"], "a": fee["amount"]}).scalar_one()
                conn.execute(text(
                    "INSERT INTO otp_codes (transaction_id, code_hash, expires_at) "
                    "VALUES (:t, :h, now() + interval '5 minutes')"),
                    {"t": tx_id, "h": code_hash})
            break
        except IntegrityError:
            continue
    else:
        raise HTTPException(500, "Không tạo được OTP")

    if not notify(user["email"], "Mã OTP thanh toán học phí",
                  f"Mã OTP của bạn là {otp}. Có hiệu lực 5 phút, chỉ dùng được một lần."):
        with engine.begin() as conn:
            conn.execute(text(
                "UPDATE transactions SET status='FAILED', fail_reason='Không gửi được OTP', "
                "updated_at=now() WHERE id=:id"), {"id": tx_id})
        raise HTTPException(502, "Không gửi được email OTP")

    resp = {"transaction_id": tx_id, "expires_in_seconds": 300}
    if os.getenv("DEBUG_RETURN_OTP") == "1":
        resp["debug_otp"] = otp
    return resp


@app.post("/payments/{tx_id}/verify-otp")
def verify_otp(tx_id: int, body: OtpReq, authorization: str | None = Header(None)):
    uid = user_id_from(authorization)
    with engine.begin() as conn:
        tx = conn.execute(text(
            "SELECT * FROM transactions WHERE id=:id AND user_id=:u FOR UPDATE"),
            {"id": tx_id, "u": uid}).mappings().first()
        if not tx:
            return JSONResponse(status_code=404, content={"detail": "Không tìm thấy giao dịch"})
        if tx["status"] != "PENDING_OTP":
            return JSONResponse(status_code=409, content={"detail": "Giao dịch đã được xử lý"})

        otp = conn.execute(text(
            "SELECT id, code_hash, used, (expires_at > CURRENT_TIMESTAMP) AS valid "
            "FROM otp_codes WHERE transaction_id=:id ORDER BY id DESC LIMIT 1"),
            {"id": tx_id}).mappings().first()
        if not otp or otp["used"]:
            return JSONResponse(status_code=400, content={"detail": "OTP không hợp lệ"})
        if not otp["valid"]:
            return finish(conn, tx_id, "EXPIRED", "OTP đã hết hạn", 410)
        digest = hashlib.sha256(body.otp.encode()).hexdigest()
        if not hmac.compare_digest(digest, otp["code_hash"]):
            return JSONResponse(status_code=400, content={"detail": "OTP sai"})

        conn.execute(text("UPDATE otp_codes SET used = TRUE WHERE id=:id"), {"id": otp["id"]})

        # Bước A: trừ tiền
        try:
            r = httpx.post(f"{ACCOUNT_URL}/internal/accounts/{uid}/debit",
                           json={"amount": tx["amount"]}, headers=HDR, timeout=10)
        except httpx.HTTPError:
            return finish(conn, tx_id, "FAILED", "Không gọi được Account Service", 502)
        if r.status_code == 402:
            return finish(conn, tx_id, "FAILED", "Số dư không đủ", 402)
        if r.status_code != 200:
            return finish(conn, tx_id, "FAILED", "Trừ tiền thất bại", 502)

        # Bước B: chốt học phí
        ok = False
        try:
            r2 = httpx.post(f"{TUITION_URL}/internal/tuition/{tx['tuition_id']}/pay",
                            json={"version": tx["tuition_version"]}, headers=HDR, timeout=10)
            ok = r2.status_code == 200
        except httpx.HTTPError:
            pass
        if not ok:
            # Bù trừ: hoàn tiền
            try:
                httpx.post(f"{ACCOUNT_URL}/internal/accounts/{uid}/credit",
                           json={"amount": tx["amount"]}, headers=HDR, timeout=10)
                reason = "Học phí đã được thanh toán bởi giao dịch khác, đã hoàn tiền"
            except httpx.HTTPError:
                reason = "REFUND_PENDING: cần hoàn tiền thủ công"
            return finish(conn, tx_id, "FAILED", reason, 409)

        conn.execute(text(
            "UPDATE transactions SET status='SUCCESS', updated_at=now() WHERE id=:id"),
            {"id": tx_id})

    # Ra khỏi khối with: giao dịch đã commit, nhờ notification-service gửi email xác nhận.
    # Lỗi gửi mail không được làm hỏng giao dịch đã thành công, chỉ ghi log.
    try:
        me = httpx.get(f"{ACCOUNT_URL}/users/me",
                       headers={"Authorization": authorization}, timeout=10).json()

        # Lấy tên sinh viên nhận học phí; lỗi thì bỏ qua, email vẫn được gửi
        student_name = ""
        try:
            rs = httpx.get(f"{TUITION_URL}/api/tuition/{tx['mssv']}", timeout=10)
            if rs.status_code == 200:
                student_name = rs.json().get("full_name") or ""
        except httpx.HTTPError:
            pass

        r = httpx.post(f"{NOTIFY_URL}/internal/notify/payment-success",
                       json={"to": me["email"], "payer_name": me["full_name"],
                             "student_name": student_name,
                             "mssv": tx["mssv"], "amount": tx["amount"],
                             "transaction_id": tx_id},
                       headers=HDR, timeout=15)
        if r.status_code != 200:
            logging.getLogger("payment-service").warning(
                "Gửi email xác nhận giao dịch %s lỗi: HTTP %s", tx_id, r.status_code)
    except Exception:
        logging.getLogger("payment-service").exception(
            "Gửi email xác nhận giao dịch %s lỗi", tx_id)
    return {"status": "SUCCESS", "transaction_id": tx_id}

@app.post("/payments/{tx_id}/resend-otp")
def resend_otp(tx_id: int, authorization: str | None = Header(None)):
    uid = user_id_from(authorization)
    try:
        me = httpx.get(f"{ACCOUNT_URL}/users/me",
                       headers={"Authorization": authorization}, timeout=10).json()
    except httpx.HTTPError:
        raise HTTPException(502, "Không gọi được Account Service")

    for _ in range(3):
        otp = f"{secrets.randbelow(10**6):06d}"
        code_hash = hashlib.sha256(otp.encode()).hexdigest()
        try:
            with engine.begin() as conn:
                tx = conn.execute(text(
                    "SELECT status FROM transactions WHERE id=:id AND user_id=:u FOR UPDATE"),
                    {"id": tx_id, "u": uid}).mappings().first()
                if not tx:
                    raise HTTPException(404, "Không tìm thấy giao dịch")
                if tx["status"] != "PENDING_OTP":
                    raise HTTPException(409, "Giao dịch không còn chờ OTP")
                conn.execute(text(
                    "UPDATE otp_codes SET used = TRUE WHERE transaction_id=:id AND used = FALSE"),
                    {"id": tx_id})
                conn.execute(text(
                    "INSERT INTO otp_codes (transaction_id, code_hash, expires_at) "
                    "VALUES (:t, :h, now() + interval '5 minutes')"),
                    {"t": tx_id, "h": code_hash})
            break
        except IntegrityError:
            continue
    else:
        raise HTTPException(500, "Không tạo được OTP")

    if not notify(me["email"], "Mã OTP thanh toán học phí",
                  f"Mã OTP mới của bạn là {otp}. Có hiệu lực 5 phút, chỉ dùng được một lần."):
        raise HTTPException(502, "Không gửi được email OTP")
    return {"expires_in_seconds": 300}


@app.get("/users/me/transactions")
def my_transactions(authorization: str | None = Header(None)):
    uid = user_id_from(authorization)
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT id, mssv, amount, status, fail_reason, created_at "
            "FROM transactions WHERE user_id=:u ORDER BY created_at DESC"),
            {"u": uid}).mappings().all()
    return [dict(r) for r in rows]