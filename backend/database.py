"""
資料庫連線設定
Database connection setup using SQLAlchemy
"""
import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

# 本地開發：若未設定 DATABASE_URL，自動使用 SQLite
if not DATABASE_URL:
    _db_path = os.path.join(os.path.dirname(__file__), "stock_game.db")
    DATABASE_URL = f"sqlite:///{_db_path}"
    print(f"[DB] Using local SQLite: {_db_path}")

# Railway 有時會給 postgres:// 開頭，需轉換成 postgresql://
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# SQLite 不支援 pool_size / max_overflow，依資料庫類型建立 engine
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},  # SQLite 多執行緒支援
    )
else:
    engine = create_engine(
        DATABASE_URL,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,  # 自動偵測斷線並重連
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """FastAPI dependency: 取得資料庫 session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
