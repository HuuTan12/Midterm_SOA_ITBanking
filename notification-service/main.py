import html
import os
import smtplib
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
app = FastAPI(title="Notification Service")


class EmailReq(BaseModel):
    to: str
    subject: str
    body: str


class PaymentSuccessReq(BaseModel):
    to: str
    payer_name: str
    student_name: str = ""
    mssv: str
    amount: int = Field(gt=0)
    transaction_id: int

def check_key(key: str | None):
    if key != os.environ["INTERNAL_API_KEY"]:
        raise HTTPException(403, "Forbidden")


def deliver(to: str, subject: str, text: str, html_body: str | None = None) -> str:
    """Gửi email qua SMTP; chưa cấu hình SMTP thì in ra console (chế độ dev)."""
    user, pwd = os.getenv("SMTP_USER"), os.getenv("SMTP_PASS")
    if not user:
        print(f"\n[EMAIL] To: {to}\n[EMAIL] {subject}\n[EMAIL] {text}\n", flush=True)
        return "console"

    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = user, to, subject
    msg.set_content(text)
    if html_body:
        msg.add_alternative(html_body, subtype="html")
    try:
        with smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.gmail.com"),
                          int(os.getenv("SMTP_PORT", "587")), timeout=10) as s:
            s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
    except Exception as e:
        raise HTTPException(502, f"Gửi email thất bại: {e}")
    return "smtp"


@app.post("/internal/notify/email")
def send_email(req: EmailReq, x_internal_key: str | None = Header(None)):
    check_key(x_internal_key)
    return {"sent": True, "mode": deliver(req.to, req.subject, req.body)}


@app.post("/internal/notify/payment-success")
def payment_success(req: PaymentSuccessReq, x_internal_key: str | None = Header(None)):
    check_key(x_internal_key)

    amount = f"{req.amount:,}".replace(",", ".") + " VND"
    paid_at = datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).strftime("%H:%M:%S %d/%m/%Y")

    # Danh sách dòng thông tin; chỉ thêm dòng tên sinh viên khi có dữ liệu
    rows = [("Người thanh toán", req.payer_name)]
    if req.student_name:
        rows.append(("Sinh viên nhận học phí", req.student_name))
    rows += [
        ("MSSV", req.mssv),
        ("Số tiền", amount),
        ("Mã giao dịch", f"#{req.transaction_id}"),
        ("Thời gian", paid_at),
    ]

    text = (
        f"Xin chào {req.payer_name},\n\n"
        "Giao dịch thanh toán học phí của bạn đã thành công.\n\n"
        + "\n".join(f"- {k}: {v}" for k, v in rows)
        + "\n\nCảm ơn bạn đã sử dụng iBanking."
    )

    e = html.escape  # chống chèn HTML từ dữ liệu người dùng
    tr = "".join(
        f'<tr><td style="padding:8px 12px;color:#666">{e(k)}</td>'
        f'<td style="padding:8px 12px;font-weight:600">{e(v)}</td></tr>'
        for k, v in rows
    )
    html_body = (
        '<div style="font-family:Arial,sans-serif;max-width:480px">'
        '<h2 style="color:#198754">Thanh toán học phí thành công</h2>'
        f"<p>Xin chào <b>{e(req.payer_name)}</b>, giao dịch của bạn đã được xử lý.</p>"
        f'<table style="border-collapse:collapse;border:1px solid #ddd;width:100%">{tr}</table>'
        '<p style="color:#888;font-size:12px">Cảm ơn bạn đã sử dụng iBanking.</p></div>'
    )

    mode = deliver(req.to, "Thanh toán học phí thành công", text, html_body)
    return {"sent": True, "mode": mode}