"""Chạy: python seed.py -- tạo vài user mẫu để test API."""
from app.database import Base, engine, SessionLocal
from app.models import User
from app.auth import hash_password

Base.metadata.create_all(bind=engine)

db = SessionLocal()

sample_users = [
    {
        "username": "alice",
        "password": "123456",
        "full_name": "Nguyen Thi Alice",
        "phone": "0900000001",
        "email": "alice@example.com",
        "balance": 5_000_000,
    },
    {
        "username": "bob",
        "password": "123456",
        "full_name": "Tran Van Bob",
        "phone": "0900000002",
        "email": "bob@example.com",
        "balance": 200_000,
    },
]

for u in sample_users:
    existing = db.query(User).filter(User.username == u["username"]).first()
    if existing:
        print(f"Bỏ qua, đã tồn tại: {u['username']}")
        continue
    user = User(
        username=u["username"],
        password_hash=hash_password(u["password"]),
        full_name=u["full_name"],
        phone=u["phone"],
        email=u["email"],
        balance=u["balance"],
    )
    db.add(user)
    print(f"Đã tạo user: {u['username']} (password: {u['password']})")

db.commit()
db.close()
