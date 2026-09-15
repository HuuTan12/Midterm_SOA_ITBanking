import random
import bcrypt
from datetime import datetime, timedelta


def generate_otp() -> str:
    """Sinh mã OTP 6 chữ số."""
    return f"{random.randint(0, 999999):06d}"


def hash_otp(otp: str) -> str:
    """Hash OTP trước khi lưu DB — không bao giờ lưu OTP dạng plain text."""
    return bcrypt.hashpw(otp.encode(), bcrypt.gensalt()).decode()


def verify_otp_hash(otp: str, otp_hash: str) -> bool:
    return bcrypt.checkpw(otp.encode(), otp_hash.encode())


def otp_expiry() -> datetime:
    """OTP có hiệu lực tối đa 5 phút theo yêu cầu đề bài."""
    return datetime.utcnow() + timedelta(minutes=5)