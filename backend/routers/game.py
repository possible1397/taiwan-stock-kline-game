"""
遊戲 API Router
處理抽題、提交答案、取得進度等遊戲核心操作
"""
import random
import uuid
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import get_db
from models import StockInfo, StockDaily, GameSession, User
from game_logic import (
    calc_xp_earned, calc_level, get_rank_title,
    check_new_achievements, AVAILABLE_INDICATORS, get_unlock_slots
)

router = APIRouter(prefix="/api/game", tags=["game"])

# ─────────────────────────────────────────
# 免費額度設定
# ─────────────────────────────────────────
FREE_ROUNDS_PER_DAY = 20       # 免費用戶每日題數
FREE_STOCK_POOL_SIZE = 50      # 免費用戶可玩的股票池（前 N 大市值）
FREE_YEARS_LIMIT = 3           # 免費用戶資料只有近 N 年


# ─────────────────────────────────────────
# Pydantic Schema
# ─────────────────────────────────────────
class RoundResponse(BaseModel):
    session_id: int
    stock_name: str           # 盲測模式下回傳 "???"
    stock_code: str           # 盲測模式下回傳 "???"
    history_data: list[dict]  # [{time, open, high, low, close, volume}, ...]
    horizon: int
    is_blind: bool
    # 用戶狀態
    capital: float
    level: int
    experience: int
    xp_next_level: int
    rank_icon: str
    rank_title: str
    # 免費用戶剩餘額度
    free_rounds_remaining: Optional[int] = None


class SubmitRequest(BaseModel):
    session_id: int
    guess: str          # "UP" / "DOWN"
    position_pct: int   # 10~100
    is_blind: bool
    horizon: int


class SubmitResponse(BaseModel):
    is_correct: bool
    actual_direction: str
    stock_name: str
    stock_code: str
    price_start: float
    price_end: float
    stock_return_pct: float
    pnl: float
    capital_after: float
    xp_earned: int
    level_before: int
    level_after: int
    level_up: bool
    new_achievements: list[dict]  # [{key, name, icon, xp_reward}]
    future_data: list[dict]
    rank_icon: str
    rank_title: str


# ─────────────────────────────────────────
# 工具函式
# ─────────────────────────────────────────
def get_or_create_guest_state(session_token: str, db: Session) -> dict:
    """訪客狀態（存在 DB game_sessions 彙總，或用暫存）"""
    # 簡化版：訪客狀態只靠前端 localStorage，API 不追蹤
    return {}


def get_eligible_stocks(db: Session, is_premium: bool) -> list[StockInfo]:
    """取得符合條件的股票池"""
    query = db.query(StockInfo).filter(StockInfo.is_active == True)

    if not is_premium:
        # 免費用戶：只取代號數字較小的前50支（大市值代理）
        query = query.order_by(StockInfo.code).limit(FREE_STOCK_POOL_SIZE)

    return query.all()


def get_stock_window(
    db: Session,
    stock: StockInfo,
    horizon: int,
    is_premium: bool
) -> Optional[tuple[list, list]]:
    """
    取得一段歷史視窗（120天歷史 + horizon天未來）
    回傳 (history_rows, future_rows) 或 None 表示資料不足
    """
    history_length = 120

    # 免費用戶只能看近3年資料
    if not is_premium:
        earliest = date.today() - timedelta(days=365 * FREE_YEARS_LIMIT)
        all_data = (
            db.query(StockDaily)
            .filter(
                StockDaily.stock_id == stock.id,
                StockDaily.date >= earliest
            )
            .order_by(StockDaily.date)
            .all()
        )
    else:
        all_data = (
            db.query(StockDaily)
            .filter(StockDaily.stock_id == stock.id)
            .order_by(StockDaily.date)
            .all()
        )

    total = len(all_data)
    if total < history_length + horizon:
        return None

    max_start = total - history_length - horizon
    start_idx = random.randint(0, max_start)

    history = all_data[start_idx: start_idx + history_length]
    future = all_data[start_idx + history_length: start_idx + history_length + horizon]

    return history, future


def rows_to_dict(rows: list[StockDaily]) -> list[dict]:
    return [
        {
            "time": r.date.isoformat(),
            "open": r.open,
            "high": r.high,
            "low": r.low,
            "close": r.close,
            "volume": r.volume,
        }
        for r in rows
    ]


# ─────────────────────────────────────────
# GET /api/game/round  —  抽取新題目
# ─────────────────────────────────────────
@router.get("/round", response_model=RoundResponse)
def get_new_round(
    horizon: int = 5,
    is_blind: bool = True,
    user_id: Optional[int] = None,
    session_token: Optional[str] = Header(None, alias="X-Session-Token"),
    db: Session = Depends(get_db),
):
    """
    抽取一道新題目（隨機股票 + 隨機歷史區間）。
    - 未登入用戶：使用 X-Session-Token header 識別，享有每日免費額度
    - 登入付費用戶：無限制
    """
    if horizon not in (1, 5, 20):
        raise HTTPException(status_code=400, detail="horizon 必須是 1、5 或 20")

    # 取得用戶資訊（目前 MVP 暫不做 JWT 驗證，先用 user_id query param）
    user = None
    is_premium = False
    capital = 100000.0
    level = 1
    experience = 0
    total_rounds = 0
    total_wins = 0
    streak = 0

    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            is_premium = user.is_premium
            capital = user.capital
            level = user.level
            experience = user.experience
            total_rounds = user.total_rounds
            total_wins = user.total_wins
            streak = user.current_streak

    win_rate = (total_wins / total_rounds * 100) if total_rounds > 0 else 0
    rank_icon, rank_title = get_rank_title(level, win_rate, capital)

    # 選股
    stocks = get_eligible_stocks(db, is_premium)
    if not stocks:
        raise HTTPException(status_code=503, detail="股票資料庫尚未初始化，請先執行資料爬取腳本")

    # 最多試 10 次找到有足夠資料的股票
    for _ in range(10):
        stock = random.choice(stocks)
        result = get_stock_window(db, stock, horizon, is_premium)
        if result is not None:
            history_rows, future_rows = result
            break
    else:
        raise HTTPException(status_code=503, detail="無法找到符合條件的股票資料，請確認資料已爬取完成")

    # 建立 GameSession 紀錄（暫存題目，submit 時對照）
    session = GameSession(
        user_id=user_id,
        session_token=session_token or str(uuid.uuid4()),
        stock_id=stock.id,
        start_date=history_rows[0].date,
        end_date=history_rows[-1].date,
        horizon=horizon,
    )
    db.add(session)
    db.commit()
    db.refresh(session)

    # 盲測模式下隱藏股票名稱
    display_name = "神秘台股 (???)" if is_blind else f"{stock.name} ({stock.code})"
    display_code = "???" if is_blind else stock.code

    from game_logic import xp_for_next_level
    xp_next = xp_for_next_level(level)

    free_remaining = None
    if not is_premium and not user_id:
        free_remaining = FREE_ROUNDS_PER_DAY  # MVP 暫不追蹤，後續加上 Redis

    return RoundResponse(
        session_id=session.id,
        stock_name=display_name,
        stock_code=display_code,
        history_data=rows_to_dict(history_rows),
        horizon=horizon,
        is_blind=is_blind,
        capital=capital,
        level=level,
        experience=experience,
        xp_next_level=xp_next,
        rank_icon=rank_icon,
        rank_title=rank_title,
        free_rounds_remaining=free_remaining,
    )


# ─────────────────────────────────────────
# POST /api/game/submit  —  提交答案
# ─────────────────────────────────────────
@router.post("/submit", response_model=SubmitResponse)
def submit_answer(
    body: SubmitRequest,
    db: Session = Depends(get_db),
):
    """提交玩家的漲跌預測，結算損益、XP、成就"""

    session = db.query(GameSession).filter(GameSession.id == body.session_id).first()
    if not session:
        raise HTTPException(status_code=404, detail="找不到對應的題目，請重新抽題")
    if session.guess is not None:
        raise HTTPException(status_code=400, detail="這題已經作答過了")

    # 取出未來資料
    future_rows = (
        db.query(StockDaily)
        .filter(
            StockDaily.stock_id == session.stock_id,
            StockDaily.date > session.end_date,
        )
        .order_by(StockDaily.date)
        .limit(body.horizon)
        .all()
    )

    if not future_rows or len(future_rows) < body.horizon:
        raise HTTPException(status_code=503, detail="找不到未來資料，資料可能不完整")

    # 計算漲跌
    price_start = (
        db.query(StockDaily)
        .filter(
            StockDaily.stock_id == session.stock_id,
            StockDaily.date == session.end_date
        )
        .first()
    )
    if not price_start:
        raise HTTPException(status_code=503, detail="找不到起始價格資料")

    p_start = price_start.close
    p_end = future_rows[-1].close
    stock_return = (p_end - p_start) / p_start
    stock_return_pct = round(stock_return * 100, 2)

    actual = "UP" if p_end > p_start else ("DOWN" if p_end < p_start else "DRAW")
    
    # 取得用戶狀態
    user = None
    if session.user_id:
        user = db.query(User).filter(User.id == session.user_id).first()

    capital = user.capital if user else 100000.0
    level_before = user.level if user else 1
    experience = user.experience if user else 0

    if body.guess == "PASS":
        # 觀望模式：不計題數、不計勝負、不計損益、不破壞連勝與成就
        is_correct = False
        pnl = 0.0
        xp_earned = 0
        total_rounds = (user.total_rounds if user else 0)
        total_wins = (user.total_wins if user else 0)
        streak = (user.current_streak if user else 0)
        max_streak = (user.max_streak if user else 0)
        new_experience = experience
        level_after = level_before
        level_up = False
        new_achievements_detail = []
        capital_after = capital
        win_rate = (total_wins / total_rounds * 100) if total_rounds > 0 else 0
        rank_icon, rank_title = get_rank_title(level_after, win_rate, capital_after)
    else:
        is_correct = (body.guess == actual) or (actual == "DRAW")
        total_rounds = (user.total_rounds if user else 0) + 1
        total_wins = (user.total_wins if user else 0) + (1 if is_correct else 0)
        streak = ((user.current_streak if user else 0) + 1) if is_correct else 0
        max_streak = max(user.max_streak if user else 0, streak)

        # 損益計算
        invested = capital * (body.position_pct / 100)
        if body.guess == "UP":
            pnl = invested * stock_return
        else:
            pnl = invested * (-stock_return)

        capital_after = max(1000.0, round(capital + pnl, 2))

        # XP 計算
        xp_earned = calc_xp_earned(is_correct, streak, body.horizon, body.position_pct)
        new_experience = experience + xp_earned
        level_after = calc_level(new_experience)
        level_up = level_after > level_before

        # 稱號
        win_rate = (total_wins / total_rounds * 100) if total_rounds > 0 else 0
        rank_icon, rank_title = get_rank_title(level_after, win_rate, capital_after)

        # 成就檢查
        existing_keys = set()
        if user:
            existing_keys = {ua.achievement_id for ua in user.achievements}  # 先簡化
        new_ach_keys = check_new_achievements(
            existing_keys=existing_keys,
            total_rounds=total_rounds,
            total_wins=total_wins,
            streak=streak,
            capital=capital_after,
            level=level_after,
            is_blind_mode=body.is_blind,
            horizon=body.horizon,
            is_correct=is_correct,
        )

        # 成就詳細資訊
        from game_logic import ACHIEVEMENT_DEFINITIONS
        ach_map = {k: (k, name, desc, icon, xp) for k, name, desc, icon, xp in ACHIEVEMENT_DEFINITIONS}
        new_achievements_detail = []
        for key in new_ach_keys:
            if key in ach_map:
                k, name, desc, icon, xp = ach_map[key]
                new_achievements_detail.append({"key": k, "name": name, "icon": icon, "xp_reward": xp})
                xp_earned += xp
                new_experience += xp

    # 更新 GameSession
    session.guess = body.guess
    session.actual = actual
    session.is_correct = is_correct
    session.price_start = p_start
    session.price_end = p_end
    session.stock_return_pct = stock_return_pct
    session.position_pct = body.position_pct
    session.pnl = pnl
    session.capital_after = capital_after
    session.xp_earned = xp_earned
    db.add(session)

    # 更新用戶狀態
    if user:
        user.capital = capital_after
        user.total_rounds = total_rounds
        user.total_wins = total_wins
        user.current_streak = streak
        user.max_streak = max_streak
        user.experience = new_experience
        user.level = level_after
        db.add(user)

    db.commit()

    stock_obj = db.query(StockInfo).filter(StockInfo.id == session.stock_id).first()

    return SubmitResponse(
        is_correct=is_correct,
        actual_direction=actual,
        stock_name=stock_obj.name if stock_obj else "???",
        stock_code=stock_obj.code if stock_obj else "???",
        price_start=p_start,
        price_end=p_end,
        stock_return_pct=stock_return_pct,
        pnl=pnl,
        capital_after=capital_after,
        xp_earned=xp_earned,
        level_before=level_before,
        level_after=level_after,
        level_up=level_up,
        new_achievements=new_achievements_detail,
        future_data=rows_to_dict(future_rows),
        rank_icon=rank_icon,
        rank_title=rank_title,
    )


# ─────────────────────────────────────────
# GET /api/game/indicators  —  可用技術指標清單
# ─────────────────────────────────────────
@router.get("/indicators")
def get_indicators(user_id: Optional[int] = None, db: Session = Depends(get_db)):
    """取得技術指標清單，標注哪些已解鎖"""
    unlocked_keys = set()
    unlock_slots_available = 0

    if user_id:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            unlocked_keys = {ui.indicator_key for ui in user.unlocked_indicators}
            total_slots = get_unlock_slots(user.level)
            unlock_slots_available = max(0, total_slots - len(unlocked_keys))

    return {
        "indicators": [
            {**ind, "is_unlocked": ind["key"] in unlocked_keys}
            for ind in AVAILABLE_INDICATORS
        ],
        "unlock_slots_available": unlock_slots_available,
    }
