import os
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, text

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

engine = create_engine(os.environ["TUITION_DATABASE_URL"],
                       connect_args={"connect_timeout": 5})

app = FastAPI(title="Tuition Service API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/tuition/{mssv}")
def get_tuition(mssv: str):
    with engine.connect() as connection:
        result = connection.execute(text("""
            SELECT s.mssv, s.full_name,
                   t.id AS tuition_id, t.amount, t.status, t.version
            FROM students s
            LEFT JOIN tuition_fees t ON s.mssv = t.mssv
            WHERE s.mssv = :mssv
        """), {"mssv": mssv}).mappings().first()
    if not result:
        raise HTTPException(404, f"Không tìm thấy sinh viên có MSSV: {mssv}")
    return dict(result)


class PayReq(BaseModel):
    version: int


@app.post("/internal/tuition/{tuition_id}/pay")
def pay(tuition_id: int, body: PayReq, x_internal_key: str | None = Header(None)):
    if x_internal_key != os.environ["INTERNAL_API_KEY"]:
        raise HTTPException(403, "Forbidden")
    with engine.begin() as conn:
        row = conn.execute(text(
            "UPDATE tuition_fees SET status = 'PAID', version = version + 1 "
            "WHERE id = :id AND status = 'PENDING' AND version = :v RETURNING id"),
            {"id": tuition_id, "v": body.version}).first()
    if not row:
        raise HTTPException(409, "Học phí đã được thanh toán hoặc đã thay đổi")
    return {"ok": True}