# Kịch bản kiểm thử (Test Flow)

Các nhóm A-E kiểm thử qua API bằng PowerShell, nhóm F kiểm thử concurrency, nhóm G kiểm thử giao diện. Mỗi nhóm đều đối chiếu kết quả thực tế với cột "Kết quả mong đợi".

## 0. Chuẩn bị (làm một lần)

1. Trong `.env` đặt `DEBUG_RETURN_OTP=1` (để `POST /payments` trả OTP, không cần mở log). **Nhớ đặt lại `0` sau khi test.**
2. Khởi động lại hệ thống để nhận biến mới:

```powershell
cd D:\Midterm_SOA_ITBanking
docker compose up -d --build
docker compose ps        # 6 container running
```

3. Dán khối hàm trợ giúp này vào cửa sổ PowerShell (dùng cho mọi nhóm A-E):

```powershell
$A="http://127.0.0.1:8001"; $T="http://127.0.0.1:8002"
$P="http://127.0.0.1:8003"; $N="http://127.0.0.1:8004"
$KEY = (Select-String -Path .env -Pattern '^INTERNAL_API_KEY=').Line.Split('=',2)[1]
$KH  = @{ "X-Internal-Key" = $KEY }

# Gọi API và in "mã HTTP + nội dung", kể cả khi lỗi 4xx/5xx
function Call($Method, $Url, $Body = $null, $Headers = @{}) {
  try {
    $p = @{ Method=$Method; Uri=$Url; Headers=$Headers; ContentType="application/json"; UseBasicParsing=$true }
    if ($Body) { $p.Body = $Body }
    $r = Invoke-WebRequest @p
    "$($r.StatusCode) $($r.Content)"
  } catch {
    $resp = $_.Exception.Response
    if ($resp -and $resp.GetType().Name -eq "HttpWebResponse") {
      $sr = New-Object IO.StreamReader($resp.GetResponseStream())
      "$([int]$resp.StatusCode) $($sr.ReadToEnd())"
    } elseif ($resp) { "$([int]$resp.StatusCode) $($_.ErrorDetails.Message)" }
    else { "ERR $($_.Exception.Message)" }
  }
}

# Đăng nhập, trả về header Authorization
function Login($u, $pw = "123456") {
  $r = Invoke-RestMethod -Method Post "$A/auth/login" -ContentType "application/json" -Body (@{username=$u;password=$pw} | ConvertTo-Json)
  @{ Authorization = "Bearer $($r.access_token)" }
}

# Tạo giao dịch, trả về object có transaction_id và debug_otp
function NewTx($h, $mssv) {
  Invoke-RestMethod -Method Post "$P/payments" -Headers $h -ContentType "application/json" -Body (@{mssv=$mssv} | ConvertTo-Json)
}

function Db($db, $sql) { docker exec -i ibanking_postgres psql -U postgres -d $db -c $sql }
function Reset { .\tests\reset.ps1 }
function Bal($h) { (Invoke-RestMethod "$A/users/me" -Headers $h).balance }
```

Dữ liệu mẫu: `tan` (id 1) 20.000.000, `thai` (id 2) 5.000.000, `viet` (id 3) 30.000.000, mật khẩu `123456`. Học phí: `524H0028` 15tr, `524H0029` 12,5tr, `524H0030` đã đóng, `524H0031` 18tr.

> Ký hiệu ↻ nghĩa là chạy `Reset` trước nhóm đó.

---

## A. Đăng nhập và xác thực

```powershell
Reset
# A1
Call Post "$A/auth/login" '{"username":"tan","password":"123456"}'
# A2
Call Post "$A/auth/login" '{"username":"tan","password":"sai"}'
# A3
Call Get "$A/users/me"
# A4
$tan = Login "tan"; Call Get "$A/users/me" $null $tan
# A5
Call Get "$A/users/me" $null @{Authorization="Bearer abc.def.ghi"}
```

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| A1 | Đăng nhập đúng | 200, có `access_token` |
| A2 | Sai mật khẩu | 401 "Sai username hoặc password" |
| A3 | Gọi `/users/me` không token | 401 "Thiếu token" |
| A4 | Gọi `/users/me` có token | 200, `balance` = 20000000 |
| A5 | Token giả | 401 "Token không hợp lệ hoặc đã hết hạn" |

## B. Tra cứu học phí

```powershell
# B1
Call Get "$T/api/tuition/524H0028"
# B2
Call Get "$T/api/tuition/524H0030"
# B3
Call Get "$T/api/tuition/000"
```

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| B1 | MSSV chưa đóng | 200, `amount` 15000000, `status` PENDING, `version` 1 |
| B2 | MSSV đã đóng | 200, `status` PAID |
| B3 | MSSV không tồn tại | 404 "Không tìm thấy sinh viên có MSSV: 000" |

## C. Tạo giao dịch (`POST /payments`)

```powershell
Reset
$tan = Login "tan"; $thai = Login "thai"
# C1
Call Post "$P/payments" '{"mssv":"524H0028"}'
# C2
Call Post "$P/payments" '{"mssv":"524H0028"}' $tan
# C3
Call Post "$P/payments" '{"mssv":"524H0030"}' $tan
# C4
Call Post "$P/payments" '{"mssv":"000"}' $tan
# C5
Call Post "$P/payments" '{"mssv":"524H0028"}' $thai
```

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| C1 | Không đăng nhập | 401 "Thiếu token" |
| C2 | Hợp lệ | 201, có `transaction_id`, `expires_in_seconds` 300, `debug_otp` |
| C3 | MSSV đã đóng | 409 "Học phí đã được thanh toán" |
| C4 | MSSV không tồn tại | 404 "Không tìm thấy sinh viên" |
| C5 | Số dư không đủ (`thai` 5tr, cần 15tr) | 402 "Số dư không đủ" |

## D. Xác thực OTP

```powershell
Reset
$tan = Login "tan"; $viet = Login "viet"
$tx = NewTx $tan "524H0028"
# D1: OTP sai
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" '{"otp":"000000"}' $tan
# D4: user khác xác thực giao dịch của tan
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $viet
# D2: OTP đúng
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $tan
Bal $tan                                              # 5000000
Call Get "$T/api/tuition/524H0028"                    # PAID, version 2
Call Get "$P/users/me/transactions" $null $tan        # có 1 giao dịch SUCCESS
# D3: xác thực lại giao dịch đã xong
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $tan
```

```powershell
# D5: OTP hết hạn
Reset
$tan = Login "tan"
$tx = NewTx $tan "524H0028"
Db payment_db "UPDATE otp_codes SET expires_at = now() - interval '1 minute' WHERE used = FALSE;"
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $tan
Call Post "$P/payments/$($tx.transaction_id)/resend-otp" $null $tan
```

```powershell
# D6: gửi lại OTP
Reset
$tan = Login "tan"
$tx = NewTx $tan "524H0028"
Call Post "$P/payments/$($tx.transaction_id)/resend-otp" $null $tan
# OTP cũ không còn dùng được
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $tan
# Lấy OTP mới từ log (dòng "Mã OTP mới của bạn là ...")
docker compose logs notification-service --tail 8
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" '{"otp":"<OTP-MỚI>"}' $tan
```

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| D1 | OTP sai | 400 "OTP sai", giao dịch vẫn chờ OTP |
| D2 | OTP đúng | 200 `SUCCESS`; số dư `tan` còn 5.000.000; `524H0028` là PAID version 2; lịch sử có giao dịch SUCCESS |
| D3 | Xác thực lại giao dịch đã xong | 409 "Giao dịch đã được xử lý", không trừ tiền lần 2 |
| D4 | User khác xác thực giao dịch của người khác | 404 "Không tìm thấy giao dịch" |
| D5 | OTP hết hạn | 410 "OTP đã hết hạn"; giao dịch chuyển EXPIRED; gửi lại OTP sau đó trả 409 |
| D6 | Gửi lại OTP | 200 `expires_in_seconds` 300; OTP cũ trả 400 "OTP sai"; OTP mới trả 200 SUCCESS |

## E. Bù trừ (Saga) và endpoint nội bộ

```powershell
# E1: học phí bị người khác đóng sau khi tạo giao dịch -> hoàn tiền
Reset
$tan = Login "tan"
$tx = NewTx $tan "524H0028"
Db tuition_db "UPDATE tuition_fees SET status='PAID', version=version+1 WHERE mssv='524H0028';"
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $tan
Bal $tan                                              # vẫn 20000000
Call Get "$P/users/me/transactions" $null $tan        # FAILED + ghi chú đã hoàn tiền
```

```powershell
# E2: số dư giảm sau khi tạo giao dịch -> không chốt học phí
Reset
$tan = Login "tan"
$tx = NewTx $tan "524H0029"
Db account_db "UPDATE users SET balance = 1000000 WHERE username='tan';"
Call Post "$P/payments/$($tx.transaction_id)/verify-otp" (@{otp=$tx.debug_otp} | ConvertTo-Json) $tan
Call Get "$T/api/tuition/524H0029"                    # vẫn PENDING
```

```powershell
# E3-E7: endpoint nội bộ
Reset
# E3
Call Post "$A/internal/accounts/1/debit" '{"amount":1000}'
# E4
Call Post "$A/internal/accounts/1/debit" '{"amount":999999999}' $KH
# E5
Call Post "$T/internal/tuition/1/pay" '{"version":99}' $KH
# E6
Call Post "$N/internal/notify/email" '{"to":"a@b.c","subject":"x","body":"y"}'
# E7
Call Post "$N/internal/notify/email" '{"to":"a@b.c","subject":"x","body":"y"}' $KH
```

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| E1 | Học phí bị đóng bởi giao dịch khác khi đang xác thực OTP | 409 "...đã được thanh toán bởi giao dịch khác, đã hoàn tiền"; số dư `tan` vẫn 20.000.000; giao dịch FAILED |
| E2 | Số dư không đủ lúc xác thực | 402 "Số dư không đủ"; học phí vẫn PENDING; giao dịch FAILED |
| E3 | Gọi `debit` không có `X-Internal-Key` | 403 "Forbidden" |
| E4 | `debit` vượt số dư | 402 "Số dư không đủ" |
| E5 | `pay` sai `version` | 409 "Học phí đã được thanh toán hoặc đã thay đổi" |
| E6 | Gửi email không có key | 403 "Forbidden" |
| E7 | Gửi email có key | 200 `{"sent":true,...}` |

## F. Concurrency

Thêm kịch bản (c) vào `tests/concurrency_test.py` (đặt trên khối `if __name__`) và đổi dòng cuối thành `{"a": scenario_a, "b": scenario_b, "c": scenario_c}[sys.argv[1]]()`:

```python
def scenario_c():
    print("=== (c) 1 giao dịch, bấm xác nhận OTP 2 lần đồng thời ===")
    h = login("tan")
    b = balance(h)
    tx, otp = create(h, "524H0028")
    res = verify_parallel([("lần 1", h, tx, otp), ("lần 2", h, tx, otp)])
    show(res)
    a = balance(h)
    codes = sorted(c for c, _ in res.values())
    ok = codes == [200, 409] and b - a == 15_000_000
    print("  KẾT QUẢ:", "PASS (chỉ trừ tiền 1 lần)" if ok else "FAIL")
```

```powershell
pip install httpx        # nếu chưa có
Reset
python tests\concurrency_test.py a
Reset
python tests\concurrency_test.py b
Reset
python tests\concurrency_test.py c
```

| Mã | Tình huống | Kết quả mong đợi |
|---|---|---|
| F1 | 2 user cùng trả 1 MSSV | Một request 200, một request 409; tổng tiền bị trừ đúng 15.000.000 (người thua được hoàn tiền); học phí PAID; dòng cuối `PASS` |
| F2 | 1 user trả 2 MSSV song song, số dư không đủ cho cả hai | Một request 200, một request 402; số dư không âm; `PASS` |
| F3 | Bấm xác nhận OTP 2 lần đồng thời | Một request 200, một request 409; chỉ trừ tiền một lần; `PASS` |

Chạy mỗi kịch bản 3-5 lần (có `Reset` giữa các lần) để chắc kết quả ổn định.

## G. Giao diện (thủ công, `http://localhost:5173`)

Chạy `Reset` rồi F5 trình duyệt trước khi test.

| Mã | Làm | Kết quả mong đợi |
|---|---|---|
| G1 | Xóa `access_token` trong Local Storage, vào `/` hoặc `/history` | Tự chuyển về `/login` |
| G2 | Đăng nhập sai mật khẩu | Hiện lỗi, không chuyển trang |
| G3 | Đăng nhập `tan`, kiểm tra thông tin người nộp | Họ tên, SĐT, email hiển thị và **không sửa được** |
| G4 | Tra cứu `524H0028` | Hiện tên SV, 15.000.000 đ, "Chưa thanh toán" |
| G5 | Chưa tick điều khoản | Nút "Xác nhận giao dịch" bị khóa |
| G6 | Đăng nhập `thai`, tra cứu `524H0028` | Cảnh báo "Số dư không đủ", nút khóa dù đã tick |
| G7 | Tra cứu `524H0030` (đã đóng) | Chỉ hiện badge "Đã thanh toán", không có khối thanh toán |
| G8 | `tan` xác nhận giao dịch | Hiện modal OTP đếm ngược từ 05:00 |
| G9 | Nhập OTP sai | Báo lỗi, modal vẫn mở |
| G10 | Bấm "Gửi lại OTP" | Đếm ngược về 05:00, OTP cũ không dùng được |
| G11 | Nhập đúng OTP | Màn hình thành công, số dư 5.000.000, học phí chuyển "Đã thanh toán" |
| G12 | Mở "Lịch sử giao dịch" | Có giao dịch vừa tạo, trạng thái "Thành công" |
| G13 | Đăng xuất rồi vào `/history` | Về `/login` |

## Dọn dẹp sau khi test

```powershell
# đặt DEBUG_RETURN_OTP=0 trong .env, rồi:
docker compose up -d
Reset
```