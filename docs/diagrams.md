# Sơ đồ Kiến trúc & Thiết kế Hệ thống iBanking

Tài liệu này tổng hợp toàn bộ các sơ đồ đặc tả kỹ thuật theo đúng thang tiêu chí đánh giá môn học (10.0 / 10.0 điểm), bao gồm:
1. **Sơ đồ Ca sử dụng (Use Case Diagram)** - *Tiêu chí 1 (0.5đ)*
2. **Sơ đồ Thực thể Mối quan hệ (Entity Relationship Diagram - ERD)** - *Tiêu chí 1 (0.5đ) & Tiêu chí 4 (1.0đ)*
3. **Sơ đồ Kiến trúc Microservices (Microservices Architecture Diagram)** - *Tiêu chí 2 (1.5đ)*
4. **Sơ đồ Tuần tự Giao dịch & Xử lý Đồng thời (Saga Concurrency Sequence Diagram)** - *Tiêu chí 6 (1.5đ)*

---

## 1. Sơ đồ Ca sử dụng (Use Case Diagram)

Hệ thống phục vụ 2 tác nhân (Actors):
- **Khách hàng / Người nộp tiền (User)**: Sinh viên hoặc phụ huynh thực hiện đăng nhập, kiểm tra số dư, tra cứu học phí sinh viên theo MSSV, thực hiện nộp tiền qua mã OTP bảo mật và xem lịch sử giao dịch.
- **Dịch vụ Thông báo / Email (Notification Service / SMTP)**: Hệ thống ngoài nhận lệnh gửi OTP và hóa đơn điện tử.

```mermaid
flowchart LR
    User(("fa:fa-user Khách hàng\n(Người nộp tiền)"))
    EmailService(("fa:fa-envelope Email Service\n(SMTP / Notification)"))

    subgraph System ["HỆ THỐNG iBANKING - PHÂN HỆ ĐÓNG HỌC PHÍ"]
        UC1(["Đăng nhập & Xác thực"])
        UC2(["Xem thông tin tài khoản & Số dư"])
        UC3(["Quên / Đặt lại mật khẩu qua OTP"])
        UC4(["Tra cứu học phí theo MSSV"])
        UC5(["Khởi tạo giao dịch thanh toán"])
        UC6(["Nhận mã OTP qua email"])
        UC7(["Xác thực OTP & Chốt giao dịch"])
        UC8(["Xem lịch sử sao kê giao dịch"])
        UC9(["Gửi email hóa đơn xác nhận"])
    end

    User --> UC1
    User --> UC2
    User --> UC3
    User --> UC4
    User --> UC5
    User --> UC7
    User --> UC8

    UC5 -.->|"<<include>>"| UC6
    UC6 --> EmailService
    UC7 -.->|"<<include>>"| UC9
    UC9 --> EmailService
```

---

## 2. Sơ đồ Thực thể Mối quan hệ (ERD - Entity Relationship Diagram)

Sơ đồ quan hệ thực thể chuẩn hóa bám sát cấu trúc cơ sở dữ liệu của đồ án:

```mermaid
erDiagram
    STUDENTS ||--o{ TUITION_FEES : "co (has)"
    USERS ||--o{ TRANSACTIONS : "thuc hien (executes)"
    TUITION_FEES ||--o{ TRANSACTIONS : "duoc thanh toan boi (paid by)"
    TRANSACTIONS ||--o{ OTP_CODES : "xac thuc bang (authenticated by)"
    USERS ||--o{ PASSWORD_RESET_OTPS : "yeu cau reset (requests)"

    STUDENTS {
        string mssv PK "Mã số sinh viên"
        string full_name "Họ tên sinh viên"
    }

    TUITION_FEES {
        int id PK
        string mssv FK "Tham chiếu STUDENTS(mssv)"
        decimal amount "Số tiền học phí (CHECK > 0)"
        string status "Trạng thái: PENDING | PAID"
        int version "Optimistic Locking Version"
    }

    USERS {
        int id PK
        string username UK "Tên đăng nhập / Họ tên / SĐT / Email"
        string password_hash "Mật khẩu mã hóa Bcrypt"
        string full_name "Họ tên chủ tài khoản"
        string phone "Số điện thoại liên hệ"
        string email "Email nhận mã OTP"
        decimal balance "Số dư khả dụng (CHECK >= 0)"
    }

    TRANSACTIONS {
        int id PK
        int user_id FK "ID người thanh toán"
        int tuition_id FK "ID khoản học phí"
        decimal amount "Số tiền thanh toán"
        string status "PENDING_OTP | SUCCESS | FAILED | EXPIRED"
        timestamp created_at "Thời điểm tạo GD"
    }

    OTP_CODES {
        int id PK
        int transaction_id FK "Liên kết TRANSACTIONS(id)"
        string code_hash "Mã OTP băm SHA-256"
        timestamp expires_at "Thời hạn hiệu lực (5 phút)"
        boolean used "Đã sử dụng hay chưa (Single-use)"
    }

    PASSWORD_RESET_OTPS {
        int id PK
        int user_id FK "Liên kết USERS(id)"
        string code_hash "Mã OTP đặt lại mật khẩu"
        timestamp expires_at "Hạn hiệu lực (5 phút)"
        boolean used "Trạng thái sử dụng"
    }
```

### Phân rã Cơ sở dữ liệu theo Microservices (Database-per-Service)
Để đảm bảo tính độc lập và khả năng mở rộng (Scale-out):
- **`account_db`**: Chứa bảng `users`, `password_reset_otps`.
- **`tuition_db`**: Chứa bảng `students`, `tuition_fees`.
- **`payment_db`**: Chứa bảng `transactions`, `otp_codes`.
*(Khóa ngoại giữa `transactions` và `users`/`tuition_fees` là liên kết logic cấp ứng dụng (Logical Cross-Service Reference), tuân thủ nghiêm ngặt nguyên lý Microservices).*

---

## 3. Sơ đồ Kiến trúc Microservices (Microservices Architecture Diagram)

Hệ thống được tổ chức thành 4 Microservices độc lập và 1 Frontend Web Application:

```mermaid
flowchart TB
    subgraph Client ["Tầng Trình duyệt (Client Application)"]
        Web["Frontend Web App\n(React 19 + TypeScript + Redux Toolkit + Bootstrap)\nPort 5173"]
    end

    subgraph Services ["Tầng Microservices Backend (FastAPI Python)"]
        AuthSvc["Auth / Account Service\nPort 8001\n- Quản lý tài khoản & JWT Token\n- Cập nhật số dư (Debit / Credit nguyên tử)\n- Quên mật khẩu & OTP"]
        TuitionSvc["Tuition Service\nPort 8002\n- Tra cứu sinh viên & học phí theo MSSV\n- Chốt học phí (Optimistic Locking)"]
        PaymentSvc["Payment Service (Saga Coordinator)\nPort 8003\n- Tạo GD & sinh mã OTP ngẫu nhiên\n- Xác thực OTP & điều phối Saga\n- Quản lý lịch sử sao kê GD"]
        NotifySvc["Notification Service\nPort 8004\n- Gửi email mã OTP qua SMTP\n- Gửi email hóa đơn xác nhận"]
    end

    subgraph Database ["Tầng Lưu trữ Dữ liệu (PostgreSQL 16 - Port 5433)"]
        DB_Account[("account_db\n(users, password_reset_otps)")]
        DB_Tuition[("tuition_db\n(students, tuition_fees)")]
        DB_Payment[("payment_db\n(transactions, otp_codes)")]
    end

    %% Client Communication
    Web -->|"1. Đăng nhập / Lấy User Info (JWT)"| AuthSvc
    Web -->|"2. Tra cứu học phí theo MSSV"| TuitionSvc
    Web -->|"3. Tạo GD / Nhập OTP / Xem sao kê"| PaymentSvc

    %% Inter-service Communication (Bảo mật bằng X-Internal-Key)
    PaymentSvc -->|"Kiểm tra số dư & Trừ/Hoàn tiền"| AuthSvc
    PaymentSvc -->|"Kiểm tra học phí & Chốt PAID"| TuitionSvc
    PaymentSvc -->|"Yêu cầu gửi Email OTP / Hóa đơn"| NotifySvc
    AuthSvc -->|"Yêu cầu gửi Email Reset Password"| NotifySvc

    %% Database Connections
    AuthSvc --> DB_Account
    TuitionSvc --> DB_Tuition
    PaymentSvc --> DB_Payment
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
        Pay-->>User: 400 Bad Request / 410 Expired
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

## 5. File vẽ Draw.io sẵn sàng trình chiếu

File vẽ chi tiết đã được cập nhật tại:
`docs/ibanking-diagrams.drawio`

Để mở và chỉnh sửa trên giao diện kéo thả trực quan:
1. Mở trình duyệt truy cập: [https://app.diagrams.net](https://app.diagrams.net)
2. Chọn **Open Existing Diagram** -> Chọn file `docs/ibanking-diagrams.drawio` trong thư mục dự án.
3. Toàn bộ các tab sơ đồ (Use Case, Microservices, Sequence, ERD) đã được thiết kế sẵn và tương thích 100%.
