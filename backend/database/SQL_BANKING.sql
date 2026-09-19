CREATE TABLE IF NOT EXISTS Students (
    mssv VARCHAR(255) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS TuitionFees (
    id SERIAL PRIMARY KEY,
    mssv VARCHAR(20) NOT NULL,
    amount DECIMAL(12, 2) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    version INT NOT NULL,
    FOREIGN KEY (mssv) REFERENCES Students(mssv)
);

INSERT INTO Students (mssv, full_name, email) VALUES 
('524H0028', 'Nguyen Huu Tan', 'tan@student.tdtu.edu.vn'),
('524H0029', 'Tran Minh Thai', 'thai@student.tdtu.edu.vn'),
('524H0030', 'Le Quoc Viet', 'viet@student.tdtu.edu.vn');

INSERT INTO TuitionFees (mssv, amount, status, version) VALUES 
('524H0028', 15000000.00, 'PENDING', 1), 
('524H0029', 12500000.00, 'PENDING', 1), 
('524H0030', 12500000.00, 'PAID', 2);

-- Các lệnh bên dưới vẫn giữ nguyên vì PostgreSQL dùng chung cú pháp
DELETE FROM TuitionFees
WHERE mssv IN ('504070', '504071', '504072');

DELETE FROM Students
WHERE mssv IN ('504070', '504071', '504072');

SELECT * FROM TuitionFees
WHERE mssv = '524H0028';

SELECT *
FROM TuitionFees
WHERE status = 'PENDING';