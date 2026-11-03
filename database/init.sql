-- =====================================================
-- ACCOUNT_DB : Account service
-- =====================================================
CREATE DATABASE account_db;
\connect account_db

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE users (
    id            SERIAL PRIMARY KEY,
    username      VARCHAR(50)  NOT NULL UNIQUE,
    password_hash VARCHAR(100) NOT NULL,
    full_name     VARCHAR(100) NOT NULL,
    phone         VARCHAR(15)  NOT NULL,
    email         VARCHAR(100) NOT NULL,
    balance       BIGINT       NOT NULL DEFAULT 0 CHECK (balance >= 0)
);

-- Mật khẩu mẫu của cả 3 user là: 123456
-- Nhớ đổi email thành email thật của bạn để nhận OTP khi test
INSERT INTO users (username, password_hash, full_name, phone, email, balance) VALUES
('tan',  crypt('123456', gen_salt('bf', 10)), 'Nguyen Huu Tan',  '0901111111', 'tan@example.com',  20000000),
('thai', crypt('123456', gen_salt('bf', 10)), 'Tran Minh Thai',  '0902222222', 'thai@example.com',  5000000),
('viet', crypt('123456', gen_salt('bf', 10)), 'Le Quoc Viet',    '0903333333', 'viet@example.com', 30000000);


-- =====================================================
-- TUITION_DB : Tuition service
-- =====================================================
CREATE DATABASE tuition_db;
\connect tuition_db

CREATE TABLE students (
    mssv      VARCHAR(20)  PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL
);

CREATE TABLE tuition_fees (
    id         SERIAL PRIMARY KEY,
    mssv       VARCHAR(20) NOT NULL UNIQUE REFERENCES students(mssv),
    amount     BIGINT      NOT NULL CHECK (amount > 0),
    status     VARCHAR(20) NOT NULL DEFAULT 'PENDING'
               CHECK (status IN ('PENDING', 'PAID')),
    version    INT         NOT NULL DEFAULT 1,
    created_at TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO students (mssv, full_name) VALUES
('524H0028', 'Nguyen Huu Tan'),
('524H0029', 'Tran Minh Thai'),
('524H0030', 'Le Quoc Viet'),
('524H0031', 'Pham Gia Bao');

INSERT INTO tuition_fees (mssv, amount, status, version) VALUES
('524H0028', 15000000, 'PENDING', 1),
('524H0029', 12500000, 'PENDING', 1),
('524H0030', 12500000, 'PAID',    2),
('524H0031', 18000000, 'PENDING', 1);


-- =====================================================
-- PAYMENT_DB : Payment service
-- (user_id, tuition_id là tham chiếu logic, không có FK
--  vì nằm ở database của service khác)
-- =====================================================
CREATE DATABASE payment_db;
\connect payment_db

CREATE TABLE transactions (
    id              SERIAL PRIMARY KEY,
    user_id         INT         NOT NULL,
    mssv            VARCHAR(20) NOT NULL,
    tuition_id      INT         NOT NULL,
    tuition_version INT         NOT NULL,
    amount          BIGINT      NOT NULL CHECK (amount > 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'PENDING_OTP'
                    CHECK (status IN ('PENDING_OTP', 'SUCCESS', 'FAILED', 'EXPIRED')),
    fail_reason     VARCHAR(255),
    created_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_transactions_user ON transactions(user_id, created_at DESC);

CREATE TABLE otp_codes (
    id             SERIAL PRIMARY KEY,
    transaction_id INT         NOT NULL REFERENCES transactions(id),
    code_hash      VARCHAR(64) NOT NULL,
    expires_at     TIMESTAMP   NOT NULL,
    used           BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Không cho 2 OTP chưa dùng có cùng mã (đáp ứng yêu cầu "không trùng OTP đang có hiệu lực")
CREATE UNIQUE INDEX uq_otp_active_code ON otp_codes(code_hash) WHERE used = FALSE;