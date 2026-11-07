/**
 * API Client — 與後端通訊的統一介面
 * 開發時指向 localhost:8000，部署後改成正式網域
 */

// ★ Railway 正式部署網址（部署後請在這裡填入你的 Railway URL）
const RAILWAY_URL = "https://taiwan-stock-kline-game.up.railway.app";

// 自動偵測執行環境：
//   - Capacitor 原生 App (capacitor://) → 使用 Railway URL
//   - localhost 開發 → 使用本機後端
//   - 同域部署 (Railway) → 留空，走相對路徑
const _host = window.location.hostname;
const _isNativeApp = window.location.protocol === "capacitor:" ||
                     _host === "" ||
                     typeof window.Capacitor !== "undefined";

const API_BASE = _isNativeApp
  ? RAILWAY_URL
  : (_host === "localhost" || _host === "127.0.0.1")
    ? "http://localhost:8000"
    : "";  // Railway 同域部署

const api = {
  _token: null,
  offlineMode: false,   // 後端不可用時切換為離線出題

  // ── 設定 JWT Token ──────────────────────
  setToken(token) {
    this._token = token;
    if (token) {
      safeStorage.setItem("auth_token", token);
    }
  },

  loadToken() {
    this._token = safeStorage.getItem("auth_token");
  },

  // ── 基礎 fetch 包裝 ─────────────────────
  async _fetch(path, options = {}) {
    const headers = {
      "Content-Type": "application/json",
      ...(this._token ? { "Authorization": `Bearer ${this._token}` } : {}),
      ...options.headers,
    };

    // 8 秒逾時保護，避免後端無回應時卡死載入畫面
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);

    let resp;
    try {
      resp = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({ detail: resp.statusText }));
      throw new Error(err.detail || `API 錯誤 ${resp.status}`);
    }

    return resp.json();
  },

  // ── 遊戲 API ────────────────────────────

  /**
   * 取得新一題（後端不可用時自動降級為離線出題）
   * @param {Object} opts - { horizon, isBlind, userId }
   */
  async getNewRound({ horizon = 5, isBlind = true, userId = null } = {}) {
    if (this.offlineMode) {
      return OfflineEngine.getNewRound({ horizon, isBlind });
    }
    try {
      const params = new URLSearchParams({
        horizon,
        is_blind: isBlind,
        ...(userId ? { user_id: userId } : {}),
      });
      return await this._fetch(`/api/game/round?${params}`);
    } catch (err) {
      // 連線類錯誤 → 切換離線模式；伺服器邏輯錯誤（4xx 訊息）原樣拋出
      if (typeof OfflineEngine !== "undefined") {
        console.warn("[API] 後端不可用，切換離線修練模式:", err.message);
        this.offlineMode = true;
        return OfflineEngine.getNewRound({ horizon, isBlind });
      }
      throw err;
    }
  },

  /**
   * 提交答案
   * @param {Object} body - { sessionId, guess, positionPct, isBlind, horizon }
   */
  async submitAnswer({ sessionId, guess, positionPct, isBlind, horizon }) {
    if (typeof sessionId === "string" && sessionId.startsWith("offline-")) {
      return OfflineEngine.submitAnswer({ sessionId, guess, positionPct, horizon });
    }
    return this._fetch("/api/game/submit", {
      method: "POST",
      body: JSON.stringify({
        session_id: sessionId,
        guess,
        position_pct: positionPct,
        is_blind: isBlind,
        horizon,
      }),
    });
  },

  /**
   * 取得技術指標清單（含解鎖狀態）
   */
  async getIndicators(userId = null) {
    const params = userId ? `?user_id=${userId}` : "";
    return this._fetch(`/api/game/indicators${params}`);
  },

  // ── 認證 API ────────────────────────────

  async register({ email, username, password }) {
    const data = await this._fetch("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ email, username, password }),
    });
    this.setToken(data.access_token);
    return data;
  },

  async login({ email, password }) {
    const formData = new URLSearchParams({ username: email, password });
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || "登入失敗");
    }
    const data = await resp.json();
    this.setToken(data.access_token);
    return data;
  },

  async getMe() {
    return this._fetch("/api/auth/me");
  },

  logout() {
    this._token = null;
    safeStorage.setItem("auth_token", "");
  },
};
