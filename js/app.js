/**
 * App Manager v4.0 — 遊戲循環、用戶狀態、事件綁定
 * v4 重點：
 *  - 進度改由前端 Progress 引擎接管並持久化（修復「下一題就歸零」問題）
 *  - 成就收藏牆、每日修練目標、連續修練天數
 *  - 個人最佳紀錄、下一個稱號目標、XP 獲得明細
 *  - 等級獎勵：均線解鎖（MA5/MA10/MA20/MA60）
 *  - 離線修練模式（後端不可用時自動切換）
 */
document.addEventListener('DOMContentLoaded', () => {

  if (typeof StockChart === 'undefined') {
    alert("⚠️ 載入失敗：找不到 chart.js 模組");
    throw new Error("StockChart not defined");
  }

  // ==========================================
  // safeStorage Helper
  // ==========================================
  const memoryStore = {};
  const safeStorage = {
    getItem:    k => { try { return localStorage.getItem(k); }    catch { return memoryStore[k] || null; } },
    setItem:  (k,v)=> { try { localStorage.setItem(k, v); }       catch { memoryStore[k] = String(v); } },
    removeItem: k => { try { localStorage.removeItem(k); }        catch { delete memoryStore[k]; } },
  };
  window._safeStorage = safeStorage;

  // ==========================================
  // 遊戲狀態（進度欄位由 Progress 引擎持有）
  // ==========================================
  const state = {
    userId: null,
    isTaiwanStyle: true,
    isBlindMode: true,
    horizon: 5,
    currentSessionId: null,
    currentStockName: "",
    currentStockCode: "",
    isAnimating: false,
    hasGuessed: false,
    lastGuess: null,
    historyStartDate: '',
    historyEndDate: '',
  };

  // ==========================================
  // HTML Element Cache
  // ==========================================
  const el = {
    valCapital:   document.getElementById('val-capital'),
    valRoi:       document.getElementById('val-roi'),
    valWinrate:   document.getElementById('val-winrate'),
    valStreak:    document.getElementById('val-streak'),
    valRounds:    document.getElementById('val-rounds'),
    badgeStreak:  document.getElementById('badge-streak'),
    badgeIcon:    document.getElementById('badge-icon'),
    badgeRank:    document.getElementById('badge-rank'),
    xpBar:        document.getElementById('xp-bar'),
    xpText:       document.getElementById('xp-text'),
    levelBadge:   document.getElementById('level-badge'),

    nextRankCard:    document.getElementById('next-rank-card'),
    nextRankName:    document.getElementById('next-rank-name'),
    nextRankMissing: document.getElementById('next-rank-missing'),

    recBestCapital: document.getElementById('rec-best-capital'),
    recMaxStreak:   document.getElementById('rec-max-streak'),
    recBiggestWin:  document.getElementById('rec-biggest-win'),
    recDayStreak:   document.getElementById('rec-day-streak'),

    chartLoading:     document.getElementById('chart-loading'),
    chartStockName:   document.getElementById('chart-stock-name'),
    chartStockPeriod: document.getElementById('chart-stock-period'),
    offlineBadge:     document.getElementById('offline-badge'),
    maLegend:         document.getElementById('ma-legend'),
    mainContent:      document.getElementById('main-content'),
    chartPanel:       document.getElementById('chart-panel'),

    btnCandles: document.getElementById('btn-candles'),
    btnArea:    document.getElementById('btn-area'),
    modeBlind:  document.getElementById('mode-blind'),
    modeClassic:document.getElementById('mode-classic'),
    horizonBtns:document.querySelectorAll('[data-horizon]'),
    tradePercentage:     document.getElementById('trade-percentage'),
    sliderPercentageLbl: document.getElementById('slider-percentage-lbl'),
    quickPercentageBtns: document.querySelectorAll('.btn-quick-val[data-val]'),

    btnUp:   document.getElementById('btn-up-action'),
    btnDown: document.getElementById('btn-down-action'),
    btnPass: document.getElementById('btn-pass-action'),

    resultPanel: document.getElementById('result-panel'),
    resIcon:     document.getElementById('res-icon'),
    resTitle:    document.getElementById('res-title'),
    resDesc:     document.getElementById('res-desc'),
    resStockPnl: document.getElementById('res-stock-pnl'),
    resPnl:      document.getElementById('res-pnl'),
    recordBanner:    document.getElementById('record-banner'),
    xpBreakdown:     document.getElementById('xp-breakdown'),
    xpBreakdownRows: document.getElementById('xp-breakdown-rows'),
    btnNext:     document.getElementById('btn-next'),
    btnReview:   document.getElementById('btn-review-chart'),
    floatingNext:    document.getElementById('floating-next'),
    btnFloatingNext: document.getElementById('btn-floating-next'),

    settingsModal:      document.getElementById('settings-modal'),
    btnSettings:        document.getElementById('btn-settings'),
    btnCloseSettings:   document.getElementById('btn-close-settings'),
    settingColorToggle: document.getElementById('setting-color-toggle'),
    settingResetBtn:    document.getElementById('setting-reset-btn'),
    settingSoundToggle: document.getElementById('setting-sound-toggle'),
    settingTutorialBtn: document.getElementById('setting-tutorial-btn'),

    infoModal:    document.getElementById('info-modal'),
    btnInfo:      document.getElementById('btn-info'),
    btnCloseInfo: document.getElementById('btn-close-info'),

    achievementsModal:    document.getElementById('achievements-modal'),
    btnAchievements:      document.getElementById('btn-achievements'),
    btnCloseAchievements: document.getElementById('btn-close-achievements'),
    achWallGrid:          document.getElementById('ach-wall-grid'),
    achWallCount:         document.getElementById('ach-wall-count'),

    dailyModal:      document.getElementById('daily-modal'),
    btnCloseDaily:   document.getElementById('btn-close-daily'),
    dailyBadgeText:  document.getElementById('daily-badge-text'),
    dailyStreakDays: document.getElementById('daily-streak-days'),
    dailyStreakFire: document.getElementById('daily-streak-fire'),
    dailyGoalCount:  document.getElementById('daily-goal-count'),
    dailyGoalFill:   document.getElementById('daily-goal-fill'),
    dailyGoalReward: document.getElementById('daily-goal-reward'),

    btnSound:  document.getElementById('btn-sound'),
    soundIcon: document.getElementById('sound-icon'),
    btnDaily:  document.getElementById('btn-daily'),

    tutorialOverlay: document.getElementById('tutorial-overlay'),
    tutorialSteps:   document.querySelectorAll('.tutorial-step'),
    tutorialDots:    document.querySelectorAll('.tutorial-dot'),
    btnTutorialNext: document.getElementById('btn-tutorial-next'),
    btnTutorialSkip: document.getElementById('btn-tutorial-skip'),

    levelUpOverlay: document.getElementById('level-up-overlay'),
    levelUpTitle:   document.getElementById('level-up-title'),
    levelUpSub:     document.getElementById('level-up-sub'),

    achievementToast: document.getElementById('achievement-toast'),
    toastIcon:        document.getElementById('toast-icon'),
    toastName:        document.getElementById('toast-name'),
    toastXp:          document.getElementById('toast-xp'),

    swipeHintOverlay: document.getElementById('swipe-hint-overlay'),

    installBanner:     document.getElementById('install-banner'),
    btnInstall:        document.getElementById('btn-install'),
    btnDismissInstall: document.getElementById('btn-dismiss-install'),

    confettiCanvas: document.getElementById('confetti-canvas'),
  };

  // ==========================================
  // Init Chart
  // ==========================================
  const stockChart = new StockChart('tv-chart');
  loadLocalPrefs();
  stockChart.init(state.isTaiwanStyle);

  // ==========================================
  // Boot Sequence
  // ==========================================
  Progress.touchDay();
  updateSettingsUI();
  applyMAUnlocks();
  updateSidebarUI();
  updateDailyBadge();
  initTutorial();
  initSwipeGestures();
  initKeyboardShortcuts();
  initInstallPrompt();
  loadNewRound();

  // Unlock AudioContext on first user interaction
  document.addEventListener('click',      () => soundManager.init(), { once: true });
  document.addEventListener('touchstart', () => soundManager.init(), { once: true });

  // ==========================================
  // 1. CORE GAME LOOP
  // ==========================================

  async function loadNewRound() {
    state.isAnimating = false;
    state.hasGuessed  = false;
    state.currentSessionId = null;

    el.chartLoading.classList.remove('hidden');
    el.resultPanel.classList.remove('visible');
    if (el.floatingNext) el.floatingNext.style.display = 'none';
    disableActionButtons(true);

    try {
      const round = await api.getNewRound({
        horizon: state.horizon,
        isBlind: state.isBlindMode,
        userId:  state.userId,
      });

      state.currentSessionId = round.session_id;
      state.currentStockName = round.stock_name;
      state.currentStockCode = round.stock_code;

      el.chartStockName.textContent = round.stock_name;
      el.chartStockName.className   = state.isBlindMode ? 'stock-name-box stock-name-hidden' : 'stock-name-box';
      state.historyStartDate = round.history_data[0]?.time ?? '';
      state.historyEndDate   = round.history_data[round.history_data.length - 1]?.time ?? '';
      el.chartStockPeriod.textContent = '答題後揭曉日期';
      el.chartStockPeriod.className   = 'stock-period-box stock-name-hidden';

      if (el.offlineBadge) el.offlineBadge.style.display = api.offlineMode ? 'inline-flex' : 'none';

      stockChart.loadData(round.history_data);
      updateSidebarUI();

    } catch (err) {
      console.error("載入題目失敗:", err);
      el.chartStockName.textContent = "⚠️ 連線失敗：" + err.message;
      el.chartStockName.className   = 'stock-name-box';
    } finally {
      el.chartLoading.classList.add('hidden');
      disableActionButtons(false);
    }
  }

  async function makeGuess(direction) {
    if (state.isAnimating || state.hasGuessed || !state.currentSessionId) return;

    state.lastGuess   = direction;
    state.isAnimating = true;
    state.hasGuessed  = true;
    disableActionButtons(true);

    if (direction === 'UP')        soundManager.actionUp();
    else if (direction === 'DOWN') soundManager.actionDown();
    else                           soundManager.pass();

    let result;
    try {
      result = await api.submitAnswer({
        sessionId:   state.currentSessionId,
        guess:       direction,
        positionPct: parseInt(el.tradePercentage.value),
        isBlind:     state.isBlindMode,
        horizon:     state.horizon,
      });
    } catch (err) {
      console.error("提交答案失敗:", err);
      state.isAnimating = false;
      state.hasGuessed  = false;
      disableActionButtons(false);
      alert("提交失敗：" + err.message);
      return;
    }

    const tickSpeed = state.horizon === 1 ? 600 : state.horizon === 5 ? 350 : 120;
    stockChart.revealFutureData(
      result.future_data,
      tickSpeed,
      null,
      () => {
        setTimeout(() => {
          state.isAnimating = false;
          disableActionButtons(false);
          concludeRound(result);
        }, 1500);
      }
    );
  }

  function concludeRound(result) {
    // ── 進度結算：一律由前端 Progress 引擎計算並持久化 ──
    const isCorrect = state.lastGuess !== 'PASS' &&
      (state.lastGuess === result.actual_direction || result.actual_direction === 'DRAW');

    const settle = Progress.settleRound({
      guess:          state.lastGuess,
      isCorrect,
      stockReturnPct: result.stock_return_pct,
      positionPct:    parseInt(el.tradePercentage.value),
      horizon:        state.horizon,
      isBlind:        state.isBlindMode,
    });

    const s = Progress.state;

    // ── 勝負反饋特效 ──
    if (!settle.pass) {
      if (isCorrect) {
        soundManager.win();
        launchConfetti();
        el.chartPanel.classList.add('win-flash');
        setTimeout(() => el.chartPanel.classList.remove('win-flash'), 900);
        if (s.streak >= 3) {
          setTimeout(() => {
            soundManager.streak(s.streak);
            updateStreakBadge(true);
          }, 500);
        }
      } else {
        soundManager.loss();
        triggerShake();
      }
    }

    // ── 升級特效（含均線解鎖獎勵展示）──
    if (settle.levelUp) {
      setTimeout(() => {
        soundManager.levelUp();
        showLevelUp(settle.levelAfter, settle.newRewards);
        applyMAUnlocks();
      }, 900);
    }

    // ── 揭曉股票資訊 ──
    el.chartStockName.textContent = `${result.stock_name} (${result.stock_code})`;
    el.chartStockName.classList.remove('stock-name-hidden');
    el.chartStockPeriod.textContent = state.historyStartDate && state.historyEndDate
      ? `${state.historyStartDate} 至 ${state.historyEndDate}` : '';
    el.chartStockPeriod.classList.remove('stock-name-hidden');

    saveLocalPrefs();
    updateSidebarUI(settle.pass ? 0 : settle.xp.total);
    updateDailyBadge();

    // ── 成就 toast（佇列）──
    if (settle.newAchievements.length > 0) {
      showAchievementToasts(settle.newAchievements);
    }

    showResultOverlay(result, settle, isCorrect);
  }

  // ==========================================
  // 2. UI Updates
  // ==========================================

  function updateSidebarUI(xpEarned = 0) {
    const s = Progress.state;
    el.valCapital.textContent = `$${Math.round(s.capital).toLocaleString()}`;

    const roi = ((s.capital - Progress.INITIAL_CAPITAL) / Progress.INITIAL_CAPITAL) * 100;
    el.valRoi.textContent = `${roi >= 0 ? '+' : ''}${roi.toFixed(2)}%`;
    el.valRoi.style.color = roi >= 0 ? 'var(--color-up)' : 'var(--color-down)';

    el.valWinrate.textContent = `${Progress.winRate.toFixed(1)}%`;

    el.valStreak.textContent = s.streak;
    updateStreakBadge(false);

    el.valRounds.textContent = s.rounds;

    const rank = Progress.rank;
    el.badgeIcon.textContent = rank.icon;
    el.badgeRank.textContent = rank.title;
    if (el.levelBadge) el.levelBadge.textContent = `Lv.${s.level}`;

    // XP bar — 當前等級內的精確進度
    if (el.xpBar) {
      const lvIdx       = Math.max(0, s.level - 1);
      const currentBase = Progress.LEVEL_XP_TABLE[lvIdx] ?? 0;
      const nextTarget  = Progress.xpNextLevel > 0 ? Progress.xpNextLevel : (Progress.LEVEL_XP_TABLE[Progress.MAX_LEVEL - 1]);
      const span        = nextTarget - currentBase;
      const pct         = span > 0 ? Math.min(100, ((s.experience - currentBase) / span) * 100) : 100;
      el.xpBar.style.width = `${pct}%`;
      if (xpEarned > 0) {
        el.xpBar.classList.remove('flash');
        void el.xpBar.offsetWidth;
        el.xpBar.classList.add('flash');
      }
    }
    if (el.xpText) el.xpText.textContent = `XP ${s.experience}`;

    // 下一個稱號目標
    updateNextRankCard();

    // 個人最佳紀錄
    if (el.recBestCapital) el.recBestCapital.textContent = `$${Math.round(s.bestCapital).toLocaleString()}`;
    if (el.recMaxStreak)   el.recMaxStreak.textContent   = s.maxStreak;
    if (el.recBiggestWin)  el.recBiggestWin.textContent  = s.biggestWin > 0 ? `+$${Math.round(s.biggestWin).toLocaleString()}` : '$0';
    if (el.recDayStreak)   el.recDayStreak.textContent   = `${s.dayStreak} 天`;
  }

  function updateNextRankCard() {
    if (!el.nextRankCard) return;
    const next = Progress.nextRank;
    if (!next) {
      el.nextRankName.textContent    = '👑 已是最高稱號！';
      el.nextRankMissing.textContent = '你就是東方股神本神。';
      return;
    }
    el.nextRankName.textContent = `${next.icon} ${next.title}`;
    el.nextRankMissing.textContent = next.missing.length > 0
      ? `還需要：${next.missing.join('、')}`
      : '條件已達成，下一題就有機會晉升！';
  }

  function updateDailyBadge() {
    if (!el.dailyBadgeText) return;
    const s = Progress.state;
    Progress.touchDay();
    const done = s.todayRounds >= Progress.DAILY_GOAL_ROUNDS;
    el.dailyBadgeText.textContent = done
      ? `✅ 今日達標${s.dayStreak > 1 ? ` 🔥${s.dayStreak}天` : ''}`
      : `每日修練 ${s.todayRounds}/${Progress.DAILY_GOAL_ROUNDS}`;
  }

  function updateStreakBadge(pop = false) {
    const streak = Progress.state.streak;
    if (streak >= 3) {
      el.badgeStreak.style.display = 'inline-block';
      el.badgeStreak.textContent   = `${streak}連勝🔥`;
      el.valStreak.classList.add('streak-on-fire');
      if (pop) {
        el.badgeStreak.classList.remove('pop');
        void el.badgeStreak.offsetWidth;
        el.badgeStreak.classList.add('pop');
      }
    } else {
      el.badgeStreak.style.display = 'none';
      el.valStreak.classList.remove('streak-on-fire');
    }
  }

  function showResultOverlay(result, settle, isCorrect) {
    const { stock_return_pct, stock_name, stock_code, price_start, price_end } = result;
    const s = Progress.state;

    const horizonLabel = state.horizon === 1 ? '1 天' : state.horizon === 5 ? '5 天 (1週)' : '20 天 (1個月)';
    const dirIcon  = stock_return_pct >= 0 ? '📈' : '📉';
    const changeText = `${stock_return_pct >= 0 ? '+' : ''}${stock_return_pct.toFixed(2)}%`;

    // ── 新紀錄橫幅 ──
    if (el.recordBanner) {
      if (!settle.pass && settle.records.length > 0) {
        el.recordBanner.innerHTML = settle.records.map(r => `🏅 ${r.label}`).join('<br>');
        el.recordBanner.style.display = 'block';
      } else {
        el.recordBanner.style.display = 'none';
      }
    }

    // ── 描述文字 ──
    let descText = `這檔股票是 <strong>${stock_name} (${stock_code})</strong>。<br>`;
    descText += `在預測的 ${horizonLabel} 內，股價從 <strong>${price_start.toFixed(1)}</strong> `;
    descText += `變為 <strong>${price_end.toFixed(1)}</strong> (${dirIcon} ${changeText})。`;

    if (settle.pass) {
      descText += `<br><span style="color:var(--text-secondary)">此局選擇觀望，未進行交易。</span>`;
    }
    if (settle.bailout) {
      descText += `<br>💸 <strong>主力同情補助金 +$${settle.bailout.amount.toLocaleString()}</strong>（韭菜重生第 ${settle.bailout.count} 次）`;
    }
    if (settle.levelUp) {
      descText += `<br>🎉 <strong>升級！達到 Lv.${settle.levelAfter}！</strong>`;
      settle.newRewards.forEach(r => {
        descText += `<br>📐 解鎖 <strong>${r.name}</strong> — ${r.desc}`;
      });
    }
    if (!settle.pass && isCorrect && s.streak >= 2) {
      const nextBonus = Math.min(s.streak, 10) * 2;
      descText += `<br>🔥 <span style="color:var(--color-gold)">連勝中！下一題連勝加成 +${nextBonus} XP</span>`;
    }

    // ── XP 明細 ──
    if (el.xpBreakdown) {
      if (!settle.pass && settle.xp) {
        const rows = [];
        rows.push(['預測' + (isCorrect ? '正確' : '失誤'), settle.xp.base]);
        if (settle.xp.streakBonus > 0)   rows.push([`連勝加成 ×${Math.min(s.streak,10)}`, settle.xp.streakBonus]);
        if (settle.xp.horizonBonus > 0)  rows.push(['短線難度加成', settle.xp.horizonBonus]);
        if (settle.xp.positionBonus > 0) rows.push(['滿倉勇氣加成', settle.xp.positionBonus]);
        if (settle.achXp > 0)            rows.push(['🏆 成就獎勵', settle.achXp]);
        if (settle.dailyGoalHit)         rows.push(['📅 每日目標達成', Progress.DAILY_GOAL_XP]);
        const total = rows.reduce((acc, [, v]) => acc + v, 0);
        el.xpBreakdownRows.innerHTML = rows.map(([lbl, v]) =>
          `<div class="xp-row"><span>${lbl}</span><span>+${v}</span></div>`
        ).join('') + `<div class="xp-row xp-row-total"><span>合計</span><span>+${total} XP</span></div>`;
        el.xpBreakdown.style.display = 'block';
      } else {
        el.xpBreakdown.style.display = 'none';
      }
    }

    // ── 標題與數值 ──
    if (settle.pass) {
      el.resIcon.textContent  = '👀';
      el.resTitle.textContent = '觀望不交易';
      el.resTitle.className   = 'result-status-title';
    } else {
      el.resIcon.textContent  = isCorrect ? '🎉' : '😭';
      el.resTitle.textContent = isCorrect ? '預測成功！' : '看錯方向！';
      el.resTitle.className   = `result-status-title ${isCorrect ? 'win' : 'lose'}`;
    }

    el.resStockPnl.textContent = changeText;
    el.resStockPnl.className   = `res-item-val ${stock_return_pct >= 0 ? 'positive' : 'negative'}`;

    const pnl = settle.pnl;
    const formattedPnl = `${pnl >= 0 ? '+$' : '-$'}${Math.abs(Math.round(pnl)).toLocaleString()}`;
    el.resPnl.textContent = formattedPnl;
    el.resPnl.className   = `res-item-val ${pnl >= 0 ? 'positive' : 'negative'}`;

    el.resDesc.innerHTML = descText;
    el.resultPanel.classList.add('visible');
  }

  function disableActionButtons(disabled) {
    [el.btnUp, el.btnDown, el.btnPass].forEach(btn => {
      btn.disabled      = disabled;
      btn.style.opacity = disabled ? '0.5' : '1';
    });
  }

  // ==========================================
  // 3. 均線解鎖（等級獎勵）
  // ==========================================

  function applyMAUnlocks() {
    const unlocked = Progress.unlockedMAs;
    stockChart.setMAs(unlocked, Progress.MA_COLORS);
    renderMALegend(unlocked);
  }

  function renderMALegend(unlocked) {
    if (!el.maLegend) return;
    const allRewards = Object.entries(Progress.LEVEL_REWARDS)
      .filter(([, r]) => r.type === 'ma')
      .map(([lv, r]) => ({ lv: Number(lv), ...r }));

    el.maLegend.innerHTML = allRewards.map(r => {
      const isOn = unlocked.includes(r.key);
      const color = Progress.MA_COLORS[r.key];
      return isOn
        ? `<span class="ma-tag" style="color:${color};border-color:${color}55"><span class="ma-dot" style="background:${color}"></span>${r.key}</span>`
        : `<span class="ma-tag ma-locked" title="Lv.${r.lv} 解鎖">🔒${r.key}</span>`;
    }).join('');
  }

  // ==========================================
  // 4. Fun Game Effects
  // ==========================================

  function triggerShake() {
    el.mainContent.classList.remove('screen-shake');
    void el.mainContent.offsetWidth;
    el.mainContent.classList.add('screen-shake');
    setTimeout(() => el.mainContent.classList.remove('screen-shake'), 600);
  }

  function showLevelUp(level, rewards = []) {
    el.levelUpTitle.textContent = '升　級！';
    const rewardText = rewards.length > 0 ? `　解鎖 ${rewards.map(r => r.name).join('、')}！` : '';
    el.levelUpSub.textContent = `恭喜達到 Lv.${level} 🎊${rewardText}`;
    el.levelUpOverlay.classList.remove('show');
    void el.levelUpOverlay.offsetWidth;
    el.levelUpOverlay.classList.add('show');
    setTimeout(() => el.levelUpOverlay.classList.remove('show'), rewards.length > 0 ? 2600 : 1800);
  }

  // Achievement toast queue — shows each one sequentially
  let _toastQueue = [];
  let _toastBusy  = false;

  function showAchievementToasts(achievements) {
    achievements.forEach(a => {
      _toastQueue.push({ name: a.name, icon: a.icon, xp: a.xp });
    });
    if (!_toastBusy) _drainToastQueue();
  }

  function _drainToastQueue() {
    if (_toastQueue.length === 0) { _toastBusy = false; return; }
    _toastBusy = true;
    const def = _toastQueue.shift();
    el.toastIcon.textContent = def.icon;
    el.toastName.textContent = def.name;
    el.toastXp.textContent   = def.xp > 0 ? `+${def.xp} XP` : '';
    el.achievementToast.classList.add('show');
    soundManager.achievement();
    setTimeout(() => {
      el.achievementToast.classList.remove('show');
      setTimeout(_drainToastQueue, 350);
    }, 2800);
  }

  // Canvas confetti burst on correct prediction
  function launchConfetti() {
    const canvas = el.confettiCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const COLORS = ['#f59e0b','#ef4444','#10b981','#3b82f6','#8b5cf6','#ec4899','#fbbf24','#34d399'];
    const COUNT   = 100;
    const particles = Array.from({ length: COUNT }, () => ({
      x:     Math.random() * canvas.width,
      y:     -10 - Math.random() * 120,
      w:     5 + Math.random() * 10,
      h:     3 + Math.random() * 5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      angle: Math.random() * Math.PI * 2,
      spin:  (Math.random() - 0.5) * 0.22,
      vx:    (Math.random() - 0.5) * 5,
      vy:    2.5 + Math.random() * 4,
      alpha: 1,
    }));

    let animId;
    const tick = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let any = false;
      particles.forEach(p => {
        p.x     += p.vx;
        p.y     += p.vy;
        p.vy    += 0.09;
        p.angle += p.spin;
        p.alpha -= 0.007;
        if (p.alpha > 0 && p.y < canvas.height) {
          any = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
          ctx.restore();
        }
      });
      animId = any ? requestAnimationFrame(tick) : void ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    cancelAnimationFrame(animId);
    requestAnimationFrame(tick);
  }

  // ==========================================
  // 5. 成就收藏牆 / 每日修練 Modal
  // ==========================================

  function renderAchievementWall() {
    const wall = Progress.getAchievementWall();
    const unlockedCount = wall.filter(a => a.unlocked).length;
    el.achWallCount.textContent = `${unlockedCount}/${wall.length}`;

    el.achWallGrid.innerHTML = wall.map(a => {
      if (a.unlocked) {
        return `<div class="ach-cell unlocked">
          <div class="ach-cell-icon">${a.icon}</div>
          <div class="ach-cell-name">${a.name}</div>
          <div class="ach-cell-desc">${a.desc}</div>
          <div class="ach-cell-xp">+${a.xp} XP</div>
        </div>`;
      }
      const prog = a.progressInfo
        ? `<div class="ach-cell-track"><div class="ach-cell-fill" style="width:${a.progressInfo.pct}%"></div></div>
           <div class="ach-cell-prog">${Math.floor(a.progressInfo.cur).toLocaleString()}/${a.progressInfo.target.toLocaleString()}</div>`
        : '';
      return `<div class="ach-cell">
        <div class="ach-cell-icon locked-icon">${a.icon}</div>
        <div class="ach-cell-name">${a.name}</div>
        <div class="ach-cell-desc">${a.desc}</div>
        ${prog}
      </div>`;
    }).join('');
  }

  function renderDailyModal() {
    const s = Progress.state;
    Progress.touchDay();
    el.dailyStreakDays.textContent = s.dayStreak;
    el.dailyStreakFire.textContent = s.dayStreak >= 7 ? '🔥🔥' : '🔥';
    const cur = Math.min(s.todayRounds, Progress.DAILY_GOAL_ROUNDS);
    el.dailyGoalCount.textContent = `${cur}/${Progress.DAILY_GOAL_ROUNDS}`;
    el.dailyGoalFill.style.width  = `${(cur / Progress.DAILY_GOAL_ROUNDS) * 100}%`;
    const claimed = s.dailyGoalClaimed === s.todayDate;
    el.dailyGoalReward.textContent = claimed
      ? `✅ 今日獎勵已領取 +${Progress.DAILY_GOAL_XP} XP`
      : `達成獎勵：+${Progress.DAILY_GOAL_XP} XP`;
    el.dailyGoalReward.style.color = claimed ? 'var(--color-gold)' : '';
  }

  // ==========================================
  // 6. Swipe Gestures (Mobile)
  // ==========================================

  function initSwipeGestures() {
    const panel = el.chartPanel;
    if (!panel) return;

    let startY = 0, startX = 0, moved = false;

    panel.addEventListener('touchstart', e => {
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
      moved  = false;
    }, { passive: true });

    panel.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;
      if (Math.abs(dy) > 15 && Math.abs(dy) > Math.abs(dx)) {
        moved = true;
        const hint = el.swipeHintOverlay;
        hint.textContent  = dy < 0 ? '↑' : '↓';
        hint.style.color  = dy < 0 ? 'var(--color-up)' : 'var(--color-down)';
        hint.classList.add('show');
      }
    }, { passive: true });

    panel.addEventListener('touchend', e => {
      el.swipeHintOverlay.classList.remove('show');
      if (!moved || state.isAnimating || state.hasGuessed) return;
      const dy = e.changedTouches[0].clientY - startY;
      const dx = e.changedTouches[0].clientX - startX;
      if (Math.abs(dy) > 55 && Math.abs(dy) > Math.abs(dx) * 1.5) {
        makeGuess(dy < 0 ? 'UP' : 'DOWN');
      }
      moved = false;
    }, { passive: true });
  }

  // ==========================================
  // 7. Keyboard Shortcuts
  // ==========================================

  function initKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (document.querySelector('.modal-overlay.visible')) return;
      if (el.tutorialOverlay.classList.contains('show')) return;

      if (state.hasGuessed) {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); loadNewRound(); }
        return;
      }
      switch (e.key) {
        case 'ArrowUp':   e.preventDefault(); makeGuess('UP');   break;
        case 'ArrowDown': e.preventDefault(); makeGuess('DOWN'); break;
        case 'p': case 'P':
          if (!state.isAnimating) makeGuess('PASS');
          break;
      }
    });
  }

  // ==========================================
  // 8. Tutorial (First-Time Onboarding)
  // ==========================================

  let _tutorialStep = 0;

  function initTutorial() {
    if (!safeStorage.getItem('kline_tutorial_done')) {
      setTimeout(showTutorial, 900);
    }
  }

  function showTutorial() {
    _tutorialStep = 0;
    _renderTutorialStep();
    el.tutorialOverlay.classList.add('show');
  }

  function _renderTutorialStep() {
    el.tutorialSteps.forEach((s, i) => s.classList.toggle('active', i === _tutorialStep));
    el.tutorialDots.forEach((d, i) => d.classList.toggle('active', i === _tutorialStep));
    const isLast = _tutorialStep === el.tutorialSteps.length - 1;
    el.btnTutorialNext.textContent = isLast ? '🚀 開始修練！' : '下一步 →';
  }

  el.btnTutorialNext.addEventListener('click', () => {
    soundManager.click();
    if (_tutorialStep < el.tutorialSteps.length - 1) {
      _tutorialStep++;
      _renderTutorialStep();
    } else {
      _closeTutorial();
    }
  });
  el.btnTutorialSkip.addEventListener('click', () => {
    soundManager.click();
    _closeTutorial();
  });

  function _closeTutorial() {
    el.tutorialOverlay.classList.remove('show');
    safeStorage.setItem('kline_tutorial_done', '1');
  }

  // ==========================================
  // 9. PWA Install Prompt
  // ==========================================

  let _deferredInstall = null;

  function initInstallPrompt() {
    if (safeStorage.getItem('pwa_install_dismissed')) return;
    window.addEventListener('beforeinstallprompt', e => {
      e.preventDefault();
      _deferredInstall = e;
      setTimeout(() => el.installBanner.classList.add('show'), 4000);
    });
    el.btnInstall.addEventListener('click', async () => {
      if (!_deferredInstall) return;
      el.installBanner.classList.remove('show');
      _deferredInstall.prompt();
      await _deferredInstall.userChoice;
      _deferredInstall = null;
    });
    el.btnDismissInstall.addEventListener('click', () => {
      el.installBanner.classList.remove('show');
      safeStorage.setItem('pwa_install_dismissed', '1');
    });
  }

  // ==========================================
  // 10. Local Prefs (localStorage)
  // ==========================================

  function saveLocalPrefs() {
    safeStorage.setItem('kline_trainer_prefs', JSON.stringify({
      isTaiwanStyle: state.isTaiwanStyle,
      isBlindMode:   state.isBlindMode,
      horizon:       state.horizon,
      soundEnabled:  soundManager.enabled,
    }));
  }

  function loadLocalPrefs() {
    const saved = safeStorage.getItem('kline_trainer_prefs');
    if (!saved) return;
    try {
      const p = JSON.parse(saved);
      state.isTaiwanStyle    = p.isTaiwanStyle ?? true;
      state.isBlindMode      = p.isBlindMode   ?? true;
      state.horizon          = p.horizon       ?? 5;
      soundManager.enabled   = p.soundEnabled  ?? true;
    } catch {}
  }

  function updateSettingsUI() {
    const tw = state.isTaiwanStyle;
    document.body.className = tw ? 'tw-style' : 'global-style';
    el.settingColorToggle.textContent = tw ? '台股(紅漲)' : '美股(綠漲)';
    el.settingColorToggle.style.cssText = tw
      ? 'width:80px;font-size:0.8rem;font-weight:bold;background:rgba(239,68,68,0.15);color:#ef4444;border-color:rgba(239,68,68,0.3)'
      : 'width:80px;font-size:0.8rem;font-weight:bold;background:rgba(16,185,129,0.15);color:#10b981;border-color:rgba(16,185,129,0.3)';
    stockChart.updateColors(state.isTaiwanStyle);

    el.modeBlind.classList.toggle('active', state.isBlindMode);
    el.modeClassic.classList.toggle('active', !state.isBlindMode);
    el.horizonBtns.forEach(b => b.classList.toggle('active', parseInt(b.dataset.horizon) === state.horizon));

    _updateSoundUI();
  }

  function _updateSoundUI() {
    const on = soundManager.enabled;
    if (el.soundIcon)        el.soundIcon.textContent = on ? '🔊' : '🔇';
    if (el.settingSoundToggle) el.settingSoundToggle.textContent = on ? '🔊 開啟' : '🔇 關閉';
  }

  // ==========================================
  // 11. Event Bindings
  // ==========================================

  el.btnUp.addEventListener('click',   () => makeGuess('UP'));
  el.btnDown.addEventListener('click', () => makeGuess('DOWN'));
  el.btnPass.addEventListener('click', () => {
    if (state.isAnimating || state.hasGuessed) return;
    makeGuess('PASS');
  });

  el.btnNext.addEventListener('click', () => { soundManager.click(); loadNewRound(); });
  el.btnReview?.addEventListener('click', () => {
    soundManager.click();
    el.resultPanel.classList.remove('visible');
    if (el.floatingNext) el.floatingNext.style.display = 'block';
  });
  el.btnFloatingNext?.addEventListener('click', () => { soundManager.click(); loadNewRound(); });

  el.btnCandles.addEventListener('click', () => {
    soundManager.click();
    el.btnCandles.classList.add('active');
    el.btnArea.classList.remove('active');
    stockChart.setChartMode('candles');
  });
  el.btnArea.addEventListener('click', () => {
    soundManager.click();
    el.btnArea.classList.add('active');
    el.btnCandles.classList.remove('active');
    stockChart.setChartMode('area');
  });

  el.modeBlind.addEventListener('click', () => {
    if (state.isBlindMode) return;
    soundManager.click();
    state.isBlindMode = true;
    updateSettingsUI(); saveLocalPrefs(); loadNewRound();
  });
  el.modeClassic.addEventListener('click', () => {
    if (!state.isBlindMode) return;
    soundManager.click();
    state.isBlindMode = false;
    updateSettingsUI(); saveLocalPrefs(); loadNewRound();
  });

  el.horizonBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.isAnimating) return;
      const h = parseInt(btn.dataset.horizon);
      if (state.horizon === h) return;
      soundManager.click();
      state.horizon = h;
      updateSettingsUI(); saveLocalPrefs(); loadNewRound();
    });
  });

  el.tradePercentage.addEventListener('input', e => {
    el.sliderPercentageLbl.textContent = `${e.target.value}%`;
  });
  el.quickPercentageBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      soundManager.click();
      const val = btn.dataset.val;
      el.tradePercentage.value = val;
      el.sliderPercentageLbl.textContent = `${val}%`;
    });
  });

  // Sound toggle (header + settings)
  const _toggleSound = () => {
    soundManager.init();
    soundManager.toggle();
    _updateSoundUI();
    saveLocalPrefs();
    if (soundManager.enabled) soundManager.click();
  };
  el.btnSound.addEventListener('click', _toggleSound);
  el.settingSoundToggle?.addEventListener('click', _toggleSound);

  // Daily practice modal
  el.btnDaily.addEventListener('click', () => {
    soundManager.click();
    renderDailyModal();
    el.dailyModal.classList.add('visible');
  });
  el.btnCloseDaily.addEventListener('click', () => { soundManager.click(); el.dailyModal.classList.remove('visible'); });
  el.dailyModal.addEventListener('click', e => { if (e.target === el.dailyModal) el.dailyModal.classList.remove('visible'); });

  // Achievement wall modal
  el.btnAchievements.addEventListener('click', () => {
    soundManager.click();
    renderAchievementWall();
    el.achievementsModal.classList.add('visible');
  });
  el.btnCloseAchievements.addEventListener('click', () => { soundManager.click(); el.achievementsModal.classList.remove('visible'); });
  el.achievementsModal.addEventListener('click', e => { if (e.target === el.achievementsModal) el.achievementsModal.classList.remove('visible'); });

  // Settings Modal
  el.btnSettings.addEventListener('click', () => { soundManager.click(); el.settingsModal.classList.add('visible'); });
  el.btnCloseSettings.addEventListener('click', () => { soundManager.click(); el.settingsModal.classList.remove('visible'); });
  el.settingsModal.addEventListener('click', e => { if (e.target === el.settingsModal) el.settingsModal.classList.remove('visible'); });

  el.settingColorToggle.addEventListener('click', () => {
    soundManager.click();
    state.isTaiwanStyle = !state.isTaiwanStyle;
    updateSettingsUI(); saveLocalPrefs();
  });

  el.settingResetBtn.addEventListener('click', () => {
    if (!confirm("確定要清除所有紀錄（資金、XP、等級、成就、每日修練）並重置帳戶嗎？此動作無法復原！")) return;
    Progress.reset();
    applyMAUnlocks();
    updateSidebarUI();
    updateDailyBadge();
    el.settingsModal.classList.remove('visible');
    loadNewRound();
  });

  el.settingTutorialBtn?.addEventListener('click', () => {
    soundManager.click();
    el.settingsModal.classList.remove('visible');
    showTutorial();
  });

  // Info Modal
  el.btnInfo.addEventListener('click', () => { soundManager.click(); el.infoModal.classList.add('visible'); });
  el.btnCloseInfo.addEventListener('click', () => { soundManager.click(); el.infoModal.classList.remove('visible'); });
  el.infoModal.addEventListener('click', e => { if (e.target === el.infoModal) el.infoModal.classList.remove('visible'); });

});
