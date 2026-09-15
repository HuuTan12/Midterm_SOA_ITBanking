import os
import httpx

ACCOUNT_SERVICE_URL = os.getenv("ACCOUNT_SERVICE_URL", "http://localhost:8001")
TUITION_SERVICE_URL = os.getenv("TUITION_SERVICE_URL", "http://localhost:8002")

TIMEOUT = 5.0  # giây


async def get_fee_by_mssv(mssv: str) -> dict:
    """
    Gọi Tuition Service để lấy thông tin khoản học phí cần đóng theo MSSV.
    Trả về dict có ít nhất: fee_id, amount, status.
    Ném lỗi nếu không tìm thấy hoặc học phí đã được đóng rồi.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(f"{TUITION_SERVICE_URL}/students/{mssv}/fees")
        res.raise_for_status()
        return res.json()


async def get_user(user_id: str) -> dict:
    """
    Gọi Account Service để lấy thông tin người dùng (cần email để gửi OTP).
    Trả về dict có ít nhất: user_id, email, balance.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.get(f"{ACCOUNT_SERVICE_URL}/users/{user_id}")
        res.raise_for_status()
        return res.json()


async def debit_account(user_id: str, amount: float, payment_ref_id: str) -> bool:
    """
    Gọi Account Service để trừ tiền.
    payment_ref_id (= transaction_id bên Payment) dùng làm idempotency key:
    nếu gọi lại với cùng payment_ref_id, Account Service phải nhận ra
    và KHÔNG trừ tiền lần 2.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.post(
            f"{ACCOUNT_SERVICE_URL}/users/{user_id}/debit",
            json={"amount": amount, "payment_ref_id": payment_ref_id},
        )
        return res.status_code == 200


async def refund_account(user_id: str, amount: float, payment_ref_id: str) -> bool:
    """
    Hoàn tiền — dùng khi bước cập nhật học phí thất bại sau khi đã trừ tiền
    (bước compensate trong Saga). Cũng cần idempotent tương tự debit_account.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.post(
            f"{ACCOUNT_SERVICE_URL}/users/{user_id}/refund",
            json={"amount": amount, "payment_ref_id": payment_ref_id},
        )
        return res.status_code == 200


async def mark_tuition_paid(fee_id: str, payment_ref_id: str) -> bool:
    """
    Báo Tuition Service cập nhật khoản học phí (fee_id) thành đã thanh toán.
    payment_ref_id cũng nên được Tuition Service dùng làm idempotency key,
    tránh 1 khoản học phí bị đánh dấu "đã đóng" nhiều lần nếu Payment gọi lại.
    """
    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        res = await client.post(
            f"{TUITION_SERVICE_URL}/fees/{fee_id}/pay",
            json={"payment_ref_id": payment_ref_id},
        )
        return res.status_code == 200