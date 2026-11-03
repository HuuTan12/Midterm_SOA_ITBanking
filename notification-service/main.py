import os, smtplib
from email.message import EmailMessage
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

load_dotenv(Path(__file__).resolve().parent.parent / ".env")
app = FastAPI(title="Notification Service")


class EmailReq(BaseModel):
    to: str
    subject: str
    body: str


@app.post("/internal/notify/email")
def send_email(req: EmailReq, x_internal_key: str | None = Header(None)):
    if x_internal_key != os.environ["INTERNAL_API_KEY"]:
        raise HTTPException(403, "Forbidden")

    user, pwd = os.getenv("SMTP_USER"), os.getenv("SMTP_PASS")
    if not user:  # chế độ dev: chưa cấu hình SMTP thì in ra console
        print(f"\n[EMAIL] To: {req.to}\n[EMAIL] {req.subject}\n[EMAIL] {req.body}\n")
        return {"sent": True, "mode": "console"}

    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = user, req.to, req.subject
    msg.set_content(req.body)
    try:
        with smtplib.SMTP(os.getenv("SMTP_HOST", "smtp.gmail.com"),
                          int(os.getenv("SMTP_PORT", "587")), timeout=10) as s:
            s.starttls()
            s.login(user, pwd)
            s.send_message(msg)
    except Exception as e:
        raise HTTPException(502, f"Gửi email thất bại: {e}")
    return {"sent": True, "mode": "smtp"}