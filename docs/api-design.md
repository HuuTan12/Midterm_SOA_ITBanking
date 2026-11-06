# Thiết kế REST API

Quy ước chung:

- Lỗi trả về dạng `{"detail": "<thông báo>"}`.
- Endpoint của người dùng cần header `Authorization: Bearer <JWT>` (trừ đăng nhập, quên mật khẩu và tra cứu học phí).
- Endpoint `/internal/*` yêu cầu header `X-Internal-Key`, chỉ dành cho các service gọi nhau, không dành cho frontend.
- Request body được kiểm tra bằng Pydantic: thiếu trường hoặc sai định dạng trả về **422**.
- Swagger của từng service: `http://localhost:<cổng>/docs`.

## 1. Auth/Account Service (cổng 8001, DB `account_db`)

| Method | URI | Request | Response thành công | Mã lỗi |
|---|---|---|---|---|
| POST | /auth/login | `{"username","password"}` (username có thể là SĐT hoặc email) | 200 `{"access_token","token_type":"bearer"}` | 401 sai tài khoản/mật khẩu, 422 |
| GET | /users/me | Bearer | 200 `{"id","username","full_name","phone","email","balance"}` | 401 token thiếu/sai/hết hạn |
| POST | /auth/forgot-password | `{"email"}` | 200 `{"message","expires_in_seconds"}` (luôn 200 dù email có tồn tại hay không) | 422 |
| POST | /auth/verify-reset-otp | `{"email","otp"}` (6 chữ số) | 200 `{"reset_token","expires_in_seconds"}` | 400 OTP sai/không hợp lệ, 410 hết hạn, 422, 429 sai quá 5 lần |
| POST | /auth/reset-password | `{"reset_token","new_password"}` | 200 `{"message"}` | 400 phiên không hợp lệ/đã dùng, 422 mật khẩu dưới 6 ký tự |
| POST | /internal/accounts/{user_id}/debit | `X-Internal-Key` + `{"amount"}` | 200 `{"balance"}` (số dư mới) | 402 số dư không đủ, 403 sai key, 422 amount ≤ 0 |
| POST | /internal/accounts/{user_id}/credit | `X-Internal-Key` + `{"amount"}` | 200 `{"balance"}` | 403, 404 không có user, 422 |

## 2. Tuition Service (cổng 8002, DB `tuition_db`)

| Method | URI | Request | Response thành công | Mã lỗi |
|---|---|---|---|---|
| GET | /api/tuition/{mssv} | không | 200 `{"mssv","full_name","tuition_id","amount","status","version"}` (các trường học phí là `null` nếu chưa có khoản học phí) | 404 không có sinh viên |
| POST | /internal/tuition/{tuition_id}/pay | `X-Internal-Key` + `{"version"}` | 200 `{"ok": true}` | 403, 409 học phí đã được đóng hoặc sai version |

## 3. Payment Service (cổng 8003, DB `payment_db`), điều phối giao dịch

| Method | URI | Request | Response thành công | Mã lỗi |
|---|---|---|---|---|
| POST | /payments | Bearer + `{"mssv"}` | 201 `{"transaction_id","expires_in_seconds"}` | 401, 402 số dư không đủ, 404 không có sinh viên/khoản học phí, 409 đã thanh toán, 502 service khác lỗi hoặc gửi mail lỗi |
| POST | /payments/{tx_id}/verify-otp | Bearer + `{"otp"}` | 200 `{"status":"SUCCESS","transaction_id"}` | 400 OTP sai/không hợp lệ, 401, 402 số dư không đủ, 404, 409 giao dịch đã xử lý hoặc học phí đã được người khác đóng (đã hoàn tiền), 410 OTP hết hạn, 429 sai OTP quá 5 lần, 502 Account Service lỗi |
| POST | /payments/{tx_id}/resend-otp | Bearer | 200 `{"expires_in_seconds"}` | 401, 404, 409 giao dịch không còn chờ OTP, 502 |
| GET | /users/me/transactions | Bearer | 200 `[{"id","mssv","amount","status","fail_reason","created_at"}]` | 401 |

Trạng thái giao dịch: `PENDING_OTP` → `SUCCESS` \| `FAILED` \| `EXPIRED`.

## 4. Notification Service (cổng 8004)

| Method | URI | Request | Response thành công | Mã lỗi |
|---|---|---|---|---|
| POST | /internal/notify/email | `X-Internal-Key` + `{"to","subject","body"}` | 200 `{"sent":true,"mode":"smtp"}` hoặc `"console"` | 403, 422, 502 SMTP lỗi |
| POST | /internal/notify/payment-success | `X-Internal-Key` + `{"to","payer_name","student_name"(tùy chọn),"mssv","amount","transaction_id"}` | 200 `{"sent":true,"mode":"smtp"}` hoặc `"console"` | 403, 422, 502 SMTP lỗi |

## 5. Bảng mã lỗi

| HTTP | Ý nghĩa | Ví dụ |
|---|---|---|
| 400 | OTP sai / không hợp lệ | "OTP sai, còn 4 lần thử" |
| 401 | Thiếu hoặc sai JWT | "Token không hợp lệ hoặc đã hết hạn" |
| 402 | Số dư không đủ | "Số dư không đủ" |
| 403 | Sai `X-Internal-Key` | "Forbidden" |
| 404 | Không tìm thấy | "Không tìm thấy sinh viên" |
| 409 | Xung đột dữ liệu | "Học phí đã được thanh toán" |
| 410 | OTP hết hạn (5 phút) | "OTP đã hết hạn" |
| 422 | Sai định dạng dữ liệu (Pydantic) | amount ≤ 0, thiếu trường |
| 429 | Nhập sai OTP quá 5 lần | "Nhập sai OTP quá 5 lần" |
| 502 | Service khác hoặc SMTP lỗi | "Không gửi được email OTP" |
