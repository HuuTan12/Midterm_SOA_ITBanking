from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
from fastapi.middleware.cors import CORSMiddleware

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
engine = create_engine(DATABASE_URL)

app = FastAPI(title="Tuition Service API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/tuition/{mssv}")
def get_tuition(mssv:str):
    with engine.connect() as connection:
        query = text("""
            SELECT 
                s.mssv, 
                s.full_name, 
                t.id AS tuition_id, 
                t.amount, 
                t.status,
                t.version  
            FROM Students s
            LEFT JOIN TuitionFees t ON s.mssv = t.mssv
            WHERE s.mssv = :mssv
        """)
        result = connection.execute(query, {"mssv": mssv}).mappings().first()
        
        if not result:
            # Dùng HTTPException để bắn lỗi chuẩn REST
            raise HTTPException(status_code=404, detail=f"No tuition record found for student with MSSV: {mssv}")
            
        return dict(result)


class PaymentRequest(BaseModel):
    mssv: str
    
    version: int

@app.post("/api/tuition/pay")
def pay_tuition(req: PaymentRequest):
    with engine.begin() as connection:  # Sử dụng begin() để tự động commit hoặc rollback
        query = text("""
            UPDATE TuitionFees
            SET status = 'PAID', version = version + 1
            WHERE mssv = :mssv 
            AND status = 'PENDING'
            AND version = :version

        """)
        result = connection.execute(query, {"mssv": req.mssv, "version": req.version})
        if result.rowcount == 0:
            raise HTTPException(
                status_code=409, 
                detail="Thanh toán thất bại: Xung đột dữ liệu (có thể do khoản phí đã được đóng hoặc sai version)!"
            )
            
        return {
            "status": "success",
            "message": "Cập nhật thanh toán thành công"
        }