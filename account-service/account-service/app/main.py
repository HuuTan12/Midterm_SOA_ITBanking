from fastapi import FastAPI

from app.database import Base, engine
from app.routers import auth, users, internal

# Demo/dev only: tự tạo bảng khi start app.
# Khi lên production nên dùng Alembic để quản lý migration thay vì create_all.
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Account Service", version="1.0.0")

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(internal.router)


@app.get("/health")
def health_check():
    return {"status": "ok", "service": "account-service"}
