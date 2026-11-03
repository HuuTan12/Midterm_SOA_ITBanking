import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import jwt
from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

engine = create_engine(os.environ["AUTH_DATABASE_URL"],
                       connect_args={"connect_timeout": 5})
JWT_SECRET = os.environ["JWT_SECRET"]
INTERNAL_KEY = os.environ["INTERNAL_API_KEY"]

app = FastAPI(title="Auth Service")
app.add_middleware(CORSMiddleware, allow_origins=["*"],
                   allow_methods=["*"], allow_headers=["*"])


class LoginReq(BaseModel):
    username: str
    password: str


class Amount(BaseModel):
    amount: int = Field(gt=0)


def user_id_from(authorization: str | None) -> int:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(401, "Thiếu token")
    try:
        payload = jwt.decode(authorization[7:], JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, "Token không hợp lệ hoặc đã hết hạn")
    return int(payload["sub"])


def require_internal(key: str | None):
    if key != INTERNAL_KEY:
        raise HTTPException(403, "Forbidden")


@app.post("/auth/login")
def login(body: LoginReq):
    # crypt() của pgcrypto kiểm tra bcrypt ngay trong DB, khớp hash trong init.sql
    with engine.connect() as c:
        user = c.execute(text(
            "SELECT id FROM users "
            "WHERE username = :u AND password_hash = crypt(:p, password_hash)"
        ), {"u": body.username, "p": body.password}).mappings().first()
    if not user:
        raise HTTPException(401, "Sai username hoặc password")
    token = jwt.encode(
        {"sub": str(user["id"]),
         "exp": datetime.now(timezone.utc) + timedelta(hours=2)},
        JWT_SECRET, algorithm="HS256")
    return {"access_token": token, "token_type": "bearer"}


@app.get("/users/me")
def me(authorization: str | None = Header(None)):
    uid = user_id_from(authorization)
    with engine.connect() as c:
        u = c.execute(text(
            "SELECT id, username, full_name, phone, email, balance "
            "FROM users WHERE id = :id"), {"id": uid}).mappings().first()
    if not u:
        raise HTTPException(401, "User không tồn tại")
    return dict(u)


@app.post("/internal/accounts/{user_id}/debit")
def debit(user_id: int, body: Amount, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    with engine.begin() as c:
        row = c.execute(text(
            "UPDATE users SET balance = balance - :a "
            "WHERE id = :id AND balance >= :a RETURNING balance"),
            {"a": body.amount, "id": user_id}).first()
    if not row:
        raise HTTPException(402, "Số dư không đủ")
    return {"balance": row[0]}


@app.post("/internal/accounts/{user_id}/credit")   # dùng để hoàn tiền
def credit(user_id: int, body: Amount, x_internal_key: str | None = Header(None)):
    require_internal(x_internal_key)
    with engine.begin() as c:
        row = c.execute(text(
            "UPDATE users SET balance = balance + :a WHERE id = :id RETURNING balance"),
            {"a": body.amount, "id": user_id}).first()
    if not row:
        raise HTTPException(404, "User không tồn tại")
    return {"balance": row[0]}