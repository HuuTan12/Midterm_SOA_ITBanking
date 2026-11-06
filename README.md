# iBanking - Phân hệ đóng học phí (CS504070)

Hệ thống mô phỏng thanh toán học phí cho sinh viên TDTU: đăng nhập, tra cứu học phí theo MSSV, xác thực giao dịch bằng OTP qua email, và đảm bảo tính nhất quán dữ liệu khi có nhiều giao dịch đồng thời.

## Kiến trúc

Hệ thống gồm 4 microservice (FastAPI), mỗi service có database riêng trong cùng một PostgreSQL, và frontend React.

| Thành phần | Cổng | Vai trò | Database |
|---|---|---|---|
| frontend | 5173 | Giao diện web (React + TypeScript + Redux Toolkit) | - |
| auth-service | 8001 | Đăng nhập (JWT), thông tin người dùng, số dư, trừ/hoàn tiền | `account_db` |
| tuition-service | 8002 | Tra cứu và chốt trạng thái học phí | `tuition_db` |
| payment-service | 8003 | Tạo giao dịch, sinh và xác thực OTP, điều phối Saga, lịch sử | `payment_db` |
| notification-service | 8004 | Gửi email OTP và xác nhận giao dịch (SMTP) | - |
| postgres | 5433 | PostgreSQL 16 (3 database) | - |

Sơ đồ kiến trúc, luồng xác nhận OTP và ERD: [docs/diagrams.md](docs/diagrams.md). Thiết kế REST API: [docs/api-design.md](docs/api-design.md).

### Đảm bảo nhất quán dữ liệu

Tài khoản và học phí nằm ở hai database khác nhau nên không thể dùng chung một transaction. Payment Service điều phối theo mô hình **Saga có bù trừ**, mỗi bước là một câu lệnh SQL nguyên tử:

1. Khóa dòng giao dịch (`SELECT ... FOR UPDATE`), kiểm tra OTP rồi đánh dấu đã dùng. Bấm xác nhận hai lần chỉ có một lần được xử lý.
2. Trừ tiền: `UPDATE users SET balance = balance - :amt WHERE id = :id AND balance >= :amt`. Hai giao dịch song song của cùng một tài khoản không thể làm số dư âm (ràng buộc `CHECK (balance >= 0)` là lớp bảo vệ cuối).
3. Chốt học phí: `UPDATE tuition_fees SET status='PAID', version=version+1 WHERE status='PENDING' AND version=:v` (optimistic locking). Hai người cùng trả một MSSV thì chỉ một người thành công.
4. Nếu bước 3 thất bại thì hoàn tiền (bù trừ) và ghi giao dịch `FAILED`.

Hạn chế đã biết: nếu Payment Service dừng đột ngột giữa bước 2 và 3 thì giao dịch có thể bị kẹt. Hướng mở rộng là một job quét các giao dịch dở dang để hoàn tiền hoặc thử lại.

## Yêu cầu môi trường

- Docker Desktop (có Docker Compose v2)
- Các cổng 5173, 5433, 8001-8004 đang trống
- Cho script kiểm thử concurrency: Python 3.10+ và `pip install httpx`

## Cài đặt và khởi chạy

```powershell
git clone <đường-dẫn-repo>
cd Midterm_SOA_ITBanking

Copy-Item .env.example .env
# Mở .env và đổi POSTGRES_PASSWORD, JWT_SECRET, INTERNAL_API_KEY

docker compose up -d --build
docker compose ps
```

Chờ 6 container ở trạng thái `running` (postgres là `healthy`), rồi mở **http://localhost:5173**.

Lần chạy đầu tiên, PostgreSQL tự chạy `database/init.sql` để tạo 3 database và dữ liệu mẫu. Script này chỉ chạy khi volume còn trống.

Các lệnh thường dùng:

```powershell
docker compose logs -f notification-service   # xem mã OTP (khi chưa cấu hình SMTP)
docker compose logs payment-service --tail 50
docker compose down                           # dừng, giữ dữ liệu
docker compose down -v                        # dừng và xóa toàn bộ dữ liệu (về trạng thái ban đầu)
```

## Tài khoản và dữ liệu mẫu

Mật khẩu của tất cả tài khoản: `123456`

Hệ thống hỗ trợ đăng nhập bằng chính **Họ và tên đầy đủ** (có dấu hoặc không dấu), hoặc **Số điện thoại**, **Email**:

| Tên đăng nhập (Họ tên) | Tên viết tắt | Số điện thoại | Số dư ban đầu | MSSV tương ứng |
|---|---|---|---|---|
| **Nguyễn Hữu Tân** | `tan` | `0901111111` | 20.000.000 | 524H0028 |
| **Trần Minh Thái** | `thai` | `0902222222` | 5.000.000 | 524H0029 |
| **Lê Quốc Việt** | `viet` | `0903333333` | 30.000.000 | 524H0137 |
| **Nguyễn Văn Nam** | `nam` | `0904444444` | 25.000.000 | - |
| **Phạm Thị Lan** | `lan` | `0905555555` | 18.000.000 | - |

Học phí (người dùng có thể đóng cho bất kỳ MSSV nào, không nhất thiết là của mình):

| MSSV | Sinh viên | Số tiền | Trạng thái |
|---|---|---|---|
| 524H0028 | Nguyễn Hữu Tân | 15.000.000 | Chưa đóng |
| 524H0029 | Trần Minh Thái | 12.500.000 | Chưa đóng |
| 524H0031 | Phạm Gia Bảo | 18.000.000 | Chưa đóng |
| 524H0137 | Lê Quốc Việt | 12.500.000 | Đã đóng |

## Nhận mã OTP

**Chế độ mặc định (không cấu hình SMTP):** mã OTP in ra log của notification-service:

```powershell
docker compose logs -f notification-service
```

Tìm dòng `[EMAIL] ... Mã OTP của bạn là xxxxxx`.

**Gửi email thật:**

1. Đổi email của user mẫu thành email của bạn:
   ```powershell
   docker exec -it ibanking_postgres psql -U postgres -d account_db -c "UPDATE users SET email='email-cua-ban@gmail.com' WHERE username='tan';"
   ```
2. Tạo App Password cho Gmail (cần bật xác minh 2 bước), điền `SMTP_USER` và `SMTP_PASS` vào `.env`.
3. Chạy lại: `docker compose up -d`.

## Kịch bản demo

Đặt lại dữ liệu trước mỗi lần demo:

```powershell
.\tests\reset.ps1
```

**1. Thanh toán thành công**
Đăng nhập `tan` → tra cứu `524H0028` → tick điều khoản → "Xác nhận giao dịch" → nhập OTP lấy từ log → thấy màn hình thành công, số dư còn 5.000.000, học phí chuyển "Đã thanh toán". Mở "Lịch sử giao dịch" để xem giao dịch vừa tạo.

**2. Số dư không đủ**
Đăng nhập `thai` (5.000.000) → tra cứu `524H0028` → hệ thống cảnh báo "Số dư không đủ" và khóa nút xác nhận.

**3. OTP sai và OTP hết hạn**
Tạo giao dịch bằng `tan`, nhập OTP sai thì báo lỗi và vẫn nhập lại được. Bấm "Gửi lại OTP" thì mã cũ mất hiệu lực. Để mô phỏng hết hạn mà không phải chờ 5 phút:

```powershell
docker exec -i ibanking_postgres psql -U postgres -d payment_db -c "UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE used = FALSE;"
```

Rồi nhập mã đúng và xác nhận: giao dịch báo "OTP đã hết hạn".

**4. Kiểm thử concurrency**

Bật `DEBUG_RETURN_OTP=1` trong `.env` rồi `docker compose up -d` (để script lấy OTP tự động). Sau đó:

```powershell
.\tests\reset.ps1
python tests\concurrency_test.py a    # 2 người cùng trả một MSSV: chỉ 1 thành công, người kia được hoàn tiền

.\tests\reset.ps1
python tests\concurrency_test.py b    # 1 người trả 2 MSSV song song với số dư không đủ cho cả hai: chỉ 1 thành công
```

Kết quả mong đợi: dòng cuối của mỗi kịch bản là `PASS`. Xong thì đặt lại `DEBUG_RETURN_OTP=0` và `docker compose up -d`.

## Đối chiếu yêu cầu đề bài

| Yêu cầu | Nơi thực hiện |
|---|---|
| 1. Phân tích nghiệp vụ, Use Case, ERD | `docs/use-case-diagram.docx`, `docs/diagrams.md` |
| 2. Kiến trúc Microservices | `docs/diagrams.md`, mục Kiến trúc |
| 3. Thiết kế REST API | `docs/api-design.md` |
| 4. Thiết kế và hiện thực CSDL | `database/init.sql` |
| 5. Lập trình service và API | `auth-service/`, `tuition-service/`, `payment-service/`, `notification-service/` |
| 6. Transaction và concurrency | Mục "Đảm bảo nhất quán dữ liệu", `payment-service/main.py` (`verify_otp`) |
| 7. Giao diện web | `frontend-tuition/` |
| 8. Tài liệu và trình diễn | README này, mục Kịch bản demo |

## Cấu trúc thư mục

```
auth-service/          Đăng nhập, người dùng, số dư
tuition-service/       Học phí
payment-service/       Giao dịch, OTP, Saga
notification-service/  Gửi email
frontend-tuition/      Giao diện React
database/init.sql      Schema và dữ liệu mẫu
docs/                  Tài liệu, sơ đồ, thiết kế API
tests/                 Script reset dữ liệu và kiểm thử concurrency
docker-compose.yml
.env.example
```

## Chạy không dùng Docker (phát triển)

Mỗi service Python có venv riêng, chạy `uvicorn main:app --reload --port <cổng>` trong thư mục của nó, cần biến môi trường tương ứng trong `.env` (xem `docker-compose.yml` để biết tên biến). Frontend: `cd frontend-tuition`, `npm install`, `npm run dev`.