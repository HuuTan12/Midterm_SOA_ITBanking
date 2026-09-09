from datetime import datetime
from decimal import Decimal
from typing import Optional

from pydantic import BaseModel, ConfigDict


# ---------- Auth ----------

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- User-facing ----------

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    user_id: str
    username: str
    full_name: str
    phone: Optional[str]
    email: str
    status: str


class BalanceOut(BaseModel):
    balance: Decimal


class TransactionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    transaction_id: str
    mssv: str
    student_name: str
    amount: Decimal
    status: str
    description: Optional[str]
    created_at: datetime


# ---------- Internal APIs (dùng bởi Payment Service) ----------

class CheckBalanceOut(BaseModel):
    user_id: str
    balance: Decimal
    sufficient: bool


class DebitRequest(BaseModel):
    payment_ref_id: str          # id giao dịch bên Payment Service -> idempotency key
    amount: Decimal
    mssv: str
    student_name: str
    description: Optional[str] = None


class DebitResponse(BaseModel):
    transaction_id: str
    user_id: str
    payment_ref_id: str
    amount: Decimal
    balance_after: Decimal
    status: str
    idempotent_replay: bool      # True nếu đây là lần gọi lại của 1 giao dịch đã xử lý trước đó
