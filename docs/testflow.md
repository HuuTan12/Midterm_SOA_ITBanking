# Kịch bản kiểm thử

Kiểm thử qua giao diện **http://localhost:5173**. Mật khẩu mọi tài khoản: `123456`.

**Trước khi bắt đầu:** đặt lại dữ liệu, và mở sẵn một cửa sổ PowerShell để xem email (OTP và thông báo in ra đây khi chưa cấu hình SMTP):

```powershell
.\tests\reset.ps1
docker compose logs -f notification-service
```

Dữ liệu dùng trong bài:

| Tài khoản | Số dư | MSSV của mình | Học phí của mình |
|---|---|---|---|
| tan | 20.000.000 | 524H0028 | 15.000.000 |
| thai | 5.000.000 | 524H0029 | 12.500.000 |
| nam | 25.000.000 | 524H0032 | 14.000.000 |
| mai | 8.000.000 | 524H0034 | 7.500.000 |

Ngoài ra: `524H0030` (viet) đã đóng, `524H0031` (Pham Gia Bao, không có tài khoản) 18.000.000, `524H0035` chưa có khoản học phí.

## 1. Đăng nhập

| Bước | Kết quả mong đợi |
|---|---|
| Đăng nhập `tan` / `123456` | Vào trang thanh toán, hiện họ tên, số điện thoại, email, số dư 20.000.000 |
| Đăng nhập `tan` / mật khẩu sai | Báo lỗi sai tài khoản hoặc mật khẩu |
| Mở `/` khi chưa đăng nhập | Tự chuyển về trang đăng nhập |

## 2. Tra cứu học phí

Đăng nhập `tan`, nhập MSSV ở ô tra cứu.

| MSSV nhập | Kết quả mong đợi |
|---|---|
| 524H0028 | Hiện tên sinh viên, 15.000.000, "Chưa thanh toán" |
| 524H0030 | Hiện "Đã thanh toán", không có nút thanh toán |
| 524H0035 | Báo sinh viên chưa có khoản học phí |
| 000 | Báo không tìm thấy sinh viên |

## 3. Thanh toán thành công

Đăng nhập `tan` → tra cứu `524H0028` → tick đồng ý điều khoản → "Xác nhận giao dịch" → lấy OTP từ cửa sổ log → nhập OTP.

| Kiểm tra | Kết quả mong đợi |
|---|---|
| Màn hình sau khi nhập OTP | Thông báo thanh toán thành công |
| Số dư của `tan` | Còn 5.000.000 |
| Tra cứu lại `524H0028` | "Đã thanh toán" |
| Lịch sử giao dịch | Có giao dịch trạng thái SUCCESS |
| Cửa sổ log (email xác nhận) | Có người thanh toán, sinh viên nhận, MSSV, số tiền, mã giao dịch, thời gian |

## 4. Đóng hộ người khác

Đăng nhập `nam` → tra cứu `524H0031` (Pham Gia Bao) → thanh toán bằng OTP.

| Kiểm tra | Kết quả mong đợi |
|---|---|
| Số dư của `nam` | Còn 7.000.000 (25.000.000 trừ 18.000.000) |
| Email xác nhận | Người thanh toán: Nguyen Van Nam. Sinh viên nhận học phí: Pham Gia Bao |

## 5. Số dư không đủ

Đăng nhập `thai` (5.000.000) → tra cứu `524H0028` (15.000.000).

| Kết quả mong đợi |
|---|
| Cảnh báo "Số dư không đủ", nút xác nhận bị khóa |

## 6. Kiểm tra OTP

Đăng nhập `mai` → tra cứu `524H0034` → "Xác nhận giao dịch" để tạo giao dịch và nhận OTP.

| Bước | Kết quả mong đợi |
|---|---|
| Nhập OTP sai | Báo "OTP sai, còn 4 lần thử", vẫn nhập lại được |
| Bấm "Gửi lại OTP" | Nhận mã mới, mã cũ không còn dùng được |
| Nhập sai OTP đủ 5 lần | Giao dịch chuyển FAILED, phải tạo giao dịch mới |
| Làm hết hạn OTP (lệnh bên dưới) rồi nhập mã đúng | Báo "OTP đã hết hạn" |

Mô phỏng hết hạn mà không phải chờ 5 phút:

```powershell
docker exec -i ibanking_postgres psql -U postgres -d payment_db -c "UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE used = FALSE;"
```

## 7. Quên mật khẩu

Ở trang đăng nhập bấm "Quên mật khẩu?".

| Bước | Kết quả mong đợi |
|---|---|
| Nhập `lan@example.com`, bấm "Gửi mã OTP" | Chuyển sang bước nhập OTP, có đồng hồ đếm ngược 5 phút. OTP hiện trong cửa sổ log |
| Nhập OTP sai | Báo còn bao nhiêu lần thử |
| Nhập OTP đúng | Chuyển sang bước đặt mật khẩu mới |
| Nhập mật khẩu mới (từ 6 ký tự) và xác nhận | Về trang đăng nhập, có thông báo thành công |
| Đăng nhập `lan` bằng mật khẩu mới | Thành công. Mật khẩu cũ `123456` không còn dùng được |
| Nhập email không tồn tại | Vẫn hiện thông báo "đã gửi" nhưng không có email nào trong log (cố ý, để không lộ email đã đăng ký) |

Để về mật khẩu mẫu sau khi test: `docker compose down -v` rồi `docker compose up -d`.

## 8. Concurrency

Bật `DEBUG_RETURN_OTP=1` trong `.env`, chạy `docker compose up -d` (để script tự lấy OTP), cần `pip install httpx`. Mỗi kịch bản đặt lại dữ liệu trước:

```powershell
.\tests\reset.ps1
python tests\concurrency_test.py a

.\tests\reset.ps1
python tests\concurrency_test.py b

.\tests\reset.ps1
python tests\concurrency_test.py c
```

| Kịch bản | Tình huống | Kết quả mong đợi |
|---|---|---|
| a | `tan` và `viet` cùng trả `524H0028` đồng thời | Một người thành công, người kia được hoàn tiền. Tổng tiền bị trừ đúng 15.000.000. Dòng cuối `PASS` |
| b | `tan` (20tr) trả song song `524H0028` (15tr) và `524H0029` (12,5tr) | Chỉ một giao dịch thành công, số dư không âm. Dòng cuối `PASS` |
| c | Bấm xác nhận OTP hai lần đồng thời cho một giao dịch | Chỉ trừ tiền một lần. Dòng cuối `PASS` |

Xong thì đặt lại `DEBUG_RETURN_OTP=0` trong `.env` và chạy `docker compose up -d`.