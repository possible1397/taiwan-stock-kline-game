"""
資料庫 ORM 模型定義
Database ORM models
"""
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Date, DateTime,
    Boolean, ForeignKey, Text, UniqueConstraint, Index
)
from sqlalchemy.orm import relationship
from database import Base


# ─────────────────────────────────────────
# 股票基本資料
# ─────────────────────────────────────────
class StockInfo(Base):
    __tablename__ = "stock_info"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(10), unique=True, nullable=False, index=True)   # 股票代號 e.g. "2330"
    name = Column(String(50), nullable=False)                             # 股票名稱 e.g. "台積電"
    market = Column(String(10), nullable=False)                          # "TWSE" 或 "TPEx"
    industry = Column(String(50), nullable=True)                         # 產業別
    is_active = Column(Boolean, default=True)                            # 是否仍在交易
    listing_date = Column(Date, nullable=True)                           # 上市/上櫃日期
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    daily_data = relationship("StockDaily", back_populates="stock", cascade="all, delete-orphan")


# ─────────────────────────────────────────
# 股票每日 K 線資料
# ─────────────────────────────────────────
class StockDaily(Base):
    __tablename__ = "stock_daily"

    id = Column(Integer, primary_key=True, index=True)
    stock_id = Column(Integer, ForeignKey("stock_info.id"), nullable=False)
    date = Column(Date, nullable=False, index=True)
    open = Column(Float, nullable=False)
    high = Column(Float, nullable=False)
    low = Column(Float, nullable=False)
    close = Column(Float, nullable=False)
    volume = Column(Float, nullable=False)

    stock = relationship("StockInfo", back_populates="daily_data")

    __table_args__ = (
        UniqueConstraint("stock_id", "date", name="uq_stock_daily"),
        Index("idx_stock_daily_stock_date", "stock_id", "date"),
    )


# ─────────────────────────────────────────
# 用戶帳號
# ─────────────────────────────────────────
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    username = Column(String(50), unique=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    is_active = Column(Boolean, default=True)
    is_premium = Column(Boolean, default=False)          # 付費用戶
    premium_until = Column(DateTime, nullable=True)      # 訂閱到期時間
    created_at = Column(DateTime, default=datetime.utcnow)

    # 遊戲進度（彙總數據，快速讀取用）
    capital = Column(Float, default=100000.0)
    total_rounds = Column(Integer, default=0)
    total_wins = Column(Integer, default=0)
    current_streak = Column(Integer, default=0)
    max_streak = Column(Integer, default=0)
    experience = Column(Integer, default=0)              # 總 XP
    level = Column(Integer, default=1)                   # 等級
    is_taiwan_style = Column(Boolean, default=True)      # 台股/美股顏色
    preferred_mode = Column(String(20), default="blind") # blind / classic
    preferred_horizon = Column(Integer, default=5)       # 1 / 5 / 20

    # 免費試玩額度（未登入/未付費用戶）
    free_rounds_today = Column(Integer, default=0)       # 今日已玩題數
    free_rounds_reset_date = Column(Date, nullable=True) # 上次重置日期

    sessions = relationship("GameSession", back_populates="user")
    unlocked_indicators = relationship("UserIndicator", back_populates="user")
    achievements = relationship("UserAchievement", back_populates="user")


# ─────────────────────────────────────────
# 每次答題紀錄
# ─────────────────────────────────────────
class GameSession(Base):
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # null = 訪客
    session_token = Column(String(64), nullable=True, index=True)     # 訪客用 token

    stock_id = Column(Integer, ForeignKey("stock_info.id"), nullable=False)
    start_date = Column(Date, nullable=False)     # 歷史顯示起點
    end_date = Column(Date, nullable=False)       # 歷史顯示終點（答題點）
    horizon = Column(Integer, nullable=False)     # 預測天數 1/5/20

    guess = Column(String(10), nullable=True)     # "UP" / "DOWN" / "PASS"
    actual = Column(String(10), nullable=True)    # "UP" / "DOWN" / "DRAW"
    is_correct = Column(Boolean, nullable=True)

    price_start = Column(Float, nullable=True)    # 答題點收盤價
    price_end = Column(Float, nullable=True)      # 預測點收盤價
    stock_return_pct = Column(Float, nullable=True)
    position_pct = Column(Integer, nullable=True) # 倉位比例 10~100
    pnl = Column(Float, nullable=True)            # 本次損益
    capital_after = Column(Float, nullable=True)  # 答題後帳戶資金
    xp_earned = Column(Integer, default=0)        # 本題獲得 XP

    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="sessions")
    stock = relationship("StockInfo")


# ─────────────────────────────────────────
# 技術指標解鎖
# ─────────────────────────────────────────
class UserIndicator(Base):
    __tablename__ = "user_indicators"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    indicator_key = Column(String(30), nullable=False)  # e.g. "MA5", "MACD", "RSI"
    unlocked_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="unlocked_indicators")

    __table_args__ = (
        UniqueConstraint("user_id", "indicator_key", name="uq_user_indicator"),
    )


# ─────────────────────────────────────────
# 成就系統
# ─────────────────────────────────────────
class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(50), unique=True, nullable=False)   # e.g. "streak_10"
    name = Column(String(100), nullable=False)              # e.g. "連勝達人"
    description = Column(Text, nullable=True)
    icon = Column(String(10), nullable=True)                # emoji
    xp_reward = Column(Integer, default=0)

    user_achievements = relationship("UserAchievement", back_populates="achievement")


class UserAchievement(Base):
    __tablename__ = "user_achievements"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    achievement_id = Column(Integer, ForeignKey("achievements.id"), nullable=False)
    earned_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="achievements")
    achievement = relationship("Achievement", back_populates="user_achievements")

    __table_args__ = (
        UniqueConstraint("user_id", "achievement_id", name="uq_user_achievement"),
    )


# ─────────────────────────────────────────
# 每日挑戰（先建好，之後開放）
# ─────────────────────────────────────────
class DailyChallenge(Base):
    __tablename__ = "daily_challenges"

    id = Column(Integer, primary_key=True, index=True)
    challenge_date = Column(Date, unique=True, nullable=False, index=True)
    stock_id = Column(Integer, ForeignKey("stock_info.id"), nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    horizon = Column(Integer, nullable=False)
    actual_direction = Column(String(10), nullable=True)  # 揭曉後填入

    stock = relationship("StockInfo")
