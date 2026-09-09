# Account Service

Microservice quản lý người dùng, số dư và lịch sử giao dịch — thuộc phân hệ "Đóng học phí iBanking".

## Cài đặt

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env          # rồi chỉnh DATABASE_URL, JWT_SECRET_KEY, INTERNAL_API_KEY
```

Muốn test nhanh không cần cài PostgreSQL: đổi `DATABASE_URL` trong `.env` thành

```
DATABASE_URL=sqlite:///./account_service.db
```

## Seed dữ liệu mẫu

```bash
python seed.py
```

Tạo 2 user mẫu: `alice` / `123456` (balance 5.000.000) và `bob` / `123456` (balance 200.000).

## Chạy server

```bash
uvicorn app.main:app --reload --port 8000
```

Xem docs tự động (Swagger UI): http://localhost:8000/docs

## Danh sách API

### Public (Frontend gọi)

| Method | Endpoint | Mô tả | Auth |
|---|---|---|---|
| POST | `/auth/login` | Đăng nhập, trả JWT | Không |
| GET | `/users/me` | Thông tin người dùng đang đăng nhập | Bearer JWT |
| GET | `/users/me/balance` | Số dư khả dụng | Bearer JWT |
| GET | `/users/me/transactions` | Lịch sử giao dịch | Bearer JWT |

### Internal (chỉ Payment Service gọi, cần header `X-Internal-Api-Key`)

| Method | Endpoint | Mô tả |
|---|---|---|
| GET | `/internal/accounts/{user_id}/check-balance?amount=...` | Kiểm tra số dư có đủ không |
| POST | `/internal/accounts/{user_id}/debit` | Trừ tiền + ghi lịch sử giao dịch |

## Cơ chế chống trừ tiền trùng / đồng thời (mục 6 của đề)

1. **Idempotency**: mỗi lần gọi `/debit`, Payment Service phải gửi kèm `payment_ref_id` (mã giao dịch bên Payment Service). Nếu `payment_ref_id` đã được xử lý trước đó, Account Service trả lại đúng kết quả cũ (`idempotent_replay: true`) mà không trừ tiền thêm lần nữa — chống trường hợp Payment Service gọi lại do timeout/retry.

2. **Optimistic locking bằng cột `version`**: khi trừ tiền, câu lệnh UPDATE luôn kèm điều kiện `WHERE version = <giá trị đã đọc>`. Nếu có giao dịch khác đã trừ tiền trước đó (khiến `version` đổi), UPDATE sẽ trả về 0 dòng ảnh hưởng → hệ thống tự động đọc lại số dư mới nhất và thử lại (tối đa 5 lần). Nhờ vậy, dù nhiều giao dịch cùng lúc trên 1 tài khoản, chúng vẫn được xử lý tuần tự về mặt dữ liệu, không bao giờ trừ vượt quá số dư khả dụng.

Đã test thực tế: bắn 5 request debit đồng thời trên tài khoản chỉ đủ tiền cho 4 request → đúng 4 giao dịch thành công, 1 giao dịch bị từ chối, số dư cuối chính xác tuyệt đối.

## Cấu trúc thư mục

```
account-service/
├── app/
│   ├── main.py          # entry point
│   ├── config.py        # đọc biến môi trường
│   ├── database.py      # SQLAlchemy engine/session
│   ├── models.py         # User, Transaction (khớp ERD)
│   ├── schemas.py        # Pydantic request/response
│   ├── auth.py           # JWT + hash password + internal API key
│   └── routers/
│       ├── auth.py       # POST /auth/login
│       ├── users.py      # GET /users/me...
│       └── internal.py   # check-balance, debit
├── seed.py               # tạo user mẫu để test
├── requirements.txt
└── .env.example
```
