/**
 * Offline Engine v1.0 — 無後端時的本地出題引擎
 * 後端連不上時，lazy-load js/data.js（內嵌台股歷史資料），
 * 由前端自行隨機切窗口出題，保證遊戲永遠可玩。
 */
(function () {
  'use strict';

  const HISTORY_LENGTH = 120;
  let _loadPromise = null;
  let _sessions = {};      // sessionId -> {code, name, history, future}
  let _seq = 1;

  /** 動態載入 data.js（只載一次） */
  function ensureData() {
    if (typeof TAIWAN_STOCKS !== 'undefined') return Promise.resolve();
    if (_loadPromise) return _loadPromise;
    _loadPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'js/data.js?v=1.0.0';
      s.onload = () => (typeof TAIWAN_STOCKS !== 'undefined') ? resolve() : reject(new Error('離線資料載入失敗'));
      s.onerror = () => reject(new Error('離線資料載入失敗'));
      document.head.appendChild(s);
    });
    return _loadPromise;
  }

  const OfflineEngine = {
    available: true,

    async getNewRound({ horizon = 5, isBlind = true } = {}) {
      await ensureData();

      const codes = Object.keys(TAIWAN_STOCKS);
      // 最多嘗試 10 次找到資料足夠的股票
      for (let attempt = 0; attempt < 10; attempt++) {
        const code = codes[Math.floor(Math.random() * codes.length)];
        const stock = TAIWAN_STOCKS[code];
        const data = stock.data;
        const total = data.length;
        if (total < HISTORY_LENGTH + horizon) continue;

        const maxStart = total - HISTORY_LENGTH - horizon;
        const startIdx = Math.floor(Math.random() * (maxStart + 1));
        const history = data.slice(startIdx, startIdx + HISTORY_LENGTH);
        const future = data.slice(startIdx + HISTORY_LENGTH, startIdx + HISTORY_LENGTH + horizon);

        const sessionId = `offline-${_seq++}`;
        _sessions[sessionId] = { code, name: stock.name, history, future };

        return {
          session_id: sessionId,
          stock_name: isBlind ? '神秘台股 (???)' : `${stock.name} (${code})`,
          stock_code: isBlind ? '???' : code,
          history_data: history,
          horizon,
          is_blind: isBlind,
          offline: true,
          // 進度欄位由前端 Progress 引擎接管，這裡只回填佔位值
          capital: 0, level: 1, experience: 0, xp_next_level: 0,
          rank_icon: '', rank_title: '',
        };
      }
      throw new Error('離線資料不足，無法出題');
    },

    async submitAnswer({ sessionId, guess, positionPct, horizon }) {
      const sess = _sessions[sessionId];
      if (!sess) throw new Error('找不到離線題目，請重新抽題');
      delete _sessions[sessionId];

      const pStart = sess.history[sess.history.length - 1].close;
      const pEnd = sess.future[sess.future.length - 1].close;
      const stockReturn = (pEnd - pStart) / pStart;
      const stockReturnPct = Math.round(stockReturn * 10000) / 100;
      const actual = pEnd > pStart ? 'UP' : (pEnd < pStart ? 'DOWN' : 'DRAW');
      const isCorrect = guess === actual || actual === 'DRAW';

      return {
        is_correct: isCorrect,
        actual_direction: actual,
        stock_name: sess.name,
        stock_code: sess.code,
        price_start: pStart,
        price_end: pEnd,
        stock_return_pct: stockReturnPct,
        future_data: sess.future,
        offline: true,
        // 損益/XP/成就由前端 Progress 引擎計算，以下為佔位值
        pnl: 0, capital_after: 0, xp_earned: 0,
        level_before: 1, level_after: 1, level_up: false,
        new_achievements: [], rank_icon: '', rank_title: '',
      };
    },
  };

  window.OfflineEngine = OfflineEngine;
})();
