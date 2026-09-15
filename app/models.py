import uuid
from sqlalchemy import Column, String, DECIMAL, Enum, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import relationship

from .database import Base


class Transaction(Base):
    __tablename__ = "transactions"

    transaction_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    payer_user_id = Column(String(36), nullable=False)
    student_mssv = Column(String(20), nullable=False)
    fee_id = Column(String(36), nullable=False)  # tham chiếu tới TuitionFees.fee_id bên Tuition Service
    amount = Column(DECIMAL(12, 2), nullable=False)
    status = Column(
        Enum("PENDING", "OTP_SENT", "SUCCESS", "FAILED", "EXPIRED", name="tx_status"),
        default="PENDING",
        nullable=False,
    )
    account_debited = Column(Boolean, default=False, nullable=False)
    tuition_updated = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)

    otps = relationship("OtpCode", back_populates="transaction")


class OtpCode(Base):
    __tablename__ = "otp_codes"

    otp_id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    transaction_id = Column(String(36), ForeignKey("transactions.transaction_id"), nullable=False)
    otp_hash = Column(String, nullable=False)
    created_at = Column(DateTime, server_default=func.now())
    expires_at = Column(DateTime, nullable=False)
    is_used = Column(Boolean, default=False, nullable=False)
    used_at = Column(DateTime, nullable=True)

    transaction = relationship("Transaction", back_populates="otps")