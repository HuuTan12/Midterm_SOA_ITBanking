# Đặt lại dữ liệu mẫu về trạng thái ban đầu (khớp với database/init.sql)
docker exec -i ibanking_postgres psql -U postgres -d account_db -c "UPDATE users SET balance = CASE username WHEN 'tan' THEN 20000000 WHEN 'thai' THEN 5000000 WHEN 'viet' THEN 30000000 WHEN 'nam' THEN 25000000 WHEN 'lan' THEN 18000000 WHEN 'mai' THEN 8000000 ELSE balance END;"
docker exec -i ibanking_postgres psql -U postgres -d account_db -c "TRUNCATE password_reset_otps RESTART IDENTITY;"
docker exec -i ibanking_postgres psql -U postgres -d tuition_db -c "UPDATE tuition_fees SET status = CASE mssv WHEN '524H0030' THEN 'PAID' ELSE 'PENDING' END, version = CASE mssv WHEN '524H0030' THEN 2 ELSE 1 END;"
docker exec -i ibanking_postgres psql -U postgres -d payment_db -c "TRUNCATE otp_codes, transactions RESTART IDENTITY;"
