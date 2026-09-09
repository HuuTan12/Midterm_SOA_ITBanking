import uuid
from datetime import datetime

from sqlalchemy import Column, String, Numeric, DateTime, Integer, ForeignKey, Text
from sqlalchemy.orm import relationship

from app.database import Base


def gen_uuid() -> str:
    return str(uuid.uuid4())


class User(Base):
    __tablename__ = "users"

    user_id = Column(String, primary_key=True, default=gen_uuid)
    username = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    phone = Column(String, nullable=True)
    email = Column(String, unique=True, nullable=False, index=True)
    balance = Column(Numeric(18, 2), nullable=False, default=0)
    status = Column(String, nullable=False, default="ACTIVE")
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Optimistic locking: tăng mỗi lần balance được cập nhật thành công.
    # Dùng để chống race condition khi nhiều giao dịch cùng trừ tiền 1 tài khoản.
    version = Column(Integer, nullable=False, default=0)

    transactions = relationship("Transaction", back_populates="user")


class Transaction(Base):
    __tablename__ = "transactions"

    transaction_id = Column(String, primary_key=True, default=gen_uuid)
    user_id = Column(String, ForeignKey("users.user_id"), nullable=False, index=True)

    # Mã giao dịch bên Payment Service -> dùng làm idempotency key.
    payment_ref_id = Column(String, unique=True, nullable=False, index=True)

    mssv = Column(String, nullable=False)
    student_name = Column(String, nullable=False)

    amount_before = Column(Numeric(18, 2), nullable=False)
    amount = Column(Numeric(18, 2), nullable=False)
    amount_after = Column(Numeric(18, 2), nullable=False)

    type = Column(String, nullable=False, default="PAYMENT")
    status = Column(String, nullable=False, default="SUCCESS")
    description = Column(Text, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="transactions")
