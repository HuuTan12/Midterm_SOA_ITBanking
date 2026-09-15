from decimal import Decimal
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CreateTransactionRequest(BaseModel):
    payer_user_id: str
    student_mssv: str
    # Không nhận amount từ client — số tiền sẽ được lấy từ Tuition Service
    # để tránh người dùng tự sửa số tiền khi gọi API.


class VerifyOtpRequest(BaseModel):
    transaction_id: str
    otp_code: str


class TransactionResponse(BaseModel):
    transaction_id: str
    payer_user_id: str
    student_mssv: str
    fee_id: str
    amount: Decimal
    status: str
    created_at: datetime
    completed_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VerifyOtpResponse(BaseModel):
    status: str
    transaction_id: str