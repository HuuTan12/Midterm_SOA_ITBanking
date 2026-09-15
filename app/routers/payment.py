from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..database import get_db
from ..otp_utils import generate_otp, hash_otp, verify_otp_hash, otp_expiry
from ..external_clients import (
    get_fee_by_mssv,
    get_user,
    debit_account,
    refund_account,
    mark_tuition_paid,
)
from ..mailer import send_otp_email

router = APIRouter()


@router.post("/transactions", response_model=schemas.TransactionResponse)
async def create_transaction(req: schemas.CreateTransactionRequest, db: Session = Depends(get_db)):
    # 1. Khoá kiểm tra: không cho 2 giao dịch đang xử lý trên cùng 1 MSSV
    existing = (
        db.query(models.Transaction)
        .filter(
            models.Transaction.student_mssv == req.student_mssv,
            models.Transaction.status.in_(["PENDING", "OTP_SENT"]),
        )
        .with_for_update()
        .first()
    )
    if existing:
        raise HTTPException(400, "Khoản học phí này đang được xử lý bởi giao dịch khác")

    # 2. Lấy thông tin khoản học phí thật từ Tuition Service
    #    (không nhận amount/fee_id từ client để tránh bị sửa số tiền)
    try:
        fee_info = await get_fee_by_mssv(req.student_mssv)
    except Exception:
        raise HTTPException(404, "Không tìm thấy khoản học phí cho MSSV này")

    if fee_info.get("status") == "PAID":
        raise HTTPException(400, "Khoản học phí này đã được thanh toán")

    # 3. Lấy thông tin người nộp tiền (cần email để gửi OTP)
    try:
        payer = await get_user(req.payer_user_id)
    except Exception:
        raise HTTPException(404, "Không tìm thấy người dùng thanh toán")

    # 4. Tạo giao dịch
    tx = models.Transaction(
        payer_user_id=req.payer_user_id,
        student_mssv=req.student_mssv,
        fee_id=fee_info["fee_id"],
        amount=fee_info["amount"],
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)

    # 5. Sinh OTP, lưu hash, gửi email
    otp = generate_otp()
    otp_record = models.OtpCode(
        transaction_id=tx.transaction_id,
        otp_hash=hash_otp(otp),
        expires_at=otp_expiry(),
    )
    db.add(otp_record)
    tx.status = "OTP_SENT"
    db.commit()
    db.refresh(tx)

    await send_otp_email(
        to_email=payer["email"],
        otp_code=otp,
        amount=float(tx.amount),
        mssv=tx.student_mssv,
    )

    return tx


@router.post("/transactions/verify-otp", response_model=schemas.VerifyOtpResponse)
async def verify_otp(req: schemas.VerifyOtpRequest, db: Session = Depends(get_db)):
    tx = (
        db.query(models.Transaction)
        .filter_by(transaction_id=req.transaction_id)
        .with_for_update()
        .first()
    )
    if not tx or tx.status != "OTP_SENT":
        raise HTTPException(400, "Giao dịch không hợp lệ")

    otp_record = (
        db.query(models.OtpCode)
        .filter_by(transaction_id=tx.transaction_id, is_used=False)
        .order_by(models.OtpCode.created_at.desc())
        .first()
    )

    if not otp_record or otp_record.expires_at < datetime.utcnow():
        tx.status = "EXPIRED"
        db.commit()
        raise HTTPException(400, "OTP hết hạn")

    if not verify_otp_hash(req.otp_code, otp_record.otp_hash):
        raise HTTPException(400, "OTP không đúng")

    otp_record.is_used = True
    otp_record.used_at = datetime.utcnow()
    db.commit()

    # Bước 1 của Saga: trừ tiền bên Account Service
    debited = await debit_account(tx.payer_user_id, float(tx.amount), tx.transaction_id)
    if not debited:
        tx.status = "FAILED"
        db.commit()
        raise HTTPException(400, "Số dư không đủ hoặc trừ tiền thất bại")

    tx.account_debited = True
    db.commit()

    # Bước 2 của Saga: cập nhật học phí bên Tuition Service
    updated = await mark_tuition_paid(tx.fee_id, tx.transaction_id)
    if not updated:
        # Compensate: hoàn tiền lại vì bước 2 thất bại
        await refund_account(tx.payer_user_id, float(tx.amount), tx.transaction_id)
        tx.status = "FAILED"
        db.commit()
        raise HTTPException(500, "Cập nhật học phí thất bại, đã hoàn tiền")

    tx.tuition_updated = True
    tx.status = "SUCCESS"
    tx.completed_at = datetime.utcnow()
    db.commit()

    return {"status": "SUCCESS", "transaction_id": tx.transaction_id}