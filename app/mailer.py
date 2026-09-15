import os
from fastapi_mail import FastMail, MessageSchema, ConnectionConfig, MessageType

conf = ConnectionConfig(
    MAIL_USERNAME=os.getenv("MAIL_USERNAME", ""),
    MAIL_PASSWORD=os.getenv("MAIL_PASSWORD", ""),
    MAIL_FROM=os.getenv("MAIL_FROM", "no-reply@ibanking-demo.com"),
    MAIL_PORT=int(os.getenv("MAIL_PORT", "587")),
    MAIL_SERVER=os.getenv("MAIL_SERVER", "smtp.gmail.com"),
    MAIL_STARTTLS=True,
    MAIL_SSL_TLS=False,
    USE_CREDENTIALS=True,
)

fm = FastMail(conf)


async def send_otp_email(to_email: str, otp_code: str, amount: float, mssv: str):
    message = MessageSchema(
        subject="[iBanking Demo] Mã xác thực thanh toán học phí",
        recipients=[to_email],
        body=(
            f"Mã OTP của bạn là: {otp_code}\n"
            f"Dùng để xác nhận thanh toán học phí {amount} cho MSSV {mssv}.\n"
            f"Mã có hiệu lực trong 5 phút, chỉ dùng được 1 lần."
        ),
        subtype=MessageType.plain,
    )
    await fm.send_message(message)