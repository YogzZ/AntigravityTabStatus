/**
 * Antigravity Tab Status - Top Frame Multi-Project Aggregator & Tab Status Light Presenter (v2.9.0)
 *
 * 严格兼容页面 Content Security Policy (worker-src 'self' / img-src 'self')：
 * - 完全移除页面内 Blob / Worker 创建，改用扩展后台 Service Worker Port 驱动动画与防抖计时器
 * - v2.7 纯净状态灯理念：绝不向浏览器标签页标题 (`document.title`) 追加任何状态文字，仅自动剥离旧版残留后缀
 * - 6 种可选状态灯风格 (`antigravity` / `gemini` / `glow` / `claude` / `geek` / `emoji`) × 2 种挂载布局 (`standalone` / `badge`)
 * - 遵循 `prefers-reduced-motion: reduce` 与 `< 3Hz` 安全闪烁频率规范
 * - 支持已折叠 Project 的三层无损对话状态读取与点击自动展开跳转
 * - 全局状态优先级：待处理 (waiting) > 未读 (unread) > 正在运行 (running) > 默认空闲 (idle)
 */

(() => {
  if (window.top !== window.self) return;
  if (window.__AGY_TAB_STATUS_V260__) return;
  window.__AGY_TAB_STATUS_V260__ = true;

  const FAVICON_ID = 'agy-status-favicon';
  const CANVAS_SIZE = 64;
  const COMPLETION_DEBOUNCE_MS = 1500;
  const TITLE_SUFFIX_RE =
    /\s*·\s*(?:🔴|🔔|🟠|🟢|✅|🔵|⏳)\s*(?:待处理|未读|运行中|Waiting|Unread|Running)(?:\(\d+\))?$/;
  const AGY_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
  const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;
  const ALLOWED_CHILD_SITE_DOMAINS = [
    'antigravity.google.com',
    'antigravity.google',
    'usercontent.goog'
  ];

  function isLocalTopPage() {
    const host = (window.location.hostname || '').toLowerCase();
    return window.location.protocol === 'http:' && (host === 'localhost' || host === '127.0.0.1');
  }

  function isAllowedTopOrigin(rawOrigin) {
    return AGY_ORIGIN_RE.test(rawOrigin || '') || LOCAL_ORIGIN_RE.test(rawOrigin || '');
  }

  function isAllowedChildOrigin(rawOrigin) {
    if (typeof rawOrigin !== 'string' || !rawOrigin || rawOrigin === 'null') return false;
    try {
      const parsed = new URL(rawOrigin);
      if (parsed.origin === 'null') return false;
      const host = parsed.hostname.toLowerCase();
      if (parsed.protocol === 'http:') {
        return host === 'localhost' || host === '127.0.0.1';
      }
      if (parsed.protocol !== 'https:') return false;
      return ALLOWED_CHILD_SITE_DOMAINS.some(
        (domain) => host === domain || host.endsWith(`.${domain}`)
      );
    } catch {
      return false;
    }
  }

  function isMountedChildFrameWindow(sourceWin) {
    if (!sourceWin || sourceWin === window) return false;
    try {
      return Array.from(document.querySelectorAll('iframe')).some(
        (frameEl) => frameEl.contentWindow === sourceWin
      );
    } catch {
      return false;
    }
  }

  function resolveIframeTargetOrigin(frameEl) {
    if (!frameEl) return '';
    try {
      const childOrigin = frameEl.contentWindow?.location?.origin;
      if (isAllowedChildOrigin(childOrigin)) {
        return childOrigin;
      }
      const childHref = frameEl.contentWindow?.location?.href || '';
      if (
        (childHref === 'about:blank' || childHref.startsWith('about:srcdoc')) &&
        isAllowedTopOrigin(window.location.origin)
      ) {
        return window.location.origin;
      }
    } catch {}
    const rawSrc = frameEl.getAttribute('src') || frameEl.src || '';
    if (!rawSrc || rawSrc.startsWith('about:')) {
      return isAllowedTopOrigin(window.location.origin) ? window.location.origin : '';
    }
    try {
      const parsed = new URL(rawSrc, window.location.href);
      return isAllowedChildOrigin(parsed.origin) ? parsed.origin : '';
    } catch {
      return '';
    }
  }

  function postToAntigravityIframe(frameEl, payload) {
    const targetOrigin = resolveIframeTargetOrigin(frameEl);
    if (!targetOrigin) return;
    try {
      frameEl.contentWindow?.postMessage(payload, targetOrigin);
    } catch {}
  }

  const VALID_STYLES = new Set(['antigravity', 'gemini', 'glow', 'claude', 'geek', 'emoji']);
  const VALID_LAYOUTS = new Set(['standalone', 'badge']);
  const VALID_BADGE_SIZES = new Set(['standard', 'large']);

  const DEFAULT_CONFIG = {
    enabled: true,
    indicatorStyle: 'glow',   // 'antigravity' | 'gemini' | 'glow' | 'claude' | 'geek' | 'emoji'
    iconLayout: 'standalone', // 'standalone' | 'badge'
    badgeSize: 'standard',    // 'standard' | 'large' (used when iconLayout === 'badge')
    autoProbeCollapsed: false,
    showQuotaMetrics: true,
    showContextMetrics: true,
    showInPageCapsule: false,
    customWaitingSelector: '',
    customRunningSelector: ''
  };

  function t(key, vars = {}, fallback = '') {
    try {
      const res = window.__AGY_I18N__?.t?.(key, vars);
      if (typeof res === 'string' && res && res !== key) {
        return res;
      }
    } catch {}
    if (fallback) {
      return String(fallback).replace(/\{(\w+)\}/g, (_, k) =>
        vars && Object.prototype.hasOwnProperty.call(vars, k) ? String(vars[k]) : `{${k}}`
      );
    }
    return key;
  }

  function normalizeConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    return {
      enabled: src.enabled !== false,
      indicatorStyle: VALID_STYLES.has(src.indicatorStyle) ? src.indicatorStyle : DEFAULT_CONFIG.indicatorStyle,
      iconLayout: VALID_LAYOUTS.has(src.iconLayout) ? src.iconLayout : DEFAULT_CONFIG.iconLayout,
      badgeSize: VALID_BADGE_SIZES.has(src.badgeSize) ? src.badgeSize : DEFAULT_CONFIG.badgeSize,
      autoProbeCollapsed: Boolean(src.autoProbeCollapsed),
      showQuotaMetrics: src.showQuotaMetrics !== false,
      showContextMetrics: src.showContextMetrics !== false,
      showInPageCapsule: Boolean(src.showInPageCapsule),
      customWaitingSelector: typeof src.customWaitingSelector === 'string' ? src.customWaitingSelector : '',
      customRunningSelector: typeof src.customRunningSelector === 'string' ? src.customRunningSelector : ''
    };
  }

  let config = { ...DEFAULT_CONFIG };

  let currentGlobalState = 'idle'; // 'idle' | 'waiting' | 'unread' | 'running'
  let globalReason = t('reasonInit', {}, 'Waiting for tasks to start');
  let previewState = null;         // null | 'waiting' | 'unread' | 'running'
  let latestProjects = [];
  let latestTelemetry = null;
  let latestCounts = { waiting: 0, unread: 0, running: 0, total: 0 };
  let lastBadgeKey = '';
  let lastPresentationKey = '';

  const childFrames = new Map();
  let localHostWasConfirmed = !isLocalTopPage();

  function isLocalHostConfirmed() {
    if (!isLocalTopPage()) return true;
    if (childFrames.size > 0) return true;
    return Boolean(window.__AGY_SCANNER__?.isLocalAntigravityConfirmed?.());
  }
  const taskTracker = new Map();
  const stickyWaitingByTitle = new Map();
  const topCollapsedCache = new Map();
  let pendingDebounceStop = null;

  function makeCanonicalTaskTitleKey(projectName, title) {
    return `${String(projectName || '').trim().toLowerCase()}::${String(title || '').trim().toLowerCase()}`;
  }

  let savedBaseTitle = (document.title || '').replace(TITLE_SUFFIX_RE, '').trimEnd();
  let lastWrittenTitle = '';
  let isMutatingTitle = false;

  let savedOrigIcons = [];
  let baseIconCanvas = null; // 缓存解码后的 64x64 离屏 Canvas
  let baseIconSourceUrl = '';
  let renderedFrames = {
    running: [],
    waiting: [],
    unread: []
  };
  let animFrameIndex = 0;
  let animStopFn = null;
  let isMutatingFavicon = false;

  let bodyObserver = null;
  let headObserver = null;
  let pollIntervalId = null;

  const reducedMotionQuery =
    typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function prefersReducedMotion() {
    return Boolean(reducedMotionQuery?.matches);
  }

  function isContextAlive() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function shutdownIfInvalidated() {
    if (isContextAlive()) return false;
    stopAnimationTicker();
    if (pendingDebounceStop) {
      pendingDebounceStop();
      pendingDebounceStop = null;
    }
    if (bodyObserver) {
      bodyObserver.disconnect();
      bodyObserver = null;
    }
    if (headObserver) {
      headObserver.disconnect();
      headObserver = null;
    }
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    return true;
  }

  // ============================================================================
  // 1. 免 CSP 后台 Port 计时器（零 Worker / 零 Blob，后台标签页不节流）
  // ============================================================================

  let timerPort = null;
  let onPortTick = null;
  let nextTimeoutSeq = 1;
  const portTimeouts = new Map();

  function ensureTimerPort() {
    if (timerPort) return timerPort;
    if (!isContextAlive()) return null;
    try {
      const port = chrome.runtime.connect({ name: 'agy-timer' });
      port.onMessage.addListener((msg) => {
        if (!msg) return;
        if (msg.type === 'TICK' && typeof onPortTick === 'function') {
          onPortTick();
        } else if (msg.type === 'TIMEOUT_FIRE' && portTimeouts.has(msg.id)) {
          const cb = portTimeouts.get(msg.id);
          portTimeouts.delete(msg.id);
          cb();
        }
      });
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        timerPort = null;
      });
      timerPort = port;
      return port;
    } catch {
      timerPort = null;
      return null;
    }
  }

  function stopAnimationTicker() {
    onPortTick = null;
    if (timerPort) {
      try {
        timerPort.postMessage({ cmd: 'STOP_INTERVAL' });
      } catch {}
    }
    if (animStopFn) {
      animStopFn();
      animStopFn = null;
    }
  }

  function startAnimationTicker(intervalMs, onTick) {
    stopAnimationTicker();
    onPortTick = onTick;

    // 本地兜底定时器（即使后台 Service Worker 休眠重连也能无缝平滑过渡）
    let lastTickAt = Date.now();
    const wrappedTick = () => {
      lastTickAt = Date.now();
      onTick();
    };
    onPortTick = wrappedTick;

    const port = ensureTimerPort();
    if (port) {
      try {
        port.postMessage({ cmd: 'START_INTERVAL', intervalMs });
      } catch {}
    }

    const fallbackId = window.setInterval(() => {
      if (Date.now() - lastTickAt >= intervalMs * 1.4) {
        const rePort = ensureTimerPort();
        if (rePort) {
          try {
            rePort.postMessage({ cmd: 'START_INTERVAL', intervalMs });
          } catch {}
        }
        wrappedTick();
      }
    }, Math.max(250, intervalMs));

    animStopFn = () => {
      clearInterval(fallbackId);
    };
  }

  function startUnthrottledTimeout(callback, delayMs) {
    let fired = false;
    const seqId = nextTimeoutSeq++;

    const fireOnce = () => {
      if (fired) return;
      fired = true;
      portTimeouts.delete(seqId);
      clearTimeout(localFallbackId);
      callback();
    };

    portTimeouts.set(seqId, fireOnce);
    const port = ensureTimerPort();
    if (port) {
      try {
        port.postMessage({ cmd: 'SET_TIMEOUT', id: seqId, delayMs });
      } catch {}
    }

    const localFallbackId = window.setTimeout(fireOnce, delayMs + 80);

    return () => {
      if (fired) return;
      fired = true;
      portTimeouts.delete(seqId);
      clearTimeout(localFallbackId);
      if (timerPort) {
        try {
          timerPort.postMessage({ cmd: 'CLEAR_TIMEOUT', id: seqId });
        } catch {}
      }
    };
  }

  // ============================================================================
  // 2. 原站 Favicon 像素获取与 6 种高对比状态灯帧渲染引擎
  // ============================================================================

  function captureOriginalIconLinks() {
    const head = document.head || document.documentElement;
    const links = Array.from(head.querySelectorAll("link[rel*='icon']")).filter(
      (el) => el.id !== FAVICON_ID
    );
    if (links.length > 0) {
      savedOrigIcons = links.map((link) => ({
        rel: link.getAttribute('rel') || 'icon',
        type: link.getAttribute('type') || '',
        sizes: link.getAttribute('sizes') || '',
        href: link.getAttribute('href') || '',
        media: link.getAttribute('media') || ''
      }));
    }
  }

  function pickBestOriginalIconUrl() {
    if (savedOrigIcons.length === 0) {
      captureOriginalIconLinks();
    }
    if (savedOrigIcons.length === 0) {
      return new URL('/favicon.ico', location.origin).href;
    }

    const scored = savedOrigIcons
      .filter((item) => Boolean(item.href))
      .map((item) => {
        let score = 200;
        const type = item.type.toLowerCase();
        const sizes = item.sizes.toLowerCase();
        if (type.includes('svg') || item.href.endsWith('.svg')) score = 1000;
        else if (sizes === 'any') score = 900;
        else {
          const m = sizes.match(/(\d+)\s*x\s*(\d+)/);
          if (m) {
            const w = parseInt(m[1], 10);
            score = w >= 32 && w <= 192 ? 500 + w : w;
          }
        }
        return { href: item.href, score };
      })
      .sort((a, b) => b.score - a.score);

    if (scored.length === 0) {
      return new URL('/favicon.ico', location.origin).href;
    }
    try {
      return new URL(scored[0].href, location.href).href;
    } catch {
      return new URL('/favicon.ico', location.origin).href;
    }
  }

  function fetchFaviconPixelsViaBackground(url) {
    return new Promise((resolve) => {
      if (!isContextAlive()) {
        resolve(null);
        return;
      }
      try {
        chrome.runtime.sendMessage(
          { type: 'FETCH_FAVICON_PIXELS', url, size: CANVAS_SIZE },
          (resp) => {
            if (chrome.runtime.lastError || !resp || !resp.ok || !Array.isArray(resp.pixels)) {
              resolve(null);
              return;
            }
            resolve(resp);
          }
        );
      } catch {
        resolve(null);
      }
    });
  }

  async function ensureBaseIconLoaded(force = false) {
    captureOriginalIconLinks();
    const candidateUrl = pickBestOriginalIconUrl();
    if (!force && baseIconCanvas && candidateUrl === baseIconSourceUrl) {
      return;
    }
    baseIconSourceUrl = candidateUrl;

    const decoded = await fetchFaviconPixelsViaBackground(candidateUrl);
    if (decoded && decoded.pixels.length === decoded.width * decoded.height * 4) {
      try {
        const c = document.createElement('canvas');
        c.width = decoded.width;
        c.height = decoded.height;
        const imgData = new ImageData(
          new Uint8ClampedArray(decoded.pixels),
          decoded.width,
          decoded.height
        );
        c.getContext('2d').putImageData(imgData, 0, 0);
        baseIconCanvas = c;
        rebuildAllFrames();
        return;
      } catch {}
    }

    baseIconCanvas = null;
    rebuildAllFrames();
  }

  function drawFallbackBaseIcon(ctx, size) {
    const r = size * 0.22;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(2, 2, size - 4, size - 4, r);
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#1E293B');
    grad.addColorStop(1, '#0F172A');
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.strokeStyle = '#60A5FA';
    ctx.lineWidth = size * 0.1;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(size * 0.24, size * 0.72);
    ctx.lineTo(size * 0.5, size * 0.24);
    ctx.lineTo(size * 0.76, size * 0.72);
    ctx.stroke();

    ctx.strokeStyle = '#93C5FD';
    ctx.lineWidth = size * 0.08;
    ctx.beginPath();
    ctx.moveTo(size * 0.35, size * 0.56);
    ctx.lineTo(size * 0.65, size * 0.56);
    ctx.stroke();
    ctx.restore();
  }

  function drawBaseLayer(ctx) {
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    if (baseIconCanvas) {
      ctx.drawImage(baseIconCanvas, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
    } else {
      drawFallbackBaseIcon(ctx, CANVAS_SIZE);
    }
  }

  function getBadgeGeometry() {
    if (config.badgeSize === 'large') {
      return { cx: 43, cy: 43, r: 19.5, cutout: 3.5 };
    }
    return { cx: 46, cy: 46, r: 16.5, cutout: 3.2 };
  }

  function punchCutout(ctx, cx, cy, outerR) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(cx, cy, outerR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function punchRoundedRectCutout(ctx, x, y, w, h, radius) {
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, radius);
    ctx.fill();
    ctx.restore();
  }

  // ---- Style 1: 'glow' (Luminous Orb / 轻盈质感呼吸灯) ----
  const GLOW_PALETTES = {
    waiting: {
      coreLight: '#FEF3C7',
      mid: '#FBBF24',
      deep: '#EF4444',
      glowRgb: '245, 158, 11'
    },
    unread: {
      coreLight: '#D1FAE5',
      mid: '#34D399',
      deep: '#059669',
      glowRgb: '16, 185, 129'
    },
    running: {
      coreLight: '#E0F2FE',
      mid: '#38BDF8',
      deep: '#0284C7',
      glowRgb: '56, 189, 248'
    }
  };

  function drawGlowStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone) {
    const palette = GLOW_PALETTES[state] || GLOW_PALETTES.running;
    const { cx, cy, r } = geom;
    const cycle = totalFrames > 1 ? frameIdx / totalFrames : 0;
    const breath = totalFrames > 1 ? 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2) : 0.75;

    ctx.save();

    if (isStandalone) {
      const haloR = r * (1.02 + 0.08 * breath);
      const halo = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, haloR);
      halo.addColorStop(0, `rgba(${palette.glowRgb}, ${0.42 + 0.28 * breath})`);
      halo.addColorStop(0.65, `rgba(${palette.glowRgb}, ${0.14 + 0.16 * breath})`);
      halo.addColorStop(1, `rgba(${palette.glowRgb}, 0)`);
      ctx.beginPath();
      ctx.arc(cx, cy, haloR, 0, Math.PI * 2);
      ctx.fillStyle = halo;
      ctx.fill();
    }

    const orbR = isStandalone
      ? r * (0.76 + (state === 'idle' ? 0 : 0.07 * breath))
      : r * (state === 'waiting' ? 0.92 + 0.07 * breath : 0.96);

    // Dual-tone contrast rim for both light and dark tab strips
    ctx.beginPath();
    ctx.arc(cx, cy, orbR + 1.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.42)';
    ctx.fill();

    // Jewel radial gradient with off-center top-left glow
    const grad = ctx.createRadialGradient(
      cx - orbR * 0.3,
      cy - orbR * 0.32,
      orbR * 0.08,
      cx,
      cy,
      orbR
    );
    grad.addColorStop(0, palette.coreLight);
    grad.addColorStop(0.45, palette.mid);
    grad.addColorStop(1, palette.deep);

    ctx.beginPath();
    ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Crisp hairline inner rim
    ctx.beginPath();
    ctx.arc(cx, cy, orbR - 0.75, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.78)';
    ctx.lineWidth = Math.max(1.2, orbR * 0.08);
    ctx.stroke();

    // Top-left specular glass crescent highlight
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, orbR * 0.86, 0, Math.PI * 2);
    ctx.clip();
    const spec = ctx.createRadialGradient(
      cx - orbR * 0.34,
      cy - orbR * 0.38,
      0,
      cx - orbR * 0.25,
      cy - orbR * 0.3,
      orbR * 0.65
    );
    spec.addColorStop(0, 'rgba(255, 255, 255, 0.82)');
    spec.addColorStop(0.55, 'rgba(255, 255, 255, 0.18)');
    spec.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = spec;
    ctx.fillRect(cx - orbR, cy - orbR, orbR * 2, orbR * 2);
    ctx.restore();

    // Subtle orbital shimmer arc when running, warm inner pulse ring when waiting
    if (state === 'running') {
      const startA = cycle * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * 0.66, startA, startA + Math.PI * 0.85);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = Math.max(2.2, orbR * 0.16);
      ctx.lineCap = 'round';
      ctx.stroke();
    } else if (state === 'waiting') {
      ctx.beginPath();
      ctx.arc(cx, cy, orbR * (0.34 + 0.12 * breath), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${0.42 + 0.48 * breath})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // ---- Style 2: 'claude' (Claude Dynamic Sparkle / Claude 动态风格) ----
  function drawClaudeStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone) {
    const { cx, cy, r } = geom;
    const cycle = totalFrames > 1 ? frameIdx / totalFrames : 0;
    const breath = totalFrames > 1 ? 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2) : 0.7;

    ctx.save();

    // Subtle soft translucent contrast disc so the sparkle pops on both light and dark tab strips
    const discR = isStandalone ? r * 0.96 : r;
    const discGrad = ctx.createRadialGradient(cx, cy, discR * 0.15, cx, cy, discR);
    discGrad.addColorStop(0, 'rgba(24, 21, 20, 0.94)');
    discGrad.addColorStop(0.85, 'rgba(24, 21, 20, 0.84)');
    discGrad.addColorStop(1, isStandalone ? 'rgba(24, 21, 20, 0.08)' : 'rgba(24, 21, 20, 0.78)');
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fillStyle = discGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, discR - 0.7, 0, Math.PI * 2);
    ctx.strokeStyle =
      state === 'unread'
        ? 'rgba(16, 185, 129, 0.52)'
        : state === 'waiting'
          ? `rgba(251, 191, 36, ${0.45 + 0.45 * breath})`
          : 'rgba(240, 148, 117, 0.35)';
    ctx.lineWidth = Math.max(1.2, discR * 0.06);
    ctx.stroke();

    ctx.translate(cx, cy);

    if (state === 'unread') {
      // Settled sage-emerald 6-point sparkle star
      const outerR = discR * 0.74;
      const innerR = discR * 0.25;
      const points = 6;
      ctx.beginPath();
      for (let i = 0; i < points * 2; i++) {
        const rad = i % 2 === 0 ? outerR : innerR;
        const a = (i * Math.PI) / points - Math.PI / 2;
        const x = Math.cos(a) * rad;
        const y = Math.sin(a) * rad;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      const starGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, outerR);
      starGrad.addColorStop(0, '#D1FAE5');
      starGrad.addColorStop(0.45, '#34D399');
      starGrad.addColorStop(1, '#10B981');
      ctx.fillStyle = starGrad;
      ctx.fill();
      ctx.restore();
      return;
    }

    // 8-spoke rounded-cap Claude starburst/asterisk
    const spokes = 8;
    const rot = state === 'running' ? cycle * (Math.PI / 4) : 0;
    ctx.rotate(rot);

    const baseMaxLen = discR * (state === 'waiting' ? 0.66 + 0.09 * breath : 0.72);
    const strokeW = Math.max(2.8, discR * 0.21);

    for (let i = 0; i < spokes; i++) {
      const angle = (i / spokes) * Math.PI * 2;
      const harmonic =
        state === 'running'
          ? 0.8 + 0.2 * Math.sin(cycle * Math.PI * 2 + i * Math.PI * 0.5)
          : state === 'waiting'
            ? 0.88 + 0.12 * breath
            : 1;
      const rayLen = baseMaxLen * harmonic;
      const x1 = Math.cos(angle) * (discR * 0.14);
      const y1 = Math.sin(angle) * (discR * 0.14);
      const x2 = Math.cos(angle) * rayLen;
      const y2 = Math.sin(angle) * rayLen;

      const grad = ctx.createLinearGradient(x1, y1, x2, y2);
      if (state === 'waiting') {
        grad.addColorStop(0, breath > 0.5 ? '#FDE68A' : '#FCA5A5');
        grad.addColorStop(1, breath > 0.5 ? '#F59E0B' : '#D97757');
      } else {
        grad.addColorStop(0, '#F09475');
        grad.addColorStop(1, '#D97757');
      }

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = grad;
      ctx.lineWidth = strokeW;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Luminous center hub
    ctx.beginPath();
    ctx.arc(0, 0, discR * (state === 'waiting' ? 0.22 + 0.06 * breath : 0.2), 0, Math.PI * 2);
    ctx.fillStyle = state === 'waiting' ? (breath > 0.5 ? '#FEF3C7' : '#FDE68A') : '#F8B8A2';
    ctx.fill();

    ctx.restore();
  }

  // ---- Style 3: 'geek' (Geek Terminal / 极客风格) ----
  function drawGeekStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone) {
    const { cx, cy, r } = geom;
    const cycle = totalFrames > 1 ? frameIdx / totalFrames : 0;
    const half = isStandalone ? 27.5 : r * 0.96;
    const x = cx - half;
    const y = cy - half;
    const size = half * 2;
    const cornerR = size * 0.24;

    const isAltPhase = state === 'waiting' && frameIdx % 2 === 1;
    const neon =
      state === 'waiting'
        ? isAltPhase
          ? '#F87171'
          : '#FBBF24'
        : state === 'unread'
          ? '#4ADE80'
          : '#22D3EE';

    ctx.save();

    // Obsidian CRT keycap background
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, cornerR);
    ctx.fillStyle = '#0B101B';
    ctx.fill();

    // Subtle CRT horizontal scanlines clipped inside keycap
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.055)';
    const step = Math.max(3, Math.round(size / 11));
    for (let sy = y + 2; sy < y + size; sy += step) {
      ctx.fillRect(x, sy, size, 1);
    }
    ctx.restore();

    // Crisp neon phosphor border
    ctx.beginPath();
    ctx.roundRect(x + 1.2, y + 1.2, size - 2.4, size - 2.4, Math.max(2, cornerR - 1));
    ctx.strokeStyle = neon;
    ctx.lineWidth = Math.max(2.2, size * 0.07);
    ctx.stroke();

    ctx.strokeStyle = neon;
    ctx.fillStyle = neon;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const lw = Math.max(2.6, size * 0.095);
    ctx.lineWidth = lw;

    if (state === 'running') {
      // Crisp vector `>_` plus cycling 4-quadrant pixel spinner dot in top-right
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.56, cy - half * 0.26);
      ctx.lineTo(cx - half * 0.16, cy + half * 0.04);
      ctx.lineTo(cx - half * 0.56, cy + half * 0.34);
      ctx.stroke();

      // Blinking/pulsing underscore cursor
      const cursorAlpha = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(cycle * Math.PI * 2));
      ctx.save();
      ctx.globalAlpha = cursorAlpha;
      ctx.beginPath();
      ctx.moveTo(cx - half * 0.02, cy + half * 0.34);
      ctx.lineTo(cx + half * 0.52, cy + half * 0.34);
      ctx.stroke();
      ctx.restore();

      // 4-quadrant pixel spinner in upper-right quadrant
      const qIdx = Math.floor(cycle * 4) % 4;
      const pSize = Math.max(3, size * 0.11);
      const qBaseX = cx + half * 0.12;
      const qBaseY = cy - half * 0.52;
      const offsets = [
        [0, 0],
        [pSize + 2, 0],
        [pSize + 2, pSize + 2],
        [0, pSize + 2]
      ];
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = i === qIdx ? '#E0F2FE' : 'rgba(34, 211, 238, 0.28)';
        ctx.fillRect(qBaseX + offsets[i][0], qBaseY + offsets[i][1], pSize, pSize);
      }
    } else if (state === 'waiting') {
      // Crisp `[!]` prompt
      const bx = half * 0.54;
      const by = half * 0.46;
      const tip = half * 0.16;

      // Left bracket `[`
      ctx.beginPath();
      ctx.moveTo(cx - bx + tip, cy - by);
      ctx.lineTo(cx - bx, cy - by);
      ctx.lineTo(cx - bx, cy + by);
      ctx.lineTo(cx - bx + tip, cy + by);
      ctx.stroke();

      // Right bracket `]`
      ctx.beginPath();
      ctx.moveTo(cx + bx - tip, cy - by);
      ctx.lineTo(cx + bx, cy - by);
      ctx.lineTo(cx + bx, cy + by);
      ctx.lineTo(cx + bx - tip, cy + by);
      ctx.stroke();

      // Center `!`
      ctx.beginPath();
      ctx.moveTo(cx, cy - half * 0.4);
      ctx.lineTo(cx, cy + half * 0.08);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy + half * 0.36, Math.max(1.8, lw * 0.52), 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Crisp `[✓]` prompt
      const bx = half * 0.56;
      const by = half * 0.46;
      const tip = half * 0.15;

      ctx.beginPath();
      ctx.moveTo(cx - bx + tip, cy - by);
      ctx.lineTo(cx - bx, cy - by);
      ctx.lineTo(cx - bx, cy + by);
      ctx.lineTo(cx - bx + tip, cy + by);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx + bx - tip, cy - by);
      ctx.lineTo(cx + bx, cy - by);
      ctx.lineTo(cx + bx, cy + by);
      ctx.lineTo(cx + bx - tip, cy + by);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - half * 0.28, cy + half * 0.03);
      ctx.lineTo(cx - half * 0.05, cy + half * 0.28);
      ctx.lineTo(cx + half * 0.3, cy - half * 0.22);
      ctx.stroke();
    }

    ctx.restore();
  }

  // ---- Style 4: 'emoji' (Vivid Emoji / Emoji 风格) ----
  function drawEmojiStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone) {
    const { cx, cy, r } = geom;
    const cycle = totalFrames > 1 ? frameIdx / totalFrames : 0;
    const discR = isStandalone ? r * 0.95 : r;

    ctx.save();

    // Subtle soft contrast disc with state-tinted halo
    const tint =
      state === 'waiting'
        ? 'rgba(245, 158, 11, 0.26)'
        : state === 'unread'
          ? 'rgba(16, 185, 129, 0.26)'
          : 'rgba(56, 189, 248, 0.26)';
    const border =
      state === 'waiting'
        ? 'rgba(251, 191, 36, 0.72)'
        : state === 'unread'
          ? 'rgba(52, 211, 153, 0.72)'
          : 'rgba(56, 189, 248, 0.72)';

    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.84)';
    ctx.fill();

    const innerGlow = ctx.createRadialGradient(cx, cy, 0, cx, cy, discR);
    innerGlow.addColorStop(0, tint);
    innerGlow.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = innerGlow;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, discR - 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(1.5, discR * 0.075);
    ctx.stroke();

    ctx.translate(cx, cy);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    let emoji = '⚡';
    let scale = 1;
    let angleRad = 0;

    if (state === 'running') {
      emoji = '⚡';
      scale = 0.96 + 0.12 * (0.5 - 0.5 * Math.cos(cycle * Math.PI * 2));
      ctx.shadowColor = 'rgba(56, 189, 248, 0.75)';
      ctx.shadowBlur = isStandalone ? 10 : 6;
    } else if (state === 'waiting') {
      emoji = '🔔';
      // ±10deg gentle bell swing across frames
      const swingDeg = Math.sin(cycle * Math.PI * 2) * 10;
      angleRad = (swingDeg * Math.PI) / 180;
      ctx.shadowColor = 'rgba(251, 191, 36, 0.7)';
      ctx.shadowBlur = isStandalone ? 8 : 5;
    } else {
      emoji = '✅';
    }

    ctx.rotate(angleRad);
    ctx.scale(scale, scale);

    const fontPx = Math.round(discR * (isStandalone ? 1.24 : 1.28));
    ctx.font = `${fontPx}px 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`;
    ctx.fillText(emoji, 0, Math.round(fontPx * 0.06));

    ctx.restore();
  }

  // ---- Style 5: 'antigravity' (Native Antigravity Workspace / 原生 Antigravity 风格) ----
  function drawAntigravityStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone) {
    const { cx, cy, r } = geom;
    const cycle = totalFrames > 1 ? frameIdx / totalFrames : 0;
    const breath = totalFrames > 1 ? 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2) : 0.75;
    const half = isStandalone ? 27.5 : r * 0.96;
    const size = half * 2;
    const x = cx - half;
    const y = cy - half;
    const cornerR = size * 0.25;

    const borderColor =
      state === 'waiting' ? '#FBBF24' : state === 'unread' ? '#34D399' : '#60A5FA';
    const glowRgb =
      state === 'waiting' ? '251, 191, 36' : state === 'unread' ? '52, 211, 153' : '96, 165, 250';

    ctx.save();

    // Deep Antigravity slate rounded squircle
    const bgGrad = ctx.createLinearGradient(x, y, x + size, y + size);
    bgGrad.addColorStop(0, '#0F172A');
    bgGrad.addColorStop(1, '#1E293B');
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, cornerR);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Subtle state-tinted inner radial glow clipped inside squircle
    ctx.save();
    ctx.clip();
    const innerGlow = ctx.createRadialGradient(cx, cy, half * 0.08, cx, cy, half);
    innerGlow.addColorStop(0, `rgba(${glowRgb}, ${state === 'waiting' ? 0.16 + 0.12 * breath : 0.18})`);
    innerGlow.addColorStop(1, `rgba(${glowRgb}, 0)`);
    ctx.fillStyle = innerGlow;
    ctx.fillRect(x, y, size, size);
    ctx.restore();

    // Crisp hairline border (>= 3:1 against dark/light tab strips)
    ctx.beginPath();
    ctx.roundRect(x + 1, y + 1, size - 2, size - 2, Math.max(2, cornerR - 1));
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = Math.max(1.6, size * 0.055);
    ctx.stroke();

    if (state === 'running') {
      // Native Antigravity progress_activity + stop_circle indicator
      const ringR = half * 0.58;
      const ringLw = Math.max(2.6, half * 0.21);

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.22)';
      ctx.lineWidth = ringLw;
      ctx.stroke();

      const startA = cycle * Math.PI * 2 - Math.PI / 2;
      const endA = startA + (250 * Math.PI) / 180;
      const arcGrad = ctx.createLinearGradient(
        cx + Math.cos(startA) * ringR,
        cy + Math.sin(startA) * ringR,
        cx + Math.cos(endA) * ringR,
        cy + Math.sin(endA) * ringR
      );
      arcGrad.addColorStop(0, '#3B82F6');
      arcGrad.addColorStop(0.55, '#60A5FA');
      arcGrad.addColorStop(1, '#BAE6FD');

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, startA, endA);
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = ringLw;
      ctx.lineCap = 'round';
      ctx.stroke();

      const stopSize = ringR * 0.54;
      ctx.save();
      ctx.globalAlpha = 0.72 + 0.28 * breath;
      ctx.fillStyle = '#93C5FD';
      ctx.beginPath();
      ctx.roundRect(
        cx - stopSize / 2,
        cy - stopSize / 2,
        stopSize,
        stopSize,
        Math.max(1.5, stopSize * 0.22)
      );
      ctx.fill();
      ctx.restore();
    } else if (state === 'waiting') {
      // Native Antigravity notifications_active warm Google Amber bell
      const swingDeg = totalFrames > 1 ? Math.sin(cycle * Math.PI * 2) * 6 : 0;
      const swingRad = (swingDeg * Math.PI) / 180;

      ctx.save();
      ctx.translate(cx, cy);

      // Pulsing acoustic arcs flanking upper dome
      ctx.save();
      ctx.strokeStyle = `rgba(254, 240, 138, ${0.42 + 0.52 * breath})`;
      ctx.lineWidth = Math.max(1.8, half * 0.095);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.arc(0, -half * 0.14, half * 0.58, -Math.PI * 0.34, -Math.PI * 0.08);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, -half * 0.14, half * 0.58, -Math.PI * 0.92, -Math.PI * 0.66);
      ctx.stroke();
      ctx.restore();

      // Gentle +-6deg bell swing around top pivot
      ctx.translate(0, -half * 0.36);
      ctx.rotate(swingRad);
      ctx.translate(0, half * 0.36);

      const bellGrad = ctx.createLinearGradient(0, -half * 0.6, 0, half * 0.56);
      bellGrad.addColorStop(0, '#FEF08A');
      bellGrad.addColorStop(0.48, '#FBBF24');
      bellGrad.addColorStop(1, '#F59E0B');

      // Top finial
      ctx.beginPath();
      ctx.arc(0, -half * 0.52, half * 0.1, 0, Math.PI * 2);
      ctx.fillStyle = '#FEF08A';
      ctx.fill();

      // Curved bell dome + flared rim
      ctx.beginPath();
      ctx.moveTo(0, -half * 0.46);
      ctx.bezierCurveTo(half * 0.28, -half * 0.46, half * 0.38, -half * 0.24, half * 0.39, half * 0.04);
      ctx.bezierCurveTo(half * 0.4, half * 0.18, half * 0.48, half * 0.26, half * 0.52, half * 0.32);
      ctx.quadraticCurveTo(half * 0.54, half * 0.38, half * 0.45, half * 0.38);
      ctx.lineTo(-half * 0.45, half * 0.38);
      ctx.quadraticCurveTo(-half * 0.54, half * 0.38, -half * 0.52, half * 0.32);
      ctx.bezierCurveTo(-half * 0.48, half * 0.26, -half * 0.4, half * 0.18, -half * 0.39, half * 0.04);
      ctx.bezierCurveTo(-half * 0.38, -half * 0.24, -half * 0.28, -half * 0.46, 0, -half * 0.46);
      ctx.closePath();
      ctx.fillStyle = bellGrad;
      ctx.fill();

      // Bottom clapper
      ctx.beginPath();
      ctx.arc(0, half * 0.47, half * 0.115, 0, Math.PI * 2);
      ctx.fillStyle = '#F59E0B';
      ctx.fill();

      ctx.restore();
    } else {
      // Native Antigravity mark_chat_unread indicator
      const bx = cx - half * 0.56;
      const by = cy - half * 0.44;
      const bw = half * 1.04;
      const bh = half * 0.78;
      const br = half * 0.2;

      ctx.fillStyle = '#E2E8F0';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, br);
      ctx.fill();

      // Bottom-left speech tail
      ctx.beginPath();
      ctx.moveTo(bx + half * 0.02, by + bh - br * 0.65);
      ctx.lineTo(bx + half * 0.02, by + bh + half * 0.22);
      ctx.lineTo(bx + half * 0.34, by + bh - 0.5);
      ctx.closePath();
      ctx.fill();

      // Dark #0F172A cutout at top-right holding luminous emerald-mint unread dot
      const dotX = cx + half * 0.38;
      const dotY = cy - half * 0.34;
      const dotR = half * 0.22;
      const cutoutR = dotR + Math.max(2.0, half * 0.11);

      ctx.beginPath();
      ctx.arc(dotX, dotY, cutoutR, 0, Math.PI * 2);
      ctx.fillStyle = '#0F172A';
      ctx.fill();

      const dotGrad = ctx.createRadialGradient(
        dotX - dotR * 0.28,
        dotY - dotR * 0.28,
        dotR * 0.08,
        dotX,
        dotY,
        dotR
      );
      dotGrad.addColorStop(0, '#A7F3D0');
      dotGrad.addColorStop(0.55, '#34D399');
      dotGrad.addColorStop(1, '#10B981');
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = dotGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  // ---- Style 6: 'gemini' (Native Gemini Sparkle / 原生 Gemini 星标风格) ----
  function drawGeminiSparklePath(ctx, cx, cy, R) {
    const k = 0.4477;
    ctx.beginPath();
    ctx.moveTo(cx, cy - R);
    ctx.bezierCurveTo(cx, cy - R * k, cx + R * k, cy, cx + R, cy);
    ctx.bezierCurveTo(cx + R * k, cy, cx, cy + R * k, cx, cy + R);
    ctx.bezierCurveTo(cx, cy + R * k, cx - R * k, cy, cx - R, cy);
    ctx.bezierCurveTo(cx - R * k, cy, cx, cy - R * k, cx, cy - R);
    ctx.closePath();
  }

  function drawGeminiStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone) {
    const { cx, cy, r } = geom;
    const cycle = totalFrames > 1 ? frameIdx / totalFrames : 0;
    const breath = totalFrames > 1 ? 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2) : 0.75;
    const discR = isStandalone ? r * 0.96 : r;

    ctx.save();

    // Circular dark Gemini obsidian disc
    const discGrad = ctx.createRadialGradient(
      cx - discR * 0.24,
      cy - discR * 0.24,
      discR * 0.08,
      cx,
      cy,
      discR
    );
    discGrad.addColorStop(0, '#1E1F20');
    discGrad.addColorStop(1, '#131314');
    ctx.beginPath();
    ctx.arc(cx, cy, discR, 0, Math.PI * 2);
    ctx.fillStyle = discGrad;
    ctx.fill();

    // State-harmonized hairline rim (>= 3:1 non-text contrast on light/dark tab bars)
    const rimColor =
      state === 'waiting'
        ? `rgba(251, 191, 36, ${0.78 + 0.22 * breath})`
        : state === 'unread'
          ? 'rgba(52, 211, 153, 0.9)'
          : 'rgba(96, 165, 250, 0.88)';
    ctx.beginPath();
    ctx.arc(cx, cy, discR - 0.8, 0, Math.PI * 2);
    ctx.strokeStyle = rimColor;
    ctx.lineWidth = Math.max(1.5, discR * 0.06);
    ctx.stroke();

    if (state === 'running') {
      // Native gemini.google.com/app sparkle_thinking avatar
      const orbR = discR * 0.79;
      const orbLw = Math.max(2.4, discR * 0.145);

      ctx.beginPath();
      ctx.arc(cx, cy, orbR, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(155, 114, 203, 0.22)';
      ctx.lineWidth = orbLw;
      ctx.stroke();

      const startA = cycle * Math.PI * 2 - Math.PI / 2;
      const endA = startA + (245 * Math.PI) / 180;
      const arcGrad = ctx.createLinearGradient(
        cx + Math.cos(startA) * orbR,
        cy + Math.sin(startA) * orbR,
        cx + Math.cos(endA) * orbR,
        cy + Math.sin(endA) * orbR
      );
      arcGrad.addColorStop(0, '#4285F4');
      arcGrad.addColorStop(0.38, '#9B72CB');
      arcGrad.addColorStop(0.72, '#D96570');
      arcGrad.addColorStop(1, '#FBBC04');

      ctx.beginPath();
      ctx.arc(cx, cy, orbR, startA, endA);
      ctx.strokeStyle = arcGrad;
      ctx.lineWidth = orbLw;
      ctx.lineCap = 'round';
      ctx.stroke();

      const sparkleR = discR * (0.48 + 0.07 * breath);
      drawGeminiSparklePath(ctx, cx, cy, sparkleR);
      const spGrad = ctx.createLinearGradient(
        cx - sparkleR,
        cy - sparkleR,
        cx + sparkleR,
        cy + sparkleR
      );
      spGrad.addColorStop(0, '#60A5FA');
      spGrad.addColorStop(0.5, '#9B72CB');
      spGrad.addColorStop(1, '#D96570');
      ctx.fillStyle = spGrad;
      ctx.fill();
    } else if (state === 'waiting') {
      // Pulsing warm Google Amber-Coral Gemini 4-pointed sparkle + bottom-right attention badge
      const sx = cx - discR * 0.07;
      const sy = cy - discR * 0.04;
      const sparkleR = discR * (0.58 + 0.07 * breath);

      drawGeminiSparklePath(ctx, sx, sy, sparkleR);
      const spGrad = ctx.createLinearGradient(
        sx - sparkleR,
        sy - sparkleR,
        sx + sparkleR,
        sy + sparkleR
      );
      spGrad.addColorStop(0, '#FDE68A');
      spGrad.addColorStop(0.5, '#FBBC04');
      spGrad.addColorStop(1, '#EA4335');
      ctx.fillStyle = spGrad;
      ctx.fill();

      const badgeX = cx + discR * 0.42;
      const badgeY = cy + discR * 0.4;
      const badgeR = discR * (0.27 + 0.03 * breath);
      const collarR = badgeR + Math.max(1.8, discR * 0.08);

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, collarR, 0, Math.PI * 2);
      ctx.fillStyle = '#131314';
      ctx.fill();

      ctx.beginPath();
      ctx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
      ctx.fillStyle = '#FBBF24';
      ctx.fill();

      if (discR < 18) {
        ctx.beginPath();
        ctx.arc(badgeX, badgeY, badgeR * 0.46, 0, Math.PI * 2);
        ctx.fillStyle = '#FEF08A';
        ctx.fill();
      } else {
        ctx.strokeStyle = '#131314';
        ctx.fillStyle = '#131314';
        ctx.lineWidth = Math.max(1.8, badgeR * 0.3);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(badgeX, badgeY - badgeR * 0.46);
        ctx.lineTo(badgeX, badgeY + badgeR * 0.06);
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(badgeX, badgeY + badgeR * 0.42, Math.max(1.1, badgeR * 0.17), 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      // Settled resting Gemini 4-pointed sparkle + top-right Google Green unread dot
      const sx = cx - discR * 0.06;
      const sy = cy + discR * 0.06;
      const sparkleR = discR * 0.64;

      drawGeminiSparklePath(ctx, sx, sy, sparkleR);
      const spGrad = ctx.createLinearGradient(
        sx - sparkleR,
        sy - sparkleR,
        sx + sparkleR,
        sy + sparkleR
      );
      spGrad.addColorStop(0, '#4285F4');
      spGrad.addColorStop(0.5, '#9B72CB');
      spGrad.addColorStop(1, '#34D399');
      ctx.fillStyle = spGrad;
      ctx.fill();

      const dotX = cx + discR * 0.43;
      const dotY = cy - discR * 0.43;
      const dotR = discR * 0.22;
      const collarR = dotR + Math.max(2.0, discR * 0.09);

      ctx.beginPath();
      ctx.arc(dotX, dotY, collarR, 0, Math.PI * 2);
      ctx.fillStyle = '#131314';
      ctx.fill();

      const dotGrad = ctx.createRadialGradient(
        dotX - dotR * 0.28,
        dotY - dotR * 0.28,
        dotR * 0.08,
        dotX,
        dotY,
        dotR
      );
      dotGrad.addColorStop(0, '#A7F3D0');
      dotGrad.addColorStop(0.55, '#34A853');
      dotGrad.addColorStop(1, '#34A853');
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = dotGrad;
      ctx.fill();
    }

    ctx.restore();
  }

  function renderFrameDataUrl(style, state, frameIdx, totalFrames) {
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_SIZE;
    canvas.height = CANVAS_SIZE;
    const ctx = canvas.getContext('2d');
    const isStandalone = config.iconLayout !== 'badge';

    let geom;
    if (isStandalone) {
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      geom = { cx: 32, cy: 32, r: 29, cutout: 0 };
    } else {
      drawBaseLayer(ctx);
      geom = getBadgeGeometry();
      if (style === 'geek' || style === 'antigravity') {
        const half = geom.r * 0.96 + geom.cutout * 0.75;
        const size = half * 2;
        const cornerRadius = style === 'antigravity' ? size * 0.25 : size * 0.24;
        punchRoundedRectCutout(ctx, geom.cx - half, geom.cy - half, size, size, cornerRadius);
      } else {
        punchCutout(ctx, geom.cx, geom.cy, geom.r + geom.cutout);
      }
    }

    if (style === 'antigravity') {
      drawAntigravityStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone);
    } else if (style === 'gemini') {
      drawGeminiStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone);
    } else if (style === 'claude') {
      drawClaudeStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone);
    } else if (style === 'geek') {
      drawGeekStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone);
    } else if (style === 'emoji') {
      drawEmojiStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone);
    } else {
      drawGlowStyle(ctx, state, frameIdx, totalFrames, geom, isStandalone);
    }

    return canvas.toDataURL('image/png');
  }

  function rebuildAllFrames() {
    const style = VALID_STYLES.has(config.indicatorStyle) ? config.indicatorStyle : 'glow';
    const runningSteps = 12;
    const waitingSteps = style === 'geek' ? 2 : style === 'emoji' ? 4 : 6;

    const running = [];
    for (let i = 0; i < runningSteps; i++) {
      running.push(renderFrameDataUrl(style, 'running', i, runningSteps));
    }

    const waiting = [];
    for (let i = 0; i < waitingSteps; i++) {
      waiting.push(renderFrameDataUrl(style, 'waiting', i, waitingSteps));
    }

    renderedFrames = {
      running,
      waiting,
      unread: [renderFrameDataUrl(style, 'unread', 0, 1)]
    };

    syncFaviconPresentation();
  }

  // ============================================================================
  // 3. Favicon DOM 更新、旧标题后缀清理与工具栏数字角标联动
  // ============================================================================

  function setFaviconDataUrl(dataUrl) {
    if (!dataUrl) return;
    isMutatingFavicon = true;
    try {
      const head = document.head || document.documentElement;
      if (savedOrigIcons.length === 0) {
        captureOriginalIconLinks();
      }
      head.querySelectorAll("link[rel*='icon']").forEach((el) => {
        if (el.id !== FAVICON_ID) el.remove();
      });

      let faviconEl = document.getElementById(FAVICON_ID);
      if (!faviconEl) {
        faviconEl = document.createElement('link');
        faviconEl.id = FAVICON_ID;
        faviconEl.rel = 'icon';
        faviconEl.type = 'image/png';
        head.appendChild(faviconEl);
      }
      if (faviconEl.href !== dataUrl) {
        faviconEl.href = dataUrl;
      }
    } finally {
      isMutatingFavicon = false;
    }
  }

  function restoreOriginalIcons() {
    isMutatingFavicon = true;
    try {
      const head = document.head || document.documentElement;
      const dyn = document.getElementById(FAVICON_ID);
      if (dyn) dyn.remove();

      const remaining = head.querySelectorAll("link[rel*='icon']");
      if (remaining.length === 0 && savedOrigIcons.length > 0) {
        for (const item of savedOrigIcons) {
          const link = document.createElement('link');
          link.setAttribute('rel', item.rel || 'icon');
          if (item.type) link.setAttribute('type', item.type);
          if (item.sizes) link.setAttribute('sizes', item.sizes);
          if (item.media) link.setAttribute('media', item.media);
          if (item.href) link.setAttribute('href', item.href);
          head.appendChild(link);
        }
      }
    } finally {
      isMutatingFavicon = false;
    }
  }

  function getEffectiveGlobalState() {
    if (!config.enabled) return 'idle';
    if (previewState) return previewState === 'completed' ? 'unread' : previewState;
    return currentGlobalState;
  }

  function stripTitleStatusSuffix(rawTitle) {
    return String(rawTitle || '').replace(TITLE_SUFFIX_RE, '').trimEnd();
  }

  function deriveWorkspaceLabel() {
    const rawTitle = stripTitleStatusSuffix(savedBaseTitle || document.title || '').trim();
    const cleaned = rawTitle
      .replace(/\s*(?:[-–—|·•]\s*)?(?:Google\s+)?Antigravity\s*$/i, '')
      .replace(/^(?:Google\s+)?Antigravity\s*(?:[-–—|·•]\s*)?/i, '')
      .trim();
    if (cleaned) return cleaned;
    if (Array.isArray(latestProjects) && latestProjects.length === 1 && latestProjects[0]?.projectName) {
      return latestProjects[0].projectName;
    }
    if (Array.isArray(latestProjects) && latestProjects.length > 1 && latestProjects[0]?.projectName) {
      return `${latestProjects[0].projectName} +${latestProjects.length - 1}`;
    }
    return rawTitle || location.hostname;
  }

  function syncTabTitlePresentation() {
    if (isLocalTopPage() && !isLocalHostConfirmed()) return;
    const currentRaw = document.title || '';
    const currentStripped = stripTitleStatusSuffix(currentRaw);
    if (!isMutatingTitle && currentRaw !== lastWrittenTitle) {
      if (currentStripped) {
        savedBaseTitle = currentStripped;
      }
    }

    const targetTitle = currentStripped || savedBaseTitle;
    if (!targetTitle) return;

    if (document.title !== targetTitle) {
      isMutatingTitle = true;
      try {
        lastWrittenTitle = targetTitle;
        document.title = targetTitle;
      } finally {
        isMutatingTitle = false;
      }
    } else {
      lastWrittenTitle = targetTitle;
    }
  }

  function syncFaviconPresentation() {
    if (isLocalTopPage() && !isLocalHostConfirmed()) return;
    const effective = getEffectiveGlobalState();
    stopAnimationTicker();

    if (!config.enabled || effective === 'idle') {
      restoreOriginalIcons();
      return;
    }

    if (renderedFrames.unread.length === 0) {
      rebuildAllFrames();
      return;
    }

    const reduceMotion = prefersReducedMotion();

    if (effective === 'unread' || effective === 'completed') {
      setFaviconDataUrl(renderedFrames.unread[0]);
      return;
    }

    if (effective === 'running') {
      animFrameIndex = 0;
      setFaviconDataUrl(renderedFrames.running[0]);
      if (!reduceMotion && renderedFrames.running.length > 1) {
        startAnimationTicker(140, () => {
          animFrameIndex = (animFrameIndex + 1) % renderedFrames.running.length;
          setFaviconDataUrl(renderedFrames.running[animFrameIndex]);
        });
      }
      return;
    }

    if (effective === 'waiting') {
      animFrameIndex = 0;
      setFaviconDataUrl(renderedFrames.waiting[0]);
      if (!reduceMotion && renderedFrames.waiting.length > 1) {
        // Keep waiting pulse interval >= 650ms (<3 flashes/sec)
        startAnimationTicker(650, () => {
          animFrameIndex = (animFrameIndex + 1) % renderedFrames.waiting.length;
          setFaviconDataUrl(renderedFrames.waiting[animFrameIndex]);
        });
      }
    }
  }

  function syncTabPresentation() {
    syncFaviconPresentation();
    syncTabTitlePresentation();
  }

  function syncToolbarActionBadge(waitingCount, unreadCount) {
    if (!isContextAlive()) return;
    if (isLocalTopPage() && !isLocalHostConfirmed()) return;
    const totalAttention = config.enabled ? waitingCount + unreadCount : 0;
    const hasWaiting = config.enabled && waitingCount > 0;
    const nextKey = `${totalAttention}:${hasWaiting ? 1 : 0}`;
    if (nextKey === lastBadgeKey) return;
    lastBadgeKey = nextKey;

    try {
      chrome.runtime.sendMessage(
        {
          type: 'UPDATE_ACTION_BADGE',
          count: totalAttention,
          hasWaiting
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } catch {}
  }

  // ============================================================================
  // 4. 多项目状态树合并、单任务防抖与未读追踪引擎
  // ============================================================================

  const STATE_RANK = { waiting: 4, unread: 3, running: 2, idle: 1, none: 0 };

  function mergeTelemetry(sources) {
    const valid = [];
    for (const item of sources) {
      if (!item || !item.telemetry || typeof item.telemetry !== 'object') continue;
      valid.push({
        telemetry: item.telemetry,
        isTop: Boolean(item.isTop),
        fetchedAt: Number(item.telemetry.fetchedAt) || 0
      });
    }
    if (valid.length === 0) return null;

    const byNewest = [...valid].sort((a, b) => b.fetchedAt - a.fetchedAt);
    const maxFetchedAt = byNewest[0].fetchedAt;

    const quotaPools = { gemini: null, premium: null };
    for (const poolKey of ['gemini', 'premium']) {
      for (const src of byNewest) {
        const poolVal = src.telemetry.quotaPools?.[poolKey];
        if (poolVal && typeof poolVal === 'object') {
          quotaPools[poolKey] = poolVal;
          break;
        }
      }
    }
    for (const src of byNewest) {
      const qp = src.telemetry.quotaPools;
      if (qp && typeof qp === 'object') {
        for (const [k, v] of Object.entries(qp)) {
          if (!(k in quotaPools) && v && typeof v === 'object') {
            quotaPools[k] = v;
          }
        }
      }
    }

    let models = [];
    for (const src of byNewest) {
      if (Array.isArray(src.telemetry.models) && src.telemetry.models.length > 0) {
        models = src.telemetry.models;
        break;
      }
    }

    let composers = [];
    const topWithComposers = valid.find(
      (s) => s.isTop && Array.isArray(s.telemetry.composers) && s.telemetry.composers.length > 0
    );
    if (topWithComposers) {
      composers = topWithComposers.telemetry.composers;
    } else {
      for (const src of byNewest) {
        if (Array.isArray(src.telemetry.composers) && src.telemetry.composers.length > 0) {
          composers = src.telemetry.composers;
          break;
        }
      }
    }

    let activeConvId = '';
    for (const src of byNewest) {
      if (typeof src.telemetry.activeConvId === 'string' && src.telemetry.activeConvId) {
        activeConvId = src.telemetry.activeConvId;
        break;
      }
    }

    const convRank = new Map();
    const conversations = {};
    for (const src of valid) {
      const convMap = src.telemetry.conversations;
      if (!convMap || typeof convMap !== 'object') continue;
      for (const [convId, conv] of Object.entries(convMap)) {
        if (!conv || typeof conv !== 'object') continue;
        const precisionScore = conv.precision === 'exact' ? 2 : 1;
        const prev = convRank.get(convId);
        if (
          !prev ||
          precisionScore > prev.precisionScore ||
          (precisionScore === prev.precisionScore && src.fetchedAt >= prev.fetchedAt)
        ) {
          convRank.set(convId, { precisionScore, fetchedAt: src.fetchedAt });
          conversations[convId] = conv;
        }
      }
    }

    const sourceMode = valid.some((s) => s.telemetry.sourceMode === 'rpc_assisted')
      ? 'rpc_assisted'
      : 'passive';

    return {
      fetchedAt: maxFetchedAt,
      sourceMode,
      quotaPools,
      models,
      activeConvId,
      composers,
      conversations
    };
  }

  function mergeFrameWorkspaces() {
    const now = Date.now();
    const topScan = window.__AGY_SCANNER__
      ? window.__AGY_SCANNER__.scanWorkspace()
      : { activePane: { state: 'none', reason: '' }, projects: [], telemetry: null };

    const telemetrySources = [{ telemetry: topScan.telemetry || null, isTop: true }];
    let bestActivePane = topScan.activePane || { state: 'none', reason: '' };
    const projectMap = new Map();
    let activeChildCount = 0;

    const ingestProjects = (projList, sourceFrame) => {
      if (!Array.isArray(projList)) return;
      for (const proj of projList) {
        const pName = proj.projectName || 'Projects';
        if (!projectMap.has(pName)) {
          projectMap.set(pName, {
            projectType: proj.projectType || 'local',
            headerTaskId: proj.headerTaskId || '',
            isCollapsed: Boolean(proj.isCollapsed),
            knownEmpty: Boolean(proj.knownEmpty),
            taskMap: new Map()
          });
        }
        const entry = projectMap.get(pName);
        if (proj.projectType === 'remote') {
          entry.projectType = 'remote';
        }
        if (proj.headerTaskId && !entry.headerTaskId) {
          entry.headerTaskId = proj.headerTaskId;
        }
        if (!proj.isCollapsed) {
          entry.isCollapsed = false;
        }
        if (proj.knownEmpty) {
          entry.knownEmpty = true;
        }
        for (const t of proj.tasks || []) {
          const existing = entry.taskMap.get(t.taskId);
          if (!existing || (STATE_RANK[t.state] || 0) > (STATE_RANK[existing.state] || 0)) {
            entry.taskMap.set(t.taskId, { ...t, sourceFrame });
          }
        }
      }
    };

    ingestProjects(topScan.projects, 'top');

    const hasMountedIframe = Boolean(document.querySelector('iframe'));
    let newestChildTs = 0;
    if (hasMountedIframe) {
      for (const entry of childFrames.values()) {
        if (entry.ts > newestChildTs) newestChildTs = entry.ts;
      }
    }

    for (const [frameKey, entry] of childFrames.entries()) {
      const expired = hasMountedIframe
        ? entry.ts < newestChildTs && now - entry.ts > 15000
        : now - entry.ts > 6500;
      if (expired) {
        childFrames.delete(frameKey);
        continue;
      }
      activeChildCount++;
      if (entry.telemetry) {
        telemetrySources.push({ telemetry: entry.telemetry, isTop: false });
      }
      if (
        entry.activePane &&
        (STATE_RANK[entry.activePane.state] || 0) > (STATE_RANK[bestActivePane.state] || 0)
      ) {
        bestActivePane = entry.activePane;
      }
      ingestProjects(entry.projects, frameKey);
    }

    const mergedTelemetry = mergeTelemetry(telemetrySources);

    const mergedProjects = [];
    for (const [projectName, entry] of projectMap.entries()) {
      let tasks = Array.from(entry.taskMap.values());
      if (tasks.length > 0 || entry.knownEmpty) {
        topCollapsedCache.set(projectName, {
          knownEmpty: Boolean(entry.knownEmpty && tasks.length === 0),
          projectType: entry.projectType,
          tasks: tasks.map((task) => ({ ...task }))
        });
      } else if (entry.isCollapsed && topCollapsedCache.has(projectName)) {
        const cached = topCollapsedCache.get(projectName);
        if (cached.projectType === 'remote') {
          entry.projectType = 'remote';
        }
        if (cached.knownEmpty) {
          entry.knownEmpty = true;
        } else if (Array.isArray(cached.tasks) && cached.tasks.length > 0) {
          tasks = cached.tasks.map((task) => ({ ...task, fromCollapsedCache: true }));
        }
      }

      for (const task of tasks) {
        if (!task.convId && task.isActive && mergedTelemetry?.activeConvId) {
          task.convId = mergedTelemetry.activeConvId;
        }
        if (task.convId && mergedTelemetry?.conversations?.[task.convId]) {
          task.telemetry = mergedTelemetry.conversations[task.convId];
        }
      }

      mergedProjects.push({
        projectName,
        projectType: entry.projectType,
        headerTaskId: entry.headerTaskId,
        isCollapsed: entry.isCollapsed,
        knownEmpty: entry.knownEmpty,
        tasks
      });
    }

    if (bestActivePane.state === 'waiting' || bestActivePane.state === 'running') {
      let appliedToActiveRow = false;
      for (const proj of mergedProjects) {
        for (const task of proj.tasks) {
          if (task.isActive) {
            appliedToActiveRow = true;
            if ((STATE_RANK[bestActivePane.state] || 0) > (STATE_RANK[task.state] || 0)) {
              task.state = bestActivePane.state;
              task.reason = bestActivePane.reason;
            }
          }
        }
      }
      if (!appliedToActiveRow) {
        const alreadyCovered = mergedProjects.some((p) =>
          p.tasks.some((task) => task.state === bestActivePane.state)
        );
        if (!alreadyCovered) {
          if (mergedProjects.length === 0) {
            mergedProjects.push({
              projectName: t('fallbackWorkspaceName', {}, 'Current Workspace'),
              projectType: 'local',
              tasks: []
            });
          }
          const activeConvId = mergedTelemetry?.activeConvId || '';
          mergedProjects[0].tasks.unshift({
            taskId: 'active-open-pane',
            convId: activeConvId,
            title: t('fallbackOpenConvTitle', {}, 'Open Conversation'),
            state: bestActivePane.state,
            reason: bestActivePane.reason,
            timeText: t('taskCurrentTag', {}, 'Current'),
            isActive: true,
            sourceFrame: 'top',
            telemetry: (activeConvId && mergedTelemetry?.conversations?.[activeConvId]) || null
          });
        }
      }
    }

    return { mergedProjects, activeChildCount, mergedTelemetry };
  }

  function evaluateAllProjects() {
    if (shutdownIfInvalidated()) return;
    if (isLocalTopPage() && !isLocalHostConfirmed()) {
      window.__AGY_SCANNER__?.syncInPageCapsules?.(false, null);
      return;
    }
    if (isLocalTopPage() && !localHostWasConfirmed) {
      localHostWasConfirmed = true;
      rebuildAllFrames();
      void ensureBaseIconLoaded(true);
    }

    const now = Date.now();
    const { mergedProjects, activeChildCount, mergedTelemetry } = mergeFrameWorkspaces();
    latestTelemetry = mergedTelemetry;
    window.__AGY_SCANNER__?.syncInPageCapsules?.(
      Boolean(config.enabled && config.showInPageCapsule),
      latestTelemetry
    );

    let needsDebounceRecheck = false;
    let waitingCount = 0;
    let unreadCount = 0;
    let runningCount = 0;
    let totalCount = 0;

    let firstWaitingSample = '';
    let firstUnreadSample = '';
    let firstRunningSample = '';

    for (const proj of mergedProjects) {
      for (const task of proj.tasks) {
        let rec = taskTracker.get(task.taskId);
        if (!rec) {
          rec = {
            lastActiveState: null,
            lastActiveTs: 0,
            stickyWaiting: false,
            stickyWaitingReason: '',
            runtimeUnread: false,
            dismissedUnread: false,
            wasDomUnread: false,
            wasActive: Boolean(task.isActive)
          };
          taskTracker.set(task.taskId, rec);
        }

        const titleKey = makeCanonicalTaskTitleKey(proj.projectName, task.title);
        const clearStickyWaiting = () => {
          rec.stickyWaiting = false;
          rec.stickyWaitingReason = '';
          stickyWaitingByTitle.delete(titleKey);
        };

        // 粘性 waiting 保护：点进确认待处理后切走时，非详情的粗粒度 running 不得把 waiting 洗回 running
        if (task.state === 'waiting') {
          rec.stickyWaiting = true;
          rec.stickyWaitingReason = task.reason || '';
          stickyWaitingByTitle.set(titleKey, { reason: rec.stickyWaitingReason, ts: now });
        } else if (rec.stickyWaiting || stickyWaitingByTitle.has(titleKey)) {
          // 注意：后台任务的 confirmedRunning 只说明桥接器缓存里的对话对象写着 RUNNING，
          // 很可能是提问前的旧详情快照（runStatus 仍为 RUNNING、无 waiting 字段），不能据此
          // 清除已确认的 waiting。唯一能证明 waiting 结束的证据是：点开该对话后面板显示
          // 非 waiting（isActive 分支），或变 unread/idle（下方 debounce 分支）。
          if ((task.isActive && task.state !== 'waiting') || task.state === 'unread') {
            clearStickyWaiting();
          } else if (!task.isActive && task.state === 'running') {
            const stickyRsn =
              rec.stickyWaitingReason || stickyWaitingByTitle.get(titleKey)?.reason || '';
            task.state = 'waiting';
            if (stickyRsn) task.reason = stickyRsn;
            rec.stickyWaiting = true;
          }
        }

        // 若侧边栏重新出现了新的未读圆点（此前并非 unread），自动解除旧的已读忽略标记
        if (task.state === 'unread' && !rec.wasDomUnread) {
          rec.dismissedUnread = false;
        }
        rec.wasDomUnread = task.state === 'unread';

        if (task.isActive && !rec.wasActive && !document.hidden) {
          rec.runtimeUnread = false;
          rec.dismissedUnread = true;
        }
        rec.wasActive = Boolean(task.isActive);

        let effectiveTaskState = task.state;
        let effectiveReason = task.reason;

        if (task.state === 'waiting' || task.state === 'running') {
          rec.lastActiveState = task.state;
          rec.lastActiveTs = now;
          rec.runtimeUnread = false;
          rec.dismissedUnread = false;
          effectiveTaskState = task.state;
        } else {
          if (rec.lastActiveState && now - rec.lastActiveTs < COMPLETION_DEBOUNCE_MS) {
            effectiveTaskState = rec.lastActiveState;
            effectiveReason = t('reasonStepDebounce', {}, 'Confirming step transition...');
            needsDebounceRecheck = true;
          } else {
            if (rec.lastActiveState) {
              rec.lastActiveState = null;
              rec.runtimeUnread = true;
              rec.dismissedUnread = false;
            }
            clearStickyWaiting();

            if (task.state === 'unread') {
              if (rec.dismissedUnread || (task.isActive && !document.hidden && !rec.runtimeUnread)) {
                effectiveTaskState = 'idle';
              } else {
                effectiveTaskState = 'unread';
              }
            } else if (rec.runtimeUnread && !rec.dismissedUnread) {
              effectiveTaskState = 'unread';
              effectiveReason = t('reasonJustCompleted', {}, 'Conversation just completed (unread)');
            } else {
              effectiveTaskState = 'idle';
            }
          }
        }

        task.state = effectiveTaskState;
        task.reason = effectiveReason;

        totalCount++;
        if (effectiveTaskState === 'waiting') {
          waitingCount++;
          if (!firstWaitingSample) firstWaitingSample = `${proj.projectName} › ${task.title}`;
        } else if (effectiveTaskState === 'unread') {
          unreadCount++;
          if (!firstUnreadSample) firstUnreadSample = `${proj.projectName} › ${task.title}`;
        } else if (effectiveTaskState === 'running') {
          runningCount++;
          if (!firstRunningSample) firstRunningSample = `${proj.projectName} › ${task.title}`;
        }
      }

      if (proj.tasks.length > 0 || proj.knownEmpty) {
        topCollapsedCache.set(proj.projectName, {
          knownEmpty: Boolean(proj.knownEmpty && proj.tasks.length === 0),
          projectType: proj.projectType,
          tasks: proj.tasks.map((task) => ({ ...task }))
        });
      }
    }

    if (needsDebounceRecheck && !pendingDebounceStop) {
      pendingDebounceStop = startUnthrottledTimeout(() => {
        pendingDebounceStop = null;
        evaluateAllProjects();
      }, COMPLETION_DEBOUNCE_MS + 60);
    } else if (!needsDebounceRecheck && pendingDebounceStop) {
      pendingDebounceStop();
      pendingDebounceStop = null;
    }

    latestProjects = mergedProjects;
    latestCounts = {
      waiting: waitingCount,
      unread: unreadCount,
      running: runningCount,
      total: totalCount
    };

    // 严格优先级：待处理 (waiting) > 未读 (unread) > 正在运行 (running) > 空闲 (idle)
    let nextState = 'idle';
    let nextReason = '';

    if (waitingCount > 0) {
      nextState = 'waiting';
      nextReason =
        waitingCount === 1
          ? t('reasonGlobalWaitingOne', { sample: firstWaitingSample }, `Waiting: ${firstWaitingSample}`)
          : t(
              'reasonGlobalWaitingMany',
              { count: waitingCount, sample: firstWaitingSample },
              `${waitingCount} conversations waiting (${firstWaitingSample}, etc.)`
            );
    } else if (unreadCount > 0) {
      nextState = 'unread';
      nextReason =
        unreadCount === 1
          ? t('reasonGlobalUnreadOne', { sample: firstUnreadSample }, `Unread: ${firstUnreadSample}`)
          : t(
              'reasonGlobalUnreadMany',
              { count: unreadCount, sample: firstUnreadSample },
              `${unreadCount} unread conversations (${firstUnreadSample}, etc.)`
            );
    } else if (runningCount > 0) {
      nextState = 'running';
      nextReason =
        runningCount === 1
          ? t('reasonGlobalRunningOne', { sample: firstRunningSample }, `Running: ${firstRunningSample}`)
          : t(
              'reasonGlobalRunningMany',
              { count: runningCount },
              `${runningCount} conversations running in background`
            );
    } else {
      nextReason =
        mergedProjects.length > 0
          ? t(
              'reasonGlobalIdleProjects',
              { projects: mergedProjects.length, tasks: totalCount },
              `Synced ${mergedProjects.length} projects / ${totalCount} conversations · All idle`
            )
          : activeChildCount > 0
            ? t(
                'reasonGlobalIdleFrames',
                { frames: activeChildCount },
                `Connected workspace (${activeChildCount} frames) · No active conversations`
              )
            : t('reasonGlobalIdlePage', {}, 'Connected · No active conversations');
    }

    globalReason = nextReason;
    const presentationKey = `${nextState}:${waitingCount}:${unreadCount}:${runningCount}`;
    if (currentGlobalState !== nextState || presentationKey !== lastPresentationKey) {
      currentGlobalState = nextState;
      lastPresentationKey = presentationKey;
      syncTabPresentation();
    }
    syncToolbarActionBadge(waitingCount, unreadCount);
  }

  function markAllTasksAsRead() {
    previewState = null;
    for (const proj of latestProjects) {
      for (const task of proj.tasks) {
        let rec = taskTracker.get(task.taskId);
        if (!rec) {
          rec = {
            lastActiveState: null,
            lastActiveTs: 0,
            stickyWaiting: false,
            stickyWaitingReason: '',
            runtimeUnread: false,
            dismissedUnread: true,
            wasDomUnread: task.state === 'unread',
            wasActive: Boolean(task.isActive)
          };
          taskTracker.set(task.taskId, rec);
        } else {
          rec.runtimeUnread = false;
          rec.dismissedUnread = true;
          rec.wasDomUnread = task.state === 'unread';
        }
      }
    }
    evaluateAllProjects();
    syncTabPresentation();
  }

  function recordChildSync(frameKey, activePane, projects, telemetry = null) {
    childFrames.set(frameKey || 'default-child', {
      activePane: activePane || { state: 'none', reason: '' },
      projects: Array.isArray(projects) ? projects : [],
      telemetry: telemetry && typeof telemetry === 'object' ? telemetry : null,
      ts: Date.now()
    });
    evaluateAllProjects();
  }

  function getPreviewStateLabel(state) {
    const normalized = state === 'completed' ? 'unread' : state;
    if (normalized === 'waiting') return t('taskStateWaiting', {}, 'Waiting');
    if (normalized === 'unread') return t('taskStateUnread', {}, 'Unread');
    if (normalized === 'running') return t('taskStateRunning', {}, 'Running');
    return String(state || '');
  }

  window.addEventListener('message', (event) => {
    if (shutdownIfInvalidated()) return;
    const rawOrigin = event.origin || '';
    const originTrusted =
      event.source &&
      event.source !== window &&
      (isAllowedChildOrigin(rawOrigin) ||
        (rawOrigin === 'null' && isMountedChildFrameWindow(event.source)));
    if (!originTrusted) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'ANTIGRAVITY_WORKSPACE_SYNC') {
      recordChildSync(
        data.frameUid || 'postmsg-child',
        data.activePane,
        data.projects,
        data.telemetry || null
      );
    }
  });

  if (reducedMotionQuery) {
    const onMotionPrefChange = () => {
      syncFaviconPresentation();
    };
    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', onMotionPrefChange);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
      reducedMotionQuery.addListener(onMotionPrefChange);
    }
  }

  // ============================================================================
  // 5. 与 Popup 交互通信及初始化
  // ============================================================================

  if (isContextAlive()) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (!isContextAlive() || !message || typeof message !== 'object') return false;

      if (message.type === 'RELAYED_CHILD_SYNC') {
        recordChildSync(
          message.frameKey,
          message.activePane,
          message.projects,
          message.telemetry || null
        );
        return false;
      }

      if (message.type === 'RELAYED_CHILD_UNLOAD' && message.frameKey) {
        childFrames.delete(message.frameKey);
        evaluateAllProjects();
        return false;
      }

      if (isLocalTopPage() && !isLocalHostConfirmed()) {
        return false;
      }

      if (message.type === 'FOCUS_TASK_IN_FRAME' && message.taskId) {
        const hit = window.__AGY_SCANNER__
          ? window.__AGY_SCANNER__.focusTaskById(
              message.taskId,
              message.projectName || '',
              message.taskTitle || ''
            )
          : false;
        if (hit) evaluateAllProjects();
        sendResponse({ ok: hit });
        return false;
      }

      if (message.type === 'PROBE_COLLAPSED' || message.type === 'PROBE_COLLAPSED_IN_FRAME') {
        if (window.__AGY_SCANNER__?.probeCollapsedProjects) {
          void (async () => {
            await window.__AGY_SCANNER__.probeCollapsedProjects(true);
            evaluateAllProjects();
          })();
        }
        if (message.type === 'PROBE_COLLAPSED') {
          for (const frameEl of document.querySelectorAll('iframe')) {
            postToAntigravityIframe(frameEl, { type: 'AGY_PROBE_COLLAPSED' });
          }
        }
        evaluateAllProjects();
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === 'GET_STATUS') {
        if (childFrames.size === 0 && document.querySelector('iframe')) {
          try {
            chrome.runtime.sendMessage({ type: 'PING_CHILD_FRAMES' }, () => {
              void chrome.runtime.lastError;
            });
          } catch {}
          for (const frameEl of document.querySelectorAll('iframe')) {
            postToAntigravityIframe(frameEl, { type: 'AGY_SYNC_NOW' });
          }
        }
        evaluateAllProjects();
        sendResponse({
          ok: true,
          enabled: config.enabled,
          indicatorStyle: config.indicatorStyle,
          iconLayout: config.iconLayout,
          badgeSize: config.badgeSize,
          showQuotaMetrics: config.showQuotaMetrics,
          showContextMetrics: config.showContextMetrics,
          showInPageCapsule: config.showInPageCapsule,
          pageTitle: stripTitleStatusSuffix(savedBaseTitle || document.title || ''),
          workspaceLabel: deriveWorkspaceLabel(),
          pageUrl: location.href,
          state: getEffectiveGlobalState(),
          detectedState: currentGlobalState,
          counts: latestCounts,
          projects: latestProjects,
          telemetry: latestTelemetry,
          activeChildCount: childFrames.size,
          reason: previewState
            ? t(
                'reasonPreviewing',
                { state: getPreviewStateLabel(previewState) },
                `Previewing "${getPreviewStateLabel(previewState)}" status light`
              )
            : globalReason,
          previewState
        });
        return false;
      }

      if (message.type === 'MARK_ALL_READ' || message.type === 'RESET_COMPLETED') {
        markAllTasksAsRead();
        sendResponse({
          ok: true,
          state: getEffectiveGlobalState(),
          counts: latestCounts,
          projects: latestProjects
        });
        return false;
      }

      if (message.type === 'FOCUS_TASK' && message.taskId) {
        const rec = taskTracker.get(message.taskId);
        if (rec) {
          rec.runtimeUnread = false;
          rec.dismissedUnread = true;
        }

        let hitTop = false;
        if (window.__AGY_SCANNER__) {
          hitTop = window.__AGY_SCANNER__.focusTaskById(
            message.taskId,
            message.projectName || '',
            message.taskTitle || ''
          );
        }
        if (!hitTop) {
          for (const frameEl of document.querySelectorAll('iframe')) {
            postToAntigravityIframe(frameEl, {
              type: 'AGY_FOCUS_TASK',
              taskId: message.taskId,
              projectName: message.projectName || '',
              taskTitle: message.taskTitle || ''
            });
          }
        }
        evaluateAllProjects();
        sendResponse({ ok: true });
        return false;
      }

      if (message.type === 'SET_PREVIEW') {
        previewState = message.state || null;
        syncTabPresentation();
        sendResponse({ ok: true, state: getEffectiveGlobalState(), previewState });
        return false;
      }

      if (message.type === 'INSPECT_PAGE') {
        evaluateAllProjects();
        sendResponse({
          ok: true,
          snapshot: {
            url: location.href,
            title: document.title,
            indicatorStyle: config.indicatorStyle,
            iconLayout: config.iconLayout,
            badgeSize: config.badgeSize,
            showQuotaMetrics: config.showQuotaMetrics,
            showContextMetrics: config.showContextMetrics,
            showInPageCapsule: config.showInPageCapsule,
            globalState: currentGlobalState,
            counts: latestCounts,
            activeChildFrames: childFrames.size,
            projects: latestProjects,
            telemetry: latestTelemetry,
            reason: globalReason,
            diagnostics: window.__AGY_SCANNER__?.scanDiagnostics?.() || null
          }
        });
        return false;
      }

      return false;
    });

    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      const hasStorageError = Boolean(chrome.runtime.lastError);
      config = normalizeConfig(hasStorageError ? DEFAULT_CONFIG : items);
      if (isLocalTopPage() && !isLocalHostConfirmed()) {
        window.__AGY_SCANNER__?.syncInPageCapsules?.(false, null);
        return;
      }
      rebuildAllFrames();
      evaluateAllProjects();
      syncTabPresentation();
    });

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (!isContextAlive() || areaName !== 'sync') return;
      let needRebuild = false;
      let changedConfig = false;
      const nextRaw = { ...config };
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in DEFAULT_CONFIG) {
          nextRaw[key] = newValue;
          changedConfig = true;
          if (key === 'indicatorStyle' || key === 'iconLayout' || key === 'badgeSize') {
            needRebuild = true;
          }
        }
      }
      if (!changedConfig) return;
      config = normalizeConfig(nextRaw);
      if (isLocalTopPage() && !isLocalHostConfirmed()) {
        window.__AGY_SCANNER__?.syncInPageCapsules?.(false, null);
        return;
      }
      if (needRebuild) rebuildAllFrames();
      else syncTabPresentation();
      evaluateAllProjects();
    });
  }

  if (typeof window.__AGY_SCANNER__?.onProbeComplete === 'function') {
    window.__AGY_SCANNER__.onProbeComplete(() => {
      evaluateAllProjects();
    });
  }

  let lastTopScanTs = 0;
  let topThrottleTimer = null;
  const scheduleTopEval = () => {
    if (isMutatingFavicon || shutdownIfInvalidated()) return;
    const elapsed = Date.now() - lastTopScanTs;
    if (elapsed >= 180) {
      lastTopScanTs = Date.now();
      evaluateAllProjects();
      return;
    }
    if (!topThrottleTimer) {
      topThrottleTimer = setTimeout(() => {
        topThrottleTimer = null;
        lastTopScanTs = Date.now();
        evaluateAllProjects();
      }, 190 - elapsed);
    }
  };

  if (document.body) {
    bodyObserver = new MutationObserver(scheduleTopEval);
    bodyObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-label', 'aria-current', 'aria-selected', 'aria-expanded']
    });
  }

  const head = document.head || document.documentElement;
  headObserver = new MutationObserver((mutations) => {
    if (
      isMutatingFavicon ||
      isMutatingTitle ||
      shutdownIfInvalidated() ||
      (isLocalTopPage() && !isLocalHostConfirmed())
    ) {
      return;
    }
    let titleTouched = false;
    for (const m of mutations) {
      if (
        m.target?.nodeName === 'TITLE' ||
        m.target?.parentNode?.nodeName === 'TITLE'
      ) {
        titleTouched = true;
      }
      for (const node of m.addedNodes) {
        if (node.nodeName === 'TITLE') {
          titleTouched = true;
        } else if (node instanceof HTMLLinkElement && node.id !== FAVICON_ID) {
          if ((node.getAttribute('rel') || '').toLowerCase().includes('icon')) {
            if (config.enabled && getEffectiveGlobalState() !== 'idle') {
              syncFaviconPresentation();
            }
          }
        }
      }
    }
    if (titleTouched) {
      syncTabTitlePresentation();
    }
  });
  headObserver.observe(head, { childList: true, subtree: true, characterData: true });

  pollIntervalId = window.setInterval(() => {
    evaluateAllProjects();
    syncTabTitlePresentation();
  }, 900);
  window.addEventListener('pagehide', () => {
    if (!isContextAlive()) return;
    try {
      chrome.runtime.sendMessage({ type: 'TOP_FRAME_UNLOAD' }, () => {
        void chrome.runtime.lastError;
      });
    } catch {}
  });

  if (!isLocalTopPage() || isLocalHostConfirmed()) {
    void (async () => {
      await ensureBaseIconLoaded(true);
      evaluateAllProjects();
      syncTabPresentation();
    })();
  }

  if (isLocalTopPage()) {
    const probeLocalHydration = () => {
      if (shutdownIfInvalidated()) return;
      if (!isLocalHostConfirmed()) return;
      if (!localHostWasConfirmed) {
        localHostWasConfirmed = true;
        rebuildAllFrames();
        void ensureBaseIconLoaded(true);
      }
      evaluateAllProjects();
      syncTabPresentation();
    };
    window.setTimeout(probeLocalHydration, 1500);
    window.setTimeout(probeLocalHydration, 4500);
  }
})();
