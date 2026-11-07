/**
 * Progress Engine v1.0 — 前端進度引擎
 * 訪客模式下所有進度（資金/XP/等級/稱號/成就/每日修練/個人紀錄）
 * 由前端計算並持久化到 localStorage，與 backend/game_logic.py 規則同步。
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'kline_progress_v1';
  const INITIAL_CAPITAL = 100000;
  const BANKRUPT_THRESHOLD = 10000;   // 低於此資金觸發重生補助
  const BAILOUT_AMOUNT = 50000;       // 補助金額
  const DAILY_GOAL_ROUNDS = 10;       // 每日目標題數
  const DAILY_GOAL_XP = 100;          // 達成每日目標獎勵 XP

  // ── 等級 XP 門檻（與後端同步）─────────────
  const LEVEL_XP_TABLE = [
    0, 100, 250, 450, 700, 1000, 1400, 1900, 2500, 3200,
    4000, 5000, 6200, 7600, 9200, 11000, 13200, 15700, 18500, 22000,
  ];
  const MAX_LEVEL = LEVEL_XP_TABLE.length;

  // ── 稱號系統（與後端同步）─────────────────
  const RANK_TITLES = [
    // [最低等級, 最低勝率%, 最低資金, icon, 稱號]
    [1,  0,  0,      '🐣', '股市嫩鳥'],
    [3,  0,  90000,  '🥬', '菜鳥操盤手'],
    [5,  45, 95000,  '🏹', '股市探險家'],
    [8,  50, 110000, '📊', '圖表獵人'],
    [10, 53, 130000, '🧙', '波段術士'],
    [12, 55, 150000, '🧙‍♂️', '波段大師'],
    [14, 57, 200000, '🐺', '華爾街之狼'],
    [16, 60, 250000, '🔱', '專業作手'],
    [18, 63, 400000, '🌟', '市場之王'],
    [20, 65, 500000, '👑', '東方股神'],
  ];
  const LOSER_TITLES = [
    [50000, '🤡', '高級韭菜花'],
    [70000, '🥬', '被割的韭菜'],
  ];

  // ── 等級獎勵：均線解鎖 ────────────────────
  const LEVEL_REWARDS = {
    2: { type: 'ma', key: 'MA5',  name: 'MA5 五日均線',  desc: '短線趨勢參考線' },
    4: { type: 'ma', key: 'MA10', name: 'MA10 十日均線', desc: '短中期趨勢線' },
    6: { type: 'ma', key: 'MA20', name: 'MA20 月線',     desc: '中期趨勢／生命線' },
    9: { type: 'ma', key: 'MA60', name: 'MA60 季線',     desc: '中長期主力成本線' },
  };
  const MA_COLORS = { MA5: '#fbbf24', MA10: '#38bdf8', MA20: '#c084fc', MA60: '#f472b6' };

  // ── 成就定義（與後端同步 + 進度函式）──────
  // progress: (s) => [目前值, 目標值]，null 表示無進度條（一次性事件）
  const ACHIEVEMENTS = [
    { key: 'first_win',     name: '初戰告捷',   desc: '第一次預測正確',           icon: '🎯', xp: 50,  progress: s => [Math.min(s.wins, 1), 1] },
    { key: 'streak_3',      name: '三連勝',     desc: '連續猜對 3 題',            icon: '🔥', xp: 30,  progress: s => [Math.min(s.maxStreak, 3), 3] },
    { key: 'streak_5',      name: '五連勝',     desc: '連續猜對 5 題',            icon: '🔥', xp: 60,  progress: s => [Math.min(s.maxStreak, 5), 5] },
    { key: 'streak_10',     name: '十連勝',     desc: '連續猜對 10 題',           icon: '🔥', xp: 150, progress: s => [Math.min(s.maxStreak, 10), 10] },
    { key: 'rounds_10',     name: '入門修練',   desc: '累積完成 10 題',           icon: '📚', xp: 50,  progress: s => [Math.min(s.rounds, 10), 10] },
    { key: 'rounds_50',     name: '認真練習',   desc: '累積完成 50 題',           icon: '📚', xp: 100, progress: s => [Math.min(s.rounds, 50), 50] },
    { key: 'rounds_100',    name: '百題高手',   desc: '累積完成 100 題',          icon: '📚', xp: 200, progress: s => [Math.min(s.rounds, 100), 100] },
    { key: 'rounds_500',    name: '修練達人',   desc: '累積完成 500 題',          icon: '📚', xp: 500, progress: s => [Math.min(s.rounds, 500), 500] },
    { key: 'winrate_60',    name: '六成命中',   desc: '勝率達 60%（10題以上）',   icon: '🎯', xp: 100, progress: null },
    { key: 'winrate_65',    name: '精準狙擊',   desc: '勝率達 65%（20題以上）',   icon: '🎯', xp: 200, progress: null },
    { key: 'capital_150k',  name: '資金成長',   desc: '帳戶資金超過 $150,000',    icon: '💰', xp: 100, progress: s => [Math.min(s.bestCapital, 150000), 150000] },
    { key: 'capital_300k',  name: '翻倍操盤',   desc: '帳戶資金超過 $300,000',    icon: '💰', xp: 200, progress: s => [Math.min(s.bestCapital, 300000), 300000] },
    { key: 'capital_500k',  name: '半百萬富翁', desc: '帳戶資金超過 $500,000',    icon: '💰', xp: 300, progress: s => [Math.min(s.bestCapital, 500000), 500000] },
    { key: 'horizon_1_win', name: '短線高手',   desc: '成功預測 1 天走勢',        icon: '⚡', xp: 30,  progress: null },
    { key: 'blind_50',      name: '蒙眼達人',   desc: '盲測模式完成 50 題',       icon: '🙈', xp: 150, progress: s => [Math.min(s.blindRounds, 50), 50] },
    { key: 'lv5',           name: '升段 Lv.5',  desc: '達到等級 5',               icon: '⭐', xp: 50,  progress: s => [Math.min(s.level, 5), 5] },
    { key: 'lv10',          name: '升段 Lv.10', desc: '達到等級 10',              icon: '⭐', xp: 150, progress: s => [Math.min(s.level, 10), 10] },
    { key: 'lv20',          name: '滿級達人',   desc: '達到最高等級 20',          icon: '👑', xp: 500, progress: s => [Math.min(s.level, 20), 20] },
    { key: 'daily_7',       name: '修練成癮',   desc: '連續修練 7 天',            icon: '📅', xp: 200, progress: s => [Math.min(s.dayStreak, 7), 7] },
    { key: 'comeback',      name: '韭菜重生',   desc: '破產後東山再起回到 $100,000', icon: '🐦‍🔥', xp: 150, progress: null },
  ];
  const ACHIEVEMENT_MAP = Object.fromEntries(ACHIEVEMENTS.map(a => [a.key, a]));

  // ── 預設狀態 ──────────────────────────────
  function defaultState() {
    return {
      capital: INITIAL_CAPITAL,
      experience: 0,
      level: 1,
      rounds: 0,
      wins: 0,
      streak: 0,
      maxStreak: 0,
      blindRounds: 0,
      bestCapital: INITIAL_CAPITAL,
      biggestWin: 0,        // 單筆最大獲利
      totalPnl: 0,          // 累計實現損益
      bailouts: 0,          // 領過幾次補助
      hadBailout: false,    // 是否破產過（comeback 成就用）
      unlocked: [],         // 已解鎖成就 key
      lastPlayDate: '',     // YYYY-MM-DD
      dayStreak: 0,         // 連續修練天數
      todayRounds: 0,       // 今日完成題數
      todayDate: '',        // todayRounds 對應的日期
      dailyGoalClaimed: '', // 已領取每日獎勵的日期
    };
  }

  // ── 持久化 ────────────────────────────────
  function load() {
    try {
      const raw = (window._safeStorage || localStorage).getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return Object.assign(defaultState(), JSON.parse(raw));
    } catch {
      return defaultState();
    }
  }

  function save(state) {
    try {
      (window._safeStorage || localStorage).setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {}
  }

  // ── 規則函式（與後端同步）─────────────────
  function calcLevel(totalXp) {
    for (let lv = MAX_LEVEL - 1; lv > 0; lv--) {
      if (totalXp >= LEVEL_XP_TABLE[lv]) return lv + 1;
    }
    return 1;
  }

  function xpForNextLevel(level) {
    return level >= MAX_LEVEL ? 0 : LEVEL_XP_TABLE[level];
  }

  function getRank(level, winRate, capital) {
    for (const [threshold, icon, title] of LOSER_TITLES) {
      if (capital < threshold) return { icon, title };
    }
    for (let i = RANK_TITLES.length - 1; i >= 0; i--) {
      const [minLv, minWr, minCap, icon, title] = RANK_TITLES[i];
      if (level >= minLv && winRate >= minWr && capital >= minCap) return { icon, title };
    }
    return { icon: '🐣', title: '股市嫩鳥' };
  }

  /** 下一個尚未達成的稱號與缺少的條件 */
  function getNextRank(level, winRate, capital) {
    const current = getRank(level, winRate, capital);
    const idx = RANK_TITLES.findIndex(([, , , , t]) => t === current.title);

    // 虧損稱號中：目標是把資金救回正常稱號的門檻之上
    if (idx === -1) {
      const recoverTarget = Math.max(...LOSER_TITLES.map(([t]) => t));
      return { icon: '🐣', title: '脫離韭菜身分', missing: [`資金回到 $${recoverTarget.toLocaleString()}`] };
    }

    const nextIdx = idx + 1;
    if (nextIdx >= RANK_TITLES.length) return null; // 已是東方股神
    const [minLv, minWr, minCap, icon, title] = RANK_TITLES[nextIdx];
    const missing = [];
    if (level < minLv)    missing.push(`Lv.${minLv}`);
    if (winRate < minWr)  missing.push(`勝率 ${minWr}%`);
    if (capital < minCap) missing.push(`資金 $${minCap.toLocaleString()}`);
    return { icon, title, missing };
  }

  function calcXpEarned(isCorrect, streak, horizon, positionPct) {
    const base = isCorrect ? 20 : 5;
    const streakBonus = Math.min(streak, 10) * 2;
    const horizonBonus = { 1: 10, 5: 5, 20: 0 }[horizon] || 0;
    const positionBonus = positionPct >= 100 ? 5 : 0;
    return {
      base, streakBonus, horizonBonus, positionBonus,
      total: base + streakBonus + horizonBonus + positionBonus,
    };
  }

  function checkAchievements(s, ctx) {
    const out = [];
    const winRate = s.rounds > 0 ? (s.wins / s.rounds) * 100 : 0;
    const chk = (key, cond) => {
      if (cond && !s.unlocked.includes(key)) { s.unlocked.push(key); out.push(ACHIEVEMENT_MAP[key]); }
    };
    chk('first_win',     ctx.isCorrect && s.wins >= 1);
    chk('streak_3',      s.streak >= 3);
    chk('streak_5',      s.streak >= 5);
    chk('streak_10',     s.streak >= 10);
    chk('rounds_10',     s.rounds >= 10);
    chk('rounds_50',     s.rounds >= 50);
    chk('rounds_100',    s.rounds >= 100);
    chk('rounds_500',    s.rounds >= 500);
    chk('winrate_60',    s.rounds >= 10 && winRate >= 60);
    chk('winrate_65',    s.rounds >= 20 && winRate >= 65);
    chk('capital_150k',  s.capital >= 150000);
    chk('capital_300k',  s.capital >= 300000);
    chk('capital_500k',  s.capital >= 500000);
    chk('horizon_1_win', ctx.isCorrect && ctx.horizon === 1);
    chk('blind_50',      s.blindRounds >= 50);
    chk('lv5',           s.level >= 5);
    chk('lv10',          s.level >= 10);
    chk('lv20',          s.level >= 20);
    chk('daily_7',       s.dayStreak >= 7);
    chk('comeback',      s.hadBailout && s.capital >= INITIAL_CAPITAL);
    return out;
  }

  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  // ── Progress Engine 主體 ──────────────────
  const Progress = {
    state: load(),

    LEVEL_XP_TABLE,
    MAX_LEVEL,
    ACHIEVEMENTS,
    ACHIEVEMENT_MAP,
    LEVEL_REWARDS,
    MA_COLORS,
    DAILY_GOAL_ROUNDS,
    DAILY_GOAL_XP,
    INITIAL_CAPITAL,

    save() { save(this.state); },

    /** 每次開啟/每回合呼叫：滾動每日狀態，回傳今天是否為新的修練日 */
    touchDay() {
      const s = this.state;
      const today = todayStr();
      if (s.todayDate !== today) {
        s.todayDate = today;
        s.todayRounds = 0;
      }
      return today;
    },

    get winRate() {
      const s = this.state;
      return s.rounds > 0 ? (s.wins / s.rounds) * 100 : 0;
    },

    get rank() { return getRank(this.state.level, this.winRate, this.state.capital); },
    get nextRank() { return getNextRank(this.state.level, this.winRate, this.state.capital); },
    get xpNextLevel() { return xpForNextLevel(this.state.level); },

    /** 已解鎖的均線 key 列表（依等級） */
    get unlockedMAs() {
      const lv = this.state.level;
      return Object.entries(LEVEL_REWARDS)
        .filter(([rewardLv, r]) => r.type === 'ma' && lv >= Number(rewardLv))
        .map(([, r]) => r.key);
    },

    /**
     * 結算一回合（核心入口）
     * @param {Object} p - { guess, isCorrect, stockReturnPct, positionPct, horizon, isBlind }
     * @returns 結算明細（給 UI 顯示）
     */
    settleRound(p) {
      const s = this.state;
      const today = this.touchDay();

      // ── 觀望：不計任何進度 ──
      if (p.guess === 'PASS') {
        this.save();
        return { pass: true, pnl: 0, xp: null, newAchievements: [], levelUp: false, records: [], bailout: null, dailyGoalHit: false };
      }

      // ── 連續修練天數 ──
      if (s.lastPlayDate !== today) {
        const yesterday = new Date(Date.now() - 86400000);
        const yStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
        s.dayStreak = (s.lastPlayDate === yStr) ? s.dayStreak + 1 : 1;
        s.lastPlayDate = today;
      }

      // ── 勝負與連勝 ──
      s.rounds += 1;
      s.todayRounds += 1;
      if (p.isBlind) s.blindRounds += 1;
      if (p.isCorrect) {
        s.wins += 1;
        s.streak += 1;
        if (s.streak > s.maxStreak) s.maxStreak = s.streak;
      } else {
        s.streak = 0;
      }

      // ── 損益 ──
      const invested = s.capital * (p.positionPct / 100);
      const ret = p.stockReturnPct / 100;
      const pnl = Math.round((p.guess === 'UP' ? invested * ret : invested * -ret) * 100) / 100;
      s.capital = Math.round((s.capital + pnl) * 100) / 100;
      s.totalPnl = Math.round((s.totalPnl + pnl) * 100) / 100;

      // ── 個人紀錄 ──
      const records = [];
      if (pnl > 0 && pnl > s.biggestWin) {
        s.biggestWin = pnl;
        if (s.rounds > 5) records.push({ type: 'biggestWin', label: `單筆最大獲利 +$${Math.round(pnl).toLocaleString()}` });
      }
      if (s.capital > s.bestCapital) {
        const wasAbove = s.bestCapital > INITIAL_CAPITAL;
        s.bestCapital = s.capital;
        if (wasAbove) records.push({ type: 'bestCapital', label: `資金新高 $${Math.round(s.capital).toLocaleString()}` });
      }
      if (p.isCorrect && s.streak >= 3 && s.streak === s.maxStreak && s.streak > 3) {
        records.push({ type: 'maxStreak', label: `連勝新紀錄 ${s.streak} 連勝！` });
      }

      // ── 破產補助（韭菜重生機制）──
      let bailout = null;
      if (s.capital < BANKRUPT_THRESHOLD) {
        s.capital += BAILOUT_AMOUNT;
        s.bailouts += 1;
        s.hadBailout = true;
        bailout = { amount: BAILOUT_AMOUNT, count: s.bailouts };
      }

      // ── XP / 等級 ──
      const prevLevel = s.level;
      const xp = calcXpEarned(p.isCorrect, s.streak, p.horizon, p.positionPct);
      s.experience += xp.total;

      // ── 每日目標 ──
      let dailyGoalHit = false;
      if (s.todayRounds === DAILY_GOAL_ROUNDS && s.dailyGoalClaimed !== today) {
        s.dailyGoalClaimed = today;
        s.experience += DAILY_GOAL_XP;
        dailyGoalHit = true;
      }

      s.level = calcLevel(s.experience);

      // ── 成就（成就 XP 也累加）──
      const newAchievements = checkAchievements(s, { isCorrect: p.isCorrect, horizon: p.horizon });
      let achXp = 0;
      newAchievements.forEach(a => { achXp += a.xp; });
      if (achXp > 0) {
        s.experience += achXp;
        s.level = calcLevel(s.experience);
      }

      const levelUp = s.level > prevLevel;
      const newRewards = [];
      if (levelUp) {
        for (let lv = prevLevel + 1; lv <= s.level; lv++) {
          if (LEVEL_REWARDS[lv]) newRewards.push(LEVEL_REWARDS[lv]);
        }
      }

      this.save();

      return {
        pass: false,
        pnl,
        xp,                 // {base, streakBonus, horizonBonus, positionBonus, total}
        achXp,
        newAchievements,    // [{key,name,icon,xp,...}]
        levelUp,
        levelAfter: s.level,
        newRewards,         // 升級解鎖的均線等
        records,            // 個人新紀錄
        bailout,            // 破產補助
        dailyGoalHit,
      };
    },

    /** 成就牆資料（含進度） */
    getAchievementWall() {
      const s = this.state;
      return ACHIEVEMENTS.map(a => {
        const unlocked = s.unlocked.includes(a.key);
        let progress = null;
        if (!unlocked && a.progress) {
          const [cur, target] = a.progress(s);
          progress = { cur, target, pct: Math.min(100, (cur / target) * 100) };
        }
        return { ...a, unlocked, progressInfo: progress };
      });
    },

    /** 重置全部進度 */
    reset() {
      this.state = defaultState();
      this.save();
    },
  };

  window.Progress = Progress;
})();
