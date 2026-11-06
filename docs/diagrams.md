# Sơ đồ thiết kế hệ thống iBanking

Tài liệu tổng hợp các sơ đồ của phân hệ đóng học phí:

1. Sơ đồ Use Case (tiêu chí 1)
2. Sơ đồ ERD (tiêu chí 1 và 4)
3. Sơ đồ kiến trúc Microservices (tiêu chí 2)
4. Sơ đồ tuần tự giao dịch và xử lý đồng thời (tiêu chí 6)

Bản vẽ gốc dùng để trình chiếu là `docs/ibanking-diagrams.drawio` (3 trang: Use Case, ERD, Microservices Architecture). Các sơ đồ mermaid dưới đây có cùng nội dung để xem trực tiếp trên GitHub.

---

## 1. Sơ đồ Use Case

Tác nhân:

- **Người dùng (người nộp tiền):** đăng nhập, xem thông tin tài khoản, tra cứu và thanh toán học phí cho mình hoặc cho sinh viên khác, xem lịch sử giao dịch, quên mật khẩu, đăng xuất.
- **Hệ thống email (SMTP):** tác nhân ngoài, nhận email OTP và email xác nhận.

Quan hệ:

- *Thanh toán học phí* «include» *Tra cứu học phí* và *Xác thực OTP*.
- *Xác thực OTP* và *Quên mật khẩu* «include» *Gửi email*.
- *Quên mật khẩu* «extend» *Đăng nhập*; *Gửi lại OTP* «extend» *Xác thực OTP*.

```mermaid
flowchart LR
    User["Người dùng<br/>(người nộp tiền)"]
    Email["Hệ thống email<br/>(SMTP)"]

    subgraph System ["Hệ thống iBanking: đóng học phí"]
        UC1(["Đăng nhập"])
        UC2(["Thông tin tài khoản"])
        UC3(["Tra cứu học phí"])
        UC4(["Thanh toán học phí"])
        UC5(["Lịch sử giao dịch"])
        UC6(["Đăng xuất"])
        UC7(["Quên mật khẩu"])
        UC8(["Gửi email"])
        UC9(["Xác thực OTP"])
        UC10(["Gửi lại OTP"])
    end

    User --- UC1
    User --- UC2
    User --- UC3
    User --- UC4
    User --- UC5
    User --- UC6
    UC8 --- Email

    UC4 -.->|"«include»"| UC3
    UC4 -.->|"«include»"| UC9
    UC9 -.->|"«include»"| UC8
    UC7 -.->|"«include»"| UC8
    UC7 -.->|"«extend»"| UC1
    UC10 -.->|"«extend»"| UC9
```

---

## 2. Sơ đồ ERD

Sơ đồ khớp với `database/init.sql`. Mỗi service sở hữu một database riêng:

- **`account_db`**: `users`, `password_reset_otps`
- **`tuition_db`**: `students`, `tuition_fees`
- **`payment_db`**: `transactions`, `otp_codes`

Quan hệ trong cùng một database dùng khóa ngoại thật. `transactions.user_id` và `transactions.tuition_id` là liên kết logic sang database khác (không có khóa ngoại thật), Payment Service kiểm tra qua API.

```mermaid
erDiagram
    USERS ||--o{ PASSWORD_RESET_OTPS : "có"
    STUDENTS ||--o| TUITION_FEES : "có"
    USERS ||--o{ TRANSACTIONS : "thực hiện (logic)"
    TUITION_FEES ||--o{ TRANSACTIONS : "được thanh toán bởi (logic)"
    TRANSACTIONS ||--o{ OTP_CODES : "xác thực bằng"

    USERS {
        int id PK
        varchar username UK
        varchar password_hash "bcrypt"
        varchar full_name
        varchar phone
        varchar email
        bigint balance "CHECK >= 0"
    }

    PASSWORD_RESET_OTPS {
        int id PK
        int user_id FK
        varchar code_hash "HMAC-SHA256"
        timestamp expires_at "5 phút"
        int attempts "sai tối đa 5 lần"
        boolean used
        timestamp verified_at
        timestamp consumed_at
        timestamp created_at
    }

    STUDENTS {
        varchar mssv PK
        varchar full_name
    }

    TUITION_FEES {
        int id PK
        varchar mssv FK,UK
        bigint amount "CHECK > 0"
        varchar status "PENDING, PAID"
        int version "optimistic lock"
        timestamp created_at
    }

    TRANSACTIONS {
        int id PK
        int user_id "FK logic"
        varchar mssv
        int tuition_id "FK logic"
        int tuition_version
        bigint amount "CHECK > 0"
        varchar status "PENDING_OTP, SUCCESS, FAILED, EXPIRED"
        varchar fail_reason
        timestamp created_at
        timestamp updated_at
    }

    OTP_CODES {
        int id PK
        int transaction_id FK
        varchar code_hash "HMAC-SHA256, UK khi chưa dùng"
        timestamp expires_at "5 phút"
        boolean used
        int attempts "sai tối đa 5 lần"
        timestamp created_at
    }
```

---

## 3. Sơ đồ kiến trúc Microservices

Frontend gọi API bằng JWT; các service gọi nhau qua endpoint `/internal/*` với header `X-Internal-Key`. Payment Service điều phối giao dịch (Saga có bù trừ). Toàn bộ hệ thống chạy bằng Docker Compose (6 container).

```mermaid
flowchart TB
    Web["Frontend (React + Nginx)<br/>cổng 5173"]

    subgraph Services ["Microservices (FastAPI)"]
        Auth["Auth service<br/>cổng 8001<br/>Đăng nhập, tài khoản, số dư, quên mật khẩu"]
        Pay["Payment service<br/>cổng 8003<br/>Giao dịch, OTP, điều phối Saga, lịch sử"]
        Tui["Tuition service<br/>cổng 8002<br/>Tra cứu và chốt học phí"]
        Noti["Notification service<br/>cổng 8004<br/>Gửi email"]
    end

    SMTP["SMTP (Gmail)<br/>dịch vụ ngoài"]

    subgraph DB ["PostgreSQL 16 (cổng 5433), mỗi service một database"]
        DBA[("account_db")]
        DBP[("payment_db")]
        DBT[("tuition_db")]
    end

    Web -->|"REST + JWT"| Auth
    Web -->|"REST + JWT"| Pay
    Web -->|"REST"| Tui
    Pay -->|"REST: trừ / hoàn tiền"| Auth
    Pay -->|"REST: chốt học phí"| Tui
    Pay -->|"REST: email OTP, xác nhận"| Noti
    Auth -->|"REST: OTP quên mật khẩu"| Noti
    Noti -->|"SMTP"| SMTP
    Auth -.-> DBA
    Pay -.-> DBP
    Tui -.-> DBT
```

---

## 4. Sơ đồ Tuần tự Giao dịch & Xử lý Đồng thời (Saga Concurrency Sequence)

Xử lý đồng thời (Concurrency Control) và bảo đảm toàn vẹn giao dịch (Data Consistency) được giải quyết qua 2 cơ chế:
1. **Kiểm soát số dư tài khoản**: Dùng câu lệnh SQL nguyên tử `UPDATE users SET balance = balance - :amount WHERE id = :id AND balance >= :amount`, kết hợp ràng buộc `CHECK (balance >= 0)`.
2. **Kiểm soát học phí**: Sử dụng **Optimistic Concurrency Control (OCC)** với cột `version` (`UPDATE tuition_fees SET status='PAID', version=version+1 WHERE id=:id AND status='PENDING' AND version=:v`). Nếu xung đột, Saga Coordinator tự động kích hoạt **Compensating Transaction** để hoàn tiền vào tài khoản người nộp.

```mermaid
sequenceDiagram
    autonumber
    actor User as Khách hàng (Frontend)
    participant Pay as Payment Service (Saga Coordinator)
    participant Auth as Auth / Account Service
    participant Tui as Tuition Service
    participant Noti as Notification Service

    Note over User,Pay: BƯỚC 1: Khởi tạo giao dịch
    User->>Pay: POST /payments {mssv} (Bearer Token)
    Pay->>Auth: GET /users/me (Lấy thông tin số dư, email)
    Pay->>Tui: GET /api/tuition/{mssv} (Lấy học phí & version)
    Pay->>Pay: Tạo Transaction (PENDING_OTP) & sinh OTP 6 số
    Pay->>Noti: POST /internal/notify/email (Gửi OTP qua email)
    Pay-->>User: 201 Created {transaction_id, expires_in_seconds}

    Note over User,Pay: BƯỚC 2: Nhập OTP & Điều phối Saga
    User->>Pay: POST /payments/{id}/verify-otp {otp}
    Pay->>Pay: Khóa dòng giao dịch (SELECT FOR UPDATE) & đối chiếu mã OTP
    
    alt Mã OTP không hợp lệ hoặc hết hạn
        Pay-->>User: 400 OTP sai / 410 hết hạn / 429 sai quá 5 lần
    else OTP hợp lệ
        Note over Pay,Auth: Bước Saga 1: Trừ tiền tài khoản người nộp
        Pay->>Auth: POST /internal/accounts/{uid}/debit {amount}
        alt Số dư không đủ (balance < amount)
            Auth-->>Pay: 402 Payment Required
            Pay->>Pay: Đổi trạng thái GD thành FAILED
            Pay-->>User: 402 "Số dư không đủ"
        else Trừ tiền thành công
            Auth-->>Pay: 200 OK (Số dư mới)
            Note over Pay,Tui: Bước Saga 2: Gạch nợ học phí (Optimistic Locking)
            Pay->>Tui: POST /internal/tuition/{id}/pay {version}
            
            alt Thành công (status=PENDING & đúng version)
                Tui-->>Pay: 200 OK (status=PAID)
                Pay->>Pay: Đổi trạng thái GD thành SUCCESS
                Pay->>Noti: POST /internal/notify/payment-success (Email biên lai)
                Pay-->>User: 200 OK (Thanh toán hoàn tất)
            else Xung đột đồng thời (Học phí đã bị giao dịch khác gạch trước)
                Tui-->>Pay: 409 Conflict
                Note over Pay,Auth: Giao dịch bù trừ (Compensating Transaction): Hoàn tiền lại ngay
                Pay->>Auth: POST /internal/accounts/{uid}/credit {amount}
                Auth-->>Pay: 200 OK (Hoàn tiền thành công)
                Pay->>Pay: Cập nhật Transaction FAILED (Lý do: Đã thanh toán trước đó)
                Pay-->>User: 409 Conflict (Báo lỗi & thông báo đã hoàn tiền đầy đủ)
            end
        end
    end
```

---

## 5. File draw.io

Bản vẽ gốc: `docs/ibanking-diagrams.drawio`, gồm 3 trang **1. Use Case**, **2. ERD**, **3. Microservices Architecture**. Sơ đồ tuần tự chỉ có ở dạng mermaid trong file này.

Mở bằng https://app.diagrams.net → **Open Existing Diagram**. Để xuất ảnh: chọn trang, **File → Export as → PNG** (zoom 200%). Ảnh dùng trong repo: `docs/erd.png` (trang ERD), `docs/architecture.png` (trang kiến trúc).
