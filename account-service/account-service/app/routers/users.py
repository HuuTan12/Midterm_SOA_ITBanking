from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import User, Transaction
from app.schemas import UserOut, BalanceOut, TransactionOut

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
def get_my_profile(current_user: User = Depends(get_current_user)):
    return current_user


@router.get("/me/balance", response_model=BalanceOut)
def get_my_balance(current_user: User = Depends(get_current_user)):
    return BalanceOut(balance=current_user.balance)


@router.get("/me/transactions", response_model=List[TransactionOut])
def get_my_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.user_id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
