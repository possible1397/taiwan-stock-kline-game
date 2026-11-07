"""
遊戲核心邏輯
XP 計算、等級系統、稱號、成就判斷
"""
from dataclasses import dataclass
from typing import Optional

# ─────────────────────────────────────────
# 等級 XP 門檻表（level -> 需要累積 XP）
# ─────────────────────────────────────────
LEVEL_XP_TABLE = [
    0,      # Lv1  起始
    100,    # Lv2
    250,    # Lv3
    450,    # Lv4
    700,    # Lv5
    1000,   # Lv6
    1400,   # Lv7
    1900,   # Lv8
    2500,   # Lv9
    3200,   # Lv10
    4000,   # Lv11
    5000,   # Lv12
    6200,   # Lv13
    7600,   # Lv14
    9200,   # Lv15
    11000,  # Lv16
    13200,  # Lv17
    15700,  # Lv18
    18500,  # Lv19
    22000,  # Lv20（最高）
]
MAX_LEVEL = len(LEVEL_XP_TABLE)


# ─────────────────────────────────────────
# 稱號系統
# ─────────────────────────────────────────
RANK_TITLES = [
    # (最低等級, 最低勝率%, 最低資金, icon, 稱號)
    (1,  0,   0,      "🐣", "股市嫩鳥"),
    (3,  0,   90000,  "🥬", "菜鳥操盤手"),
    (5,  45,  95000,  "🏹", "股市探險家"),
    (8,  50,  110000, "📊", "圖表獵人"),
    (10, 53,  130000, "🧙", "波段術士"),
    (12, 55,  150000, "🧙‍♂️", "波段大師"),
    (14, 57,  200000, "🐺", "華爾街之狼"),
    (16, 60,  250000, "🔱", "專業作手"),
    (18, 63,  400000, "🌟", "市場之王"),
    (20, 65,  500000, "👑", "東方股神"),
    # 特殊：資金大幅虧損
]

LOSER_TITLES = [
    (50000, "🤡", "高級韭菜花"),
    (70000, "🥬", "被割的韭菜"),
]


def get_rank_title(level: int, win_rate: float, capital: float) -> tuple[str, str]:
    """根據等級、勝率、資金回傳 (icon, 稱號)"""
    # 先檢查虧損稱號
    for threshold, icon, title in LOSER_TITLES:
        if capital < threshold:
            return icon, title

    # 從高到低找第一個符合條件的稱號
    for min_lv, min_wr, min_cap, icon, title in reversed(RANK_TITLES):
        if level >= min_lv and win_rate >= min_wr and capital >= min_cap:
            return icon, title

    return "🐣", "股市嫩鳥"


def calc_level(total_xp: int) -> int:
    """根據累積 XP 計算目前等級"""
    for lv in range(MAX_LEVEL - 1, 0, -1):
        if total_xp >= LEVEL_XP_TABLE[lv]:
            return lv + 1
    return 1


def xp_for_next_level(level: int) -> int:
    """距離下一等級還需要的 XP"""
    if level >= MAX_LEVEL:
        return 0
    return LEVEL_XP_TABLE[level]  # index = current level = next level threshold


def calc_xp_earned(is_correct: bool, streak: int, horizon: int, position_pct: int) -> int:
    """
    計算本題獲得的 XP
    - 答對基礎 XP
    - 連勝加成
    - 難度加成（預測天數越短越難）
    - 倉位加成（全倉更勇敢）
    """
    if is_correct:
        base = 20
    else:
        base = 5  # 答錯也給少量 XP（鼓勵持續練習）

    # 連勝加成
    streak_bonus = min(streak, 10) * 2  # 最多 +20

    # 預測天數難度加成（1天最難）
    horizon_bonus = {1: 10, 5: 5, 20: 0}.get(horizon, 0)

    # 倉位加成（滿倉給 +5）
    position_bonus = 5 if position_pct >= 100 else 0

    return base + streak_bonus + horizon_bonus + position_bonus


# ─────────────────────────────────────────
# 技術指標定義
# ─────────────────────────────────────────
AVAILABLE_INDICATORS = [
    {"key": "MA5",    "name": "MA5（5日均線）",      "desc": "短期趨勢參考，適合短線操作"},
    {"key": "MA10",   "name": "MA10（10日均線）",     "desc": "短中期趨勢"},
    {"key": "MA20",   "name": "MA20（20日均線）",     "desc": "月線，中期趨勢參考"},
    {"key": "MA60",   "name": "MA60（60日均線）",     "desc": "季線，中長期主力成本"},
    {"key": "VOL_MA", "name": "成交量均線",           "desc": "量能趨勢，判斷主力動向"},
    {"key": "RSI",    "name": "RSI（相對強弱指標）",  "desc": "超買超賣訊號"},
    {"key": "MACD",   "name": "MACD（指數平滑移動平均）", "desc": "動能趨勢，金叉死叉"},
    {"key": "BBAND",  "name": "布林通道",             "desc": "價格波動區間"},
    {"key": "KD",     "name": "KD 隨機指標",          "desc": "短線進出場參考"},
]

UNLOCK_EVERY_N_LEVELS = 10  # 每幾級可以解鎖一個指標


def get_unlock_slots(level: int) -> int:
    """玩家目前共有幾個指標解鎖槽"""
    return level // UNLOCK_EVERY_N_LEVELS


# ─────────────────────────────────────────
# 成就清單
# ─────────────────────────────────────────
ACHIEVEMENT_DEFINITIONS = [
    # key, name, description, icon, xp_reward, condition_hint
    ("first_win",      "初戰告捷",   "第一次預測正確",            "🎯", 50),
    ("streak_3",       "三連勝",     "連續猜對 3 題",             "🔥", 30),
    ("streak_5",       "五連勝",     "連續猜對 5 題",             "🔥", 60),
    ("streak_10",      "十連勝",     "連續猜對 10 題",            "🔥", 150),
    ("rounds_10",      "入門修練",   "累積完成 10 題",            "📚", 50),
    ("rounds_50",      "認真練習",   "累積完成 50 題",            "📚", 100),
    ("rounds_100",     "百題高手",   "累積完成 100 題",           "📚", 200),
    ("rounds_500",     "修練達人",   "累積完成 500 題",           "📚", 500),
    ("winrate_60",     "六成命中",   "勝率達到 60%（10題以上）",  "🎯", 100),
    ("winrate_65",     "精準狙擊",   "勝率達到 65%（20題以上）",  "🎯", 200),
    ("capital_150k",   "資金成長",   "帳戶資金超過 $150,000",     "💰", 100),
    ("capital_300k",   "翻倍操盤",   "帳戶資金超過 $300,000",     "💰", 200),
    ("capital_500k",   "半百萬富翁", "帳戶資金超過 $500,000",     "💰", 300),
    ("horizon_1_win",  "短線高手",   "成功預測 1 天走勢",         "⚡", 30),
    ("blind_50",       "蒙眼達人",   "盲測模式完成 50 題",        "🙈", 150),
    ("lv5",            "升段 Lv.5",  "達到等級 5",                "⭐", 50),
    ("lv10",           "升段 Lv.10", "達到等級 10",               "⭐", 150),
    ("lv20",           "滿級達人",   "達到最高等級 20",           "👑", 500),
]


def check_new_achievements(
    existing_keys: set[str],
    total_rounds: int,
    total_wins: int,
    streak: int,
    capital: float,
    level: int,
    is_blind_mode: bool,
    horizon: int,
    is_correct: bool,
    blind_rounds: int = 0,
) -> list[str]:
    """
    檢查是否有新成就達成，回傳新達成的成就 key list
    """
    new_keys = []
    win_rate = (total_wins / total_rounds * 100) if total_rounds > 0 else 0

    def check(key: str, condition: bool):
        if key not in existing_keys and condition:
            new_keys.append(key)

    check("first_win",     is_correct and total_wins == 1)
    check("streak_3",      streak >= 3)
    check("streak_5",      streak >= 5)
    check("streak_10",     streak >= 10)
    check("rounds_10",     total_rounds >= 10)
    check("rounds_50",     total_rounds >= 50)
    check("rounds_100",    total_rounds >= 100)
    check("rounds_500",    total_rounds >= 500)
    check("winrate_60",    total_rounds >= 10 and win_rate >= 60)
    check("winrate_65",    total_rounds >= 20 and win_rate >= 65)
    check("capital_150k",  capital >= 150000)
    check("capital_300k",  capital >= 300000)
    check("capital_500k",  capital >= 500000)
    check("horizon_1_win", is_correct and horizon == 1)
    check("blind_50",      is_blind_mode and blind_rounds >= 50)
    check("lv5",           level >= 5)
    check("lv10",          level >= 10)
    check("lv20",          level >= 20)

    return new_keys
