/**
 * SoundManager - Web Audio API 合成音效
 * 無需外部音頻檔案，全部即時合成
 */
class SoundManager {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this._ready = false;
  }

  _ensureCtx() {
    if (!this._ready) {
      try {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this._ready = true;
      } catch (e) {
        console.warn('[Sound] Web Audio API 不支援:', e);
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
  }

  _tone(freq, type, duration, volume = 0.25, delay = 0) {
    if (!this.enabled || !this.ctx) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = type;
      osc.frequency.value = freq;

      const t = this.ctx.currentTime + delay;
      gain.gain.setValueAtTime(0, t);
      gain.gain.linearRampToValueAtTime(volume, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.start(t);
      osc.stop(t + duration + 0.01);
    } catch (e) {}
  }

  // 初始化（需要用戶交互後才能使用 AudioContext）
  init() {
    this._ensureCtx();
  }

  // 按鈕點擊
  click() {
    this._ensureCtx();
    this._tone(880, 'sine', 0.06, 0.12);
  }

  // 看漲/看跌按鈕按下
  actionUp() {
    this._ensureCtx();
    this._tone(660, 'sine', 0.08, 0.15);
    this._tone(880, 'sine', 0.08, 0.12, 0.06);
  }

  actionDown() {
    this._ensureCtx();
    this._tone(440, 'sine', 0.08, 0.15);
    this._tone(330, 'sine', 0.08, 0.12, 0.06);
  }

  // 預測成功 - 上升琶音
  win() {
    this._ensureCtx();
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => this._tone(f, 'sine', 0.3, 0.22, i * 0.1));
  }

  // 預測失敗 - 下降悶音
  loss() {
    this._ensureCtx();
    this._tone(330, 'sawtooth', 0.12, 0.18);
    this._tone(220, 'sawtooth', 0.25, 0.15, 0.1);
    this._tone(110, 'triangle', 0.35, 0.1, 0.22);
  }

  // 連勝 combo 音效
  streak(count) {
    this._ensureCtx();
    const base = 440 + Math.min(count, 10) * 30;
    this._tone(base, 'sine', 0.12, 0.18);
    this._tone(base * 1.25, 'sine', 0.1, 0.15, 0.1);
    this._tone(base * 1.5, 'sine', 0.1, 0.12, 0.18);
  }

  // 升級號角
  levelUp() {
    this._ensureCtx();
    const notes = [523, 659, 784, 880, 1047, 1319];
    notes.forEach((f, i) => this._tone(f, 'triangle', 0.35, 0.25, i * 0.09));
    this._tone(1568, 'sine', 0.7, 0.3, 0.54);
  }

  // 成就解鎖音效
  achievement() {
    this._ensureCtx();
    const notes = [784, 988, 1175, 1568];
    notes.forEach((f, i) => this._tone(f, 'sine', 0.35, 0.2, i * 0.07));
  }

  // 觀望音效
  pass() {
    this._ensureCtx();
    this._tone(500, 'sine', 0.15, 0.1);
    this._tone(450, 'sine', 0.2, 0.08, 0.12);
  }

  toggle() {
    this.enabled = !this.enabled;
    return this.enabled;
  }
}

const soundManager = new SoundManager();
