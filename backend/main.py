"""
台股K線修練場 — 後端 API 主程式
FastAPI Application Entry Point
"""
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from dotenv import load_dotenv

from database import engine
from models import Base
from routers import game, auth

load_dotenv()

# ─────────────────────────────────────────
# 建立 FastAPI App
# ─────────────────────────────────────────
app = FastAPI(
    title="台股K線修練場 API",
    description="Taiwan Stock K-Line Trainer Backend",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc",
)

# ─────────────────────────────────────────
# CORS（允許前端跨域呼叫）
# ─────────────────────────────────────────
cors_origins_env = os.getenv("CORS_ORIGINS", "*")
cors_origins = cors_origins_env.split(",") if cors_origins_env != "*" else ["*"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────
# 啟動時建立資料表（若不存在）
# ─────────────────────────────────────────
@app.on_event("startup")
def startup():
    Base.metadata.create_all(bind=engine)
    print("[DB] Database tables ready (資料庫資料表已就緒)")


# ─────────────────────────────────────────
# 掛載 API Routers
# ─────────────────────────────────────────
app.include_router(game.router)
app.include_router(auth.router)


# ─────────────────────────────────────────
# 健康檢查（Railway 部署用）
# ─────────────────────────────────────────
@app.get("/api/health")
def health():
    return {"status": "ok", "message": "台股K線修練場 API 運行中"}


# ─────────────────────────────────────────
# 掛載前端靜態檔（同域部署：API 在 /api/*，其餘路徑服務前端）
# 注意：必須掛在所有 API router 之後，否則會攔截 /api 路由
# ─────────────────────────────────────────
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
if os.path.exists(os.path.join(FRONTEND_DIR, "index.html")):
    app.mount("/", StaticFiles(directory=FRONTEND_DIR, html=True), name="frontend")
    print(f"[Static] Serving frontend from: {FRONTEND_DIR}")


# ─────────────────────────────────────────
# 本機開發啟動
# ─────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
