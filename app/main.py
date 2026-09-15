from fastapi import FastAPI

from .database import Base, engine
from .routers import payment

# Tạo bảng nếu chưa tồn tại (dùng cho demo/dev; project thật nên dùng Alembic migration)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Payment Service", version="1.0.0")

app.include_router(payment.router, prefix="/api/payment", tags=["payment"])


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "payment-service"}