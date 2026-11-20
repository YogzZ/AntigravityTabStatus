/**
 * Antigravity Tab Status - Offline Model Pricing & Deduplicated Usage Ledger (v2.9.0)
 *
 * 100% offline, zero external network calls, strict CSP compliant:
 * - Safe in MV3 Service Worker (importScripts), Extension Pages, and ISOLATED content scripts.
 * - Exits in ~0.01ms on non-Antigravity frames.
 * - Provides static USD / 1M token catalog, alias normalization, tiered cache-write billing,
 *   disjoint reasoning token accounting, USD/CNY FX, custom per-model overrides,
 *   high-watermark deduplicated ledger ingestion, 90-day / <250KB pruning, and CWE-1236 safe CSV export.
 */
(() => {
  'use strict';

  if (globalThis.__AGY_PRICING__) return;

  const winObj = typeof globalThis.window !== 'undefined' ? globalThis.window : null;
  if (winObj && winObj.__AGY_PRICING__) {
    globalThis.__AGY_PRICING__ = winObj.__AGY_PRICING__;
    return;
  }

  const loc = winObj
    ? winObj.location
    : typeof globalThis.location === 'object' && globalThis.location !== null
      ? globalThis.location
      : null;

  if (winObj && loc && typeof loc.protocol === 'string' && !loc.protocol.endsWith('-extension:')) {
    const AGY_HOST_RE = /(?:^|\.)antigravity\.google(?:\.com)?$/i;
    const AGY_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
    const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;
    const isLocalHost =
      loc.protocol === 'http:' &&
      (loc.hostname === 'localhost' || loc.hostname === '127.0.0.1');
    const hostOk =
      (typeof loc.hostname === 'string' && AGY_HOST_RE.test(loc.hostname)) || isLocalHost;
    let ancestorOk = false;
    try {
      const origins = loc.ancestorOrigins;
      if (origins && typeof origins.length === 'number') {
        for (let i = 0; i < origins.length; i += 1) {
          const origin = String(origins[i] || '');
          if (AGY_ORIGIN_RE.test(origin) || LOCAL_ORIGIN_RE.test(origin)) {
            ancestorOk = true;
            break;
          }
        }
      }
    } catch {}
    if (!hostOk && !ancestorOk) return;
  }

  const LEDGER_STORAGE_KEY = 'agyUsageLedgerV1';
  const PRICING_CONFIG_STORAGE_KEY = 'agyPricingConfigV1';
  const NOTIF_STATE_STORAGE_KEY = 'agyNotifStateV1';
  const MAGPIE_CONFIG_STORAGE_KEY = 'agyMagpieConfigV1';
  const MAGPIE_CACHE_SESSION_KEY = 'agyMagpieCacheV1';
  const DEFAULT_MAGPIE_ENDPOINT = 'http://127.0.0.1:3425';
  const MIN_VALID_TS_MS = 946684800000;
  const SHADOW_MODEL_RE =
    /(?:^|[^A-Z0-9])(M50|M21)(?:$|[^A-Z0-9])|FLASH[_-]?LITE|IMAGE|BANANA/i;

  const NOTIF_DEPLETED_MAX_FRAC = 0.005;
  const NOTIF_RECOVERED_MIN_FRAC = 0.05;
  const NOTIF_PRE_RESET_WINDOW_MS = 30 * 60 * 1000;
  const NOTIF_PRE_RESET_MIN_FRAC = 0.4;
  const NOTIF_SAME_CYCLE_TOLERANCE_MS = 10 * 60 * 1000;
  const NOTIF_RECOVERY_GRACE_MS = 5 * 1000;
  const NOTIF_MAX_STALE_RECOVERY_MS = 60 * 60 * 1000;
  const NOTIF_MAX_OBSERVATION_AGE_MS = 5 * 60 * 60 * 1000;

  const LEDGER_SCHEMA_VERSION = 1;
  const PRICING_CONFIG_VERSION = 1;
  const MAX_LEDGER_WATERMARKS = 300;
  const MAX_RECENT_STEPS_PER_CONV = 4;
  const MAX_LEDGER_DAYS = 90;
  const MIN_PROTECTED_DAYS = 30;
  const MAX_MODELS_PER_DAY = 16;
  const MAX_PROJECTS_PER_DAY = 20;
  const MAX_LEDGER_BYTES = 245760; // Hard 240 KB ceiling (< 250 KB)
  const DEFAULT_USD_TO_CNY_RATE = 7.25;
  const MAX_CUSTOM_OVERRIDES = 50;

  const CATALOG_LIST = [
    {
      canonicalKey: 'gemini-2.5-pro',
      label: 'Gemini 2.5 Pro',
      in: 1.25,
      cacheRead: 0.3125,
      cacheWrite: 1.25,
      cacheWrite5m: 1.25,
      cacheWrite1h: 1.25,
      out: 10.0,
      pattern: /gemini[\s_-]*2\.5[\s_-]*pro/i
    },
    {
      canonicalKey: 'gemini-3-pro',
      label: 'Gemini 3 Pro',
      in: 2.0,
      cacheRead: 0.5,
      cacheWrite: 2.0,
      cacheWrite5m: 2.0,
      cacheWrite1h: 2.0,
      out: 12.0,
      pattern: /gemini[\s_-]*3(?:\.\d+)?[\s_-]*pro/i
    },
    {
      canonicalKey: 'gemini-2.5-flash',
      label: 'Gemini 2.5 Flash',
      in: 0.3,
      cacheRead: 0.075,
      cacheWrite: 0.3,
      cacheWrite5m: 0.3,
      cacheWrite1h: 0.3,
      out: 2.5,
      pattern: /gemini[\s_-]*2\.5[\s_-]*flash(?!.*lite)/i
    },
    {
      canonicalKey: 'gemini-3-flash',
      label: 'Gemini 3 Flash',
      in: 0.5,
      cacheRead: 0.125,
      cacheWrite: 0.5,
      cacheWrite5m: 0.5,
      cacheWrite1h: 0.5,
      out: 3.0,
      pattern: /gemini[\s_-]*3(?:\.\d+)?[\s_-]*flash(?!.*lite)/i
    },
    {
      canonicalKey: 'claude-sonnet-4-5',
      label: 'Claude Sonnet 4.5',
      in: 3.0,
      cacheRead: 0.3,
      cacheWrite: 3.75,
      cacheWrite5m: 3.75,
      cacheWrite1h: 6.0,
      out: 15.0,
      pattern:
        /claude.*sonnet[\s_-]*4|claude[\s_-]*4[\s._-]*\d*[\s_-]*sonnet|claude[\s_-]*3[\s._-]*(?:5|7)[\s_-]*sonnet/i
    },
    {
      canonicalKey: 'claude-opus-4-5',
      label: 'Claude Opus 4.5',
      in: 5.0,
      cacheRead: 0.5,
      cacheWrite: 6.25,
      cacheWrite5m: 6.25,
      cacheWrite1h: 10.0,
      out: 25.0,
      pattern:
        /claude.*opus[\s_-]*4[\s._-]*(?:5|6)|claude[\s_-]*4[\s._-]*(?:5|6)[\s_-]*opus/i
    },
    {
      canonicalKey: 'claude-opus-4',
      label: 'Claude Opus 4',
      in: 15.0,
      cacheRead: 1.5,
      cacheWrite: 18.75,
      cacheWrite5m: 18.75,
      cacheWrite1h: 30.0,
      out: 75.0,
      pattern: /claude.*opus[\s_-]*4(?:[\s._-]*(?:0|1))?(?!\d)|claude[\s_-]*3[\s_-]*opus/i
    },
    {
      canonicalKey: 'claude-haiku-4-5',
      label: 'Claude Haiku 4.5',
      in: 1.0,
      cacheRead: 0.1,
      cacheWrite: 1.25,
      cacheWrite5m: 1.25,
      cacheWrite1h: 2.0,
      out: 5.0,
      pattern: /claude.*haiku[\s_-]*(?:4|3[\s._-]*5)/i
    },
    {
      canonicalKey: 'gpt-5-mini',
      label: 'GPT-5 Mini',
      in: 0.25,
      cacheRead: 0.025,
      cacheWrite: 0.25,
      cacheWrite5m: 0.25,
      cacheWrite1h: 0.25,
      out: 2.0,
      pattern: /\bgpt[\s_-]*5[\s_-]*mini\b/i
    },
    {
      canonicalKey: 'gpt-5',
      label: 'GPT-5',
      in: 1.25,
      cacheRead: 0.125,
      cacheWrite: 1.25,
      cacheWrite5m: 1.25,
      cacheWrite1h: 1.25,
      out: 10.0,
      pattern: /\bgpt[\s_-]*5(?!\s*[-_]?(?:mini|nano))\b/i
    },
    {
      canonicalKey: 'gpt-4.1',
      label: 'GPT-4.1',
      in: 2.0,
      cacheRead: 0.5,
      cacheWrite: 2.0,
      cacheWrite5m: 2.0,
      cacheWrite1h: 2.0,
      out: 8.0,
      pattern: /\bgpt[\s_-]*(?:4\.1|4o)(?!\s*[-_]?(?:mini|nano))\b/i
    },
    {
      canonicalKey: 'o3',
      label: 'OpenAI o3',
      in: 2.0,
      cacheRead: 0.5,
      cacheWrite: 2.0,
      cacheWrite5m: 2.0,
      cacheWrite1h: 2.0,
      out: 8.0,
      pattern: /(?:^|[\s/_-])o3(?:$|[\s/_-])/i
    },
    {
      canonicalKey: 'o4-mini',
      label: 'OpenAI o4-mini',
      in: 1.1,
      cacheRead: 0.275,
      cacheWrite: 1.1,
      cacheWrite5m: 1.1,
      cacheWrite1h: 1.1,
      out: 4.4,
      pattern: /\bo4[\s_-]*mini\b/i
    },
    {
      canonicalKey: 'gpt-oss-120b',
      label: 'GPT-OSS 120B',
      in: 0.15,
      cacheRead: 0.075,
      cacheWrite: 0.15,
      cacheWrite5m: 0.15,
      cacheWrite1h: 0.15,
      out: 0.6,
      pattern: /gpt[\s_-]*oss|120b/i
    }
  ];

  const PLACEHOLDER_TO_CANONICAL = Object.freeze({
    MODEL_PLACEHOLDER_M18: 'gemini-2.5-flash',
    MODEL_PLACEHOLDER_M36: 'gemini-2.5-pro',
    MODEL_PLACEHOLDER_M37: 'gemini-3-pro',
    MODEL_PLACEHOLDER_M47: 'gemini-3-flash',
    MODEL_PLACEHOLDER_M35: 'claude-sonnet-4-5',
    MODEL_PLACEHOLDER_M26: 'claude-opus-4-5',
    MODEL_PLACEHOLDER_M12: 'gpt-oss-120b'
  });

  const STATIC_CATALOG_MAP = {};
  const CATALOG_MODELS = [];
  for (let i = 0; i < CATALOG_LIST.length; i += 1) {
    const entry = CATALOG_LIST[i];
    const frozenRate = Object.freeze({
      canonicalKey: entry.canonicalKey,
      label: entry.label,
      in: entry.in,
      cacheRead: entry.cacheRead,
      cacheWrite: entry.cacheWrite,
      cacheWrite5m: entry.cacheWrite5m,
      cacheWrite1h: entry.cacheWrite1h,
      out: entry.out,
      isCustom: false
    });
    STATIC_CATALOG_MAP[entry.canonicalKey] = frozenRate;
    CATALOG_MODELS.push(frozenRate);
  }
  const STATIC_CATALOG = Object.freeze(STATIC_CATALOG_MAP);

  function toNonNegInt(val) {
    const n = Number(val);
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(n);
  }

  function clampRateVal(val, fallback = 0) {
    const n = Number(val);
    if (!Number.isFinite(n) || n < 0 || n > 10000) return fallback;
    return Math.round(n * 100000) / 100000;
  }

  function normalizeOverrideEntry(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const inRate = clampRateVal(raw.in, NaN);
    const crRate = clampRateVal(raw.cacheRead, NaN);
    const outRate = clampRateVal(raw.out, NaN);
    if (!Number.isFinite(inRate) || !Number.isFinite(crRate) || !Number.isFinite(outRate)) {
      return null;
    }
    const cw5mRaw = clampRateVal(raw.cacheWrite5m, NaN);
    const cwRaw = clampRateVal(raw.cacheWrite, NaN);
    const cw1hRaw = clampRateVal(raw.cacheWrite1h, NaN);
    const cw5m = Number.isFinite(cw5mRaw) ? cw5mRaw : Number.isFinite(cwRaw) ? cwRaw : inRate;
    const cw = Number.isFinite(cwRaw) ? cwRaw : cw5m;
    const cw1h = Number.isFinite(cw1hRaw) ? cw1hRaw : cw;
    return {
      in: inRate,
      cacheRead: crRate,
      cacheWrite: cw,
      cacheWrite5m: cw5m,
      cacheWrite1h: cw1h,
      out: outRate
    };
  }

  function normalizePricingConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const currency = src.currency === 'CNY' ? 'CNY' : 'USD';
    const rawFx = Number(src.usdToCnyRate);
    const usdToCnyRate =
      Number.isFinite(rawFx) && rawFx >= 0.5 && rawFx <= 50
        ? Math.round(rawFx * 10000) / 10000
        : DEFAULT_USD_TO_CNY_RATE;
    const overrides = {};
    if (src.overrides && typeof src.overrides === 'object' && !Array.isArray(src.overrides)) {
      let count = 0;
      for (const [k, v] of Object.entries(src.overrides)) {
        if (count >= MAX_CUSTOM_OVERRIDES) break;
        const cleanKey = String(k || '').trim().toLowerCase().slice(0, 80);
        if (!cleanKey) continue;
        const norm = normalizeOverrideEntry(v);
        if (norm) {
          overrides[cleanKey] = norm;
          count += 1;
        }
      }
    }
    return {
      version: PRICING_CONFIG_VERSION,
      currency,
      usdToCnyRate,
      overrides
    };
  }

  function resolveModelPricing(modelId, modelLabel = '', pricingConfig = null) {
    const cfg = normalizePricingConfig(pricingConfig);
    const rawId = String(modelId || '').trim();
    const rawLabel = String(modelLabel || '').trim();
    const rawIdLower = rawId.toLowerCase();

    if (rawIdLower && Object.prototype.hasOwnProperty.call(cfg.overrides, rawIdLower)) {
      const staticMatch = STATIC_CATALOG[rawIdLower];
      return {
        canonicalKey: rawIdLower,
        label: staticMatch?.label || rawLabel || rawId,
        ...cfg.overrides[rawIdLower],
        isCustom: true
      };
    }

    let canonicalKey = '';
    const combined = `${rawLabel} ${rawId}`.trim();
    if (combined) {
      for (let i = 0; i < CATALOG_LIST.length; i += 1) {
        if (CATALOG_LIST[i].pattern.test(combined)) {
          canonicalKey = CATALOG_LIST[i].canonicalKey;
          break;
        }
      }
    }

    if (!canonicalKey && rawId) {
      canonicalKey = PLACEHOLDER_TO_CANONICAL[rawId.toUpperCase()] || '';
    }

    if (!canonicalKey) {
      return null;
    }

    const baseEntry = STATIC_CATALOG[canonicalKey];
    if (Object.prototype.hasOwnProperty.call(cfg.overrides, canonicalKey)) {
      return {
        canonicalKey,
        label: baseEntry?.label || rawLabel || canonicalKey,
        ...cfg.overrides[canonicalKey],
        isCustom: true
      };
    }

    return baseEntry || null;
  }

  function extractTokenBag(u) {
    const src = u && typeof u === 'object' ? u : {};
    const inTok = toNonNegInt(src.in ?? src.inputTokens);
    const crTok = toNonNegInt(src.cr ?? src.cacheReadTokens);
    const cw5m = toNonNegInt(src.cw5m ?? src.cacheWrite5mTokens);
    const cw1h = toNonNegInt(src.cw1h ?? src.cacheWrite1hTokens);
    const cwRaw = toNonNegInt(src.cw ?? src.cacheCreationTokens);
    const cwTotal = Math.max(cwRaw, cw5m + cw1h);
    const cwUntiered = Math.max(0, cwTotal - (cw5m + cw1h));
    const rawOut = toNonNegInt(src.out ?? src.outputTokens);
    const rs = toNonNegInt(src.rs ?? src.reasoningTokens);
    const effOut = src.reasoningInOutput ? Math.max(0, rawOut - rs) : rawOut;
    const billableOut = effOut + rs;
    return {
      inTok,
      crTok,
      cw5m,
      cw1h,
      cwTotal,
      cwUntiered,
      effOut,
      rs,
      billableOut
    };
  }

  function computeUsageCost(usage, rate, pricingConfig = null) {
    const cfg = normalizePricingConfig(pricingConfig);
    const fx = cfg.currency === 'CNY' ? cfg.usdToCnyRate : 1;
    const bag = extractTokenBag(usage);
    const inputSide = bag.inTok + bag.crTok + bag.cwTotal;
    const cacheHitRate = inputSide > 0 ? Math.round((bag.crTok / inputSide) * 100) : 0;

    if (!rate || typeof rate !== 'object') {
      return {
        actualCostUsd: null,
        cacheSavedUsd: null,
        actualCost: null,
        cacheSaved: null,
        cacheHitRate,
        currency: cfg.currency,
        fx
      };
    }

    const rIn = Number(rate.in) || 0;
    const rCr = Number(rate.cacheRead) || 0;
    const rCw5m = Number(rate.cacheWrite5m ?? rate.cacheWrite ?? rIn) || 0;
    const rCw1h = Number(rate.cacheWrite1h ?? rate.cacheWrite ?? rIn) || 0;
    const rCw = Number(rate.cacheWrite ?? rate.cacheWrite5m ?? rIn) || 0;
    const rOut = Number(rate.out) || 0;

    const actualCostUsd =
      (bag.inTok * rIn +
        bag.crTok * rCr +
        bag.cw5m * rCw5m +
        bag.cw1h * rCw1h +
        bag.cwUntiered * rCw +
        bag.billableOut * rOut) /
      1e6;
    const cacheSavedUsd = Math.max(0, (bag.crTok * (rIn - rCr)) / 1e6);

    return {
      actualCostUsd,
      cacheSavedUsd,
      actualCost: actualCostUsd * fx,
      cacheSaved: cacheSavedUsd * fx,
      cacheHitRate,
      currency: cfg.currency,
      fx
    };
  }

  function computeSessionCost(convTel, pricingConfig = null) {
    if (!convTel || typeof convTel !== 'object') return null;
    const rate = resolveModelPricing(convTel.modelId, convTel.modelLabel, pricingConfig);
    return computeUsageCost(
      {
        in: convTel.sessionInputTokens,
        cr: convTel.sessionCacheReadTokens,
        cw: convTel.sessionCacheCreationTokens,
        cw5m: convTel.sessionCacheWrite5mTokens,
        cw1h: convTel.sessionCacheWrite1hTokens,
        out: convTel.sessionOutputTokens,
        rs: convTel.sessionReasoningTokens,
        reasoningInOutput: false
      },
      rate,
      pricingConfig
    );
  }

  function formatCostValue(amount, currency = 'USD', { approx = false } = {}) {
    if (amount === null || amount === undefined || !Number.isFinite(amount)) {
      return '--';
    }
    const sym = currency === 'CNY' ? '¥' : '$';
    const tilde = approx && amount > 0 ? '~' : '';
    if (amount === 0) return `${sym}0.00`;
    if (amount > 0 && amount < 0.01) {
      const fixed = amount.toFixed(4).replace(/0+$/, '').replace(/\.$/, '.00');
      const parts = fixed.split('.');
      const dec = (parts[1] || '').padEnd(2, '0');
      return `${tilde}${sym}${parts[0]}.${dec}`;
    }
    if (amount < 1000) {
      return `${tilde}${sym}${amount.toFixed(2)}`;
    }
    return `${tilde}${sym}${amount.toFixed(0)}`;
  }

  function formatLocalDateKey(tsMs) {
    const d = new Date(Number.isFinite(tsMs) ? tsMs : Date.now());
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function getLocalHour(tsMs) {
    const d = new Date(Number.isFinite(tsMs) ? tsMs : Date.now());
    const h = d.getHours();
    return h >= 0 && h <= 23 ? h : 0;
  }

  function getLocalCutoffDateKey(nowMs, daysBack = MAX_LEDGER_DAYS - 1) {
    const d = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - Math.max(0, Math.round(daysBack)));
    return formatLocalDateKey(d.getTime());
  }

  function buildLocalDateRangeKeys(nowMs, countDays) {
    const count = Math.max(1, Math.round(countDays));
    const base = new Date(Number.isFinite(nowMs) ? nowMs : Date.now());
    base.setHours(0, 0, 0, 0);
    const out = [];
    for (let i = count - 1; i >= 0; i -= 1) {
      const d = new Date(base.getTime());
      d.setDate(base.getDate() - i);
      out.push(formatLocalDateKey(d.getTime()));
    }
    return out;
  }

  function sanitizeProjectName(rawName) {
    let s = String(rawName || '').trim();
    if (!s) return '';
    // Strip path separators if any parent directory leaked into a label
    if (s.includes('/') || s.includes('\\')) {
      const parts = s.split(/[/\\]+/).filter(Boolean);
      s = parts.length > 0 ? parts[parts.length - 1] : '';
    }
    return s.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80);
  }

  function createEmptyDailyBucket() {
    return {
      totals: {
        in: 0,
        cr: 0,
        cw: 0,
        cw5m: 0,
        cw1h: 0,
        out: 0,
        rs: 0,
        calls: 0,
        durMs: 0,
        durSteps: 0,
        genToks: 0,
        ttftMs: 0,
        ttftSteps: 0
      },
      hourlyTokens: new Array(24).fill(0),
      byModel: {},
      byProject: {}
    };
  }

  function createEmptyLedger(clearedAt = 0) {
    const ts = toNonNegInt(clearedAt);
    return {
      version: LEDGER_SCHEMA_VERSION,
      clearedAt: ts,
      updatedAt: ts,
      watermarks: {},
      daily: {}
    };
  }

  function normalizeStepTuple(arr) {
    if (!Array.isArray(arr)) return null;
    return [
      toNonNegInt(arr[0]),
      toNonNegInt(arr[1]),
      toNonNegInt(arr[2]),
      toNonNegInt(arr[3]),
      toNonNegInt(arr[4]),
      toNonNegInt(arr[5]),
      toNonNegInt(arr[6]),
      arr[7] ? 1 : 0,
      arr[8] ? 1 : 0
    ];
  }

  function normalizeDailyBucket(raw) {
    const out = createEmptyDailyBucket();
    if (!raw || typeof raw !== 'object') return out;
    const t = raw.totals && typeof raw.totals === 'object' ? raw.totals : {};
    out.totals.in = toNonNegInt(t.in);
    out.totals.cr = toNonNegInt(t.cr);
    out.totals.cw = toNonNegInt(t.cw);
    out.totals.cw5m = toNonNegInt(t.cw5m);
    out.totals.cw1h = toNonNegInt(t.cw1h);
    out.totals.out = toNonNegInt(t.out);
    out.totals.rs = toNonNegInt(t.rs);
    out.totals.calls = toNonNegInt(t.calls);
    out.totals.durMs = toNonNegInt(t.durMs);
    out.totals.durSteps = toNonNegInt(t.durSteps);
    out.totals.genToks = toNonNegInt(t.genToks);
    out.totals.ttftMs = toNonNegInt(t.ttftMs);
    out.totals.ttftSteps = toNonNegInt(t.ttftSteps);

    if (Array.isArray(raw.hourlyTokens)) {
      for (let h = 0; h < 24; h += 1) {
        out.hourlyTokens[h] = toNonNegInt(raw.hourlyTokens[h]);
      }
    }

    if (raw.byModel && typeof raw.byModel === 'object' && !Array.isArray(raw.byModel)) {
      let mCount = 0;
      for (const [k, v] of Object.entries(raw.byModel)) {
        if (mCount >= MAX_MODELS_PER_DAY) break;
        if (!v || typeof v !== 'object') continue;
        const cleanKey = String(k || '').trim().slice(0, 80);
        if (!cleanKey) continue;
        out.byModel[cleanKey] = {
          label: String(v.label || cleanKey).slice(0, 80),
          in: toNonNegInt(v.in),
          cr: toNonNegInt(v.cr),
          cw: toNonNegInt(v.cw),
          cw5m: toNonNegInt(v.cw5m),
          cw1h: toNonNegInt(v.cw1h),
          out: toNonNegInt(v.out),
          rs: toNonNegInt(v.rs),
          calls: toNonNegInt(v.calls)
        };
        mCount += 1;
      }
    }

    if (raw.byProject && typeof raw.byProject === 'object' && !Array.isArray(raw.byProject)) {
      let pCount = 0;
      for (const [k, v] of Object.entries(raw.byProject)) {
        if (pCount >= MAX_PROJECTS_PER_DAY) break;
        if (!v || typeof v !== 'object') continue;
        const cleanKey = k === '__unassigned__' ? '__unassigned__' : sanitizeProjectName(k);
        if (!cleanKey) continue;
        const equivUsd =
          typeof v.equivUsd === 'number' && Number.isFinite(v.equivUsd) && v.equivUsd >= 0
            ? v.equivUsd
            : null;
        const savedUsd =
          typeof v.savedUsd === 'number' && Number.isFinite(v.savedUsd) && v.savedUsd >= 0
            ? v.savedUsd
            : 0;
        out.byProject[cleanKey] = {
          total: toNonNegInt(v.total),
          in: toNonNegInt(v.in),
          cr: toNonNegInt(v.cr),
          cw: toNonNegInt(v.cw),
          cw5m: toNonNegInt(v.cw5m),
          cw1h: toNonNegInt(v.cw1h),
          out: toNonNegInt(v.out),
          rs: toNonNegInt(v.rs),
          equivUsd,
          savedUsd,
          pricedCalls: toNonNegInt(v.pricedCalls),
          calls: toNonNegInt(v.calls)
        };
        pCount += 1;
      }
    }

    return out;
  }

  function normalizeLedger(raw) {
    if (!raw || typeof raw !== 'object' || Number(raw.version) !== LEDGER_SCHEMA_VERSION) {
      return createEmptyLedger(0);
    }
    const out = createEmptyLedger(raw.clearedAt);
    out.updatedAt = toNonNegInt(raw.updatedAt);

    if (raw.watermarks && typeof raw.watermarks === 'object' && !Array.isArray(raw.watermarks)) {
      for (const [convId, wm] of Object.entries(raw.watermarks)) {
        const cleanId = String(convId || '').trim();
        if (cleanId.length < 6 || cleanId.length > 160 || !wm || typeof wm !== 'object') continue;
        const maxStepIndex = Math.max(-1, Math.round(Number(wm.maxStepIndex) || 0));
        const lt = wm.lastTotals && typeof wm.lastTotals === 'object' ? wm.lastTotals : {};
        const recentSteps = {};
        if (wm.recentSteps && typeof wm.recentSteps === 'object') {
          const minKeep = Math.max(0, maxStepIndex - (MAX_RECENT_STEPS_PER_CONV - 1));
          for (const [idxStr, tuple] of Object.entries(wm.recentSteps)) {
            const idx = Math.round(Number(idxStr));
            if (!Number.isFinite(idx) || idx < minKeep || idx > maxStepIndex) continue;
            const normTuple = normalizeStepTuple(tuple);
            if (normTuple) {
              recentSteps[String(idx)] = normTuple;
            }
          }
        }
        const wmOut = {
          maxStepIndex,
          lastTotals: {
            in: toNonNegInt(lt.in),
            cr: toNonNegInt(lt.cr),
            cw: toNonNegInt(lt.cw),
            out: toNonNegInt(lt.out),
            rs: toNonNegInt(lt.rs)
          },
          recentSteps,
          firstSig: String(wm.firstSig || '').slice(0, 160),
          project: sanitizeProjectName(wm.project || ''),
          updatedAt: toNonNegInt(wm.updatedAt)
        };
        if (typeof wm.forkMax === 'number' && Number.isFinite(wm.forkMax)) {
          wmOut.forkMax = Math.max(0, Math.round(wm.forkMax));
          wmOut.forkTs = toNonNegInt(wm.forkTs);
        }
        out.watermarks[cleanId] = wmOut;
      }
    }

    if (raw.daily && typeof raw.daily === 'object' && !Array.isArray(raw.daily)) {
      for (const [dk, dayVal] of Object.entries(raw.daily)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dk)) continue;
        out.daily[dk] = normalizeDailyBucket(dayVal);
      }
    }

    return out;
  }

  function trimWatermarkMap(ledger, limit = MAX_LEDGER_WATERMARKS) {
    const entries = Object.entries(ledger.watermarks || {});
    for (let i = 0; i < entries.length; i += 1) {
      const wm = entries[i][1];
      if (!wm || typeof wm !== 'object') continue;
      const minKeep = Math.max(0, (wm.maxStepIndex || 0) - (MAX_RECENT_STEPS_PER_CONV - 1));
      if (wm.recentSteps && typeof wm.recentSteps === 'object') {
        for (const k of Object.keys(wm.recentSteps)) {
          const idx = Number(k);
          if (!Number.isFinite(idx) || idx < minKeep || idx > wm.maxStepIndex) {
            delete wm.recentSteps[k];
          }
        }
      }
    }
    if (entries.length <= limit) return;
    entries.sort((a, b) => (b[1]?.updatedAt || 0) - (a[1]?.updatedAt || 0));
    const nextMap = {};
    for (let i = 0; i < limit; i += 1) {
      nextMap[entries[i][0]] = entries[i][1];
    }
    ledger.watermarks = nextMap;
  }

  function measureJsonBytes(obj) {
    const json = JSON.stringify(obj);
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(json).byteLength;
    }
    return json.length * 2;
  }

  function pruneLedgerBeforeWrite(ledger, nowMs = Date.now()) {
    if (!ledger || typeof ledger !== 'object') return ledger;
    const cutoffKey = getLocalCutoffDateKey(nowMs, MAX_LEDGER_DAYS - 1);
    if (ledger.daily && typeof ledger.daily === 'object') {
      for (const k of Object.keys(ledger.daily)) {
        if (k < cutoffKey) {
          delete ledger.daily[k];
        }
      }
    }
    trimWatermarkMap(ledger, MAX_LEDGER_WATERMARKS);

    let byteLen = measureJsonBytes(ledger);
    if (byteLen <= MAX_LEDGER_BYTES) return ledger;

    const sortedDays = Object.keys(ledger.daily || {}).sort();
    while (byteLen > MAX_LEDGER_BYTES && sortedDays.length > MIN_PROTECTED_DAYS) {
      const oldestDay = sortedDays.shift();
      if (oldestDay) delete ledger.daily[oldestDay];
      byteLen = measureJsonBytes(ledger);
    }

    let wmLimit = MAX_LEDGER_WATERMARKS;
    while (byteLen > MAX_LEDGER_BYTES && wmLimit > 120) {
      wmLimit = Math.max(120, wmLimit - 30);
      trimWatermarkMap(ledger, wmLimit);
      byteLen = measureJsonBytes(ledger);
    }

    while (byteLen > MAX_LEDGER_BYTES && sortedDays.length > 1) {
      const oldestDay = sortedDays.shift();
      if (oldestDay) delete ledger.daily[oldestDay];
      byteLen = measureJsonBytes(ledger);
    }

    return ledger;
  }

  function emergencyTrimLedger(ledger, { maxDays = 30, maxWatermarks = 100 } = {}) {
    if (!ledger || typeof ledger !== 'object') return ledger;
    const sortedDays = Object.keys(ledger.daily || {}).sort();
    while (sortedDays.length > maxDays) {
      const oldest = sortedDays.shift();
      if (oldest) delete ledger.daily[oldest];
    }
    trimWatermarkMap(ledger, maxWatermarks);
    return ledger;
  }

  function sanitizeModelKey(raw) {
    return String(raw || 'unknown')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._:/-]+/g, '_')
      .slice(0, 80) || 'unknown';
  }

  function foldStepIntoDay(day, opts) {
    const {
      dIn,
      dCr,
      dCw,
      dCw5m,
      dCw1h,
      dOut,
      dRs,
      dCalls,
      hourIdx,
      durDeltaMs,
      durDeltaSteps,
      genToksDelta,
      ttftDeltaMs,
      ttftDeltaSteps,
      modelKey,
      modelLabel,
      projKey,
      stepUsdCost,
      stepUsdSaved,
      stepPricedCalls
    } = opts;

    const tot = day.totals;
    tot.in += dIn;
    tot.cr += dCr;
    tot.cw += dCw;
    tot.cw5m += dCw5m;
    tot.cw1h += dCw1h;
    tot.out += dOut;
    tot.rs += dRs;
    tot.calls += dCalls;
    tot.durMs += durDeltaMs;
    tot.durSteps += durDeltaSteps;
    tot.genToks += genToksDelta;
    tot.ttftMs += ttftDeltaMs;
    tot.ttftSteps += ttftDeltaSteps;

    const dTotal = dIn + dCr + dCw + dOut + dRs;
    if (dTotal > 0 && hourIdx >= 0 && hourIdx <= 23) {
      day.hourlyTokens[hourIdx] = (day.hourlyTokens[hourIdx] || 0) + dTotal;
    }

    if (dTotal > 0 || dCalls > 0) {
      let targetModelKey = modelKey;
      if (!day.byModel[targetModelKey]) {
        const curModelCount = Object.keys(day.byModel).length;
        const hasOther = Boolean(day.byModel.__other__);
        if (
          curModelCount >= MAX_MODELS_PER_DAY ||
          (!hasOther && curModelCount >= MAX_MODELS_PER_DAY - 1)
        ) {
          targetModelKey = '__other__';
        }
      }
      if (
        day.byModel[targetModelKey] ||
        Object.keys(day.byModel).length < MAX_MODELS_PER_DAY
      ) {
        if (!day.byModel[targetModelKey]) {
          day.byModel[targetModelKey] = {
            label: targetModelKey === '__other__' ? 'Other' : modelLabel || targetModelKey,
            in: 0,
            cr: 0,
            cw: 0,
            cw5m: 0,
            cw1h: 0,
            out: 0,
            rs: 0,
            calls: 0
          };
        }
        const mb = day.byModel[targetModelKey];
        mb.in += dIn;
        mb.cr += dCr;
        mb.cw += dCw;
        mb.cw5m += dCw5m;
        mb.cw1h += dCw1h;
        mb.out += dOut;
        mb.rs += dRs;
        mb.calls += dCalls;
      }

      let targetProjKey = projKey || '__unassigned__';
      if (!day.byProject[targetProjKey]) {
        const curProjCount = Object.keys(day.byProject).length;
        const hasUnassigned = Boolean(day.byProject.__unassigned__);
        if (
          curProjCount >= MAX_PROJECTS_PER_DAY ||
          (!hasUnassigned && curProjCount >= MAX_PROJECTS_PER_DAY - 1)
        ) {
          targetProjKey = '__unassigned__';
        }
      }
      if (
        day.byProject[targetProjKey] ||
        Object.keys(day.byProject).length < MAX_PROJECTS_PER_DAY
      ) {
        if (!day.byProject[targetProjKey]) {
          day.byProject[targetProjKey] = {
            total: 0,
            in: 0,
            cr: 0,
            cw: 0,
            cw5m: 0,
            cw1h: 0,
            out: 0,
            rs: 0,
            equivUsd: null,
            savedUsd: 0,
            pricedCalls: 0,
            calls: 0
          };
        }
        const pb = day.byProject[targetProjKey];
        pb.total += dTotal;
        pb.in += dIn;
        pb.cr += dCr;
        pb.cw += dCw;
        pb.cw5m += dCw5m;
        pb.cw1h += dCw1h;
        pb.out += dOut;
        pb.rs += dRs;
        pb.calls += dCalls;
        if (stepUsdCost !== null) {
          pb.equivUsd = (pb.equivUsd === null ? 0 : pb.equivUsd) + stepUsdCost;
          pb.savedUsd = (pb.savedUsd || 0) + (stepUsdSaved || 0);
          pb.pricedCalls += stepPricedCalls;
        }
      }
    }
  }

  function ingestLedgerBatches(
    ledger,
    batches,
    nowMs = Date.now(),
    pricingConfig = null,
    projectHints = null
  ) {
    if (!ledger || !Array.isArray(batches) || batches.length === 0) {
      return { dirty: false, addedCalls: 0, addedTokens: 0 };
    }

    const usdCfg = { ...normalizePricingConfig(pricingConfig), currency: 'USD' };
    const cutoff90d = getLocalCutoffDateKey(nowMs, MAX_LEDGER_DAYS - 1);
    let dirty = false;
    let addedCalls = 0;
    let addedTokens = 0;

    for (let bIdx = 0; bIdx < batches.length; bIdx += 1) {
      const batch = batches[bIdx];
      if (!batch || typeof batch !== 'object') continue;
      const convId = String(batch.convId || '').trim();
      if (convId.length < 6 || convId.length > 160 || convId.startsWith('composer-panel-')) {
        continue;
      }
      const steps = Array.isArray(batch.steps)
        ? [...batch.steps].sort((a, b) => (Number(a?.idx) || 0) - (Number(b?.idx) || 0))
        : [];
      if (steps.length === 0) continue;

      const hintProj =
        projectHints && typeof projectHints === 'object' ? projectHints[convId] : '';
      const cleanProj = sanitizeProjectName(batch.projectName || hintProj || '');
      const firstSig = String(batch.firstSig || '').slice(0, 160);

      let wm = ledger.watermarks[convId] || null;
      let forkParentMaxIdx = null;
      let forkParentUpdatedAt = 0;

      if (!wm) {
        if (firstSig) {
          for (const [otherId, otherWm] of Object.entries(ledger.watermarks)) {
            if (otherId !== convId && otherWm && otherWm.firstSig === firstSig) {
              if (
                forkParentMaxIdx === null ||
                otherWm.maxStepIndex > forkParentMaxIdx
              ) {
                forkParentMaxIdx = otherWm.maxStepIndex;
                forkParentUpdatedAt = otherWm.updatedAt || 0;
              }
            }
          }
        }
        wm = {
          maxStepIndex: -1,
          lastTotals: { in: 0, cr: 0, cw: 0, out: 0, rs: 0 },
          recentSteps: {},
          firstSig,
          project: cleanProj,
          updatedAt: nowMs
        };
        if (forkParentMaxIdx !== null) {
          wm.forkMax = forkParentMaxIdx;
          wm.forkTs = forkParentUpdatedAt;
        }
        ledger.watermarks[convId] = wm;
      } else {
        if (cleanProj && wm.project !== cleanProj) {
          wm.project = cleanProj;
          dirty = true;
        }
        if (firstSig && !wm.firstSig) {
          wm.firstSig = firstSig;
        }
        if (typeof wm.forkMax === 'number') {
          forkParentMaxIdx = wm.forkMax;
          forkParentUpdatedAt = wm.forkTs || 0;
        }
      }

      const effectiveProjKey = wm.project || cleanProj || '__unassigned__';

      for (let sIdx = 0; sIdx < steps.length; sIdx += 1) {
        const s = steps[sIdx];
        if (!s || typeof s !== 'object') continue;
        const idx = Math.round(Number(s.idx));
        if (!Number.isFinite(idx) || idx < 0) continue;

        const sIn = toNonNegInt(s.in);
        const sCr = toNonNegInt(s.cr);
        const sCw5m = toNonNegInt(s.cw5m);
        const sCw1h = toNonNegInt(s.cw1h);
        const sCw = Math.max(toNonNegInt(s.cw), sCw5m + sCw1h);
        const sRs = toNonNegInt(s.rs);
        const rawOut = toNonNegInt(s.out);
        const sOut = s.reasoningInOutput ? Math.max(0, rawOut - sRs) : rawOut;
        const stepTotal = sIn + sCr + sCw + sOut + sRs;
        if (stepTotal <= 0) continue;

        const stepTs =
          typeof s.ts === 'number' && Number.isFinite(s.ts) && s.ts > 0 ? s.ts : null;

        // Rule A: Inherited fork prefix skip
        const isForkPrefix =
          s.fork === true ||
          (forkParentMaxIdx !== null &&
            idx <= forkParentMaxIdx &&
            (stepTs !== null ? stepTs <= forkParentUpdatedAt : true));
        if (isForkPrefix) {
          if (idx > wm.maxStepIndex) {
            wm.maxStepIndex = idx;
            dirty = true;
          }
          if (idx >= wm.maxStepIndex - (MAX_RECENT_STEPS_PER_CONV - 1)) {
            wm.recentSteps[String(idx)] = [sIn, sCr, sCw, sCw5m, sCw1h, sOut, sRs, 1, 1];
          }
          wm.updatedAt = nowMs;
          continue;
        }

        // Rule B: Post-Clear baseline skip
        if (ledger.clearedAt > 0) {
          const isPreClear =
            (stepTs !== null && stepTs <= ledger.clearedAt) ||
            (stepTs === null && !s.live);
          if (isPreClear) {
            if (idx > wm.maxStepIndex) {
              wm.maxStepIndex = idx;
              dirty = true;
            }
            if (idx >= wm.maxStepIndex - (MAX_RECENT_STEPS_PER_CONV - 1)) {
              wm.recentSteps[String(idx)] = [sIn, sCr, sCw, sCw5m, sCw1h, sOut, sRs, 1, 1];
            }
            wm.updatedAt = nowMs;
            continue;
          }
        }

        // Rule C: High-watermark & tail in-place completion delta
        const idxKey = String(idx);
        const prevTuple = wm.recentSteps[idxKey] || null;
        let dIn = 0;
        let dCr = 0;
        let dCw = 0;
        let dCw5m = 0;
        let dCw1h = 0;
        let dOut = 0;
        let dRs = 0;
        let dCalls = 0;
        let prevDurBooked = 0;
        let prevTtftBooked = 0;

        if (idx > wm.maxStepIndex) {
          dIn = sIn;
          dCr = sCr;
          dCw = sCw;
          dCw5m = sCw5m;
          dCw1h = sCw1h;
          dOut = sOut;
          dRs = sRs;
          dCalls = 1;
          wm.maxStepIndex = idx;
          wm.recentSteps[idxKey] = [sIn, sCr, sCw, sCw5m, sCw1h, sOut, sRs, 0, 0];
        } else if (prevTuple) {
          dIn = Math.max(0, sIn - (prevTuple[0] || 0));
          dCr = Math.max(0, sCr - (prevTuple[1] || 0));
          dCw = Math.max(0, sCw - (prevTuple[2] || 0));
          dCw5m = Math.max(0, sCw5m - (prevTuple[3] || 0));
          dCw1h = Math.max(0, sCw1h - (prevTuple[4] || 0));
          dOut = Math.max(0, sOut - (prevTuple[5] || 0));
          dRs = Math.max(0, sRs - (prevTuple[6] || 0));
          prevDurBooked = prevTuple[7] ? 1 : 0;
          prevTtftBooked = prevTuple[8] ? 1 : 0;

          const sDurCheck =
            typeof s.dur === 'number' && Number.isFinite(s.dur) && s.dur > 0
              ? Math.round(s.dur)
              : 0;
          const sTtftCheck =
            typeof s.ttft === 'number' && Number.isFinite(s.ttft) && s.ttft > 0
              ? Math.round(s.ttft)
              : 0;
          const hasTimingUpdate =
            (!prevDurBooked && sDurCheck > 0) || (!prevTtftBooked && sTtftCheck > 0);

          if (dIn + dCr + dCw + dOut + dRs === 0 && !hasTimingUpdate) {
            continue;
          }

          wm.recentSteps[idxKey] = [
            Math.max(prevTuple[0] || 0, sIn),
            Math.max(prevTuple[1] || 0, sCr),
            Math.max(prevTuple[2] || 0, sCw),
            Math.max(prevTuple[3] || 0, sCw5m),
            Math.max(prevTuple[4] || 0, sCw1h),
            Math.max(prevTuple[5] || 0, sOut),
            Math.max(prevTuple[6] || 0, sRs),
            prevDurBooked,
            prevTtftBooked
          ];
        } else {
          continue;
        }

        const sDur =
          typeof s.dur === 'number' && Number.isFinite(s.dur) && s.dur > 0
            ? Math.round(s.dur)
            : 0;
        const sTtft =
          typeof s.ttft === 'number' && Number.isFinite(s.ttft) && s.ttft > 0
            ? Math.round(s.ttft)
            : 0;

        let durDeltaMs = 0;
        let durDeltaSteps = 0;
        let genToksDelta = 0;
        let ttftDeltaMs = 0;
        let ttftDeltaSteps = 0;

        if (!prevDurBooked && sDur > 0) {
          durDeltaMs = sDur;
          durDeltaSteps = 1;
          genToksDelta = (wm.recentSteps[idxKey][5] || 0) + (wm.recentSteps[idxKey][6] || 0);
          wm.recentSteps[idxKey][7] = 1;
        } else if (prevDurBooked && dOut + dRs > 0) {
          genToksDelta = dOut + dRs;
        }

        if (!prevTtftBooked && sTtft > 0) {
          ttftDeltaMs = sTtft;
          ttftDeltaSteps = 1;
          wm.recentSteps[idxKey][8] = 1;
        }

        // Rule D: Date/hour attribution & 90-day cutoff
        const effectiveTs =
          stepTs !== null && stepTs > 946684800000 && stepTs <= nowMs + 300000
            ? stepTs
            : nowMs;
        const dateKey = formatLocalDateKey(effectiveTs);
        const hourIdx = getLocalHour(effectiveTs);

        wm.lastTotals.in += dIn;
        wm.lastTotals.cr += dCr;
        wm.lastTotals.cw += dCw;
        wm.lastTotals.out += dOut;
        wm.lastTotals.rs += dRs;
        wm.updatedAt = nowMs;
        dirty = true;

        if (dateKey < cutoff90d) {
          continue;
        }

        if (!ledger.daily[dateKey]) {
          ledger.daily[dateKey] = createEmptyDailyBucket();
        }
        const day = ledger.daily[dateKey];

        const resolvedRate = resolveModelPricing(s.m, s.ml, usdCfg);
        const modelKey = resolvedRate
          ? resolvedRate.canonicalKey
          : sanitizeModelKey(s.m || s.ml || 'unknown');
        const modelLabel = resolvedRate
          ? resolvedRate.label
          : String(s.ml || s.m || 'Unknown').slice(0, 80);

        const costRes = computeUsageCost(
          { in: dIn, cr: dCr, cw: dCw, cw5m: dCw5m, cw1h: dCw1h, out: dOut, rs: dRs },
          resolvedRate,
          usdCfg
        );
        const stepUsdCost = costRes.actualCostUsd;
        const stepUsdSaved = costRes.cacheSavedUsd;
        const stepPricedCalls = stepUsdCost !== null ? dCalls : 0;

        foldStepIntoDay(day, {
          dIn,
          dCr,
          dCw,
          dCw5m,
          dCw1h,
          dOut,
          dRs,
          dCalls,
          hourIdx,
          durDeltaMs,
          durDeltaSteps,
          genToksDelta,
          ttftDeltaMs,
          ttftDeltaSteps,
          modelKey,
          modelLabel,
          projKey: effectiveProjKey,
          stepUsdCost,
          stepUsdSaved,
          stepPricedCalls
        });

        addedCalls += dCalls;
        addedTokens += dIn + dCr + dCw + dOut + dRs;
      }

      // Keep recentSteps trimmed to tail 4 indices
      const minKeep = Math.max(0, wm.maxStepIndex - (MAX_RECENT_STEPS_PER_CONV - 1));
      for (const k of Object.keys(wm.recentSteps)) {
        const kNum = Number(k);
        if (!Number.isFinite(kNum) || kNum < minKeep || kNum > wm.maxStepIndex) {
          delete wm.recentSteps[k];
        }
      }
    }

    if (dirty) {
      ledger.updatedAt = nowMs;
    }
    return { dirty, addedCalls, addedTokens };
  }

  function computeDayCostFromModels(day, pricingConfig) {
    if (!day || typeof day !== 'object') {
      return { cost: 0, saved: 0, costUsd: 0, savedUsd: 0, pricedCalls: 0, totalCalls: 0 };
    }
    const cfg = normalizePricingConfig(pricingConfig);
    const totalCalls = toNonNegInt(day.totals?.calls);
    if (totalCalls === 0) {
      return { cost: 0, saved: 0, costUsd: 0, savedUsd: 0, pricedCalls: 0, totalCalls: 0 };
    }
    let pricedCalls = 0;
    let costSum = 0;
    let savedSum = 0;
    let costUsdSum = 0;
    let savedUsdSum = 0;

    for (const [mKey, mVal] of Object.entries(day.byModel || {})) {
      if (!mVal) continue;
      const rate = resolveModelPricing(mKey, mVal.label, cfg);
      const res = computeUsageCost(mVal, rate, cfg);
      if (res.actualCost !== null) {
        pricedCalls += toNonNegInt(mVal.calls);
        costSum += res.actualCost;
        savedSum += res.cacheSaved || 0;
        costUsdSum += res.actualCostUsd;
        savedUsdSum += res.cacheSavedUsd || 0;
      }
    }

    if (pricedCalls === 0) {
      return { cost: null, saved: null, costUsd: null, savedUsd: null, pricedCalls: 0, totalCalls };
    }
    return {
      cost: costSum,
      saved: savedSum,
      costUsd: costUsdSum,
      savedUsd: savedUsdSum,
      pricedCalls,
      totalCalls
    };
  }

  function aggregateLedgerPeriod(
    ledger,
    period = 'today',
    nowMs = Date.now(),
    pricingConfig = null
  ) {
    const cfg = normalizePricingConfig(pricingConfig);
    const fx = cfg.currency === 'CNY' ? cfg.usdToCnyRate : 1;
    const normLedger = normalizeLedger(ledger);
    const daysCount = period === '30d' ? 30 : period === '7d' ? 7 : 1;
    const dateKeys = buildLocalDateRangeKeys(nowMs, daysCount);

    const totals = {
      in: 0,
      cr: 0,
      cw: 0,
      cw5m: 0,
      cw1h: 0,
      out: 0,
      rs: 0,
      calls: 0,
      durMs: 0,
      durSteps: 0,
      genToks: 0,
      ttftMs: 0,
      ttftSteps: 0
    };

    const modelMap = new Map();
    const projectMap = new Map();

    for (let i = 0; i < dateKeys.length; i += 1) {
      const dk = dateKeys[i];
      const day = normLedger.daily[dk];
      if (!day) continue;

      totals.in += day.totals.in;
      totals.cr += day.totals.cr;
      totals.cw += day.totals.cw;
      totals.cw5m += day.totals.cw5m;
      totals.cw1h += day.totals.cw1h;
      totals.out += day.totals.out;
      totals.rs += day.totals.rs;
      totals.calls += day.totals.calls;
      totals.durMs += day.totals.durMs;
      totals.durSteps += day.totals.durSteps;
      totals.genToks += day.totals.genToks;
      totals.ttftMs += day.totals.ttftMs;
      totals.ttftSteps += day.totals.ttftSteps;

      for (const [mKey, mVal] of Object.entries(day.byModel || {})) {
        const rate = resolveModelPricing(mKey, mVal.label, cfg);
        const canonKey = rate ? rate.canonicalKey : mKey;
        const label = rate ? rate.label : mVal.label || mKey;
        let agg = modelMap.get(canonKey);
        if (!agg) {
          agg = {
            key: canonKey,
            label,
            in: 0,
            cr: 0,
            cw: 0,
            cw5m: 0,
            cw1h: 0,
            out: 0,
            rs: 0,
            calls: 0
          };
          modelMap.set(canonKey, agg);
        }
        agg.in += mVal.in;
        agg.cr += mVal.cr;
        agg.cw += mVal.cw;
        agg.cw5m += mVal.cw5m;
        agg.cw1h += mVal.cw1h;
        agg.out += mVal.out;
        agg.rs += mVal.rs;
        agg.calls += mVal.calls;
      }

      for (const [pKey, pVal] of Object.entries(day.byProject || {})) {
        let agg = projectMap.get(pKey);
        if (!agg) {
          agg = {
            key: pKey,
            totalTokens: 0,
            in: 0,
            cr: 0,
            cw: 0,
            out: 0,
            rs: 0,
            equivUsd: null,
            savedUsd: 0,
            pricedCalls: 0,
            calls: 0
          };
          projectMap.set(pKey, agg);
        }
        agg.totalTokens += pVal.total;
        agg.in += pVal.in;
        agg.cr += pVal.cr;
        agg.cw += pVal.cw;
        agg.out += pVal.out;
        agg.rs += pVal.rs;
        agg.calls += pVal.calls;
        if (typeof pVal.equivUsd === 'number' && Number.isFinite(pVal.equivUsd)) {
          agg.equivUsd = (agg.equivUsd === null ? 0 : agg.equivUsd) + pVal.equivUsd;
          agg.savedUsd += pVal.savedUsd || 0;
          agg.pricedCalls += pVal.pricedCalls || 0;
        }
      }
    }

    let pricedCalls = 0;
    let totalCost = 0;
    let totalSaved = 0;
    let totalCostUsd = 0;
    let totalSavedUsd = 0;
    const modelsList = [];

    for (const m of modelMap.values()) {
      const rate = resolveModelPricing(m.key, m.label, cfg);
      const costRes = computeUsageCost(m, rate, cfg);
      const mTotal = m.in + m.cr + m.cw + m.out + m.rs;
      if (costRes.actualCost !== null) {
        pricedCalls += m.calls;
        totalCost += costRes.actualCost;
        totalSaved += costRes.cacheSaved || 0;
        totalCostUsd += costRes.actualCostUsd;
        totalSavedUsd += costRes.cacheSavedUsd || 0;
      }
      modelsList.push({
        key: m.key,
        label: m.label,
        totalTokens: mTotal,
        calls: m.calls,
        cost: costRes.actualCost,
        costUsd: costRes.actualCostUsd,
        saved: costRes.cacheSaved,
        cacheHitRate: costRes.cacheHitRate
      });
    }

    modelsList.sort((a, b) => b.totalTokens - a.totalTokens || (b.cost || 0) - (a.cost || 0));

    const projectsList = [];
    for (const p of projectMap.values()) {
      const hasPriced = p.pricedCalls > 0 && p.equivUsd !== null;
      projectsList.push({
        key: p.key,
        totalTokens: p.totalTokens,
        calls: p.calls,
        cost: hasPriced ? p.equivUsd * fx : p.calls === 0 ? 0 : null,
        saved: hasPriced ? p.savedUsd * fx : 0
      });
    }
    projectsList.sort((a, b) => b.totalTokens - a.totalTokens || (b.cost || 0) - (a.cost || 0));

    let finalCost = 0;
    let finalSaved = 0;
    let finalCostUsd = 0;
    let finalSavedUsd = 0;
    let costApprox = false;

    if (totals.calls > 0 && pricedCalls === 0) {
      finalCost = null;
      finalSaved = null;
      finalCostUsd = null;
      finalSavedUsd = null;
    } else if (pricedCalls > 0) {
      finalCost = totalCost;
      finalSaved = totalSaved;
      finalCostUsd = totalCostUsd;
      finalSavedUsd = totalSavedUsd;
      costApprox = true;
    }

    const totalTokens = totals.in + totals.cr + totals.cw + totals.out + totals.rs;
    const inputSide = totals.in + totals.cr + totals.cw;
    const cacheHitRate = inputSide > 0 ? Math.round((totals.cr / inputSide) * 100) : 0;
    const avgTokPerSec =
      totals.durMs > 0 && totals.genToks > 0
        ? Math.round((totals.genToks / (totals.durMs / 1000)) * 10) / 10
        : null;
    const avgTtftMs =
      totals.ttftSteps > 0 && totals.ttftMs > 0
        ? Math.round(totals.ttftMs / totals.ttftSteps)
        : null;

    // Trend buckets
    const trendBuckets = [];
    if (period === 'today') {
      const todayKey = dateKeys[dateKeys.length - 1];
      const todayDay = normLedger.daily[todayKey];
      for (let h = 0; h < 24; h += 1) {
        trendBuckets.push({
          key: `${todayKey}T${String(h).padStart(2, '0')}`,
          label: `${String(h).padStart(2, '0')}:00`,
          tokens: todayDay ? toNonNegInt(todayDay.hourlyTokens[h]) : 0,
          calls: null,
          cost: null
        });
      }
    } else {
      for (let i = 0; i < dateKeys.length; i += 1) {
        const dk = dateKeys[i];
        const day = normLedger.daily[dk];
        const dayTokens = day
          ? day.totals.in + day.totals.cr + day.totals.cw + day.totals.out + day.totals.rs
          : 0;
        const dayCost = computeDayCostFromModels(day, cfg);
        trendBuckets.push({
          key: dk,
          label: dk.slice(5),
          tokens: dayTokens,
          calls: day ? day.totals.calls : 0,
          cost: dayCost.cost
        });
      }
    }

    // 28-day heatmap
    const heatmapKeys = buildLocalDateRangeKeys(nowMs, 28);
    const heatmapDays = [];
    for (let i = 0; i < heatmapKeys.length; i += 1) {
      const dk = heatmapKeys[i];
      const day = normLedger.daily[dk];
      const dayTokens = day
        ? day.totals.in + day.totals.cr + day.totals.cw + day.totals.out + day.totals.rs
        : 0;
      const dayCost = computeDayCostFromModels(day, cfg);
      heatmapDays.push({
        dateKey: dk,
        tokens: dayTokens,
        calls: day ? day.totals.calls : 0,
        cost: dayCost.cost
      });
    }

    return {
      period,
      currency: cfg.currency,
      usdToCnyRate: cfg.usdToCnyRate,
      totals,
      totalTokens,
      cacheHitRate,
      avgTokPerSec,
      avgTtftMs,
      pricedCalls,
      totalCost: finalCost,
      totalSaved: finalSaved,
      totalCostUsd: finalCostUsd,
      totalSavedUsd: finalSavedUsd,
      costApprox,
      trendBuckets,
      heatmapDays,
      topModels: modelsList.slice(0, 5),
      topProjects: projectsList.slice(0, 5)
    };
  }

  function sanitizeCsvCell(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '';
    let str = String(val).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const trimmed = str.trimStart();
    if (trimmed && /^[=+\-@]/.test(trimmed)) {
      str = `'${str}`;
    } else if (/^[\t\r\n]/.test(str)) {
      str = `'${str}`;
    }
    if (/[",\n']/.test(str)) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  }

  function formatUsdCsvNum(n) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '';
    return Number(n.toFixed(6));
  }

  function buildUsageCsv(ledger, pricingConfig = null) {
    const cfg = normalizePricingConfig(pricingConfig);
    const fx = cfg.currency === 'CNY' ? cfg.usdToCnyRate : 1;
    const normLedger = normalizeLedger(ledger);
    const header = [
      'date',
      'dimension',
      'name',
      'calls',
      'input_tokens',
      'cache_read_tokens',
      'cache_write_tokens',
      'cache_write_5m_tokens',
      'cache_write_1h_tokens',
      'output_tokens',
      'reasoning_tokens',
      'total_tokens',
      'equiv_cost_usd',
      'cache_saved_usd',
      'display_currency',
      'equiv_cost_display',
      'cache_saved_display'
    ].join(',');

    const lines = [header];
    const dateKeys = Object.keys(normLedger.daily).sort();

    for (let i = 0; i < dateKeys.length; i += 1) {
      const dk = dateKeys[i];
      const day = normLedger.daily[dk];
      const dayTotalToks =
        day.totals.in + day.totals.cr + day.totals.cw + day.totals.out + day.totals.rs;
      const dayCostInfo = computeDayCostFromModels(day, { ...cfg, currency: 'USD' });
      const dayDispCost = dayCostInfo.costUsd !== null ? dayCostInfo.costUsd * fx : null;
      const dayDispSaved = dayCostInfo.savedUsd !== null ? dayCostInfo.savedUsd * fx : null;

      lines.push(
        [
          dk,
          'daily_total',
          'ALL',
          day.totals.calls,
          day.totals.in,
          day.totals.cr,
          day.totals.cw,
          day.totals.cw5m,
          day.totals.cw1h,
          day.totals.out,
          day.totals.rs,
          dayTotalToks,
          formatUsdCsvNum(dayCostInfo.costUsd),
          formatUsdCsvNum(dayCostInfo.savedUsd),
          cfg.currency,
          formatUsdCsvNum(dayDispCost),
          formatUsdCsvNum(dayDispSaved)
        ]
          .map(sanitizeCsvCell)
          .join(',')
      );

      const models = Object.entries(day.byModel || {}).sort((a, b) => {
        const ta = a[1].in + a[1].cr + a[1].cw + a[1].out + a[1].rs;
        const tb = b[1].in + b[1].cr + b[1].cw + b[1].out + b[1].rs;
        return tb - ta;
      });
      for (let j = 0; j < models.length; j += 1) {
        const [mKey, m] = models[j];
        const mTotal = m.in + m.cr + m.cw + m.out + m.rs;
        const rate = resolveModelPricing(mKey, m.label, cfg);
        const mCost = computeUsageCost(m, rate, cfg);
        lines.push(
          [
            dk,
            'model',
            m.label || mKey,
            m.calls,
            m.in,
            m.cr,
            m.cw,
            m.cw5m,
            m.cw1h,
            m.out,
            m.rs,
            mTotal,
            formatUsdCsvNum(mCost.actualCostUsd),
            formatUsdCsvNum(mCost.cacheSavedUsd),
            cfg.currency,
            formatUsdCsvNum(mCost.actualCost),
            formatUsdCsvNum(mCost.cacheSaved)
          ]
            .map(sanitizeCsvCell)
            .join(',')
        );
      }

      const projects = Object.entries(day.byProject || {}).sort(
        (a, b) => (b[1].total || 0) - (a[1].total || 0)
      );
      for (let k = 0; k < projects.length; k += 1) {
        const [pKey, p] = projects[k];
        const pCostUsd = p.pricedCalls > 0 && p.equivUsd !== null ? p.equivUsd : null;
        const pSavedUsd = p.pricedCalls > 0 ? p.savedUsd || 0 : null;
        const pDispCost = pCostUsd !== null ? pCostUsd * fx : null;
        const pDispSaved = pSavedUsd !== null ? pSavedUsd * fx : null;
        lines.push(
          [
            dk,
            'project',
            pKey === '__unassigned__' ? 'Unassigned' : pKey,
            p.calls,
            p.in,
            p.cr,
            p.cw,
            p.cw5m,
            p.cw1h,
            p.out,
            p.rs,
            p.total,
            formatUsdCsvNum(pCostUsd),
            formatUsdCsvNum(pSavedUsd),
            cfg.currency,
            formatUsdCsvNum(pDispCost),
            formatUsdCsvNum(pDispSaved)
          ]
            .map(sanitizeCsvCell)
            .join(',')
        );
      }
    }

    return lines.join('\n');
  }

  function buildUsageExportJson(ledger, pricingConfig = null, nowMs = Date.now()) {
    const cfg = normalizePricingConfig(pricingConfig);
    const normLedger = normalizeLedger(ledger);
    const summary30d = aggregateLedgerPeriod(normLedger, '30d', nowMs, cfg);
    return {
      exportedAt: new Date(nowMs).toISOString(),
      schemaVersion: LEDGER_SCHEMA_VERSION,
      currency: cfg.currency,
      usdToCnyRate: cfg.usdToCnyRate,
      periodSummary: {
        today: aggregateLedgerPeriod(normLedger, 'today', nowMs, cfg),
        last7d: aggregateLedgerPeriod(normLedger, '7d', nowMs, cfg),
        last30d: {
          totals: summary30d.totals,
          totalTokens: summary30d.totalTokens,
          totalCost: summary30d.totalCost,
          totalSaved: summary30d.totalSaved,
          cacheHitRate: summary30d.cacheHitRate,
          topModels: summary30d.topModels,
          topProjects: summary30d.topProjects
        }
      },
      daily: normLedger.daily
    };
  }

  // ============================================================================
  // P2 Helpers: Prompt Cache Freshness, Quota Notifications & Magpie Gateway
  // ============================================================================

  function evaluateCacheFreshness(convTel, nowMs = Date.now()) {
    if (!convTel || typeof convTel !== 'object') return null;
    if (convTel.precision !== 'exact') return null;
    if (convTel.isRunning) return null;
    const lastStepTs = convTel.lastStepTs;
    if (
      typeof lastStepTs !== 'number' ||
      !Number.isFinite(lastStepTs) ||
      lastStepTs <= MIN_VALID_TS_MS
    ) {
      return null;
    }
    const modelCombined = `${convTel.modelId || ''} ${convTel.modelLabel || ''}`.trim();
    if (modelCombined && SHADOW_MODEL_RE.test(modelCombined)) {
      return null;
    }

    const cw5m = toNonNegInt(convTel.cacheWrite5mTokens);
    const cw1h = toNonNegInt(convTel.cacheWrite1hTokens);
    const cwRaw = toNonNegInt(convTel.cacheCreationTokens);
    const cwTotal = Math.max(cwRaw, cw5m + cw1h);
    const sessCw5m = toNonNegInt(convTel.sessionCacheWrite5mTokens);
    const sessCw1h = toNonNegInt(convTel.sessionCacheWrite1hTokens);
    const sessCwRaw = toNonNegInt(convTel.sessionCacheCreationTokens);
    const sessCwTotal = Math.max(sessCwRaw, sessCw5m + sessCw1h);

    const snapCache = toNonNegInt(convTel.cacheReadTokens) + cwTotal;
    const sessCache = toNonNegInt(convTel.sessionCacheReadTokens) + sessCwTotal;
    if (snapCache <= 0 && sessCache <= 0) return null;

    const uses1hTier =
      (cw1h > 0 && cw5m === 0 && cwTotal <= cw1h) ||
      (cwTotal === 0 && sessCw1h > 0 && sessCw5m === 0);

    const ttlTier = uses1hTier ? '1h' : '5m';
    const ttlMs = uses1hTier ? 60 * 60 * 1000 : 5 * 60 * 1000;
    const coolingThresholdMs = uses1hTier ? 5 * 60 * 1000 : 60 * 1000;
    const maxColdDisplayElapsedMs = uses1hTier ? 90 * 60 * 1000 : 30 * 60 * 1000;

    const safeNow = Number.isFinite(nowMs) ? nowMs : Date.now();
    const elapsedMs = Math.max(0, safeNow - lastStepTs);
    if (elapsedMs > maxColdDisplayElapsedMs) return null;

    const coldAfterMs = lastStepTs + ttlMs;
    const remainingMs = coldAfterMs - safeNow;
    const state =
      remainingMs > coolingThresholdMs
        ? 'warm'
        : remainingMs > 0
          ? 'cooling'
          : 'cold';

    return {
      state,
      ttlTier,
      ttlMs,
      coldAfterMs,
      remainingMs: Math.max(0, Math.round(remainingMs)),
      elapsedMs: Math.round(elapsedMs)
    };
  }

  function formatCacheCountdown(remainingMs, { compact = false, coarse = false } = {}) {
    const rem = Number(remainingMs);
    if (!Number.isFinite(rem) || rem <= 0) return '0s';
    if (coarse) {
      if (rem >= 60000) {
        return `${Math.ceil(rem / 60000)}m`;
      }
      const qSec = Math.max(5, Math.ceil(rem / 5000) * 5);
      return `${qSec}s`;
    }
    if (rem >= 60000) {
      const m = Math.floor(rem / 60000);
      const s = Math.floor((rem % 60000) / 1000);
      if (compact) {
        return s > 0 ? `${m}m ${s}s` : `${m}m`;
      }
      return `${m}m ${String(s).padStart(2, '0')}s`;
    }
    return `${Math.max(1, Math.ceil(rem / 1000))}s`;
  }

  function sanitizeNotifLabel(raw) {
    return String(raw || '')
      .replace(/[\u0000-\u001f\u007f]/g, '')
      .trim()
      .slice(0, 64);
  }

  function createEmptyNotifPool() {
    return {
      initialized: false,
      cycleResetMs: null,
      lastKnownFrac: null,
      lastObservedAt: 0,
      sampleLabel: '',
      depleted: false,
      depletedResetMs: null,
      lastNotifiedRecoveryResetMs: 0,
      lastNotifiedPreResetMs: 0,
      lastFiredAt: 0
    };
  }

  function normalizeValidResetMs(raw) {
    const n = Number(raw);
    return Number.isFinite(n) && n > MIN_VALID_TS_MS ? Math.round(n) : null;
  }

  function normalizeNotifPool(raw) {
    const out = createEmptyNotifPool();
    if (!raw || typeof raw !== 'object') return out;
    out.initialized = Boolean(raw.initialized);
    out.cycleResetMs = normalizeValidResetMs(raw.cycleResetMs);
    if (typeof raw.lastKnownFrac === 'number' && Number.isFinite(raw.lastKnownFrac)) {
      out.lastKnownFrac = Math.max(0, Math.min(1, raw.lastKnownFrac));
    }
    out.lastObservedAt = toNonNegInt(raw.lastObservedAt);
    out.sampleLabel = sanitizeNotifLabel(raw.sampleLabel);
    out.depleted = Boolean(raw.depleted);
    out.depletedResetMs = normalizeValidResetMs(raw.depletedResetMs);
    out.lastNotifiedRecoveryResetMs = toNonNegInt(raw.lastNotifiedRecoveryResetMs);
    out.lastNotifiedPreResetMs = toNonNegInt(raw.lastNotifiedPreResetMs);
    out.lastFiredAt = toNonNegInt(raw.lastFiredAt);
    return out;
  }

  function normalizeNotifState(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const tabIdNum = Number(src.lastSourceTabId);
    const poolsSrc = src.pools && typeof src.pools === 'object' ? src.pools : {};
    return {
      version: 1,
      updatedAt: toNonNegInt(src.updatedAt),
      lastSourceTabId:
        Number.isInteger(tabIdNum) && tabIdNum > 0 ? tabIdNum : null,
      pools: {
        gemini: normalizeNotifPool(poolsSrc.gemini),
        premium: normalizeNotifPool(poolsSrc.premium)
      }
    };
  }

  function createEmptyNotifState() {
    return normalizeNotifState(null);
  }

  function isSameResetCycle(a, b) {
    return (
      typeof a === 'number' &&
      typeof b === 'number' &&
      Number.isFinite(a) &&
      Number.isFinite(b) &&
      a > MIN_VALID_TS_MS &&
      b > MIN_VALID_TS_MS &&
      Math.abs(a - b) <= NOTIF_SAME_CYCLE_TOLERANCE_MS
    );
  }

  function evaluateQuotaNotificationTransitions(notifState, snapshot, nowMs = Date.now()) {
    const state = normalizeNotifState(notifState);
    const safeNow = Number.isFinite(nowMs) ? Math.round(nowMs) : Date.now();
    const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
    const quotaPools = snap.quotaPools && typeof snap.quotaPools === 'object' ? snap.quotaPools : {};
    const isTabHidden = Boolean(snap.isTabHidden);
    const fetchedAt = Number(snap.fetchedAt) || safeNow;
    const tabId =
      Number.isInteger(Number(snap.tabId)) && Number(snap.tabId) > 0 ? Number(snap.tabId) : null;

    let dirty = false;
    const events = [];

    for (const poolKey of ['gemini', 'premium']) {
      const ps = state.pools[poolKey];
      const incoming = quotaPools[poolKey];

      if (
        !incoming ||
        typeof incoming !== 'object' ||
        typeof incoming.remainingFraction !== 'number' ||
        !Number.isFinite(incoming.remainingFraction)
      ) {
        if (ps.initialized && ps.depleted && ps.depletedResetMs) {
          if (safeNow >= ps.depletedResetMs + NOTIF_RECOVERY_GRACE_MS) {
            if (
              safeNow - ps.depletedResetMs <= NOTIF_MAX_STALE_RECOVERY_MS &&
              !isSameResetCycle(ps.lastNotifiedRecoveryResetMs, ps.depletedResetMs)
            ) {
              events.push({
                type: 'allowance_back',
                poolKey,
                pct: 100,
                sampleLabel: ps.sampleLabel,
                notificationId: `agy-quota-back-${poolKey}`
              });
            }
            ps.lastNotifiedRecoveryResetMs = ps.depletedResetMs;
            ps.depleted = false;
            ps.depletedResetMs = null;
            ps.lastKnownFrac = 1;
            ps.cycleResetMs = null;
            ps.lastFiredAt = safeNow;
            dirty = true;
          }
        }
        continue;
      }

      const frac = Math.max(0, Math.min(1, incoming.remainingFraction));
      const resetMs = normalizeValidResetMs(incoming.resetTimeMs);
      const rawObs = Number(incoming.observedAt || fetchedAt || safeNow);
      const obsAt =
        Number.isFinite(rawObs) && rawObs > MIN_VALID_TS_MS
          ? Math.min(safeNow, Math.round(rawObs))
          : safeNow;
      const nextLabel = sanitizeNotifLabel(incoming.sampleLabel) || ps.sampleLabel;
      const prevObsAt = ps.lastObservedAt;

      let effFrac = frac;
      let effResetMs = resetMs;
      if (
        ps.initialized &&
        isTabHidden &&
        obsAt < ps.lastObservedAt &&
        isSameResetCycle(resetMs, ps.cycleResetMs)
      ) {
        effFrac = ps.lastKnownFrac ?? frac;
        effResetMs = ps.cycleResetMs;
      } else if (
        ps.initialized &&
        isSameResetCycle(resetMs, ps.cycleResetMs) &&
        resetMs !== null &&
        resetMs > safeNow &&
        obsAt <= ps.lastObservedAt + 2000
      ) {
        effFrac = Math.min(ps.lastKnownFrac ?? frac, frac);
        effResetMs = resetMs;
        ps.lastObservedAt = Math.max(ps.lastObservedAt, obsAt);
      } else {
        ps.lastObservedAt = Math.max(ps.lastObservedAt, obsAt);
      }

      if (!ps.initialized) {
        ps.initialized = true;
        ps.lastKnownFrac = effFrac;
        ps.cycleResetMs = effResetMs;
        ps.sampleLabel = nextLabel;
        if (effFrac <= NOTIF_DEPLETED_MAX_FRAC && effResetMs !== null && effResetMs > safeNow) {
          ps.depleted = true;
          ps.depletedResetMs = effResetMs;
        }
        if (
          effResetMs !== null &&
          effResetMs > safeNow &&
          effResetMs - safeNow <= NOTIF_PRE_RESET_WINDOW_MS &&
          effFrac >= NOTIF_PRE_RESET_MIN_FRAC
        ) {
          ps.lastNotifiedPreResetMs = effResetMs;
        }
        dirty = true;
        continue;
      }

      const prevKnownFrac = ps.lastKnownFrac;
      const prevCycleResetMs = ps.cycleResetMs;
      const prevLabel = ps.sampleLabel;

      if (ps.depleted) {
        const observedRecovered = effFrac >= NOTIF_RECOVERED_MIN_FRAC;
        const resetReached =
          ps.depletedResetMs !== null && safeNow >= ps.depletedResetMs + NOTIF_RECOVERY_GRACE_MS;
        if (observedRecovered || resetReached) {
          const cycleKey = ps.depletedResetMs || ps.cycleResetMs || safeNow;
          const isStaleOffline =
            ps.depletedResetMs !== null &&
            effFrac < NOTIF_RECOVERED_MIN_FRAC &&
            safeNow - ps.depletedResetMs > NOTIF_MAX_STALE_RECOVERY_MS;
          if (!isStaleOffline && !isSameResetCycle(ps.lastNotifiedRecoveryResetMs, cycleKey)) {
            const displayPct = effFrac >= NOTIF_RECOVERED_MIN_FRAC ? Math.round(effFrac * 100) : 100;
            events.push({
              type: 'allowance_back',
              poolKey,
              pct: displayPct,
              sampleLabel: nextLabel,
              notificationId: `agy-quota-back-${poolKey}`
            });
            ps.lastNotifiedRecoveryResetMs = cycleKey;
            ps.lastFiredAt = safeNow;
          }
          ps.depleted = false;
          ps.depletedResetMs = null;
          dirty = true;
          if (!observedRecovered && resetReached && effFrac <= NOTIF_DEPLETED_MAX_FRAC) {
            effFrac = 1;
            effResetMs = null;
          }
        }
      }

      if (
        !ps.depleted &&
        effFrac <= NOTIF_DEPLETED_MAX_FRAC &&
        effResetMs !== null &&
        effResetMs > safeNow &&
        !isSameResetCycle(ps.lastNotifiedRecoveryResetMs, effResetMs)
      ) {
        ps.depleted = true;
        ps.depletedResetMs = effResetMs;
        dirty = true;
      }

      if (!ps.depleted && effResetMs !== null && effResetMs > safeNow) {
        const timeLeftMs = effResetMs - safeNow;
        const obsFresh = safeNow - ps.lastObservedAt <= NOTIF_MAX_OBSERVATION_AGE_MS;
        if (
          obsFresh &&
          timeLeftMs > 60000 &&
          timeLeftMs <= NOTIF_PRE_RESET_WINDOW_MS &&
          effFrac >= NOTIF_PRE_RESET_MIN_FRAC &&
          !isSameResetCycle(ps.lastNotifiedPreResetMs, effResetMs)
        ) {
          events.push({
            type: 'pre_reset_unused',
            poolKey,
            pct: Math.round(effFrac * 100),
            timeLeftMs,
            sampleLabel: nextLabel,
            notificationId: `agy-quota-rem-${poolKey}`
          });
          ps.lastNotifiedPreResetMs = effResetMs;
          ps.lastFiredAt = safeNow;
          dirty = true;
        }
      }

      ps.lastKnownFrac = effFrac;
      ps.cycleResetMs = effResetMs;
      ps.sampleLabel = nextLabel;

      if (
        prevKnownFrac !== effFrac ||
        prevCycleResetMs !== effResetMs ||
        prevLabel !== nextLabel ||
        ps.lastObservedAt - prevObsAt >= 5000
      ) {
        dirty = true;
      }
    }

    if (tabId !== null && state.lastSourceTabId !== tabId) {
      state.lastSourceTabId = tabId;
      dirty = true;
    }
    if (dirty) {
      state.updatedAt = safeNow;
    }

    return { dirty, state, events };
  }

  function validateMagpieBaseUrl(rawInput) {
    const trimmed = String(rawInput ?? '').trim();
    const candidate = trimmed || DEFAULT_MAGPIE_ENDPOINT;
    if (
      candidate.length > 128 ||
      /[\u0000-\u0020\u007f@?#\\]/.test(candidate)
    ) {
      return { ok: false, origin: '', error: 'invalid_chars' };
    }
    let parsed;
    try {
      parsed = new URL(candidate);
    } catch {
      return { ok: false, origin: '', error: 'invalid_url' };
    }
    if (parsed.protocol !== 'http:') {
      return { ok: false, origin: '', error: 'invalid_scheme' };
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== '127.0.0.1' && host !== 'localhost') {
      return { ok: false, origin: '', error: 'non_loopback_host' };
    }
    if (parsed.username !== '' || parsed.password !== '') {
      return { ok: false, origin: '', error: 'credentials_forbidden' };
    }
    if (
      (parsed.pathname !== '/' && parsed.pathname !== '') ||
      parsed.search !== '' ||
      parsed.hash !== ''
    ) {
      return { ok: false, origin: '', error: 'path_or_query_forbidden' };
    }
    if (!/^\d{4,5}$/.test(parsed.port)) {
      return { ok: false, origin: '', error: 'port_required' };
    }
    const portNum = Number(parsed.port);
    if (!Number.isInteger(portNum) || portNum < 1024 || portNum > 65535) {
      return { ok: false, origin: '', error: 'port_out_of_range' };
    }
    if (portNum === 9222 || portNum === 9229) {
      return { ok: false, origin: '', error: 'reserved_debug_port' };
    }
    return {
      ok: true,
      origin: `http://${host}:${portNum}`,
      host,
      port: portNum
    };
  }

  function normalizeMagpieConfig(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const v = validateMagpieBaseUrl(src.endpoint);
    return {
      version: 1,
      enabled: Boolean(src.enabled),
      endpoint: v.ok ? v.origin : DEFAULT_MAGPIE_ENDPOINT
    };
  }

  function toNonNegFiniteOrNull(val) {
    if (val === null || val === undefined || val === '') return null;
    const n = Number(val);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  function parseMagpieBreakdownList(rawCollection, sanitizeAsProject = false) {
    const entries = [];
    if (Array.isArray(rawCollection)) {
      for (const item of rawCollection) {
        if (!item || typeof item !== 'object') continue;
        const rawName = item.name ?? item.agent ?? item.model ?? item.id ?? item.key ?? '';
        entries.push([rawName, item]);
      }
    } else if (rawCollection && typeof rawCollection === 'object') {
      for (const [k, v] of Object.entries(rawCollection)) {
        if (!v || typeof v !== 'object') continue;
        entries.push([v.name ?? v.label ?? k, v]);
      }
    }
    const normalized = [];
    for (const [rawName, item] of entries) {
      const cleanName = sanitizeAsProject
        ? sanitizeProjectName(rawName).slice(0, 48)
        : String(rawName || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 48);
      if (!cleanName) continue;
      const inTok = toNonNegInt(item.input_tokens ?? item.inputTokens ?? item.in);
      const crTok = toNonNegInt(item.cache_read_tokens ?? item.cacheReadTokens ?? item.cr);
      const cwTok = toNonNegInt(
        item.cache_creation_tokens ??
          item.cache_write_tokens ??
          item.cacheCreationTokens ??
          item.cacheWriteTokens ??
          item.cw
      );
      const outTok = toNonNegInt(item.output_tokens ?? item.outputTokens ?? item.out);
      const rsTok = toNonNegInt(item.reasoning_tokens ?? item.reasoningTokens ?? item.rs);
      const totalTokens = Math.max(
        toNonNegInt(item.total_tokens ?? item.totalTokens ?? item.tokens),
        inTok + crTok + cwTok + outTok + rsTok
      );
      const calls = toNonNegInt(
        item.requests ?? item.total_requests ?? item.totalRequests ?? item.calls
      );
      const costUsd = toNonNegFiniteOrNull(
        item.cost_usd ?? item.total_cost_usd ?? item.costUsd ?? item.totalCostUsd
      );
      normalized.push({
        name: cleanName,
        totalTokens,
        calls,
        costUsd
      });
    }
    normalized.sort((a, b) => b.totalTokens - a.totalTokens || b.calls - a.calls);
    return normalized.slice(0, 8);
  }

  const MAGPIE_USAGE_RECOGNIZED_KEYS = [
    'total_tokens',
    'totalTokens',
    'input_tokens',
    'inputTokens',
    'requests',
    'total_requests',
    'calls',
    'cost_usd',
    'total_cost_usd',
    'costUsd',
    'by_agent',
    'byAgent',
    'agents',
    'by_model',
    'byModel',
    'models',
    'totals'
  ];

  function normalizeMagpieUsage(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const src =
      raw.data && typeof raw.data === 'object' && !Array.isArray(raw.data)
        ? raw.data
        : raw.summary && typeof raw.summary === 'object' && !Array.isArray(raw.summary)
          ? raw.summary
          : raw;
    if (!src || typeof src !== 'object' || Array.isArray(src)) return null;

    const hasSignature = MAGPIE_USAGE_RECOGNIZED_KEYS.some((k) =>
      Object.prototype.hasOwnProperty.call(src, k)
    );
    if (!hasSignature) return null;

    const tSrc =
      src.totals && typeof src.totals === 'object' && !Array.isArray(src.totals)
        ? src.totals
        : src;
    const inTok = toNonNegInt(tSrc.input_tokens ?? tSrc.inputTokens ?? tSrc.in);
    const crTok = toNonNegInt(tSrc.cache_read_tokens ?? tSrc.cacheReadTokens ?? tSrc.cr);
    const cwTok = toNonNegInt(
      tSrc.cache_creation_tokens ??
        tSrc.cache_write_tokens ??
        tSrc.cacheCreationTokens ??
        tSrc.cacheWriteTokens ??
        tSrc.cw
    );
    const outTok = toNonNegInt(tSrc.output_tokens ?? tSrc.outputTokens ?? tSrc.out);
    const rsTok = toNonNegInt(tSrc.reasoning_tokens ?? tSrc.reasoningTokens ?? tSrc.rs);
    const totalTokens = Math.max(
      toNonNegInt(tSrc.total_tokens ?? tSrc.totalTokens ?? tSrc.tokens),
      inTok + crTok + cwTok + outTok + rsTok
    );
    const calls = toNonNegInt(
      tSrc.requests ??
        tSrc.total_requests ??
        tSrc.totalRequests ??
        tSrc.calls ??
        src.requests ??
        src.total_requests ??
        src.calls
    );
    const costUsd = toNonNegFiniteOrNull(
      tSrc.cost_usd ??
        tSrc.total_cost_usd ??
        tSrc.costUsd ??
        tSrc.totalCostUsd ??
        src.cost_usd ??
        src.total_cost_usd ??
        src.costUsd
    );
    const cacheSavedUsd = toNonNegFiniteOrNull(
      tSrc.cache_saved_usd ?? tSrc.cacheSavedUsd ?? src.cache_saved_usd ?? src.cacheSavedUsd
    );

    const byAgent = parseMagpieBreakdownList(src.by_agent ?? src.byAgent ?? src.agents, true);
    const byModel = parseMagpieBreakdownList(src.by_model ?? src.byModel ?? src.models, false);

    return {
      in: inTok,
      cr: crTok,
      cw: cwTok,
      out: outTok,
      rs: rsTok,
      totalTokens,
      calls,
      costUsd,
      cacheSavedUsd,
      byAgent,
      byModel
    };
  }

  function normalizeMagpieQuotas(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const arr = Array.isArray(raw)
      ? raw
      : Array.isArray(raw.cards)
        ? raw.cards
        : Array.isArray(raw.quotas)
          ? raw.quotas
          : Array.isArray(raw.data)
            ? raw.data
            : null;
    if (!arr) return null;

    const out = [];
    for (const c of arr) {
      if (!c || typeof c !== 'object') continue;
      let remainingPct = null;
      const rawFrac = c.remaining_fraction ?? c.remainingFraction;
      if (typeof rawFrac === 'number' && Number.isFinite(rawFrac) && rawFrac >= 0 && rawFrac <= 1) {
        remainingPct = Math.round(rawFrac * 100);
      } else {
        const rawPct = c.remaining_percent ?? c.remainingPct ?? c.percent_remaining;
        if (typeof rawPct === 'number' && Number.isFinite(rawPct) && rawPct >= 0 && rawPct <= 100) {
          remainingPct = Math.round(rawPct);
        }
      }
      if (remainingPct === null) continue;

      const label = String(c.label ?? c.title ?? c.provider ?? c.account ?? c.name ?? 'Quota')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 48);
      if (!label) continue;

      const windowLabel = String(c.window ?? c.window_label ?? c.period ?? '')
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .trim()
        .slice(0, 16);
      const rawPace = Number(c.pace_ratio ?? c.paceRatio);
      const paceRatio =
        Number.isFinite(rawPace) && rawPace >= 0
          ? Math.round(Math.min(9.9, rawPace) * 100) / 100
          : null;

      out.push({
        label,
        remainingPct,
        windowLabel,
        paceRatio
      });
      if (out.length >= 8) break;
    }
    if (arr.length > 0 && out.length === 0) return null;
    if (
      out.length === 0 &&
      !Array.isArray(raw) &&
      !Array.isArray(raw.cards) &&
      !Array.isArray(raw.quotas)
    ) {
      return null;
    }
    return out;
  }

  const api = Object.freeze({
    LEDGER_STORAGE_KEY,
    PRICING_CONFIG_STORAGE_KEY,
    NOTIF_STATE_STORAGE_KEY,
    MAGPIE_CONFIG_STORAGE_KEY,
    MAGPIE_CACHE_SESSION_KEY,
    DEFAULT_MAGPIE_ENDPOINT,
    LEDGER_SCHEMA_VERSION,
    PRICING_CONFIG_VERSION,
    MAX_LEDGER_WATERMARKS,
    MAX_RECENT_STEPS_PER_CONV,
    MAX_LEDGER_DAYS,
    MIN_PROTECTED_DAYS,
    MAX_MODELS_PER_DAY,
    MAX_PROJECTS_PER_DAY,
    MAX_LEDGER_BYTES,
    DEFAULT_USD_TO_CNY_RATE,
    MAX_CUSTOM_OVERRIDES,
    STATIC_CATALOG,
    CATALOG_MODELS: Object.freeze(CATALOG_MODELS),
    normalizePricingConfig,
    resolveModelPricing,
    computeUsageCost,
    computeSessionCost,
    formatCostValue,
    formatLocalDateKey,
    getLocalHour,
    getLocalCutoffDateKey,
    buildLocalDateRangeKeys,
    sanitizeProjectName,
    createEmptyLedger,
    normalizeLedger,
    pruneLedgerBeforeWrite,
    emergencyTrimLedger,
    ingestLedgerBatches,
    aggregateLedgerPeriod,
    sanitizeCsvCell,
    buildUsageCsv,
    buildUsageExportJson,
    evaluateCacheFreshness,
    formatCacheCountdown,
    createEmptyNotifState,
    normalizeNotifState,
    isSameResetCycle,
    evaluateQuotaNotificationTransitions,
    validateMagpieBaseUrl,
    normalizeMagpieConfig,
    normalizeMagpieUsage,
    normalizeMagpieQuotas
  });

  globalThis.__AGY_PRICING__ = api;
  if (winObj && !winObj.__AGY_PRICING__) {
    winObj.__AGY_PRICING__ = api;
  }
})();
