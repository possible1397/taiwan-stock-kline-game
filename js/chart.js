/**
 * StockChart Manager - Wraps TradingView Lightweight Charts integration.
 */
class StockChart {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this.chart = null;
    this.candleSeries = null;
    this.areaSeries = null;
    this.volumeSeries = null;
    this.currentMode = 'candles'; // 'candles' or 'area'
    this.isTaiwanStyle = true;
    this.animationInterval = null;
    this.maSeries = {};        // key (MA5/MA10/...) -> LineSeries
    this.activeMAs = [];       // 目前要顯示的均線 key
    this.maColors = {};        // key -> color
    this._closes = [];         // 累積收盤價（含已揭示的未來日），供 MA 即時計算
  }

  /**
   * Initialize chart instance with dark-mode responsive layout
   */
  init(isTaiwanStyle = true) {
    this.isTaiwanStyle = isTaiwanStyle;

    // Safeguard assertion for the chart library
    if (typeof LightweightCharts === 'undefined') {
      alert("⚠️ 錯誤：未偵測到 TradingView Lightweight Charts 程式庫！\n請確認 libs/lightweight-charts.js 檔案路徑正確，或嘗試清除瀏覽器快取後重新整理。");
      throw new Error("LightweightCharts library is not defined. Make sure libs/lightweight-charts.js is loaded correctly.");
    }

    if (!this.container) {
      console.error("Chart container element not found!");
      return;
    }

    // Defensive layout dimension calculations to prevent crashes with 0 width/height
    const containerWidth = this.container.clientWidth || (this.container.parentElement ? this.container.parentElement.clientWidth : 0) || 600;
    const containerHeight = this.container.clientHeight || 320;

    // Standard chart options
    const chartOptions = {
      width: containerWidth,
      height: containerHeight,
      layout: {
        background: { type: 'solid', color: '#0b0f19' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'Inter', system-ui, sans-serif",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.03)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
      },
      crosshair: {
        mode: 1, // CrosshairMode.Normal
        vertLine: {
          color: 'rgba(255, 255, 255, 0.25)',
          width: 1,
          style: 3, // LineStyle.Dashed
          labelBackgroundColor: '#1e293b',
        },
        horzLine: {
          color: 'rgba(255, 255, 255, 0.25)',
          width: 1,
          style: 3, // LineStyle.Dashed
          labelBackgroundColor: '#1e293b',
        },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        visible: true,
        alignLabels: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.08)',
        timeVisible: false,
        ticksVisible: false,       // 隱藏 X 軸刻度線
        tickMarkFormatter: () => '', // 隱藏所有日期標籤文字
        rightOffset: 5,
        barSpacing: 6,
        minBarSpacing: 3,
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
      },
      handleScroll: {
        mouseDrag: true,
        touchDrag: true,
      }
    };

    // Create chart
    this.chart = LightweightCharts.createChart(this.container, chartOptions);

    // Setup Series
    this.setupSeries();

    // Responsive design handler
    this.resizeObserver = new ResizeObserver(entries => {
      if (entries.length === 0 || !this.chart) return;
      const { width, height } = entries[0].contentRect;
      this.chart.resize(width, height || 320);
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * Configure Series (Candles, Area, and Volume Overlay)
   */
  setupSeries() {
    const colors = this.getSeriesColors();

    // 1. Candlestick Series
    this.candleSeries = this.chart.addCandlestickSeries({
      upColor: colors.up,
      downColor: colors.down,
      borderVisible: false,
      wickUpColor: colors.up,
      wickDownColor: colors.down,
      priceFormat: {
        type: 'price',
        precision: 2,
        minMove: 0.01,
      }
    });

    // 2. Area Series (Alternate View)
    this.areaSeries = this.chart.addAreaSeries({
      topColor: colors.up + '30',
      bottomColor: colors.up + '00',
      lineColor: colors.up,
      lineWidth: 2,
      visible: false,
      priceFormat: {
        type: 'price',
        precision: 2,
      }
    });

    // 3. Volume Histogram Series (Overlay at the bottom 20% of the chart)
    this.volumeSeries = this.chart.addHistogramSeries({
      color: '#4b5563',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume-scale', // Separate scale ID
    });

    // Configure volume overlay vertical scale
    this.chart.priceScale('volume-scale').applyOptions({
      scaleMargins: {
        top: 0.8, // Takes up the bottom 20%
        bottom: 0,
      },
      visible: false,
    });
  }

  /**
   * Helper to retrieve colors according to preference standard
   */
  getSeriesColors() {
    // Taiwan Standard: Rise = Red, Fall = Green
    // Global Standard: Rise = Green, Fall = Red
    if (this.isTaiwanStyle) {
      return {
        up: '#ef4444',
        down: '#10b981',
      };
    } else {
      return {
        up: '#10b981',
        down: '#ef4444',
      };
    }
  }

  /**
   * Update color configurations dynamically
   */
  updateColors(isTaiwanStyle) {
    this.isTaiwanStyle = isTaiwanStyle;
    const colors = this.getSeriesColors();

    if (this.candleSeries) {
      this.candleSeries.applyOptions({
        upColor: colors.up,
        downColor: colors.down,
        wickUpColor: colors.up,
        wickDownColor: colors.down,
      });
    }

    if (this.areaSeries) {
      this.areaSeries.applyOptions({
        topColor: colors.up + '30',
        bottomColor: colors.up + '00',
        lineColor: colors.up,
      });
    }
  }

  /**
   * Toggle between Candle representation and Line Area representation
   */
  setChartMode(mode) {
    this.currentMode = mode;
    const showCandles = mode === 'candles';
    
    this.candleSeries.applyOptions({ visible: showCandles });
    this.areaSeries.applyOptions({ visible: !showCandles });
  }

  /**
   * 設定要顯示哪些均線（依玩家等級解鎖）
   * @param {Array<string>} keys - e.g. ['MA5','MA20']
   * @param {Object} colors - key -> hex color
   */
  setMAs(keys, colors = {}) {
    this.activeMAs = keys || [];
    this.maColors = colors;

    // 移除不再需要的均線
    Object.keys(this.maSeries).forEach(key => {
      if (!this.activeMAs.includes(key)) {
        this.chart.removeSeries(this.maSeries[key]);
        delete this.maSeries[key];
      }
    });

    // 建立新需要的均線
    this.activeMAs.forEach(key => {
      if (!this.maSeries[key]) {
        this.maSeries[key] = this.chart.addLineSeries({
          color: this.maColors[key] || '#fbbf24',
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        });
      }
    });
  }

  /** 均線週期：MA5 → 5 */
  _maPeriod(key) {
    return parseInt(key.replace('MA', ''), 10) || 5;
  }

  /** 重算並繪製所有啟用中的均線（基於 this._closes） */
  _renderMAs() {
    this.activeMAs.forEach(key => {
      const series = this.maSeries[key];
      if (!series) return;
      const period = this._maPeriod(key);
      const data = [];
      let sum = 0;
      for (let i = 0; i < this._closes.length; i++) {
        sum += this._closes[i].close;
        if (i >= period) sum -= this._closes[i - period].close;
        if (i >= period - 1) {
          data.push({ time: this._closes[i].time, value: sum / period });
        }
      }
      series.setData(data);
    });
  }

  /** 揭示新K棒時即時更新均線最新值 */
  _updateMAsTick() {
    const n = this._closes.length;
    this.activeMAs.forEach(key => {
      const series = this.maSeries[key];
      if (!series) return;
      const period = this._maPeriod(key);
      if (n < period) return;
      let sum = 0;
      for (let i = n - period; i < n; i++) sum += this._closes[i].close;
      series.update({ time: this._closes[n - 1].time, value: sum / period });
    });
  }

  /**
   * Clear all active series data
   */
  clear() {
    if (this.animationInterval) {
      clearInterval(this.animationInterval);
      this.animationInterval = null;
    }

    this.candleSeries.setData([]);
    this.areaSeries.setData([]);
    this.volumeSeries.setData([]);
    Object.values(this.maSeries).forEach(s => s.setData([]));
    this._closes = [];
  }

  /**
   * Render initial historical K-line set
   * @param {Array} historyData - All daily stock quotes
   * @param {Number} count - Total days to show in training screen (e.g. 120)
   */
  loadData(historyData) {
    this.clear();

    const candleData = [];
    const areaData = [];
    const volumeData = [];

    historyData.forEach((item, index) => {
      // Map time and price points
      const openPrice = parseFloat(item.open);
      const closePrice = parseFloat(item.close);
      
      candleData.push({
        time: item.time,
        open: openPrice,
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: closePrice
      });

      areaData.push({
        time: item.time,
        value: closePrice
      });

      // Volume color is green/red depending on day performance
      const isUp = closePrice >= openPrice;
      const colors = this.getSeriesColors();
      
      volumeData.push({
        time: item.time,
        value: parseInt(item.volume),
        color: isUp ? colors.up + '80' : colors.down + '80'
      });
    });

    this.candleSeries.setData(candleData);
    this.areaSeries.setData(areaData);
    this.volumeSeries.setData(volumeData);

    // 均線
    this._closes = historyData.map(d => ({ time: d.time, close: parseFloat(d.close) }));
    this._renderMAs();

    // Auto-fit contents in screen
    this.chart.timeScale().fitContent();
  }

  /**
   * Run dynamic reveal animation daily up to the prediction horizon
   * @param {Array} futureData - Days to reveal in animation
   * @param {Number} delayMs - Tick speed (millisecond per day)
   * @param {Function} onProgress - Call back to update prices/status on each day
   * @param {Function} onComplete - Callback when prediction horizon is fully revealed
   */
  revealFutureData(futureData, delayMs = 80, onProgress = null, onComplete = null) {
    if (this.animationInterval) clearInterval(this.animationInterval);

    let index = 0;
    const colors = this.getSeriesColors();

    this.animationInterval = setInterval(() => {
      if (index >= futureData.length) {
        clearInterval(this.animationInterval);
        this.animationInterval = null;
        if (onComplete) onComplete();
        return;
      }

      const day = futureData[index];
      const openPrice = parseFloat(day.open);
      const closePrice = parseFloat(day.close);

      // Append next candle
      this.candleSeries.update({
        time: day.time,
        open: openPrice,
        high: parseFloat(day.high),
        low: parseFloat(day.low),
        close: closePrice
      });

      this.areaSeries.update({
        time: day.time,
        value: closePrice
      });

      const isUp = closePrice >= openPrice;
      this.volumeSeries.update({
        time: day.time,
        value: parseInt(day.volume),
        color: isUp ? colors.up + '80' : colors.down + '80'
      });

      // 均線即時更新
      this._closes.push({ time: day.time, close: closePrice });
      this._updateMAsTick();

      // Focus chart view onto new values
      this.chart.timeScale().scrollToPosition(1, true);

      if (onProgress) {
        onProgress(day, index + 1);
      }

      index++;
    }, delayMs);
  }

  /**
   * Destroy instance resources
   */
  destroy() {
    if (this.animationInterval) clearInterval(this.animationInterval);
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }
}
