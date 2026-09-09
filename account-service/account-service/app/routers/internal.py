from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth import verify_internal_api_key
from app.database import get_db
from app.models import User, Transaction
from app.schemas import CheckBalanceOut, DebitRequest, DebitResponse

router = APIRouter(
    prefix="/internal/accounts",
    tags=["internal"],
    dependencies=[Depends(verify_internal_api_key)],
)

MAX_RETRIES = 5


def _get_user_or_404(db: Session, user_id: str) -> User:
    user = db.query(User).filter(User.user_id == user_id).first()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Không tìm thấy user")
    return user


@router.get("/{user_id}/check-balance", response_model=CheckBalanceOut)
def check_balance(user_id: str, amount: float, db: Session = Depends(get_db)):
    user = _get_user_or_404(db, user_id)
    return CheckBalanceOut(
        user_id=user.user_id,
        balance=user.balance,
        sufficient=user.balance >= amount,
    )


@router.post("/{user_id}/debit", response_model=DebitResponse)
def debit_account(user_id: str, payload: DebitRequest, db: Session = Depends(get_db)):
    # 1) Idempotency: nếu payment_ref_id đã xử lý trước đó thì trả lại kết quả cũ,
    #    không trừ tiền thêm lần nữa (tránh trừ trùng khi Payment Service retry).
    existing = (
        db.query(Transaction)
        .filter(Transaction.payment_ref_id == payload.payment_ref_id)
        .first()
    )
    if existing is not None:
        return DebitResponse(
            transaction_id=existing.transaction_id,
            user_id=existing.user_id,
            payment_ref_id=existing.payment_ref_id,
            amount=existing.amount,
            balance_after=existing.amount_after,
            status=existing.status,
            idempotent_replay=True,
        )

    # 2) Optimistic locking: thử UPDATE có điều kiện version, retry nếu bị đụng độ
    #    bởi giao dịch khác đang chạy song song trên cùng tài khoản.
    for attempt in range(MAX_RETRIES):
        user = _get_user_or_404(db, user_id)

        if user.balance < payload.amount:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Số dư khả dụng không đủ để thực hiện giao dịch",
            )

        balance_before = user.balance
        balance_after = user.balance - payload.amount

        rows_updated = (
            db.query(User)
            .filter(User.user_id == user_id, User.version == user.version)
            .update(
                {
                    User.balance: balance_after,
                    User.version: User.version + 1,
                    User.updated_at: datetime.utcnow(),
                }
            )
        )

        if rows_updated == 1:
            break  # cập nhật thành công, không ai tranh chấp version này

        db.rollback()  # version đã bị đổi bởi giao dịch khác -> đọc lại và thử lại
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Giao dịch đang bị xử lý đồng thời, vui lòng thử lại",
        )

    # 3) Ghi lịch sử giao dịch. Bắt IntegrityError phòng trường hợp 2 request
    #    trùng payment_ref_id lọt qua bước kiểm tra idempotency ở bước 1 cùng lúc.
    transaction = Transaction(
        user_id=user_id,
        payment_ref_id=payload.payment_ref_id,
        mssv=payload.mssv,
        student_name=payload.student_name,
        amount_before=balance_before,
        amount=payload.amount,
        amount_after=balance_after,
        type="PAYMENT",
        status="SUCCESS",
        description=payload.description,
    )
    db.add(transaction)

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(Transaction)
            .filter(Transaction.payment_ref_id == payload.payment_ref_id)
            .first()
        )
        return DebitResponse(
            transaction_id=existing.transaction_id,
            user_id=existing.user_id,
            payment_ref_id=existing.payment_ref_id,
            amount=existing.amount,
            balance_after=existing.amount_after,
            status=existing.status,
            idempotent_replay=True,
        )

    db.refresh(transaction)

    return DebitResponse(
        transaction_id=transaction.transaction_id,
        user_id=transaction.user_id,
        payment_ref_id=transaction.payment_ref_id,
        amount=transaction.amount,
        balance_after=transaction.amount_after,
        status=transaction.status,
        idempotent_replay=False,
    )
