/**
 * Antigravity Tab Status - Multi-Instance Global Panel & Side Panel Controller (v2.9.0)
 */

const i18n = window.__AGY_I18N__ || null;
if (i18n && typeof i18n.localizeDocument === 'function') {
  i18n.localizeDocument(document);
}

function t(key, vars = {}, fallback = '') {
  if (i18n && typeof i18n.t === 'function') {
    const val = i18n.t(key, vars);
    if (val && val !== key) return val;
  }
  return fallback || key;
}

const IS_SIDE_PANEL = document.documentElement.dataset.surface === 'sidepanel';
const VALID_INDICATOR_STYLES = new Set(['antigravity', 'gemini', 'glow', 'claude', 'geek', 'emoji']);
const VALID_ICON_LAYOUTS = new Set(['standalone', 'badge']);
const VALID_BADGE_SIZES = new Set(['standard', 'large']);
const VALID_CLICK_MODES = new Set(['popup', 'sidepanel']);
const LOCALHOST_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];
const STATE_PRIORITY = { waiting: 4, unread: 3, completed: 3, running: 2, idle: 1 };

const STATE_META = {
  idle: { label: t('statusIdle', {}, 'All idle / read'), dotClass: 'idle' },
  waiting: { label: t('statusWaiting', {}, 'Action required'), dotClass: 'waiting' },
  unread: { label: t('statusUnread', {}, 'Unread / completed'), dotClass: 'unread' },
  running: { label: t('statusRunning', {}, 'Tasks running'), dotClass: 'running' }
};

const TASK_STATE_TEXT = {
  waiting: t('taskStateWaiting', {}, 'Waiting'),
  unread: t('taskStateUnread', {}, 'Unread'),
  running: t('taskStateRunning', {}, 'Running'),
  idle: t('taskStateIdle', {}, 'Idle')
};

const openSidePanelBtn = document.getElementById('openSidePanelBtn');
const enabledToggle = document.getElementById('enabledToggle');
const instanceBarEl = document.getElementById('instanceBar');
const instanceSingleInfoEl = document.getElementById('instanceSingleInfo');
const instanceSingleDotEl = document.getElementById('instanceSingleDot');
const instanceSingleLabelEl = document.getElementById('instanceSingleLabel');
const hostSwitcherWrapEl = document.getElementById('hostSwitcherWrap');
const hostMenuTriggerEl = document.getElementById('hostMenuTrigger');
const hostTriggerDotEl = document.getElementById('hostTriggerDot');
const hostTriggerLabelEl = document.getElementById('hostTriggerLabel');
const hostTriggerCountEl = document.getElementById('hostTriggerCount');
const hostMenuPopoverEl = document.getElementById('hostMenuPopover');
const hostMenuListEl = document.getElementById('hostMenuList');
const instanceJumpBtnEl = document.getElementById('instanceJumpBtn');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const statusReason = document.getElementById('statusReason');
const markAllReadBtn = document.getElementById('markAllReadBtn');
const statPills = document.getElementById('statPills');
const pillWaiting = document.getElementById('pillWaiting');
const pillUnread = document.getElementById('pillUnread');
const pillRunning = document.getElementById('pillRunning');
const pillTotal = document.getElementById('pillTotal');
const quotaStrip = document.getElementById('quotaStrip');
const actionBanner = document.getElementById('actionBanner');
const primaryActionBtn = document.getElementById('primaryActionBtn');

const projectsSection = document.getElementById('projectsSection');
const projectsListEl = document.getElementById('projectsList');
const syncCollapsedBtn = document.getElementById('syncCollapsedBtn');
const syncCollapsedLabel = syncCollapsedBtn?.querySelector('.sync-label');
const filterButtons = Array.from(document.querySelectorAll('#taskFilterGroup .seg-btn'));

const previewTag = document.getElementById('previewTag');
const previewButtons = Array.from(document.querySelectorAll('.preview-btn'));
const indicatorStyleButtons = Array.from(document.querySelectorAll('#indicatorStyleGroup .style-card-btn'));
const iconLayoutButtons = Array.from(document.querySelectorAll('#iconLayoutGroup .seg-btn'));
const badgeSizeRow = document.getElementById('badgeSizeRow');
const sizeButtons = Array.from(document.querySelectorAll('#badgeSizeGroup .seg-btn'));
const actionClickButtons = Array.from(document.querySelectorAll('#actionClickModeGroup .seg-btn'));
const showQuotaToggle = document.getElementById('showQuotaToggle');
const showContextToggle = document.getElementById('showContextToggle');
const showInPageCapsuleToggle = document.getElementById('showInPageCapsuleToggle');
const autoProbeCollapsedToggle = document.getElementById('autoProbeCollapsedToggle');
const localhostAccessBtn = document.getElementById('localhostAccessBtn');
const quotaNotifyBtn = document.getElementById('quotaNotifyBtn');
const waitingInput = document.getElementById('waitingSelector');
const runningInput = document.getElementById('runningSelector');
const saveSelectorsBtn = document.getElementById('saveSelectorsBtn');
const inspectBtn = document.getElementById('inspectBtn');
const saveFeedback = document.getElementById('saveFeedback');

const usageDrawer = document.getElementById('usageDrawer');
const usageSummaryPill = document.getElementById('usageSummaryPill');
const usagePeriodButtons = Array.from(document.querySelectorAll('#usagePeriodGroup .seg-btn'));
const usageCurrencyButtons = Array.from(document.querySelectorAll('#usageCurrencyGroup .seg-btn'));
const kpiTokensVal = document.getElementById('kpiTokensVal');
const kpiTokensSub = document.getElementById('kpiTokensSub');
const kpiCostVal = document.getElementById('kpiCostVal');
const kpiCostSub = document.getElementById('kpiCostSub');
const kpiCacheVal = document.getElementById('kpiCacheVal');
const kpiCacheSub = document.getElementById('kpiCacheSub');
const kpiSpeedVal = document.getElementById('kpiSpeedVal');
const kpiSpeedSub = document.getElementById('kpiSpeedSub');
const usageTrendTitle = document.getElementById('usageTrendTitle');
const usageTrendPeak = document.getElementById('usageTrendPeak');
const usageTrendWrap = document.getElementById('usageTrendWrap');
const usageHeatmapMeta = document.getElementById('usageHeatmapMeta');
const usageHeatmapGrid = document.getElementById('usageHeatmapGrid');
const usageEmptyNote = document.getElementById('usageEmptyNote');
const usageRankGrid = document.getElementById('usageRankGrid');
const usageTopModelsList = document.getElementById('usageTopModelsList');
const usageTopProjectsList = document.getElementById('usageTopProjectsList');
const usdToCnyInput = document.getElementById('usdToCnyInput');
const rateModelSelect = document.getElementById('rateModelSelect');
const rateCustomModelInput = document.getElementById('rateCustomModelInput');
const rateInInput = document.getElementById('rateInInput');
const rateCrInput = document.getElementById('rateCrInput');
const rateCw5mInput = document.getElementById('rateCw5mInput');
const rateCw1hInput = document.getElementById('rateCw1hInput');
const rateOutInput = document.getElementById('rateOutInput');
const activeOverridesList = document.getElementById('activeOverridesList');
const resetRateOverrideBtn = document.getElementById('resetRateOverrideBtn');
const saveRateOverrideBtn = document.getElementById('saveRateOverrideBtn');
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const usageFeedback = document.getElementById('usageFeedback');
const clearUsageBtn = document.getElementById('clearUsageBtn');
const clearUsageConfirmWrap = document.getElementById('clearUsageConfirmWrap');
const clearUsageConfirmBtn = document.getElementById('clearUsageConfirmBtn');
const clearUsageCancelBtn = document.getElementById('clearUsageCancelBtn');
const magpieLiveCard = document.getElementById('magpieLiveCard');
const magpieStatusPill = document.getElementById('magpieStatusPill');
const magpieRefreshBtn = document.getElementById('magpieRefreshBtn');
const magpieSummaryLine = document.getElementById('magpieSummaryLine');
const magpieOfflineNote = document.getElementById('magpieOfflineNote');
const magpieAgentsSection = document.getElementById('magpieAgentsSection');
const magpieAgentsList = document.getElementById('magpieAgentsList');
const magpieQuotasSection = document.getElementById('magpieQuotasSection');
const magpieQuotasList = document.getElementById('magpieQuotasList');
const magpieToggleBtn = document.getElementById('magpieToggleBtn');
const magpieUrlInput = document.getElementById('magpieUrlInput');
const magpieFeedback = document.getElementById('magpieFeedback');
const magpieSaveUrlBtn = document.getElementById('magpieSaveUrlBtn');

const PRICING_API = window.__AGY_PRICING__ || null;
const LEDGER_STORAGE_KEY = PRICING_API?.LEDGER_STORAGE_KEY || 'agyUsageLedgerV1';
const PRICING_CONFIG_STORAGE_KEY =
  PRICING_API?.PRICING_CONFIG_STORAGE_KEY || 'agyPricingConfigV1';
const MAGPIE_CONFIG_STORAGE_KEY =
  PRICING_API?.MAGPIE_CONFIG_STORAGE_KEY || 'agyMagpieConfigV1';
const SVG_NS = 'http://www.w3.org/2000/svg';

let currentActiveTabId = null;
let currentWindowId = null;
let liveInstances = []; // Array<{ tabId, windowId, index, baseLabel, label, state, resp }>
let staleTabIds = [];
let selectedInstanceKey = null; // 'all' | number (tabId)
let hasUserSelectedInstance = false;
let currentFilter = 'all'; // 'all' | 'active'
let currentIndicatorStyle = 'glow';
let currentIconLayout = 'standalone';
let currentBadgeSize = 'standard';
let currentActionClickMode = 'popup';
let currentShowQuotaMetrics = true;
let currentShowContextMetrics = true;
let currentShowInPageCapsule = false;
let localhostGranted = false;
let notificationsPermGranted = false;
let currentQuotaNotificationsPref = false;
let currentPrimaryAction = null; // 'open' | 'reload' | null
let lastRenderedDigest = '';
let lastQuotaDigest = '';
let lastInstanceBarDigest = '';
let lastHostMenuDigest = '';
let pendingHostMenuRender = false;
let hostMenuInitialized = false;
let currentJumpTarget = null;
let enterMenuOnOpen = null;
let pointerPressedTrigger = false;
let pointerWasOpenOnDown = false;
let closeMenuTimerId = null;
let lastOpenOriginWasKeyboard = false;
let feedbackTimerId = null;
let lastFeedbackText = '';
let isRefreshingStatus = false;
let pendingRefresh = false;
let pushDebounceId = null;
let currentUsageLedger = PRICING_API?.createEmptyLedger?.(0) || {
  version: 1,
  clearedAt: 0,
  updatedAt: 0,
  watermarks: {},
  daily: {}
};
let currentPricingConfig = PRICING_API?.normalizePricingConfig?.(null) || {
  version: 1,
  currency: 'USD',
  usdToCnyRate: 7.25,
  overrides: {}
};
let currentUsagePeriod = 'today'; // 'today' | '7d' | '30d'
let usageDrawerBodyDirty = true;
let usageFeedbackTimerId = null;
let clearConfirmTimerId = null;
let currentMagpieConfig = PRICING_API?.normalizeMagpieConfig?.(null) || {
  version: 1,
  enabled: false,
  endpoint: 'http://127.0.0.1:3425'
};
let latestMagpieSnapshot = null;
let magpieFeedbackTimerId = null;
const activeExportBlobUrls = new Set();
const renderedTaskLiveRefs = [];
const reducedMotionMedia =
  typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

try {
  chrome.windows?.getCurrent?.((win) => {
    if (chrome.runtime.lastError) return;
    if (win && typeof win.id === 'number') {
      currentWindowId = win.id;
    }
  });
} catch {}

if (openSidePanelBtn) {
  if (IS_SIDE_PANEL || !chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') {
    openSidePanelBtn.classList.add('hidden');
  } else {
    openSidePanelBtn.addEventListener('click', () => {
      if (!chrome.sidePanel || typeof chrome.sidePanel.open !== 'function') return;
      const openTarget =
        typeof currentWindowId === 'number'
          ? { windowId: currentWindowId }
          : typeof currentActiveTabId === 'number'
            ? { tabId: currentActiveTabId }
            : null;
      if (!openTarget) return;
      try {
        // Call chrome.sidePanel.open synchronously inside the click gesture before awaiting.
        const openPromise = chrome.sidePanel.open(openTarget);
        if (openPromise && typeof openPromise.then === 'function') {
          void (async () => {
            try {
              await openPromise;
              if (!IS_SIDE_PANEL) window.close();
            } catch {}
          })();
        } else if (!IS_SIDE_PANEL) {
          window.close();
        }
      } catch {}
    });
  }
}

function isAntigravityUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:') {
      return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    }
    if (parsed.protocol !== 'https:') return false;
    return (
      parsed.hostname === 'antigravity.google.com' ||
      parsed.hostname.endsWith('.antigravity.google.com') ||
      parsed.hostname === 'antigravity.google' ||
      parsed.hostname.endsWith('.antigravity.google')
    );
  } catch {
    return false;
  }
}

function sendTopFrameMessage(tabId, payload) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, payload, { frameId: 0 }, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

function setToggleGroupState(buttons, matcherFn) {
  for (const btn of buttons) {
    const isActive = Boolean(matcherFn(btn));
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-pressed', String(isActive));
  }
}

function announceFeedback(rawText, durationMs = 2000) {
  if (!saveFeedback) return;
  clearTimeout(feedbackTimerId);
  let message = rawText;
  if (message === lastFeedbackText) {
    message += '\u00A0';
  }
  lastFeedbackText = message;
  saveFeedback.textContent = '';
  requestAnimationFrame(() => {
    saveFeedback.textContent = message;
  });
  feedbackTimerId = setTimeout(() => {
    saveFeedback.textContent = '';
  }, durationMs);
}

function syncStyleControls(indicatorStyle, iconLayout, badgeSize) {
  if (indicatorStyle && VALID_INDICATOR_STYLES.has(indicatorStyle)) {
    currentIndicatorStyle = indicatorStyle;
  }
  setToggleGroupState(indicatorStyleButtons, (btn) => btn.dataset.style === currentIndicatorStyle);
  if (statusDot) {
    statusDot.dataset.indicatorStyle = currentIndicatorStyle;
  }

  if (iconLayout && VALID_ICON_LAYOUTS.has(iconLayout)) {
    currentIconLayout = iconLayout;
  }
  setToggleGroupState(iconLayoutButtons, (btn) => btn.dataset.layout === currentIconLayout);

  if (badgeSizeRow) {
    badgeSizeRow.classList.toggle('hidden', currentIconLayout !== 'badge');
  }

  if (badgeSize && VALID_BADGE_SIZES.has(badgeSize)) {
    currentBadgeSize = badgeSize;
  }
  setToggleGroupState(sizeButtons, (btn) => btn.dataset.size === currentBadgeSize);
}

function syncActionClickControls(clickMode) {
  if (clickMode && VALID_CLICK_MODES.has(clickMode)) {
    currentActionClickMode = clickMode;
  }
  setToggleGroupState(actionClickButtons, (btn) => btn.dataset.clickMode === currentActionClickMode);
}

function getTargetTabIds() {
  if (liveInstances.length === 0) return [];
  if (liveInstances.length >= 2 && selectedInstanceKey === 'all') {
    return liveInstances.map((inst) => inst.tabId);
  }
  const selected =
    liveInstances.find((inst) => inst.tabId === selectedInstanceKey) || liveInstances[0];
  return selected ? [selected.tabId] : [];
}

function getPrimaryTargetTabId() {
  const ids = getTargetTabIds();
  return ids.length > 0 ? ids[0] : null;
}

function activateBrowserTab(tabId, windowId) {
  if (typeof tabId !== 'number') return;
  try {
    chrome.tabs.update(tabId, { active: true }, () => {
      void chrome.runtime.lastError;
    });
    if (typeof windowId === 'number') {
      chrome.windows.update(windowId, { focused: true }, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch {}
  if (!IS_SIDE_PANEL) {
    setTimeout(() => {
      window.close();
    }, 60);
  }
}

function formatTokenCount(rawTokens) {
  const n = Math.max(0, Number(rawTokens) || 0);
  if (n >= 1000000) {
    return `${(n / 1000000).toFixed(2).replace(/\.?0+$/, '')}M`;
  }
  if (n >= 100000) {
    return `${Math.round(n / 1000)}k`;
  }
  if (n >= 1000) {
    return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  }
  return String(Math.round(n));
}

function formatQuotaReset(resetTimeMs) {
  const ts = Number(resetTimeMs);
  if (!Number.isFinite(ts) || ts <= 946684800000) return '';
  const diffMs = ts - Date.now();
  if (diffMs <= 60000) {
    return t('quotaResetsSoon', {}, 'Resets soon');
  }
  const totalMins = Math.ceil(diffMs / 60000);
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  let timeStr = '';
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remHours = hours % 24;
    timeStr = remHours > 0 ? `${days}d ${remHours}h` : `${days}d`;
  } else if (hours > 0) {
    timeStr = mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } else {
    timeStr = `${totalMins}m`;
  }
  return t('quotaResetsIn', { time: timeStr }, `Resets in ${timeStr}`);
}

function formatCompactDuration(ms) {
  const totalMins = Math.max(1, Math.round(ms / 60000));
  const hours = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${totalMins}m`;
}

function formatStepLatency(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) return '';
  if (n < 1000) return `${Math.round(n)}ms`;
  if (n < 60000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}s`;
  const mins = Math.floor(n / 60000);
  const secs = Math.round((n % 60000) / 1000);
  return secs >= 60 ? `${mins + 1}m 0s` : `${mins}m ${secs}s`;
}

function evaluatePoolDisplayMetrics(pool, fetchedAt, nowMs = Date.now()) {
  if (!pool || typeof pool !== 'object') {
    return {
      timeLeftMs: null,
      timeLeftRatio: null,
      paceRatio: null,
      paceStatus: null,
      etaMs: null,
      unusedPreResetHint: false
    };
  }
  const rawFrac = pool.remainingFraction;
  if (typeof rawFrac !== 'number' || !Number.isFinite(rawFrac)) {
    return {
      timeLeftMs: null,
      timeLeftRatio: null,
      paceRatio: null,
      paceStatus: null,
      etaMs: null,
      unusedPreResetHint: false
    };
  }
  const frac = Math.max(0, Math.min(1, rawFrac));
  const resetTimeMs = Number(pool.resetTimeMs);
  if (!Number.isFinite(resetTimeMs) || resetTimeMs <= 946684800000 || resetTimeMs <= nowMs) {
    const hasReset = Number.isFinite(resetTimeMs) && resetTimeMs > 946684800000;
    return {
      timeLeftMs: hasReset ? 0 : null,
      timeLeftRatio: null,
      paceRatio: null,
      paceStatus: null,
      etaMs: null,
      unusedPreResetHint: false
    };
  }
  const timeLeftMs = resetTimeMs - nowMs;
  const timeLeftRatio = Math.min(1, Math.max(0, timeLeftMs / (5 * 60 * 60 * 1000)));
  const rawPace =
    frac <= 0 ? 0 : timeLeftRatio > 0.02 ? frac / timeLeftRatio : Math.max(1, frac / 0.02);
  const paceRatio = Number.isFinite(rawPace)
    ? Math.round(Math.min(9.9, Math.max(0, rawPace)) * 100 + 1e-9) / 100
    : null;
  let paceStatus = null;
  if (paceRatio !== null) {
    if (paceRatio >= 1.1) paceStatus = 'comfortable';
    else if (paceRatio < 0.7 && frac < 0.8) paceStatus = 'fast';
    else paceStatus = 'balanced';
  }
  const unusedPreResetHint = Boolean(
    timeLeftMs > 0 && timeLeftMs <= 30 * 60 * 1000 && frac >= 0.4
  );
  let etaMs = null;
  if (typeof pool.etaMs === 'number' && Number.isFinite(pool.etaMs) && pool.etaMs > 0 && frac > 0) {
    const elapsed = Math.max(0, nowMs - (Number(fetchedAt) || nowMs));
    const adj = pool.etaMs - elapsed;
    if (adj > 0 && adj < timeLeftMs) {
      etaMs = Math.max(60_000, Math.round(adj));
    }
  }
  return {
    timeLeftMs,
    timeLeftRatio,
    paceRatio,
    paceStatus,
    etaMs,
    unusedPreResetHint
  };
}

function resolveTaskTelemetry(task, telemetry) {
  if (task?.telemetry && typeof task.telemetry === 'object') {
    return task.telemetry;
  }
  const convs = telemetry?.conversations;
  if (!convs || typeof convs !== 'object') return null;
  if (task?.convId && convs[task.convId]) {
    return convs[task.convId];
  }
  if (task?.isActive && telemetry?.activeConvId && convs[telemetry.activeConvId]) {
    return convs[telemetry.activeConvId];
  }
  return null;
}

function aggregateTelemetry(instances) {
  let bestFetchedAt = 0;
  let sourceMode = 'passive';
  let activeConvId = null;
  const geminiCandidates = [];
  const premiumCandidates = [];
  const mergedConversations = {};
  const convMeta = new Map();

  for (const inst of instances) {
    const tel = inst?.resp?.telemetry;
    if (!tel || typeof tel !== 'object') continue;
    const fetchedAt = Number(tel.fetchedAt) || 0;
    if (fetchedAt > bestFetchedAt) bestFetchedAt = fetchedAt;
    if (tel.sourceMode === 'rpc_assisted') sourceMode = 'rpc_assisted';
    if (!activeConvId && tel.activeConvId) activeConvId = tel.activeConvId;

    const pools = tel.quotaPools;
    if (pools && typeof pools === 'object') {
      if (pools.gemini && typeof pools.gemini.remainingFraction === 'number') {
        geminiCandidates.push({ pool: pools.gemini, fetchedAt });
      }
      if (pools.premium && typeof pools.premium.remainingFraction === 'number') {
        premiumCandidates.push({ pool: pools.premium, fetchedAt });
      }
    }

    const convs = tel.conversations;
    if (convs && typeof convs === 'object') {
      for (const [convId, conv] of Object.entries(convs)) {
        if (!conv || typeof conv !== 'object') continue;
        const prev = convMeta.get(convId);
        const isExact = conv.precision === 'exact';
        const prevExact = prev ? prev.precision === 'exact' : false;
        const pricedSteps = Number(conv.sessionStepPricedCount) || 0;
        const prevPriced = prev ? prev.pricedSteps : 0;
        if (
          !prev ||
          (isExact && !prevExact) ||
          (isExact === prevExact && pricedSteps > prevPriced) ||
          (isExact === prevExact && pricedSteps === prevPriced && fetchedAt >= prev.fetchedAt)
        ) {
          mergedConversations[convId] = conv;
          convMeta.set(convId, { precision: conv.precision, pricedSteps, fetchedAt });
        }
      }
    }
  }

  const pickBestPool = (candidates) => {
    if (candidates.length === 0) return null;
    const sorted = [...candidates].sort((a, b) => b.fetchedAt - a.fetchedAt);
    let primary = sorted[0].pool;
    const primaryFetchedAt = sorted[0].fetchedAt;
    if (primary.etaMs == null || primary.burnRatePerHour == null) {
      for (let i = 1; i < sorted.length; i++) {
        const sib = sorted[i];
        if (primaryFetchedAt - sib.fetchedAt > 15_000) continue;
        if ((primary.resetTimeMs ?? null) !== (sib.pool.resetTimeMs ?? null)) continue;
        const nextEta = primary.etaMs != null ? primary.etaMs : sib.pool.etaMs ?? null;
        const nextBurn =
          primary.burnRatePerHour != null
            ? primary.burnRatePerHour
            : sib.pool.burnRatePerHour ?? null;
        if (nextEta !== primary.etaMs || nextBurn !== primary.burnRatePerHour) {
          primary = { ...primary, etaMs: nextEta, burnRatePerHour: nextBurn };
        }
        if (primary.etaMs != null && primary.burnRatePerHour != null) break;
      }
    }
    return primary;
  };

  const geminiPool = pickBestPool(geminiCandidates);
  const premiumPool = pickBestPool(premiumCandidates);

  if (!geminiPool && !premiumPool && Object.keys(mergedConversations).length === 0) {
    return null;
  }

  return {
    fetchedAt: bestFetchedAt || Date.now(),
    sourceMode,
    quotaPools: {
      gemini: geminiPool,
      premium: premiumPool
    },
    activeConvId,
    conversations: mergedConversations
  };
}

function hideQuotaStrip() {
  if (!quotaStrip) return;
  if (lastQuotaDigest !== 'hidden') {
    lastQuotaDigest = 'hidden';
    quotaStrip.classList.add('hidden');
    quotaStrip.textContent = '';
  }
}

function renderQuotaStrip(telemetry) {
  if (!quotaStrip) return;
  if (!currentShowQuotaMetrics || !telemetry?.quotaPools) {
    hideQuotaStrip();
    return;
  }

  const rawPools = telemetry.quotaPools;
  const entries = [];
  if (
    rawPools.gemini &&
    typeof rawPools.gemini.remainingFraction === 'number' &&
    Number.isFinite(rawPools.gemini.remainingFraction)
  ) {
    entries.push({
      key: 'gemini',
      label: t('quotaPoolGemini', {}, 'Gemini'),
      pool: rawPools.gemini
    });
  }
  if (
    rawPools.premium &&
    typeof rawPools.premium.remainingFraction === 'number' &&
    Number.isFinite(rawPools.premium.remainingFraction)
  ) {
    entries.push({
      key: 'premium',
      label: t('quotaPoolPremium', {}, 'Claude / GPT'),
      pool: rawPools.premium
    });
  }

  if (entries.length === 0) {
    hideQuotaStrip();
    return;
  }

  const nowMs = Date.now();
  const normalized = entries.map(({ key, label, pool }) => {
    const frac = Math.max(0, Math.min(1, Number(pool.remainingFraction)));
    const remainPct = Math.round(frac * 100);
    const live = evaluatePoolDisplayMetrics(pool, telemetry.fetchedAt, nowMs);
    const isDanger =
      remainPct <= 20 || (live.etaMs !== null && live.etaMs <= 30 * 60 * 1000);
    const isWarn =
      !isDanger &&
      (remainPct <= 50 || live.paceStatus === 'fast' || live.etaMs !== null);
    const healthClass = isDanger ? 'is-danger' : isWarn ? 'is-warn' : '';
    const resetText = formatQuotaReset(pool.resetTimeMs);
    const metaText = resetText ? `${remainPct}% · ${resetText}` : `${remainPct}%`;
    const paceStr = live.paceRatio !== null ? live.paceRatio.toFixed(1) : '';

    let badgeText = '';
    let badgeClass = '';
    if (live.etaMs !== null && remainPct > 0) {
      const etaDur = formatCompactDuration(live.etaMs);
      badgeText = t('quotaEtaShort', { time: etaDur }, `ETA ~${etaDur}`);
      badgeClass = 'quota-pace-badge is-fast';
    } else if (live.unusedPreResetHint) {
      badgeText = t('quotaPreResetBadge', {}, 'Spare');
      badgeClass = 'quota-pace-badge is-spare';
    } else if (live.paceRatio !== null) {
      badgeText = t('quotaPaceShort', { pace: paceStr }, `Pace ${paceStr}x`);
      badgeClass =
        live.paceStatus === 'fast'
          ? 'quota-pace-badge is-warn'
          : live.paceStatus === 'comfortable'
            ? 'quota-pace-badge is-comfortable'
            : 'quota-pace-badge is-balanced';
    }

    const sampleLabel = typeof pool.sampleLabel === 'string' ? pool.sampleLabel : '';
    const tipLines = [
      `${sampleLabel ? `${label} (${sampleLabel})` : label} — ${metaText}`
    ];
    if (live.paceRatio !== null) {
      if (live.paceStatus === 'comfortable') {
        tipLines.push(
          t('quotaPaceTipComfortable', { pace: paceStr }, `Pace ${paceStr}x · Comfortable margin`)
        );
      } else if (live.paceStatus === 'fast') {
        tipLines.push(
          t(
            'quotaPaceTipFast',
            { pace: paceStr },
            `Pace ${paceStr}x · Burning faster than reset window`
          )
        );
      } else {
        tipLines.push(
          t(
            'quotaPaceTipBalanced',
            { pace: paceStr },
            `Pace ${paceStr}x · On track with reset window`
          )
        );
      }
    }
    if (live.etaMs !== null && remainPct > 0) {
      const etaDur = formatCompactDuration(live.etaMs);
      tipLines.push(
        t(
          'quotaEtaTooltip',
          { time: etaDur },
          `Projected to exhaust in ~${etaDur} (before reset)`
        )
      );
    }
    if (live.unusedPreResetHint) {
      tipLines.push(
        t(
          'quotaPreResetTooltip',
          { pct: remainPct },
          `Refreshing soon with ${remainPct}% unused quota available`
        )
      );
    }

    return {
      key,
      label,
      remainPct,
      healthClass,
      metaText,
      badgeText,
      badgeClass,
      titleText: tipLines.join('\n')
    };
  });

  const digest = JSON.stringify(normalized);
  if (digest === lastQuotaDigest) return;
  lastQuotaDigest = digest;

  quotaStrip.textContent = '';
  quotaStrip.classList.remove('hidden');

  for (const item of normalized) {
    const itemEl = document.createElement('div');
    itemEl.className = 'quota-item';
    if (item.titleText) {
      itemEl.title = item.titleText;
    }

    const headEl = document.createElement('div');
    headEl.className = 'quota-head';

    const titleGroupEl = document.createElement('span');
    titleGroupEl.className = 'quota-title-group';

    const labelEl = document.createElement('span');
    labelEl.className = 'quota-label';
    labelEl.textContent = item.label;
    titleGroupEl.appendChild(labelEl);

    if (item.badgeText) {
      const badgeEl = document.createElement('span');
      badgeEl.className = item.badgeClass;
      badgeEl.textContent = item.badgeText;
      titleGroupEl.appendChild(badgeEl);
    }

    const metaEl = document.createElement('span');
    metaEl.className = item.healthClass ? `quota-meta ${item.healthClass}` : 'quota-meta';
    metaEl.textContent = item.metaText;

    headEl.appendChild(titleGroupEl);
    headEl.appendChild(metaEl);

    const progressEl = document.createElement('progress');
    progressEl.className = item.healthClass ? `quota-progress ${item.healthClass}` : 'quota-progress';
    progressEl.max = 100;
    progressEl.value = item.remainPct;
    progressEl.setAttribute(
      'aria-label',
      item.badgeText
        ? `${item.label}: ${item.metaText} · ${item.badgeText}`
        : `${item.label}: ${item.metaText}`
    );

    itemEl.appendChild(headEl);
    itemEl.appendChild(progressEl);
    quotaStrip.appendChild(itemEl);
  }
}

function syncLocalhostBtnUI(granted) {
  localhostGranted = Boolean(granted);
  if (!localhostAccessBtn) return;
  localhostAccessBtn.textContent = localhostGranted
    ? t('localhostRevokeBtn', {}, 'Revoke')
    : t('localhostGrantBtn', {}, 'Enable');
  localhostAccessBtn.setAttribute('aria-pressed', String(localhostGranted));
}

async function refreshLocalhostPermissionState() {
  try {
    if (!chrome.permissions || typeof chrome.permissions.contains !== 'function') return;
    const granted = await chrome.permissions.contains({ origins: LOCALHOST_ORIGINS });
    syncLocalhostBtnUI(granted);
  } catch {}
}

function syncQuotaNotifyBtnUI() {
  if (!quotaNotifyBtn) return;
  const active = Boolean(currentQuotaNotificationsPref && notificationsPermGranted);
  quotaNotifyBtn.textContent = active
    ? t('quotaNotifyDisableBtn', {}, 'Disable')
    : t('quotaNotifyEnableBtn', {}, 'Enable');
  quotaNotifyBtn.setAttribute('aria-pressed', String(active));
}

async function refreshNotificationPermissionState() {
  try {
    if (!chrome.permissions || typeof chrome.permissions.contains !== 'function') return;
    notificationsPermGranted = Boolean(
      await chrome.permissions.contains({ permissions: ['notifications'] })
    );
    syncQuotaNotifyBtnUI();
  } catch {}
}

function buildSingleInstanceResponse(inst) {
  const resp = inst.resp;
  const projects = Array.isArray(resp.projects)
    ? resp.projects.map((p) => ({
        ...p,
        sourceTabId: inst.tabId,
        sourceWindowId: inst.windowId,
        instanceLabel: ''
      }))
    : [];
  return { ...resp, projects };
}

function buildAggregatedResponse(instances) {
  let enabled = false;
  let previewState = null;
  let bestState = 'idle';
  let bestRank = 0;
  const counts = { waiting: 0, unread: 0, running: 0, total: 0 };
  const mergedProjects = [];
  const waitingSamples = [];
  const unreadSamples = [];
  const runningSamples = [];

  for (const inst of instances) {
    const r = inst.resp;
    if (!r) continue;
    if (r.enabled) enabled = true;
    if (!previewState && r.previewState) previewState = r.previewState;

    const rawState = !r.enabled ? 'idle' : r.state === 'completed' ? 'unread' : r.state || 'idle';
    const rank = STATE_PRIORITY[rawState] || 1;
    if (rank > bestRank) {
      bestRank = rank;
      bestState = rawState;
    }

    const c = r.counts || {};
    counts.waiting += Number(c.waiting) || 0;
    counts.unread += Number(c.unread) || 0;
    counts.running += Number(c.running) || 0;
    counts.total += Number(c.total) || 0;

    const instTel = r.telemetry;
    const instConvs = instTel?.conversations;
    for (const p of r.projects || []) {
      const enrichedTasks = Array.isArray(p.tasks)
        ? p.tasks.map((task) => {
            if (task?.telemetry) return task;
            const resolved =
              (task?.convId && instConvs?.[task.convId]) ||
              (task?.isActive && instTel?.activeConvId && instConvs?.[instTel.activeConvId]) ||
              null;
            return resolved ? { ...task, telemetry: resolved } : task;
          })
        : [];
      mergedProjects.push({
        ...p,
        tasks: enrichedTasks,
        sourceTabId: inst.tabId,
        sourceWindowId: inst.windowId,
        instanceLabel: inst.label
      });
      for (const task of p.tasks || []) {
        const sample = `${inst.label} · ${task.title}`;
        if (task.state === 'waiting') waitingSamples.push(sample);
        else if (task.state === 'unread') unreadSamples.push(sample);
        else if (task.state === 'running') runningSamples.push(sample);
      }
    }
  }

  let reason = t(
    'reasonMultiSyncing',
    { count: instances.length },
    `Syncing ${instances.length} Antigravity tabs`
  );
  if (previewState) {
    reason = instances.find((i) => i.resp?.previewState === previewState)?.resp?.reason || reason;
  } else if (counts.waiting > 0 && waitingSamples.length > 0) {
    reason =
      waitingSamples.length === 1
        ? t('reasonGlobalWaitingOne', { sample: waitingSamples[0] }, `Waiting: ${waitingSamples[0]}`)
        : t(
            'reasonGlobalWaitingMany',
            { count: counts.waiting, sample: waitingSamples[0] },
            `${counts.waiting} chats waiting (${waitingSamples[0]}, etc.)`
          );
  } else if (counts.unread > 0 && unreadSamples.length > 0) {
    reason =
      unreadSamples.length === 1
        ? t('reasonGlobalUnreadOne', { sample: unreadSamples[0] }, `Unread: ${unreadSamples[0]}`)
        : t(
            'reasonGlobalUnreadMany',
            { count: counts.unread, sample: unreadSamples[0] },
            `${counts.unread} unread chats (${unreadSamples[0]}, etc.)`
          );
  } else if (counts.running > 0 && runningSamples.length > 0) {
    reason =
      runningSamples.length === 1
        ? t('reasonGlobalRunningOne', { sample: runningSamples[0] }, `Running: ${runningSamples[0]}`)
        : t(
            'reasonGlobalRunningMany',
            { count: counts.running },
            `${counts.running} chats running in background`
          );
  }

  return {
    ok: true,
    enabled,
    indicatorStyle: currentIndicatorStyle,
    iconLayout: currentIconLayout,
    badgeSize: currentBadgeSize,
    state: previewState || bestState,
    counts,
    projects: mergedProjects,
    telemetry: aggregateTelemetry(instances),
    reason,
    previewState
  };
}

function isHostMenuOpen() {
  return Boolean(hostMenuPopoverEl && hostMenuPopoverEl.matches(':popover-open'));
}

function closeHostMenu(restoreFocus = false) {
  if (closeMenuTimerId) {
    clearTimeout(closeMenuTimerId);
    closeMenuTimerId = null;
  }
  if (!hostMenuPopoverEl || !hostMenuPopoverEl.matches(':popover-open')) return;
  try {
    hostMenuPopoverEl.hidePopover();
  } catch {}
  if (restoreFocus && hostMenuTriggerEl) {
    hostMenuTriggerEl.focus();
  }
}

function getMenuRadioItems() {
  if (!hostMenuListEl) return [];
  return Array.from(hostMenuListEl.querySelectorAll('.host-menu-item:not(:disabled)'));
}

function focusHostMenuItem(mode = 'first') {
  const items = getMenuRadioItems();
  if (items.length === 0) return;
  let target = items[0];
  if (mode === 'last') {
    target = items[items.length - 1];
  } else if (mode === 'checked') {
    target = items.find((el) => el.getAttribute('aria-checked') === 'true') || items[0];
  }
  target.focus();
}

function positionHostMenuFallback() {
  if (!hostMenuTriggerEl || !hostMenuPopoverEl) return;
  if (typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('position-area', 'block-end')) {
    return;
  }
  const rect = hostMenuTriggerEl.getBoundingClientRect();
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const pad = 8;
  const gap = 4;

  hostMenuPopoverEl.style.minWidth = `${Math.min(Math.max(Math.round(rect.width), 216), vw - pad * 2)}px`;
  hostMenuPopoverEl.style.maxWidth = `${Math.max(200, Math.min(336, vw - pad * 2))}px`;

  const popRect = hostMenuPopoverEl.getBoundingClientRect();
  const popW = popRect.width || 224;
  const popH = popRect.height || 180;
  const spaceBelow = vh - rect.bottom - pad - gap;
  const spaceAbove = rect.top - pad - gap;

  let top = rect.bottom + gap;
  if (spaceBelow < Math.min(popH, 160) && spaceAbove > spaceBelow) {
    top = Math.max(pad, rect.top - gap - Math.min(popH, spaceAbove));
  } else {
    top = Math.min(top, Math.max(pad, vh - pad - popH));
  }

  let left = rect.left;
  if (left + popW > vw - pad) {
    left = vw - pad - popW;
  }
  left = Math.max(pad, left);

  hostMenuPopoverEl.style.top = `${Math.round(top)}px`;
  hostMenuPopoverEl.style.left = `${Math.round(left)}px`;
  hostMenuPopoverEl.style.maxHeight = `${Math.max(120, Math.round(vh - pad * 2 - 48))}px`;
}

function initHostMenuController() {
  if (hostMenuInitialized) return;
  hostMenuInitialized = true;

  if (instanceJumpBtnEl) {
    instanceJumpBtnEl.addEventListener('click', () => {
      if (currentJumpTarget && typeof currentJumpTarget.tabId === 'number') {
        activateBrowserTab(currentJumpTarget.tabId, currentJumpTarget.windowId);
      }
    });
  }

  if (!hostMenuTriggerEl || !hostMenuPopoverEl || !hostMenuListEl) return;

  const supportsCommandFor = 'commandForElement' in HTMLButtonElement.prototype;
  const supportsFocusGroup = 'focusGroup' in HTMLElement.prototype;
  const supportsPositionArea =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('position-area', 'block-end');
  const supportsImplicitAnchor =
    typeof ToggleEvent !== 'undefined' && 'source' in ToggleEvent.prototype;

  if (supportsPositionArea && !supportsImplicitAnchor) {
    hostMenuTriggerEl.style.anchorName = '--agy-host-trigger';
    hostMenuPopoverEl.style.positionAnchor = '--agy-host-trigger';
  }

  if (!supportsFocusGroup) {
    hostMenuListEl.setAttribute('role', 'menu');
  }

  hostMenuTriggerEl.addEventListener('pointerdown', (ev) => {
    pointerPressedTrigger = true;
    pointerWasOpenOnDown = hostMenuPopoverEl.matches(':popover-open');
    ev.preventDefault();
  });

  if (!supportsCommandFor) {
    hostMenuTriggerEl.addEventListener('click', () => {
      const wasOpen = pointerWasOpenOnDown;
      pointerWasOpenOnDown = false;
      if (wasOpen || hostMenuPopoverEl.matches(':popover-open')) {
        hostMenuPopoverEl.hidePopover();
        return;
      }
      try {
        hostMenuPopoverEl.showPopover({ source: hostMenuTriggerEl });
      } catch {
        hostMenuPopoverEl.showPopover();
      }
    });
  } else {
    hostMenuTriggerEl.addEventListener('click', () => {
      pointerWasOpenOnDown = false;
    });
  }

  hostMenuTriggerEl.addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
    ev.preventDefault();
    lastOpenOriginWasKeyboard = true;
    const edge = ev.key === 'ArrowUp' ? 'last' : 'first';
    if (hostMenuPopoverEl.matches(':popover-open')) {
      focusHostMenuItem(edge);
      return;
    }
    enterMenuOnOpen = edge;
    pointerPressedTrigger = false;
    hostMenuTriggerEl.click();
  });

  hostMenuPopoverEl.addEventListener('toggle', (ev) => {
    const opening = ev.newState === 'open';
    hostMenuTriggerEl.setAttribute('aria-expanded', String(opening));
    if (opening) {
      positionHostMenuFallback();
      const wasPointer = pointerPressedTrigger;
      pointerPressedTrigger = false;
      const requestedEdge = enterMenuOnOpen;
      enterMenuOnOpen = null;
      if (!wasPointer || requestedEdge) {
        lastOpenOriginWasKeyboard = true;
        focusHostMenuItem(requestedEdge || 'first');
      } else {
        lastOpenOriginWasKeyboard = false;
        hostMenuTriggerEl.focus({ focusVisible: false });
      }
    } else {
      pointerPressedTrigger = false;
      enterMenuOnOpen = null;
      if (closeMenuTimerId) {
        clearTimeout(closeMenuTimerId);
        closeMenuTimerId = null;
      }
      if (pendingHostMenuRender) {
        pendingHostMenuRender = false;
        renderInstanceBar();
      }
    }
  });

  hostMenuListEl.addEventListener('keydown', (ev) => {
    const target = ev.target instanceof Element ? ev.target : null;
    if (!target) return;

    if (ev.key === 'ArrowRight') {
      const row = target.closest('.host-menu-row');
      const openBtn = row?.querySelector('.host-menu-open-btn');
      if (openBtn && target !== openBtn) {
        ev.preventDefault();
        openBtn.focus();
        return;
      }
    } else if (ev.key === 'ArrowLeft') {
      const row = target.closest('.host-menu-row');
      const itemBtn = row?.querySelector('.host-menu-item');
      if (itemBtn && target.classList.contains('host-menu-open-btn')) {
        ev.preventDefault();
        itemBtn.focus();
        return;
      }
    }

    if (supportsFocusGroup) return;

    const items = getMenuRadioItems();
    if (items.length === 0) return;
    const currentItem = target.closest('.host-menu-item');
    const idx = currentItem ? items.indexOf(currentItem) : -1;

    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      items[(idx + 1 + items.length) % items.length].focus();
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      items[(idx - 1 + items.length) % items.length].focus();
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      items[0].focus();
    } else if (ev.key === 'End') {
      ev.preventDefault();
      items[items.length - 1].focus();
    }
  });

  window.addEventListener('resize', () => {
    if (hostMenuPopoverEl.matches(':popover-open')) {
      positionHostMenuFallback();
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && hostMenuPopoverEl.matches(':popover-open')) {
      ev.preventDefault();
      closeHostMenu(true);
    }
  });
}

function getAggregateInstanceState(instances) {
  let hasRunning = false;
  let hasUnread = false;
  for (const inst of instances) {
    if (inst?.state === 'waiting') return 'waiting';
    if (inst?.state === 'unread') hasUnread = true;
    if (inst?.state === 'running') hasRunning = true;
  }
  if (hasUnread) return 'unread';
  if (hasRunning) return 'running';
  return 'idle';
}

function extractRemoteHostIdFromUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    const m = parsed.pathname.match(/^\/r\/([^/?#]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  } catch {
    return '';
  }
}

function buildRemoteHostUrl(hostId) {
  if (!hostId || typeof hostId !== 'string') return '';
  const clean = hostId.trim();
  if (!clean || clean.startsWith('__') || !/^[a-zA-Z0-9._-]{3,128}$/.test(clean)) return '';
  return `https://antigravity.google.com/r/${encodeURIComponent(clean)}`;
}

function openRemoteHostInNewTab(host) {
  const targetUrl = buildRemoteHostUrl(host?.id);
  if (!targetUrl) return;
  try {
    chrome.tabs.create({ url: targetUrl, active: true }, () => {
      void chrome.runtime.lastError;
    });
  } catch {}
  if (!IS_SIDE_PANEL) {
    setTimeout(() => {
      window.close();
    }, 60);
  } else {
    setTimeout(() => void refreshCurrentTabStatus(), 350);
    setTimeout(() => void refreshCurrentTabStatus(), 900);
  }
}

function switchRemoteHostInTab(tabId, host) {
  const hostId = typeof host?.id === 'string' ? host.id.trim() : '';
  if (typeof tabId !== 'number' || !hostId) return;

  void sendTopFrameMessage(tabId, { type: 'SWITCH_REMOTE_HOST', hostId });
  try {
    chrome.runtime.sendMessage(
      { type: 'SWITCH_REMOTE_HOST_BROADCAST', tabId, hostId },
      () => {
        void chrome.runtime.lastError;
      }
    );
  } catch {}

  const targetInst = liveInstances.find((inst) => inst.tabId === tabId);
  if (tabId !== currentActiveTabId) {
    try {
      chrome.tabs.update(tabId, { active: true }, () => {
        void chrome.runtime.lastError;
      });
      if (typeof targetInst?.windowId === 'number') {
        chrome.windows.update(targetInst.windowId, { focused: true }, () => {
          void chrome.runtime.lastError;
        });
      }
    } catch {}
  }

  lastInstanceBarDigest = '';
  lastHostMenuDigest = '';
  lastRenderedDigest = '';
  setTimeout(() => void refreshCurrentTabStatus(), 250);
  setTimeout(() => void refreshCurrentTabStatus(), 650);
  setTimeout(() => void refreshCurrentTabStatus(), 1300);
  setTimeout(() => void refreshCurrentTabStatus(), 2200);
}

function setJumpButtonTarget(inst) {
  if (!instanceJumpBtnEl) return;
  if (!inst) {
    currentJumpTarget = null;
    instanceJumpBtnEl.classList.add('hidden');
    return;
  }
  currentJumpTarget = { tabId: inst.tabId, windowId: inst.windowId };
  const switchBtnTitle = t('switchToTabTitle', {}, 'Jump to this Antigravity browser tab');
  const switchBtnText = t('switchToTabBtn', {}, 'Switch tab');
  instanceJumpBtnEl.title = switchBtnTitle;
  const labelNode = instanceJumpBtnEl.querySelector('#instanceJumpLabel');
  if (labelNode) labelNode.textContent = switchBtnText;
  instanceJumpBtnEl.classList.remove('hidden');
}

function scheduleMenuCloseAfterSelect(clickedBtn, fromKeyboard, immediate = false) {
  if (hostMenuListEl && clickedBtn) {
    for (const el of hostMenuListEl.querySelectorAll('.host-menu-item[aria-checked]')) {
      el.setAttribute('aria-checked', String(el === clickedBtn));
    }
  }
  if (closeMenuTimerId) {
    clearTimeout(closeMenuTimerId);
    closeMenuTimerId = null;
  }
  const restoreFocus = Boolean(fromKeyboard || lastOpenOriginWasKeyboard);
  if (immediate) {
    closeHostMenu(restoreFocus);
    return;
  }
  closeMenuTimerId = setTimeout(() => {
    closeMenuTimerId = null;
    closeHostMenu(restoreFocus);
  }, 180);
}

function buildMenuOptionRow({ label, dotClass, title, checked, isRemote = false, onSelect, extraOpenBtn = null }) {
  const row = document.createElement('div');
  row.className = 'host-menu-row';

  const itemBtn = document.createElement('button');
  itemBtn.type = 'button';
  itemBtn.className = `host-menu-item${isRemote ? ' is-remote-host' : ''}`;
  itemBtn.setAttribute('role', 'menuitemradio');
  itemBtn.setAttribute('aria-checked', String(Boolean(checked)));
  if (title) itemBtn.title = title;

  const dotSpan = document.createElement('span');
  dotSpan.className = `instance-mini-dot ${dotClass}`;
  dotSpan.setAttribute('aria-hidden', 'true');

  const textSpan = document.createElement('span');
  textSpan.className = 'host-menu-label';
  textSpan.textContent = label;

  itemBtn.appendChild(dotSpan);
  itemBtn.appendChild(textSpan);
  itemBtn.addEventListener('click', (ev) => onSelect(ev, itemBtn));
  row.appendChild(itemBtn);

  if (extraOpenBtn) {
    row.appendChild(extraOpenBtn);
  }

  return row;
}

function renderInstanceBar() {
  if (!instanceBarEl) return;
  initHostMenuController();

  if (liveInstances.length === 0) {
    if (lastInstanceBarDigest !== 'hidden') {
      lastInstanceBarDigest = 'hidden';
      lastHostMenuDigest = '';
      pendingHostMenuRender = false;
      closeHostMenu(false);
      setJumpButtonTarget(null);
      if (hostMenuListEl) hostMenuListEl.textContent = '';
      instanceSingleInfoEl?.classList.add('hidden');
      hostSwitcherWrapEl?.classList.add('hidden');
      instanceBarEl.classList.add('hidden');
    }
    return;
  }

  const hostMap = new Map();
  const openHostIds = new Set();
  for (const inst of liveInstances) {
    const r = inst.resp;
    const activeId =
      (typeof r?.remoteHost?.id === 'string' && r.remoteHost.id) ||
      extractRemoteHostIdFromUrl(r?.pageUrl || '');
    if (activeId) openHostIds.add(activeId);

    for (const h of r?.remoteHosts || []) {
      if (!h || !h.id) continue;
      const prev = hostMap.get(h.id);
      if (!prev) {
        hostMap.set(h.id, { ...h });
      } else if (h.online === true && prev.online !== true) {
        prev.online = true;
      }
    }
  }

  const unopenedRemoteHosts = Array.from(hostMap.values()).filter(
    (h) => h && h.id && !openHostIds.has(h.id)
  );
  const singleInst = liveInstances.length === 1 ? liveInstances[0] : null;
  const hasRemoteLabel = Boolean(singleInst?.resp?.remoteHost?.label);

  if (
    singleInst &&
    singleInst.tabId === currentActiveTabId &&
    unopenedRemoteHosts.length === 0 &&
    !hasRemoteLabel
  ) {
    if (lastInstanceBarDigest !== 'hidden') {
      lastInstanceBarDigest = 'hidden';
      lastHostMenuDigest = '';
      pendingHostMenuRender = false;
      closeHostMenu(false);
      setJumpButtonTarget(null);
      if (hostMenuListEl) hostMenuListEl.textContent = '';
      instanceSingleInfoEl?.classList.add('hidden');
      hostSwitcherWrapEl?.classList.add('hidden');
      instanceBarEl.classList.add('hidden');
    }
    return;
  }

  if (singleInst && unopenedRemoteHosts.length === 0) {
    const isRemoteTabActive = singleInst.tabId === currentActiveTabId;
    const connectedText = isRemoteTabActive
      ? singleInst.label
      : t('connectedInstanceLabel', { name: singleInst.label }, `Connected: ${singleInst.label}`);
    const switchBtnText = t('switchToTabBtn', {}, 'Switch tab');
    const switchBtnTitle = t('switchToTabTitle', {}, 'Jump to this Antigravity browser tab');
    const barAria = t('instanceBarAria', {}, 'Open Antigravity instances');
    const digest = JSON.stringify({
      mode: 'single',
      tabId: singleInst.tabId,
      windowId: singleInst.windowId,
      isRemoteTabActive,
      state: singleInst.state,
      connectedText,
      switchBtnText,
      switchBtnTitle
    });
    if (digest === lastInstanceBarDigest) return;
    lastInstanceBarDigest = digest;
    lastHostMenuDigest = '';
    pendingHostMenuRender = false;
    closeHostMenu(false);
    if (hostMenuListEl) hostMenuListEl.textContent = '';

    instanceBarEl.setAttribute('aria-label', barAria);
    instanceBarEl.classList.remove('hidden');
    hostSwitcherWrapEl?.classList.add('hidden');
    if (instanceSingleInfoEl) {
      instanceSingleInfoEl.classList.remove('hidden');
      if (instanceSingleDotEl) {
        instanceSingleDotEl.className = `instance-mini-dot ${singleInst.state}`;
        instanceSingleDotEl.setAttribute('aria-hidden', 'true');
      }
      if (instanceSingleLabelEl) {
        instanceSingleLabelEl.textContent = connectedText;
      }
    }
    setJumpButtonTarget(isRemoteTabActive ? null : singleInst);
    return;
  }

  const showAllPill = liveInstances.length >= 2;
  const allLabel = showAllPill
    ? t('instanceAll', { count: liveInstances.length }, `All (${liveInstances.length})`)
    : '';
  const openAria = t('instanceBarAria', {}, 'Open Antigravity instances');
  const remoteAria = t('remoteHostsBarAria', {}, 'Remote hosts and open instances');
  const barAria = unopenedRemoteHosts.length > 0 ? remoteAria : openAria;
  const selectedInst =
    selectedInstanceKey !== 'all'
      ? liveInstances.find((i) => i.tabId === selectedInstanceKey) || liveInstances[0]
      : null;
  const aggState = getAggregateInstanceState(liveInstances);
  const triggerState = selectedInst ? selectedInst.state : aggState;
  const triggerLabel = selectedInst ? selectedInst.label : allLabel;
  const totalChoices = liveInstances.length + unopenedRemoteHosts.length;
  const showJump = Boolean(selectedInst && selectedInst.tabId !== currentActiveTabId);
  const switchBtnText = t('switchToTabBtn', {}, 'Switch tab');
  const switchBtnTitle = t('switchToTabTitle', {}, 'Jump to this Antigravity browser tab');

  const barDigest = JSON.stringify({
    mode: 'dropdown',
    triggerState,
    triggerLabel,
    totalChoices,
    showJump,
    selected: selectedInstanceKey,
    tabId: selectedInst?.tabId ?? null,
    windowId: selectedInst?.windowId ?? null,
    switchBtnText,
    switchBtnTitle,
    barAria
  });

  if (barDigest !== lastInstanceBarDigest) {
    lastInstanceBarDigest = barDigest;
    instanceBarEl.setAttribute('aria-label', barAria);
    instanceBarEl.classList.remove('hidden');
    instanceSingleInfoEl?.classList.add('hidden');
    hostSwitcherWrapEl?.classList.remove('hidden');

    if (hostTriggerDotEl) {
      hostTriggerDotEl.className = `instance-mini-dot ${triggerState}`;
      hostTriggerDotEl.setAttribute('aria-hidden', 'true');
    }
    if (hostTriggerLabelEl) {
      hostTriggerLabelEl.textContent = triggerLabel;
    }
    if (hostTriggerCountEl) {
      if (totalChoices >= 2) {
        hostTriggerCountEl.textContent = String(totalChoices);
        hostTriggerCountEl.classList.remove('hidden');
      } else {
        hostTriggerCountEl.textContent = '';
        hostTriggerCountEl.classList.add('hidden');
      }
    }
    if (hostMenuTriggerEl) {
      hostMenuTriggerEl.title = triggerLabel;
    }
    setJumpButtonTarget(showJump ? selectedInst : null);
  }

  const menuDigest = JSON.stringify({
    showAllPill,
    selected: selectedInstanceKey,
    allLabel,
    aggState,
    openAria,
    remoteAria,
    items: liveInstances.map((i) => ({
      tabId: i.tabId,
      windowId: i.windowId,
      label: i.label,
      state: i.state
    })),
    unopenedRemoteHosts
  });

  if (menuDigest === lastHostMenuDigest) return;
  if (isHostMenuOpen()) {
    pendingHostMenuRender = true;
    return;
  }
  lastHostMenuDigest = menuDigest;
  pendingHostMenuRender = false;

  if (!hostMenuListEl) return;
  hostMenuListEl.textContent = '';
  hostMenuListEl.setAttribute('aria-label', barAria);

  const selectView = (nextKey, clickedBtn, fromKeyboard) => {
    selectedInstanceKey = nextKey;
    hasUserSelectedInstance = true;
    lastRenderedDigest = '';
    lastQuotaDigest = '';
    scheduleMenuCloseAfterSelect(clickedBtn, fromKeyboard, false);
    renderInstanceBar();
    if (selectedInstanceKey === 'all') {
      renderStatusUI(buildAggregatedResponse(liveInstances));
    } else {
      const target = liveInstances.find((i) => i.tabId === selectedInstanceKey) || liveInstances[0];
      if (target) renderStatusUI(buildSingleInstanceResponse(target));
    }
  };

  const openGroupEl = document.createElement('div');
  openGroupEl.setAttribute('role', 'group');
  openGroupEl.setAttribute('aria-label', openAria);
  openGroupEl.className = 'host-menu-group';

  if (showAllPill) {
    openGroupEl.appendChild(
      buildMenuOptionRow({
        label: allLabel,
        dotClass: aggState,
        title: allLabel,
        checked: selectedInstanceKey === 'all',
        onSelect: (ev, btn) => selectView('all', btn, ev.detail === 0)
      })
    );
  }

  for (const inst of liveInstances) {
    openGroupEl.appendChild(
      buildMenuOptionRow({
        label: inst.label,
        dotClass: inst.state,
        title: inst.label,
        checked: selectedInstanceKey === inst.tabId,
        onSelect: (ev, btn) => selectView(inst.tabId, btn, ev.detail === 0)
      })
    );
  }

  hostMenuListEl.appendChild(openGroupEl);

  if (unopenedRemoteHosts.length > 0) {
    const sep = document.createElement('hr');
    sep.className = 'host-menu-sep';
    hostMenuListEl.appendChild(sep);

    const remoteGroupEl = document.createElement('div');
    remoteGroupEl.setAttribute('role', 'group');
    remoteGroupEl.setAttribute('aria-label', remoteAria);
    remoteGroupEl.className = 'host-menu-group';

    for (const host of unopenedRemoteHosts) {
      const canOpenTab = !host.isSpecial && Boolean(buildRemoteHostUrl(host.id));
      const hostTitle =
        host.online === false
          ? t('remoteHostOffline', { name: host.label }, `${host.label} (offline)`)
          : t('switchRemoteHostTitle', { name: host.label }, `Switch to ${host.label}`);
      const dotClass = host.isSpecial
        ? 'remote-special'
        : host.online === false
          ? 'remote-offline'
          : 'remote-online';

      let openBtn = null;
      if (canOpenTab) {
        openBtn = document.createElement('button');
        openBtn.type = 'button';
        openBtn.className = 'host-menu-open-btn';
        openBtn.setAttribute('focusgroup', 'none');
        const openLabel = t(
          'openHostInNewTabAria',
          { name: host.label },
          `Open ${host.label} in new tab`
        );
        openBtn.setAttribute('aria-label', openLabel);
        openBtn.title = openLabel;

        const glyph = document.createElement('span');
        glyph.className = 'jump-glyph';
        glyph.setAttribute('aria-hidden', 'true');
        openBtn.appendChild(glyph);
        openBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          closeHostMenu(ev.detail === 0);
          openRemoteHostInNewTab(host);
        });
      }

      const row = buildMenuOptionRow({
        label: host.label,
        dotClass,
        title: hostTitle,
        checked: false,
        isRemote: true,
        extraOpenBtn: openBtn,
        onSelect: (ev, btn) => {
          const fromKeyboard = ev.detail === 0;
          if ((ev.metaKey || ev.ctrlKey || selectedInstanceKey === 'all') && canOpenTab) {
            scheduleMenuCloseAfterSelect(btn, fromKeyboard, true);
            openRemoteHostInNewTab(host);
            return;
          }
          const targetTabId = getPrimaryTargetTabId() ?? liveInstances[0]?.tabId;
          if (typeof targetTabId === 'number') {
            scheduleMenuCloseAfterSelect(btn, fromKeyboard, false);
            switchRemoteHostInTab(targetTabId, host);
          } else if (canOpenTab) {
            scheduleMenuCloseAfterSelect(btn, fromKeyboard, true);
            openRemoteHostInNewTab(host);
          }
        }
      });

      const primaryItem = row.querySelector('.host-menu-item');
      if (primaryItem && canOpenTab) {
        primaryItem.addEventListener('auxclick', (ev) => {
          if (ev.button === 1) {
            ev.preventDefault();
            closeHostMenu(false);
            openRemoteHostInNewTab(host);
          }
        });
      }

      remoteGroupEl.appendChild(row);
    }

    hostMenuListEl.appendChild(remoteGroupEl);
  }
}

function buildProjectSummaryText(proj) {
  const tasks = proj?.tasks;
  if (!tasks || tasks.length === 0) {
    return proj?.isCollapsed && !proj?.knownEmpty
      ? t('projCollapsed', {}, 'Collapsed')
      : t('projNoTasks', {}, 'No chats');
  }
  let w = 0;
  let u = 0;
  let r = 0;
  for (const task of tasks) {
    if (task.state === 'waiting') w++;
    else if (task.state === 'unread') u++;
    else if (task.state === 'running') r++;
  }
  const parts = [];
  if (w > 0) parts.push(t('projSummaryWaiting', { count: w }, `${w} waiting`));
  if (u > 0) parts.push(t('projSummaryUnread', { count: u }, `${u} unread`));
  if (r > 0) parts.push(t('projSummaryRunning', { count: r }, `${r} running`));
  if (parts.length === 0) return t('projSummaryIdle', { count: tasks.length }, `${tasks.length} idle`);
  return parts.join(' · ');
}

function focusSidebarItem(taskId, projectName = '', taskTitle = '', sourceTabId = null, sourceWindowId = null) {
  const targetTabId = typeof sourceTabId === 'number' ? sourceTabId : getPrimaryTargetTabId();
  if (!targetTabId || !taskId) return;

  sendTopFrameMessage(targetTabId, {
    type: 'FOCUS_TASK',
    taskId,
    projectName,
    taskTitle
  });
  chrome.runtime.sendMessage(
    {
      type: 'FOCUS_TASK_BROADCAST',
      tabId: targetTabId,
      taskId,
      projectName,
      taskTitle
    },
    () => {
      void chrome.runtime.lastError;
    }
  );

  const targetInst = liveInstances.find((inst) => inst.tabId === targetTabId);
  const targetWindowId =
    typeof sourceWindowId === 'number' ? sourceWindowId : targetInst?.windowId ?? null;
  const needsTabSwitch =
    targetTabId !== currentActiveTabId ||
    (typeof targetWindowId === 'number' &&
      typeof currentWindowId === 'number' &&
      targetWindowId !== currentWindowId);

  if (needsTabSwitch) {
    activateBrowserTab(targetTabId, targetWindowId);
    if (IS_SIDE_PANEL) {
      setTimeout(refreshCurrentTabStatus, 180);
      setTimeout(refreshCurrentTabStatus, 480);
    }
  } else {
    setTimeout(refreshCurrentTabStatus, 180);
    setTimeout(refreshCurrentTabStatus, 480);
  }
}

function formatCacheChipText(fresh, coarse = false) {
  if (!fresh || !PRICING_API?.formatCacheCountdown) return '';
  if (fresh.state === 'warm') {
    const timeStr = PRICING_API.formatCacheCountdown(fresh.remainingMs, { coarse: true });
    return t('ctxCacheChipWarm', { time: timeStr }, `Cache ${timeStr}`);
  }
  if (fresh.state === 'cooling') {
    const timeStr = PRICING_API.formatCacheCountdown(fresh.remainingMs, { coarse });
    return t('ctxCacheChipCooling', { time: timeStr }, `Cache ${timeStr}`);
  }
  return t('ctxCacheChipCold', {}, 'Cache cold');
}

function buildTaskHoverTitle(proj, task, convTel, nowMs = Date.now()) {
  const lines = [`${proj.projectName} › ${task.title}`];
  if (task.reason) lines.push(task.reason);
  if (convTel && convTel.precision === 'exact' && convTel.contextUsed > 0) {
    lines.push(
      t(
        'ctxExactBreakdown',
        {
          cache: formatTokenCount(convTel.cacheReadTokens),
          input: formatTokenCount(convTel.inputTokens),
          output: formatTokenCount(convTel.outputTokens),
          hit: Math.round(convTel.cacheHitRate)
        },
        `Cache ${formatTokenCount(convTel.cacheReadTokens)} · In ${formatTokenCount(convTel.inputTokens)} · Out ${formatTokenCount(convTel.outputTokens)} (${Math.round(convTel.cacheHitRate)}% hit)`
      )
    );
  }
  if (convTel && convTel.sessionTotalTokens > 0 && convTel.sessionStepPricedCount > 0) {
    lines.push(
      t(
        'ctxSessionSummary',
        {
          total: formatTokenCount(convTel.sessionTotalTokens),
          steps: convTel.sessionStepPricedCount,
          hit: Math.round(convTel.sessionCacheHitRate)
        },
        `Session total: ${formatTokenCount(convTel.sessionTotalTokens)} (${convTel.sessionStepPricedCount} steps · ${Math.round(convTel.sessionCacheHitRate)}% cache)`
      )
    );
    const costRes = PRICING_API?.computeSessionCost?.(convTel, currentPricingConfig);
    if (costRes && costRes.actualCost !== null) {
      const costStr = PRICING_API.formatCostValue(
        costRes.actualCost,
        currentPricingConfig.currency,
        { approx: true }
      );
      if (costRes.cacheSaved > 0) {
        const savedStr = PRICING_API.formatCostValue(
          costRes.cacheSaved,
          currentPricingConfig.currency,
          { approx: true }
        );
        lines.push(
          t(
            'ctxCostSummarySaved',
            { cost: costStr, saved: savedStr },
            `Est. API value: ${costStr} · Cache saved ${savedStr}`
          )
        );
      } else {
        lines.push(t('ctxCostSummaryOnly', { cost: costStr }, `Est. API value: ${costStr}`));
      }
    } else {
      lines.push(t('ctxCostSummaryOnly', { cost: '--' }, 'Est. API value: --'));
    }
  }
  if (convTel) {
    const detailParts = [];
    if (convTel.sessionReasoningTokens > 0) {
      detailParts.push(
        t(
          'ctxReasoningStat',
          { tokens: formatTokenCount(convTel.sessionReasoningTokens) },
          `Reasoning ${formatTokenCount(convTel.sessionReasoningTokens)}`
        )
      );
    }
    if (convTel.sessionCacheCreationTokens > 0) {
      if (convTel.sessionCacheWrite5mTokens > 0 || convTel.sessionCacheWrite1hTokens > 0) {
        detailParts.push(
          t(
            'ctxCacheWriteTiered',
            {
              w5m: formatTokenCount(convTel.sessionCacheWrite5mTokens),
              w1h: formatTokenCount(convTel.sessionCacheWrite1hTokens)
            },
            `Cache write 5m ${formatTokenCount(convTel.sessionCacheWrite5mTokens)} / 1h ${formatTokenCount(convTel.sessionCacheWrite1hTokens)}`
          )
        );
      } else {
        detailParts.push(
          t(
            'ctxCacheWriteFlat',
            { tokens: formatTokenCount(convTel.sessionCacheCreationTokens) },
            `Cache write ${formatTokenCount(convTel.sessionCacheCreationTokens)}`
          )
        );
      }
    }
    if (convTel.subagentTotalTokens > 0) {
      detailParts.push(
        t(
          'ctxSubagentStat',
          { tokens: formatTokenCount(convTel.subagentTotalTokens) },
          `Subagents ${formatTokenCount(convTel.subagentTotalTokens)}`
        )
      );
    }
    if (detailParts.length > 0) {
      lines.push(detailParts.join(' · '));
    }

    const ttftStr =
      typeof convTel.lastStepTtftMs === 'number' && convTel.lastStepTtftMs > 0
        ? formatStepLatency(convTel.lastStepTtftMs)
        : '';
    const durStr =
      typeof convTel.lastStepDurationMs === 'number' && convTel.lastStepDurationMs > 0
        ? formatStepLatency(convTel.lastStepDurationMs)
        : '';
    if (ttftStr && durStr) {
      lines.push(
        t(
          'ctxLatencyFull',
          { ttft: ttftStr, duration: durStr },
          `Last step: TTFT ${ttftStr} · Total ${durStr}`
        )
      );
    } else if (durStr) {
      lines.push(
        t('ctxLatencyDurationOnly', { duration: durStr }, `Last step: ${durStr}`)
      );
    } else if (ttftStr) {
      lines.push(
        t('ctxLatencyTtftOnly', { ttft: ttftStr }, `Last step TTFT: ${ttftStr}`)
      );
    }

    const fresh = PRICING_API?.evaluateCacheFreshness?.(convTel, nowMs) || null;
    if (fresh && PRICING_API?.formatCacheCountdown) {
      const coarse = Boolean(reducedMotionMedia?.matches);
      if (fresh.state === 'warm') {
        const timeStr = PRICING_API.formatCacheCountdown(fresh.remainingMs, {
          compact: true,
          coarse
        });
        lines.push(
          t(
            'ctxCacheTipWarm',
            { ttl: fresh.ttlTier, time: timeStr },
            `Prompt cache (${fresh.ttlTier}): Warm · ~${timeStr} left`
          )
        );
      } else if (fresh.state === 'cooling') {
        const timeStr = PRICING_API.formatCacheCountdown(fresh.remainingMs, {
          compact: true,
          coarse
        });
        lines.push(
          t(
            'ctxCacheTipCooling',
            { ttl: fresh.ttlTier, time: timeStr },
            `Prompt cache (${fresh.ttlTier}): Cooling · ~${timeStr} before expiry`
          )
        );
      } else {
        lines.push(
          t(
            'ctxCacheTipCold',
            { ttl: fresh.ttlTier },
            `Prompt cache (${fresh.ttlTier}): Cold · Next turn rebuilds prefix`
          )
        );
      }
    }
  }
  return lines.join('\n');
}

function syncTaskCacheCountdownsInPlace(nowMs = Date.now()) {
  if (!PRICING_API?.evaluateCacheFreshness || renderedTaskLiveRefs.length === 0) return;
  const coarseMotion = Boolean(reducedMotionMedia?.matches);
  for (const ref of renderedTaskLiveRefs) {
    if (!ref || !ref.itemLi?.isConnected) continue;
    const fresh = PRICING_API.evaluateCacheFreshness(ref.convTel, nowMs);
    if (ref.cacheChipEl) {
      if (!fresh) {
        ref.cacheChipEl.remove();
        ref.cacheChipEl = null;
      } else {
        const nextCls = `cache-chip is-${fresh.state}`;
        if (ref.cacheChipEl.className !== nextCls) {
          ref.cacheChipEl.className = nextCls;
        }
        const nextTxt = formatCacheChipText(fresh, coarseMotion);
        if (ref.cacheChipEl.textContent !== nextTxt) {
          ref.cacheChipEl.textContent = nextTxt;
        }
      }
    }
    let isHoveredOrFocused = false;
    try {
      isHoveredOrFocused = ref.itemLi.matches(':hover, :focus-within');
    } catch {}
    if (!isHoveredOrFocused && (ref.task.reason || ref.convTel)) {
      const nextTitle = buildTaskHoverTitle(ref.proj, ref.task, ref.convTel, nowMs);
      if (ref.rowBtn && ref.rowBtn.title !== nextTitle) {
        ref.rowBtn.title = nextTitle;
      }
      if (ref.telRow && ref.telRow.title !== nextTitle) {
        ref.telRow.title = nextTitle;
      }
    }
  }
}

function renderProjectsTree(projects, telemetry = null) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const nowMs = Date.now();
  const coarseMotion = Boolean(reducedMotionMedia?.matches);
  const filteredProjects = safeProjects
    .map((p) => {
      const visibleTasks =
        currentFilter === 'active'
          ? (p.tasks || []).filter((task) => task.state !== 'idle')
          : p.tasks || [];
      return {
        projectName: p.projectName,
        projectType: p.projectType || 'local',
        headerTaskId: p.headerTaskId || '',
        isCollapsed: Boolean(p.isCollapsed),
        knownEmpty: Boolean(p.knownEmpty),
        sourceTabId: typeof p.sourceTabId === 'number' ? p.sourceTabId : null,
        sourceWindowId: typeof p.sourceWindowId === 'number' ? p.sourceWindowId : null,
        instanceLabel: p.instanceLabel || '',
        tasks: visibleTasks.map((task) => {
          const convTel = currentShowContextMetrics ? resolveTaskTelemetry(task, telemetry) : null;
          const hasTel = Boolean(
            convTel &&
              (Number(convTel.contextUsed) > 0 ||
                Number(convTel.sessionTotalTokens) > 0 ||
                Number(convTel.subagentTotalTokens) > 0)
          );
          const resolvedTel = hasTel
            ? {
                modelId: String(convTel.modelId || ''),
                modelLabel: String(convTel.modelLabel || ''),
                contextUsed: Number(convTel.contextUsed) || 0,
                contextLimit: Number(convTel.contextLimit) || 256000,
                usagePercent:
                  typeof convTel.usagePercent === 'number' && Number.isFinite(convTel.usagePercent)
                    ? Math.round(convTel.usagePercent)
                    : Math.round(
                        ((Number(convTel.contextUsed) || 0) /
                          Math.max(1, Number(convTel.contextLimit) || 256000)) *
                          100
                      ),
                precision: convTel.precision === 'exact' ? 'exact' : 'estimated',
                isRunning: Boolean(task.state === 'running' || convTel.isRunning),
                tokPerSec: Number(convTel.tokPerSec) || 0,
                compressionDetected: Boolean(convTel.compressionDetected),
                compressionDrop: Number(convTel.compressionDrop) || 0,
                cacheReadTokens: Number(convTel.cacheReadTokens) || 0,
                cacheCreationTokens: Number(convTel.cacheCreationTokens) || 0,
                cacheWrite5mTokens: Number(convTel.cacheWrite5mTokens) || 0,
                cacheWrite1hTokens: Number(convTel.cacheWrite1hTokens) || 0,
                inputTokens: Number(convTel.inputTokens) || 0,
                outputTokens: Number(convTel.outputTokens) || 0,
                reasoningTokens: Number(convTel.reasoningTokens) || 0,
                cacheHitRate: Number(convTel.cacheHitRate) || 0,
                sessionInputTokens: Number(convTel.sessionInputTokens) || 0,
                sessionCacheReadTokens: Number(convTel.sessionCacheReadTokens) || 0,
                sessionCacheCreationTokens: Number(convTel.sessionCacheCreationTokens) || 0,
                sessionCacheWrite5mTokens: Number(convTel.sessionCacheWrite5mTokens) || 0,
                sessionCacheWrite1hTokens: Number(convTel.sessionCacheWrite1hTokens) || 0,
                sessionOutputTokens: Number(convTel.sessionOutputTokens) || 0,
                sessionReasoningTokens: Number(convTel.sessionReasoningTokens) || 0,
                sessionTotalTokens: Number(convTel.sessionTotalTokens) || 0,
                sessionCacheHitRate: Number(convTel.sessionCacheHitRate) || 0,
                sessionStepPricedCount: Number(convTel.sessionStepPricedCount) || 0,
                subagentTotalTokens: Number(convTel.subagentTotalTokens) || 0,
                lastStepDurationMs:
                  typeof convTel.lastStepDurationMs === 'number' &&
                  Number.isFinite(convTel.lastStepDurationMs) &&
                  convTel.lastStepDurationMs > 0
                    ? Math.round(convTel.lastStepDurationMs)
                    : null,
                lastStepTtftMs:
                  typeof convTel.lastStepTtftMs === 'number' &&
                  Number.isFinite(convTel.lastStepTtftMs) &&
                  convTel.lastStepTtftMs > 0
                    ? Math.round(convTel.lastStepTtftMs)
                    : null,
                lastStepTs:
                  typeof convTel.lastStepTs === 'number' && Number.isFinite(convTel.lastStepTs)
                    ? convTel.lastStepTs
                    : null
              }
            : null;
          const fresh = resolvedTel
            ? PRICING_API?.evaluateCacheFreshness?.(resolvedTel, nowMs) || null
            : null;
          return {
            ...task,
            _resolvedTel: resolvedTel,
            _cacheFreshKey: fresh ? `${fresh.state}:${fresh.ttlTier}` : ''
          };
        })
      };
    })
    .filter((p) => (currentFilter === 'active' ? p.tasks.length > 0 : true));

  const pricingDigest = `${currentPricingConfig.currency}:${currentPricingConfig.usdToCnyRate}:${Object.entries(
    currentPricingConfig.overrides || {}
  )
    .map(
      ([k, v]) =>
        `${k}=${v.in},${v.cacheRead},${v.cacheWrite5m},${v.cacheWrite1h},${v.out}`
    )
    .sort()
    .join(';')}`;

  const digest = JSON.stringify({
    filter: currentFilter,
    showContextMetrics: currentShowContextMetrics,
    pricingDigest,
    list: filteredProjects
  });
  if (digest === lastRenderedDigest) {
    syncTaskCacheCountdownsInPlace(nowMs);
    return;
  }
  lastRenderedDigest = digest;

  renderedTaskLiveRefs.length = 0;
  projectsListEl.textContent = '';

  if (filteredProjects.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-projects';
    empty.textContent =
      currentFilter === 'active'
        ? t('emptyActive', {}, 'No waiting, unread, or running chats')
        : t('emptyAll', {}, 'No projects detected in sidebar yet');
    projectsListEl.appendChild(empty);
    return;
  }

  for (const proj of filteredProjects) {
    const isEmptyProj = proj.tasks.length === 0;
    const isRemote = proj.projectType === 'remote';
    const summaryText = buildProjectSummaryText(proj);

    const groupEl = document.createElement('li');
    groupEl.className = `project-group${isEmptyProj ? ' is-empty' : ''}`;

    const headerEl = document.createElement(proj.headerTaskId ? 'button' : 'div');
    if (proj.headerTaskId) {
      headerEl.type = 'button';
      headerEl.className = 'project-header project-header-btn';
      headerEl.addEventListener('click', () =>
        focusSidebarItem(
          proj.headerTaskId,
          proj.projectName,
          '',
          proj.sourceTabId,
          proj.sourceWindowId
        )
      );
    } else {
      headerEl.className = 'project-header';
    }

    const titleWrap = document.createElement('span');
    titleWrap.className = 'project-title-wrap';

    const folderIcon = document.createElement('span');
    folderIcon.className = `project-folder-icon${isRemote ? ' remote' : ''}`;
    folderIcon.dataset.kind = isRemote ? 'remote' : 'local';
    folderIcon.setAttribute('aria-hidden', 'true');

    const projNameEl = document.createElement('span');
    projNameEl.className = 'project-name';
    projNameEl.textContent = proj.projectName;

    const projKindSr = document.createElement('span');
    projKindSr.className = 'visually-hidden';
    projKindSr.textContent = isRemote
      ? t('projRemoteSr', {}, '(Remote project)')
      : t('projLocalSr', {}, '(Local project)');

    titleWrap.appendChild(folderIcon);
    titleWrap.appendChild(projNameEl);
    titleWrap.appendChild(projKindSr);

    if (proj.instanceLabel) {
      const instTag = document.createElement('span');
      instTag.className = 'proj-instance-tag';
      instTag.textContent = proj.instanceLabel;
      titleWrap.appendChild(instTag);
    }

    if (proj.isCollapsed) {
      const collapsedTag = document.createElement('span');
      collapsedTag.className = 'collapsed-tag';
      collapsedTag.textContent = t('projCollapsed', {}, 'Collapsed');
      titleWrap.appendChild(collapsedTag);
    }

    const summaryEl = document.createElement('span');
    summaryEl.className = 'project-summary-badge';
    summaryEl.textContent = summaryText;

    headerEl.appendChild(titleWrap);
    headerEl.appendChild(summaryEl);
    groupEl.appendChild(headerEl);

    if (!isEmptyProj) {
      const itemsWrap = document.createElement('ul');
      itemsWrap.className = 'task-items';
      itemsWrap.setAttribute('role', 'list');

      for (const task of proj.tasks) {
        const itemLi = document.createElement('li');
        itemLi.className = 'task-item';
        const resolvedConvId = task.convId || (task.isActive ? telemetry?.activeConvId || '' : '');
        if (resolvedConvId) {
          itemLi.dataset.convId = resolvedConvId;
        }

        const rowBtn = document.createElement('button');
        rowBtn.type = 'button';
        rowBtn.className = `task-row is-${task.state}`;

        const convTel = task._resolvedTel;
        const hoverTitle = buildTaskHoverTitle(proj, task, convTel, nowMs);
        if (task.reason || convTel) {
          rowBtn.title = hoverTitle;
        }

        const leftWrap = document.createElement('span');
        leftWrap.className = 'task-left';

        const iconSpan = document.createElement('span');
        iconSpan.className = `task-icon ${task.state}${task.state === 'running' ? ' loading-spinner' : ''}`;
        iconSpan.setAttribute('aria-hidden', 'true');
        if (task.state === 'waiting') iconSpan.textContent = '!';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'task-title';
        titleSpan.textContent = task.title;

        leftWrap.appendChild(iconSpan);
        leftWrap.appendChild(titleSpan);

        if (task.isActive) {
          const curTag = document.createElement('span');
          curTag.className = 'current-tag';
          curTag.textContent = t('taskCurrentTag', {}, 'Current');
          leftWrap.appendChild(curTag);
        }

        const rightBadge = document.createElement('span');
        rightBadge.className = `task-badge ${task.state}`;
        if (task.state === 'idle') {
          rightBadge.textContent = task.timeText || t('taskStateIdle', {}, 'Idle');
        } else if (task.state === 'unread' && task.timeText) {
          rightBadge.textContent = t('taskStateUnreadTime', { time: task.timeText }, `Unread · ${task.timeText}`);
        } else {
          rightBadge.textContent = TASK_STATE_TEXT[task.state] || task.state;
        }

        rowBtn.appendChild(leftWrap);
        rowBtn.appendChild(rightBadge);

        rowBtn.addEventListener('click', () =>
          focusSidebarItem(
            task.taskId,
            proj.projectName,
            task.title,
            proj.sourceTabId,
            proj.sourceWindowId
          )
        );
        itemLi.appendChild(rowBtn);

        let telRow = null;
        let cacheChipEl = null;
        if (convTel && convTel.contextUsed > 0) {
          telRow = document.createElement('div');
          telRow.className = 'task-telemetry-row';
          telRow.title = hoverTitle;

          const ctxChip = document.createElement('span');
          const pct = Math.max(0, convTel.usagePercent);
          ctxChip.className =
            pct >= 80 ? 'ctx-chip danger' : pct >= 50 ? 'ctx-chip warn' : 'ctx-chip';
          const estPrefix = convTel.precision === 'exact' ? '' : '~';
          ctxChip.textContent = `${estPrefix}${formatTokenCount(convTel.contextUsed)}/${formatTokenCount(convTel.contextLimit)} (${pct}%)`;
          telRow.appendChild(ctxChip);

          if (convTel.tokPerSec > 0) {
            const speedStr =
              convTel.tokPerSec >= 10
                ? String(Math.round(convTel.tokPerSec))
                : convTel.tokPerSec.toFixed(1).replace(/\.0$/, '');
            if (Number(speedStr) > 0) {
              const speedChip = document.createElement('span');
              speedChip.className = 'speed-chip';
              speedChip.textContent = t('ctxSpeedChip', { speed: speedStr }, `${speedStr} tok/s`);
              telRow.appendChild(speedChip);
            }
          }

          if (convTel.compressionDetected && convTel.compressionDrop > 0) {
            const dropPct = Math.round(convTel.compressionDrop);
            if (dropPct > 0) {
              const compactChip = document.createElement('span');
              compactChip.className = 'compact-chip';
              compactChip.textContent = t('ctxCompactChip', { drop: dropPct }, `-${dropPct}%`);
              telRow.appendChild(compactChip);
            }
          }

          const fresh = PRICING_API?.evaluateCacheFreshness?.(convTel, nowMs) || null;
          if (fresh) {
            cacheChipEl = document.createElement('span');
            cacheChipEl.className = `cache-chip is-${fresh.state}`;
            cacheChipEl.textContent = formatCacheChipText(fresh, coarseMotion);
            telRow.appendChild(cacheChipEl);
          }

          itemLi.appendChild(telRow);
        }

        if (convTel || task.reason) {
          renderedTaskLiveRefs.push({
            itemLi,
            rowBtn,
            telRow,
            cacheChipEl,
            proj,
            task,
            convTel
          });
        }

        itemsWrap.appendChild(itemLi);
      }

      groupEl.appendChild(itemsWrap);
    }

    projectsListEl.appendChild(groupEl);
  }
}

function renderStatusUI(resp) {
  if (!resp || !resp.ok) return;

  const rawKey = resp.enabled ? (resp.state || 'idle') : 'idle';
  const stateKey = rawKey === 'completed' ? 'unread' : rawKey;
  const meta = STATE_META[stateKey] || STATE_META.idle;
  const counts = resp.counts || { waiting: 0, unread: 0, running: 0, total: 0 };
  const projCount = Array.isArray(resp.projects) ? resp.projects.length : 0;

  statusDot.className = `status-dot ${meta.dotClass}`;
  statusDot.dataset.indicatorStyle = currentIndicatorStyle;
  statusLabel.textContent = resp.enabled ? meta.label : t('statusPaused', {}, 'Display paused');
  statusReason.textContent = resp.enabled
    ? resp.reason || t('reasonSyncingDefault', {}, 'Syncing all project states in real time')
    : t('reasonPaused', {}, 'Disabled via top switch; default site icon kept');

  statPills.classList.remove('hidden');
  pillWaiting.textContent = t('pillWaiting', { count: counts.waiting }, `Waiting ${counts.waiting}`);
  pillWaiting.classList.toggle('active', counts.waiting > 0);

  pillUnread.textContent = t('pillUnread', { count: counts.unread }, `Unread ${counts.unread}`);
  pillUnread.classList.toggle('active', counts.unread > 0);

  pillRunning.textContent = t('pillRunning', { count: counts.running }, `Running ${counts.running}`);
  pillRunning.classList.toggle('active', counts.running > 0);

  pillTotal.textContent = t('pillTotal', { projects: projCount, tasks: counts.total }, `${projCount} projects · ${counts.total} chats`);

  renderQuotaStrip(resp.telemetry || null);

  const showMarkRead = resp.enabled && (counts.unread > 0 || Boolean(resp.previewState));
  markAllReadBtn.classList.toggle('hidden', !showMarkRead);

  previewTag.classList.toggle('hidden', !resp.previewState);
  setToggleGroupState(previewButtons, (btn) => {
    const mode = btn.dataset.preview;
    return resp.previewState ? resp.previewState === mode : mode === 'clear';
  });

  projectsSection.classList.remove('hidden');
  renderProjectsTree(resp.projects, resp.telemetry || null);
}

function showNotAntigravityState() {
  currentPrimaryAction = 'open';
  statusDot.className = 'status-dot idle';
  statusDot.dataset.indicatorStyle = currentIndicatorStyle;
  statusLabel.textContent = t('notAgyTitle', {}, 'No open Antigravity tabs');
  statusReason.textContent = t(
    'notAgyReason',
    {},
    'Open antigravity.google.com in any tab to monitor project status from anywhere.'
  );
  statPills.classList.add('hidden');
  hideQuotaStrip();
  projectsSection.classList.add('hidden');
  markAllReadBtn.classList.add('hidden');
  actionBanner.classList.remove('hidden');
  primaryActionBtn.textContent = t('openAgyBtn', {}, 'Open antigravity.google.com');
}

function showNeedRefreshState() {
  currentPrimaryAction = 'reload';
  statusDot.className = 'status-dot waiting';
  statusDot.dataset.indicatorStyle = currentIndicatorStyle;
  statusLabel.textContent = t('needRefreshTitle', {}, 'Refresh tab to activate');
  statusReason.textContent = t(
    'needRefreshReason',
    {},
    'Extension updated to v2.9. Refresh the Antigravity tab once to enable status lights.'
  );
  statPills.classList.add('hidden');
  hideQuotaStrip();
  projectsSection.classList.add('hidden');
  markAllReadBtn.classList.add('hidden');
  actionBanner.classList.remove('hidden');
  primaryActionBtn.textContent = t('refreshNowBtn', {}, 'Refresh tab');
}

async function refreshCurrentTabStatus() {
  if (isRefreshingStatus) {
    pendingRefresh = true;
    return;
  }
  isRefreshingStatus = true;
  try {
    const [activeTabs, allTabs] = await Promise.all([
      chrome.tabs.query({ active: true, currentWindow: true }),
      chrome.tabs.query({})
    ]);

    const activeTab = activeTabs && activeTabs[0];
    if (activeTab && typeof activeTab.id === 'number') {
      currentActiveTabId = activeTab.id;
      if (typeof activeTab.windowId === 'number') {
        currentWindowId = activeTab.windowId;
      }
    } else {
      currentActiveTabId = null;
    }

    const candidateMap = new Map();
    for (const tab of allTabs || []) {
      if (!tab || typeof tab.id !== 'number') continue;
      if (isAntigravityUrl(tab.url || tab.pendingUrl || '')) {
        candidateMap.set(tab.id, tab);
      }
    }
    if (activeTab && typeof activeTab.id === 'number' && !candidateMap.has(activeTab.id)) {
      // Fallback probe on active tab because tab.url may be omitted in edge timing cases.
      candidateMap.set(activeTab.id, activeTab);
    }

    const candidates = Array.from(candidateMap.values()).sort(
      (a, b) =>
        (a.windowId ?? 0) - (b.windowId ?? 0) ||
        (a.index ?? 0) - (b.index ?? 0) ||
        a.id - b.id
    );

    const probeResults = await Promise.all(
      candidates.map(async (tab) => {
        const resp = await sendTopFrameMessage(tab.id, { type: 'GET_STATUS' });
        return { tab, resp };
      })
    );

    const nextLive = [];
    const nextStaleIds = [];
    const labelCounts = new Map();

    for (const { tab, resp } of probeResults) {
      if (resp && resp.ok) {
        const normalizedState = !resp.enabled
          ? 'idle'
          : resp.state === 'completed'
            ? 'unread'
            : resp.state || 'idle';
        const baseLabel =
          String(resp.remoteHost?.label || resp.workspaceLabel || resp.pageTitle || '').trim() ||
          t('fallbackWorkspaceName', {}, 'Workspace');
        labelCounts.set(baseLabel, (labelCounts.get(baseLabel) || 0) + 1);
        nextLive.push({
          tabId: tab.id,
          windowId: typeof tab.windowId === 'number' ? tab.windowId : null,
          index: typeof tab.index === 'number' ? tab.index : 0,
          baseLabel,
          label: baseLabel,
          state: normalizedState,
          resp
        });
      } else if (resp == null && isAntigravityUrl(tab.url || tab.pendingUrl || '')) {
        nextStaleIds.push(tab.id);
      }
    }

    const seenLabels = new Map();
    for (const inst of nextLive) {
      if ((labelCounts.get(inst.baseLabel) || 0) > 1) {
        const seq = (seenLabels.get(inst.baseLabel) || 0) + 1;
        seenLabels.set(inst.baseLabel, seq);
        inst.label = `${inst.baseLabel} #${seq}`;
      }
    }

    liveInstances = nextLive;
    staleTabIds = nextStaleIds;

    if (liveInstances.length === 0) {
      selectedInstanceKey = null;
      hasUserSelectedInstance = false;
      renderInstanceBar();
      if (staleTabIds.length > 0) {
        showNeedRefreshState();
      } else {
        showNotAntigravityState();
      }
      return;
    }

    if (liveInstances.length === 1) {
      selectedInstanceKey = liveInstances[0].tabId;
      hasUserSelectedInstance = false;
    } else {
      const stillValid =
        selectedInstanceKey === 'all' ||
        liveInstances.some((inst) => inst.tabId === selectedInstanceKey);
      if (!hasUserSelectedInstance || !stillValid) {
        selectedInstanceKey = liveInstances.some((inst) => inst.tabId === currentActiveTabId)
          ? currentActiveTabId
          : 'all';
      }
    }

    currentPrimaryAction = null;
    actionBanner.classList.add('hidden');
    renderInstanceBar();

    if (liveInstances.length >= 2 && selectedInstanceKey === 'all') {
      renderStatusUI(buildAggregatedResponse(liveInstances));
    } else {
      const selected =
        liveInstances.find((inst) => inst.tabId === selectedInstanceKey) || liveInstances[0];
      renderStatusUI(buildSingleInstanceResponse(selected));
    }
  } catch {
    // Ignore transient errors while popup closes.
  } finally {
    isRefreshingStatus = false;
    if (pendingRefresh) {
      pendingRefresh = false;
      void refreshCurrentTabStatus();
    }
  }
}

primaryActionBtn.addEventListener('click', () => {
  if (currentPrimaryAction === 'open') {
    chrome.tabs.create({ url: 'https://antigravity.google.com/' });
    if (!IS_SIDE_PANEL) window.close();
  } else if (currentPrimaryAction === 'reload' && staleTabIds.length > 0) {
    for (const tabId of staleTabIds) {
      try {
        chrome.tabs.reload(tabId);
      } catch {}
    }
    if (!IS_SIDE_PANEL) {
      window.close();
    } else {
      setTimeout(refreshCurrentTabStatus, 700);
      setTimeout(refreshCurrentTabStatus, 1400);
      setTimeout(refreshCurrentTabStatus, 2200);
    }
  }
});

chrome.storage.sync.get(
  {
    enabled: true,
    indicatorStyle: 'glow',
    iconLayout: 'standalone',
    badgeSize: 'standard',
    actionClickMode: 'popup',
    autoProbeCollapsed: false,
    showQuotaMetrics: true,
    showContextMetrics: true,
    showInPageCapsule: false,
    quotaNotifications: false,
    customWaitingSelector: '',
    customRunningSelector: ''
  },
  (cfg) => {
    void chrome.runtime.lastError;
    const safeCfg = cfg || {};
    enabledToggle.checked = Boolean(safeCfg.enabled);
    currentShowQuotaMetrics = safeCfg.showQuotaMetrics !== false;
    currentShowContextMetrics = safeCfg.showContextMetrics !== false;
    currentShowInPageCapsule = Boolean(safeCfg.showInPageCapsule);
    currentQuotaNotificationsPref = Boolean(safeCfg.quotaNotifications);
    syncQuotaNotifyBtnUI();
    if (showQuotaToggle) showQuotaToggle.checked = currentShowQuotaMetrics;
    if (showContextToggle) showContextToggle.checked = currentShowContextMetrics;
    if (showInPageCapsuleToggle) showInPageCapsuleToggle.checked = currentShowInPageCapsule;
    if (autoProbeCollapsedToggle) {
      autoProbeCollapsedToggle.checked = Boolean(safeCfg.autoProbeCollapsed);
    }
    waitingInput.value = safeCfg.customWaitingSelector || '';
    runningInput.value = safeCfg.customRunningSelector || '';

    const nextStyle = VALID_INDICATOR_STYLES.has(safeCfg.indicatorStyle) ? safeCfg.indicatorStyle : 'glow';
    const nextLayout = VALID_ICON_LAYOUTS.has(safeCfg.iconLayout) ? safeCfg.iconLayout : 'standalone';
    const nextSize = VALID_BADGE_SIZES.has(safeCfg.badgeSize) ? safeCfg.badgeSize : 'standard';
    const nextClickMode = VALID_CLICK_MODES.has(safeCfg.actionClickMode) ? safeCfg.actionClickMode : 'popup';
    syncStyleControls(nextStyle, nextLayout, nextSize);
    syncActionClickControls(nextClickMode);
    lastRenderedDigest = '';
    lastQuotaDigest = '';
    void refreshCurrentTabStatus();
  }
);

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (!changes) return;
  if (areaName === 'local') {
    let usageChanged = false;
    let pricingChanged = false;
    if (LEDGER_STORAGE_KEY in changes && PRICING_API?.normalizeLedger) {
      currentUsageLedger = PRICING_API.normalizeLedger(changes[LEDGER_STORAGE_KEY]?.newValue);
      usageChanged = true;
    }
    if (PRICING_CONFIG_STORAGE_KEY in changes && PRICING_API?.normalizePricingConfig) {
      currentPricingConfig = PRICING_API.normalizePricingConfig(
        changes[PRICING_CONFIG_STORAGE_KEY]?.newValue
      );
      pricingChanged = true;
      usageChanged = true;
    }
    if (MAGPIE_CONFIG_STORAGE_KEY in changes && PRICING_API?.normalizeMagpieConfig) {
      currentMagpieConfig = PRICING_API.normalizeMagpieConfig(
        changes[MAGPIE_CONFIG_STORAGE_KEY]?.newValue
      );
      syncMagpieControlStates();
      if (currentMagpieConfig.enabled && usageDrawer?.open) {
        void refreshMagpieSnapshot({ force: false });
      }
    }
    if (usageChanged) {
      syncUsageControlStates();
      renderUsageSummaryPill();
      usageDrawerBodyDirty = true;
      if (usageDrawer?.open) {
        renderUsageDrawerBody();
        if (currentMagpieConfig.enabled && latestMagpieSnapshot) {
          renderMagpieLiveCard(latestMagpieSnapshot);
        }
      }
    }
    if (pricingChanged && liveInstances.length > 0) {
      lastRenderedDigest = '';
      if (liveInstances.length >= 2 && selectedInstanceKey === 'all') {
        renderStatusUI(buildAggregatedResponse(liveInstances));
      } else {
        const selected =
          liveInstances.find((inst) => inst.tabId === selectedInstanceKey) || liveInstances[0];
        if (selected) renderStatusUI(buildSingleInstanceResponse(selected));
      }
    }
    return;
  }
  if (areaName !== 'sync') return;
  if ('enabled' in changes) {
    enabledToggle.checked = Boolean(changes.enabled.newValue);
  }
  if ('showQuotaMetrics' in changes) {
    currentShowQuotaMetrics = changes.showQuotaMetrics.newValue !== false;
    if (showQuotaToggle) showQuotaToggle.checked = currentShowQuotaMetrics;
    lastQuotaDigest = '';
    void refreshCurrentTabStatus();
  }
  if ('showContextMetrics' in changes) {
    currentShowContextMetrics = changes.showContextMetrics.newValue !== false;
    if (showContextToggle) showContextToggle.checked = currentShowContextMetrics;
    lastRenderedDigest = '';
    void refreshCurrentTabStatus();
  }
  if ('showInPageCapsule' in changes) {
    currentShowInPageCapsule = Boolean(changes.showInPageCapsule.newValue);
    if (showInPageCapsuleToggle) showInPageCapsuleToggle.checked = currentShowInPageCapsule;
  }
  if ('quotaNotifications' in changes) {
    currentQuotaNotificationsPref = Boolean(changes.quotaNotifications.newValue);
    syncQuotaNotifyBtnUI();
  }
  if ('autoProbeCollapsed' in changes && autoProbeCollapsedToggle) {
    autoProbeCollapsedToggle.checked = Boolean(changes.autoProbeCollapsed.newValue);
  }
  if ('indicatorStyle' in changes || 'iconLayout' in changes || 'badgeSize' in changes) {
    syncStyleControls(
      changes.indicatorStyle?.newValue || null,
      changes.iconLayout?.newValue || null,
      changes.badgeSize?.newValue || null
    );
  }
  if ('actionClickMode' in changes) {
    syncActionClickControls(changes.actionClickMode.newValue);
  }
});

enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked }, () => {
    void chrome.runtime.lastError;
    setTimeout(refreshCurrentTabStatus, 80);
  });
});

if (showQuotaToggle) {
  showQuotaToggle.addEventListener('change', () => {
    currentShowQuotaMetrics = showQuotaToggle.checked;
    lastQuotaDigest = '';
    chrome.storage.sync.set({ showQuotaMetrics: currentShowQuotaMetrics }, () => {
      void chrome.runtime.lastError;
      void refreshCurrentTabStatus();
    });
  });
}

if (showContextToggle) {
  showContextToggle.addEventListener('change', () => {
    currentShowContextMetrics = showContextToggle.checked;
    lastRenderedDigest = '';
    chrome.storage.sync.set({ showContextMetrics: currentShowContextMetrics }, () => {
      void chrome.runtime.lastError;
      void refreshCurrentTabStatus();
    });
  });
}

if (showInPageCapsuleToggle) {
  showInPageCapsuleToggle.addEventListener('change', () => {
    currentShowInPageCapsule = showInPageCapsuleToggle.checked;
    chrome.storage.sync.set({ showInPageCapsule: currentShowInPageCapsule }, () => {
      void chrome.runtime.lastError;
      void refreshCurrentTabStatus();
    });
  });
}

if (autoProbeCollapsedToggle) {
  autoProbeCollapsedToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoProbeCollapsed: autoProbeCollapsedToggle.checked }, () => {
      void chrome.runtime.lastError;
    });
  });
}

if (localhostAccessBtn) {
  localhostAccessBtn.addEventListener('click', async () => {
    if (!chrome.permissions) return;
    if (!localhostGranted) {
      const reqPromise = chrome.permissions.request({ origins: LOCALHOST_ORIGINS });
      try {
        const granted = await reqPromise;
        syncLocalhostBtnUI(granted);
        if (granted) {
          chrome.runtime.sendMessage(
            { type: 'SYNC_LOCALHOST_SCRIPTS', injectOpenTabs: true },
            () => {
              void chrome.runtime.lastError;
            }
          );
          announceFeedback(t('localhostGrantedFeedback', {}, 'Localhost enabled'), 2200);
          setTimeout(() => {
            lastRenderedDigest = '';
            lastQuotaDigest = '';
            void refreshCurrentTabStatus();
          }, 350);
        }
      } catch {}
    } else {
      try {
        const removed = await chrome.permissions.remove({ origins: LOCALHOST_ORIGINS });
        if (removed) {
          syncLocalhostBtnUI(false);
          chrome.runtime.sendMessage(
            { type: 'SYNC_LOCALHOST_SCRIPTS', injectOpenTabs: false },
            () => {
              void chrome.runtime.lastError;
            }
          );
          announceFeedback(t('localhostRevokedFeedback', {}, 'Localhost revoked'), 2200);
          lastRenderedDigest = '';
          lastQuotaDigest = '';
          void refreshCurrentTabStatus();
        } else {
          await refreshLocalhostPermissionState();
        }
      } catch {}
    }
  });
}

if (quotaNotifyBtn) {
  quotaNotifyBtn.addEventListener('click', async () => {
    if (!chrome.permissions) return;
    const currentlyActive = Boolean(currentQuotaNotificationsPref && notificationsPermGranted);
    if (!currentlyActive) {
      // Invoke chrome.permissions.request synchronously before any await to preserve user gesture.
      const reqPromise = chrome.permissions.request({ permissions: ['notifications'] });
      try {
        const granted = Boolean(await reqPromise);
        notificationsPermGranted = granted;
        currentQuotaNotificationsPref = granted;
        syncQuotaNotifyBtnUI();
        await chrome.storage.sync.set({ quotaNotifications: granted });
        if (granted) {
          chrome.runtime.sendMessage(
            { type: 'SYNC_QUOTA_NOTIFICATIONS_STATE', seedBaseline: true },
            () => {
              void chrome.runtime.lastError;
            }
          );
          announceFeedback(t('quotaNotifyEnabledFeedback', {}, 'Quota alerts enabled'), 2200);
        } else {
          announceFeedback(
            t('quotaNotifyDeniedFeedback', {}, 'Notification permission not granted'),
            2400
          );
        }
      } catch {
        await refreshNotificationPermissionState();
      }
    } else {
      currentQuotaNotificationsPref = false;
      syncQuotaNotifyBtnUI();
      try {
        await chrome.storage.sync.set({ quotaNotifications: false });
      } catch {}
      try {
        const removed = await chrome.permissions.remove({ permissions: ['notifications'] });
        if (removed) notificationsPermGranted = false;
      } catch {}
      syncQuotaNotifyBtnUI();
      chrome.runtime.sendMessage({ type: 'CLEAR_QUOTA_NOTIFICATIONS' }, () => {
        void chrome.runtime.lastError;
      });
      announceFeedback(t('quotaNotifyDisabledFeedback', {}, 'Quota alerts disabled'), 2200);
    }
  });
}

if (syncCollapsedBtn) {
  syncCollapsedBtn.addEventListener('click', async () => {
    const targetTabIds = getTargetTabIds();
    if (targetTabIds.length === 0) return;
    syncCollapsedBtn.classList.add('is-syncing');
    if (syncCollapsedLabel) syncCollapsedLabel.textContent = t('syncingBtn', {}, 'Syncing...');
    for (const tabId of targetTabIds) {
      sendTopFrameMessage(tabId, { type: 'PROBE_COLLAPSED' });
      chrome.runtime.sendMessage(
        {
          type: 'PROBE_COLLAPSED_BROADCAST',
          tabId
        },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }
    setTimeout(() => {
      lastRenderedDigest = '';
      refreshCurrentTabStatus();
    }, 450);
    setTimeout(() => {
      syncCollapsedBtn.classList.remove('is-syncing');
      if (syncCollapsedLabel) syncCollapsedLabel.textContent = t('syncBtn', {}, 'Sync');
      lastRenderedDigest = '';
      refreshCurrentTabStatus();
    }, 950);
  });
}

for (const btn of filterButtons) {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    setToggleGroupState(filterButtons, (b) => b === btn);
    lastRenderedDigest = '';
    refreshCurrentTabStatus();
  });
}

markAllReadBtn.addEventListener('click', async () => {
  const targetTabIds = getTargetTabIds();
  if (targetTabIds.length === 0) return;
  await Promise.all(targetTabIds.map((tabId) => sendTopFrameMessage(tabId, { type: 'MARK_ALL_READ' })));
  lastRenderedDigest = '';
  await refreshCurrentTabStatus();
});

for (const btn of indicatorStyleButtons) {
  btn.addEventListener('click', () => {
    const nextStyle = btn.dataset.style;
    if (!VALID_INDICATOR_STYLES.has(nextStyle)) return;
    syncStyleControls(nextStyle, null, null);
    chrome.storage.sync.set({ indicatorStyle: nextStyle }, () => {
      void chrome.runtime.lastError;
      setTimeout(refreshCurrentTabStatus, 80);
    });
  });
}

for (const btn of iconLayoutButtons) {
  btn.addEventListener('click', () => {
    const nextLayout = btn.dataset.layout;
    if (!VALID_ICON_LAYOUTS.has(nextLayout)) return;
    syncStyleControls(null, nextLayout, null);
    chrome.storage.sync.set({ iconLayout: nextLayout }, () => {
      void chrome.runtime.lastError;
      setTimeout(refreshCurrentTabStatus, 80);
    });
  });
}

for (const btn of sizeButtons) {
  btn.addEventListener('click', () => {
    const nextSize = btn.dataset.size;
    if (!VALID_BADGE_SIZES.has(nextSize)) return;
    syncStyleControls(null, null, nextSize);
    chrome.storage.sync.set({ badgeSize: nextSize }, () => {
      void chrome.runtime.lastError;
      setTimeout(refreshCurrentTabStatus, 80);
    });
  });
}

for (const btn of actionClickButtons) {
  btn.addEventListener('click', () => {
    const nextMode = btn.dataset.clickMode;
    if (!VALID_CLICK_MODES.has(nextMode)) return;
    syncActionClickControls(nextMode);
    chrome.storage.sync.set({ actionClickMode: nextMode }, () => {
      void chrome.runtime.lastError;
      announceFeedback(t('feedbackSaved', {}, 'Saved'), 1800);
    });
  });
}

for (const btn of previewButtons) {
  btn.addEventListener('click', async () => {
    const targetTabIds = getTargetTabIds();
    if (targetTabIds.length === 0) return;
    const mode = btn.dataset.preview;
    const state = mode === 'clear' ? null : mode;
    await Promise.all(
      targetTabIds.map((tabId) => sendTopFrameMessage(tabId, { type: 'SET_PREVIEW', state }))
    );
    await refreshCurrentTabStatus();
  });
}

saveSelectorsBtn.addEventListener('click', () => {
  chrome.storage.sync.set(
    {
      customWaitingSelector: waitingInput.value.trim(),
      customRunningSelector: runningInput.value.trim()
    },
    () => {
      void chrome.runtime.lastError;
      announceFeedback(t('feedbackSaved', {}, 'Saved'), 1800);
      setTimeout(refreshCurrentTabStatus, 100);
    }
  );
});

inspectBtn.addEventListener('click', async () => {
  const targetTabIds = getTargetTabIds();
  if (targetTabIds.length === 0) return;
  const results = await Promise.all(
    targetTabIds.map((tabId) => sendTopFrameMessage(tabId, { type: 'INSPECT_PAGE' }))
  );
  const snapshots = results.filter((r) => r && r.ok && r.snapshot).map((r) => r.snapshot);
  if (snapshots.length > 0) {
    const payload =
      snapshots.length === 1
        ? snapshots[0]
        : { multiInstanceCount: snapshots.length, instances: snapshots };
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      announceFeedback(t('feedbackCopied', {}, 'Diagnostics copied'), 2000);
    } catch {
      announceFeedback(t('feedbackCopyFailed', {}, 'Copy failed'), 2000);
    }
  }
});

try {
  chrome.runtime?.onMessage?.addListener((message) => {
    if (message?.type === 'AGY_STATE_PUSH') {
      if (pushDebounceId !== null) clearTimeout(pushDebounceId);
      pushDebounceId = setTimeout(() => {
        pushDebounceId = null;
        void refreshCurrentTabStatus();
      }, 50);
    }
    return false;
  });
  chrome.tabs?.onActivated?.addListener(() => {
    void refreshCurrentTabStatus();
  });
  chrome.tabs?.onUpdated?.addListener((_tabId, changeInfo, tab) => {
    const candidateUrl = changeInfo.url || tab?.url || '';
    if (
      (changeInfo.url || changeInfo.status === 'complete') &&
      isAntigravityUrl(candidateUrl)
    ) {
      void refreshCurrentTabStatus();
    }
  });
  chrome.tabs?.onRemoved?.addListener(() => {
    void refreshCurrentTabStatus();
  });
  chrome.windows?.onFocusChanged?.addListener(() => {
    void refreshCurrentTabStatus();
  });
  chrome.permissions?.onAdded?.addListener(() => {
    void refreshLocalhostPermissionState();
    void refreshNotificationPermissionState();
    setTimeout(() => {
      void refreshCurrentTabStatus();
    }, 250);
  });
  chrome.permissions?.onRemoved?.addListener(() => {
    void refreshLocalhostPermissionState();
    void refreshNotificationPermissionState();
    lastRenderedDigest = '';
    lastQuotaDigest = '';
    void refreshCurrentTabStatus();
  });
} catch {}

void refreshLocalhostPermissionState();
void refreshNotificationPermissionState();
void loadUsageAndPricingState();
refreshCurrentTabStatus();
setInterval(refreshCurrentTabStatus, 1000);
setInterval(() => {
  if (
    currentMagpieConfig.enabled &&
    usageDrawer?.open &&
    document.visibilityState === 'visible'
  ) {
    void refreshMagpieSnapshot({ force: false });
  }
}, 30_000);

// ============================================================================
// P1 Token Usage Analytics Drawer, Offline Pricing Overrides & Export
// ============================================================================

function announceUsageFeedback(msg, durationMs = 2200) {
  if (!usageFeedback) return;
  usageFeedback.textContent = msg;
  if (usageFeedbackTimerId !== null) clearTimeout(usageFeedbackTimerId);
  usageFeedbackTimerId = setTimeout(() => {
    usageFeedbackTimerId = null;
    if (usageFeedback) usageFeedback.textContent = '';
  }, durationMs);
}

function getPeriodDisplayName(period) {
  if (period === '7d') return t('usagePeriod7d', {}, '7d');
  if (period === '30d') return t('usagePeriod30d', {}, '30d');
  return t('usagePeriodToday', {}, 'Today');
}

function syncUsageControlStates() {
  setToggleGroupState(usagePeriodButtons, (btn) => btn.dataset.period === currentUsagePeriod);
  setToggleGroupState(
    usageCurrencyButtons,
    (btn) => btn.dataset.currency === currentPricingConfig.currency
  );
  if (usdToCnyInput) {
    usdToCnyInput.value = String(currentPricingConfig.usdToCnyRate);
  }
  populateRateModelSelect();
  syncRateInputsForSelectedModel();
  renderActiveOverrideChips();
}

function renderUsageSummaryPill() {
  if (!usageSummaryPill || !PRICING_API) return;
  const todayAgg = PRICING_API.aggregateLedgerPeriod(
    currentUsageLedger,
    'today',
    Date.now(),
    currentPricingConfig
  );
  const tokensStr = formatTokenCount(todayAgg.totalTokens);
  if (todayAgg.totalCost !== null) {
    const costStr = PRICING_API.formatCostValue(
      todayAgg.totalCost,
      currentPricingConfig.currency,
      { approx: todayAgg.costApprox }
    );
    usageSummaryPill.textContent = t(
      'usageSummaryPillVal',
      { tokens: tokensStr, cost: costStr },
      `Today ${tokensStr} · ${costStr}`
    );
  } else {
    usageSummaryPill.textContent = t(
      'usageSummaryPillTokensOnly',
      { tokens: tokensStr },
      `Today ${tokensStr}`
    );
  }
}

function renderUsageTrendSvg(agg) {
  if (!usageTrendWrap || !PRICING_API) return;
  const buckets = Array.isArray(agg?.trendBuckets) ? agg.trendBuckets : [];
  const maxTokens = buckets.reduce((mx, b) => Math.max(mx, b.tokens || 0), 0);

  if (usageTrendTitle) {
    usageTrendTitle.textContent =
      currentUsagePeriod === 'today'
        ? t('usageTrend24hTitle', {}, '24h Hourly Trend')
        : t(
            'usageTrendDailyTitle',
            { days: currentUsagePeriod === '7d' ? 7 : 30 },
            `${currentUsagePeriod === '7d' ? 7 : 30}d Daily Trend`
          );
  }
  if (usageTrendPeak) {
    usageTrendPeak.textContent = maxTokens > 0 ? formatTokenCount(maxTokens) : '';
  }

  usageTrendWrap.textContent = '';
  const svgW = 240;
  const svgH = 52;
  const count = Math.max(1, buckets.length);
  const slotW = svgW / count;
  const gap = count >= 24 ? 1.5 : count >= 14 ? 2.5 : 6;
  const barW = Math.max(2, slotW - gap);

  const totalCostStr = PRICING_API.formatCostValue(
    agg.totalCost,
    currentPricingConfig.currency,
    { approx: agg.costApprox }
  );
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${svgW} ${svgH}`);
  svg.setAttribute('class', 'trend-svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    t(
      'usageTrendChartAria',
      {
        period: getPeriodDisplayName(currentUsagePeriod),
        tokens: formatTokenCount(agg.totalTokens),
        cost: totalCostStr
      },
      `${getPeriodDisplayName(currentUsagePeriod)} usage trend: ${formatTokenCount(agg.totalTokens)} tokens, ${totalCostStr}`
    )
  );

  for (let i = 0; i < buckets.length; i += 1) {
    const b = buckets[i];
    const toks = Math.max(0, b.tokens || 0);
    const barH = toks === 0 ? 1.5 : Math.max(4, Math.round((toks / maxTokens) * 48));
    const x = (i * slotW + (slotW - barW) / 2).toFixed(2);
    const y = (svgH - barH).toFixed(2);

    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', x);
    rect.setAttribute('y', y);
    rect.setAttribute('width', barW.toFixed(2));
    rect.setAttribute('height', barH.toFixed(2));
    rect.setAttribute('rx', count >= 24 ? '1' : '2');
    const isPeak = maxTokens > 0 && toks === maxTokens;
    rect.setAttribute(
      'class',
      toks === 0 ? 'trend-bar is-empty' : isPeak ? 'trend-bar is-peak' : 'trend-bar'
    );

    const bCostStr =
      b.cost !== null && b.cost !== undefined
        ? PRICING_API.formatCostValue(b.cost, currentPricingConfig.currency, { approx: b.cost > 0 })
        : '--';
    const bCallsStr = b.calls !== null && b.calls !== undefined ? b.calls : '-';
    const titleEl = document.createElementNS(SVG_NS, 'title');
    titleEl.textContent = t(
      'usageBucketTip',
      {
        label: b.label,
        tokens: formatTokenCount(toks),
        cost: bCostStr,
        calls: bCallsStr
      },
      `${b.label}: ${formatTokenCount(toks)} (${bCostStr} · ${bCallsStr} calls)`
    );
    rect.appendChild(titleEl);
    svg.appendChild(rect);
  }

  usageTrendWrap.appendChild(svg);
}

function renderUsageHeatmap(agg) {
  if (!usageHeatmapGrid || !PRICING_API) return;
  const days = Array.isArray(agg?.heatmapDays) ? agg.heatmapDays : [];
  const maxDayTokens = days.reduce((mx, d) => Math.max(mx, d.tokens || 0), 0);
  const activeDays = days.filter((d) => (d.tokens || 0) > 0).length;

  if (usageHeatmapMeta) {
    usageHeatmapMeta.textContent = `${activeDays}/28`;
  }

  usageHeatmapGrid.textContent = '';
  for (let i = 0; i < days.length; i += 1) {
    const d = days[i];
    const toks = Math.max(0, d.tokens || 0);
    let level = 0;
    if (toks > 0 && maxDayTokens > 0) {
      const ratio = toks / maxDayTokens;
      level = ratio > 0.75 ? 4 : ratio > 0.5 ? 3 : ratio > 0.25 ? 2 : 1;
    }
    const costStr = PRICING_API.formatCostValue(
      d.cost,
      currentPricingConfig.currency,
      { approx: Boolean(d.cost && d.cost > 0) }
    );
    const tipText = t(
      'usageBucketTip',
      {
        label: d.dateKey,
        tokens: formatTokenCount(toks),
        cost: costStr,
        calls: d.calls || 0
      },
      `${d.dateKey}: ${formatTokenCount(toks)} (${costStr} · ${d.calls || 0} calls)`
    );

    const cell = document.createElement('span');
    cell.className = 'heatmap-cell';
    cell.dataset.level = String(level);
    cell.title = tipText;
    cell.setAttribute('aria-label', tipText);
    usageHeatmapGrid.appendChild(cell);
  }
}

function renderUsageRankList(listEl, items, isProject = false, { convertFromUsd = false } = {}) {
  if (!listEl || !PRICING_API) return;
  listEl.textContent = '';
  const maxTok = items.reduce((mx, item) => Math.max(mx, item.totalTokens || 0), 0);
  const fx = convertFromUsd && currentPricingConfig.currency === 'CNY'
    ? currentPricingConfig.usdToCnyRate
    : 1;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const li = document.createElement('li');
    li.className = 'usage-rank-item';

    const head = document.createElement('div');
    head.className = 'rank-item-head';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'rank-item-name';
    const dispName =
      isProject && item.key === '__unassigned__'
        ? t('usageUnassignedProject', {}, 'Unassigned')
        : item.label || item.name || item.key;
    nameSpan.textContent = dispName;
    nameSpan.title = dispName;

    const valSpan = document.createElement('span');
    valSpan.className = 'rank-item-val';
    const rawCost = convertFromUsd ? item.costUsd : item.cost;
    const dispCost = rawCost !== null && rawCost !== undefined ? rawCost * fx : null;
    const costStr = PRICING_API.formatCostValue(
      dispCost,
      currentPricingConfig.currency,
      { approx: Boolean(dispCost && dispCost > 0) }
    );
    valSpan.textContent = `${formatTokenCount(item.totalTokens)} · ${costStr}`;

    head.appendChild(nameSpan);
    head.appendChild(valSpan);

    const track = document.createElement('div');
    track.className = 'rank-bar-track';
    const fill = document.createElement('div');
    fill.className = 'rank-bar-fill';
    const pct = maxTok > 0 ? Math.max(4, Math.round((item.totalTokens / maxTok) * 100)) : 0;
    fill.style.inlineSize = `${pct}%`;
    track.appendChild(fill);

    li.appendChild(head);
    li.appendChild(track);
    listEl.appendChild(li);
  }
}

function renderUsageDrawerBody() {
  if (!PRICING_API) return;
  usageDrawerBodyDirty = false;
  const agg = PRICING_API.aggregateLedgerPeriod(
    currentUsageLedger,
    currentUsagePeriod,
    Date.now(),
    currentPricingConfig
  );

  if (kpiTokensVal) kpiTokensVal.textContent = formatTokenCount(agg.totalTokens);
  if (kpiTokensSub) {
    kpiTokensSub.textContent = t(
      'usageKpiTokensSub',
      {
        input: formatTokenCount(agg.totals.in),
        cache: formatTokenCount(agg.totals.cr + agg.totals.cw),
        output: formatTokenCount(agg.totals.out + agg.totals.rs)
      },
      `In ${formatTokenCount(agg.totals.in)} · Cache ${formatTokenCount(agg.totals.cr + agg.totals.cw)} · Out ${formatTokenCount(agg.totals.out + agg.totals.rs)}`
    );
  }

  if (kpiCostVal) {
    kpiCostVal.textContent = PRICING_API.formatCostValue(
      agg.totalCost,
      currentPricingConfig.currency,
      { approx: agg.costApprox }
    );
  }
  if (kpiCostSub) {
    kpiCostSub.textContent = t(
      'usageKpiCallsSub',
      { calls: agg.totals.calls },
      `${agg.totals.calls} priced calls`
    );
  }

  if (kpiCacheVal) kpiCacheVal.textContent = `${agg.cacheHitRate}%`;
  if (kpiCacheSub) {
    const savedStr =
      agg.totalSaved === null
        ? '--'
        : PRICING_API.formatCostValue(agg.totalSaved, currentPricingConfig.currency, {
            approx: agg.totalSaved > 0
          });
    kpiCacheSub.textContent = t(
      'usageKpiCacheSavedSub',
      { saved: savedStr },
      `Saved ${savedStr}`
    );
  }

  if (kpiSpeedVal) {
    kpiSpeedVal.textContent = agg.avgTokPerSec !== null ? `${agg.avgTokPerSec} tok/s` : '--';
  }
  if (kpiSpeedSub) {
    const ttftStr = agg.avgTtftMs !== null ? formatStepLatency(agg.avgTtftMs) : '--';
    kpiSpeedSub.textContent = t('usageKpiTtftSub', { ttft: ttftStr }, `Avg TTFT ${ttftStr}`);
  }

  renderUsageTrendSvg(agg);
  renderUsageHeatmap(agg);

  const hasData = agg.totalTokens > 0;
  if (usageEmptyNote) {
    usageEmptyNote.classList.toggle('hidden', hasData);
    if (!hasData) {
      usageEmptyNote.textContent = t(
        'usageEmptyPeriod',
        {},
        'No exact token usage recorded in this period yet.'
      );
    }
  }
  if (usageRankGrid) {
    usageRankGrid.classList.toggle('hidden', !hasData);
  }
  if (hasData) {
    renderUsageRankList(usageTopModelsList, agg.topModels, false);
    renderUsageRankList(usageTopProjectsList, agg.topProjects, true);
  }
}

function populateRateModelSelect() {
  if (!rateModelSelect || !PRICING_API) return;
  const prevVal = rateModelSelect.value;
  rateModelSelect.textContent = '';

  const catalogKeys = new Set();
  for (const m of PRICING_API.CATALOG_MODELS) {
    catalogKeys.add(m.canonicalKey);
    const opt = document.createElement('option');
    opt.value = m.canonicalKey;
    const hasOverride = Boolean(currentPricingConfig.overrides?.[m.canonicalKey]);
    opt.textContent = hasOverride ? `${m.label} ★` : m.label;
    rateModelSelect.appendChild(opt);
  }

  for (const customKey of Object.keys(currentPricingConfig.overrides || {})) {
    if (catalogKeys.has(customKey)) continue;
    const opt = document.createElement('option');
    opt.value = customKey;
    opt.textContent = `${customKey} ★`;
    rateModelSelect.appendChild(opt);
  }

  const customOpt = document.createElement('option');
  customOpt.value = '__custom__';
  customOpt.textContent = t('usageRateCustomOption', {}, 'Custom model ID...');
  rateModelSelect.appendChild(customOpt);

  if (prevVal && Array.from(rateModelSelect.options).some((o) => o.value === prevVal)) {
    rateModelSelect.value = prevVal;
  } else if (rateModelSelect.options.length > 0) {
    rateModelSelect.selectedIndex = 0;
  }
}

function syncRateInputsForSelectedModel() {
  if (!rateModelSelect || !PRICING_API) return;
  const sel = rateModelSelect.value;
  const isCustom = sel === '__custom__';
  if (rateCustomModelInput) {
    rateCustomModelInput.classList.toggle('hidden', !isCustom);
  }

  const hasOverride = !isCustom && Boolean(currentPricingConfig.overrides?.[sel]);
  if (resetRateOverrideBtn) {
    resetRateOverrideBtn.classList.toggle('hidden', !hasOverride);
  }

  if (isCustom) {
    if (rateInInput) rateInInput.value = '';
    if (rateCrInput) rateCrInput.value = '';
    if (rateCw5mInput) rateCw5mInput.value = '';
    if (rateCw1hInput) rateCw1hInput.value = '';
    if (rateOutInput) rateOutInput.value = '';
    return;
  }

  const effRate =
    currentPricingConfig.overrides?.[sel] || PRICING_API.STATIC_CATALOG?.[sel] || null;
  if (effRate) {
    if (rateInInput) rateInInput.value = String(effRate.in);
    if (rateCrInput) rateCrInput.value = String(effRate.cacheRead);
    if (rateCw5mInput) rateCw5mInput.value = String(effRate.cacheWrite5m ?? effRate.cacheWrite ?? effRate.in);
    if (rateCw1hInput) rateCw1hInput.value = String(effRate.cacheWrite1h ?? effRate.cacheWrite ?? effRate.in);
    if (rateOutInput) rateOutInput.value = String(effRate.out);
  }
}

function renderActiveOverrideChips() {
  if (!activeOverridesList || !PRICING_API) return;
  const entries = Object.entries(currentPricingConfig.overrides || {});
  activeOverridesList.textContent = '';
  activeOverridesList.classList.toggle('hidden', entries.length === 0);

  for (const [key] of entries) {
    const label = PRICING_API.STATIC_CATALOG?.[key]?.label || key;
    const chip = document.createElement('span');
    chip.className = 'override-chip';

    const txt = document.createElement('span');
    txt.textContent = label;
    chip.appendChild(txt);

    const rmBtn = document.createElement('button');
    rmBtn.type = 'button';
    rmBtn.className = 'override-chip-remove';
    rmBtn.textContent = '×';
    rmBtn.setAttribute(
      'aria-label',
      t('usageRateRemoveAria', { model: label }, `Remove custom rate for ${label}`)
    );
    rmBtn.addEventListener('click', () => {
      void removeCustomOverride(key);
    });
    chip.appendChild(rmBtn);
    activeOverridesList.appendChild(chip);
  }
}

async function persistPricingConfig(nextConfig) {
  if (!PRICING_API) return;
  currentPricingConfig = PRICING_API.normalizePricingConfig(nextConfig);
  try {
    await chrome.storage.local.set({
      [PRICING_CONFIG_STORAGE_KEY]: currentPricingConfig
    });
  } catch {}
  syncUsageControlStates();
  renderUsageSummaryPill();
  if (usageDrawer?.open) {
    renderUsageDrawerBody();
    if (currentMagpieConfig.enabled && latestMagpieSnapshot) {
      renderMagpieLiveCard(latestMagpieSnapshot);
    }
  } else {
    usageDrawerBodyDirty = true;
  }
  if (liveInstances.length > 0) {
    lastRenderedDigest = '';
    if (liveInstances.length >= 2 && selectedInstanceKey === 'all') {
      renderStatusUI(buildAggregatedResponse(liveInstances));
    } else {
      const selected =
        liveInstances.find((inst) => inst.tabId === selectedInstanceKey) || liveInstances[0];
      if (selected) renderStatusUI(buildSingleInstanceResponse(selected));
    }
  }
}

async function removeCustomOverride(key) {
  const nextOverrides = { ...(currentPricingConfig.overrides || {}) };
  delete nextOverrides[key];
  await persistPricingConfig({ ...currentPricingConfig, overrides: nextOverrides });
  announceUsageFeedback(t('usageFeedbackRateSaved', {}, 'Pricing saved'));
}

async function loadUsageAndPricingState() {
  if (!PRICING_API || !chrome.storage?.local?.get) return;
  try {
    const res = await chrome.storage.local.get([
      LEDGER_STORAGE_KEY,
      PRICING_CONFIG_STORAGE_KEY,
      MAGPIE_CONFIG_STORAGE_KEY
    ]);
    currentUsageLedger = PRICING_API.normalizeLedger(res?.[LEDGER_STORAGE_KEY]);
    currentPricingConfig = PRICING_API.normalizePricingConfig(
      res?.[PRICING_CONFIG_STORAGE_KEY]
    );
    if (PRICING_API.normalizeMagpieConfig) {
      currentMagpieConfig = PRICING_API.normalizeMagpieConfig(
        res?.[MAGPIE_CONFIG_STORAGE_KEY]
      );
    }
  } catch {}
  syncUsageControlStates();
  syncMagpieControlStates();
  renderUsageSummaryPill();
  if (usageDrawer?.open) {
    renderUsageDrawerBody();
    if (currentMagpieConfig.enabled) {
      void refreshMagpieSnapshot({ force: false });
    }
  }
}

function triggerBlobDownload(contentStr, mimeType, filename) {
  const blob = new Blob([contentStr], { type: mimeType });
  const blobUrl = URL.createObjectURL(blob);
  activeExportBlobUrls.add(blobUrl);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename;
  a.rel = 'noopener';
  a.className = 'visually-hidden';
  document.body.appendChild(a);
  try {
    a.click();
  } finally {
    a.remove();
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      activeExportBlobUrls.delete(blobUrl);
    }, 1000);
  }
}

function hideClearConfirmation(restoreFocus = false) {
  if (clearConfirmTimerId !== null) {
    clearTimeout(clearConfirmTimerId);
    clearConfirmTimerId = null;
  }
  if (clearUsageConfirmWrap) clearUsageConfirmWrap.classList.add('hidden');
  if (clearUsageBtn) {
    clearUsageBtn.classList.remove('hidden');
    if (restoreFocus) clearUsageBtn.focus();
  }
}

if (usageDrawer) {
  usageDrawer.addEventListener('toggle', () => {
    if (usageDrawer.open) {
      if (usageDrawerBodyDirty) {
        renderUsageDrawerBody();
      }
      if (currentMagpieConfig.enabled) {
        void refreshMagpieSnapshot({ force: false });
      }
    }
  });
}

for (const btn of usagePeriodButtons) {
  btn.addEventListener('click', () => {
    const nextPeriod = btn.dataset.period;
    if (nextPeriod !== 'today' && nextPeriod !== '7d' && nextPeriod !== '30d') return;
    currentUsagePeriod = nextPeriod;
    setToggleGroupState(usagePeriodButtons, (b) => b === btn);
    renderUsageDrawerBody();
    if (currentMagpieConfig.enabled && usageDrawer?.open) {
      void refreshMagpieSnapshot({ force: false });
    }
  });
}

for (const btn of usageCurrencyButtons) {
  btn.addEventListener('click', () => {
    const nextCurrency = btn.dataset.currency === 'CNY' ? 'CNY' : 'USD';
    void persistPricingConfig({ ...currentPricingConfig, currency: nextCurrency });
  });
}

if (rateModelSelect) {
  rateModelSelect.addEventListener('change', () => {
    syncRateInputsForSelectedModel();
  });
}

if (saveRateOverrideBtn) {
  saveRateOverrideBtn.addEventListener('click', async () => {
    if (!PRICING_API) return;
    const rawFx = Number(usdToCnyInput?.value);
    if (!Number.isFinite(rawFx) || rawFx < 0.5 || rawFx > 50) {
      announceUsageFeedback(
        t('usageFeedbackRateInvalid', {}, 'Enter valid non-negative rates')
      );
      return;
    }

    let targetKey = rateModelSelect?.value || '';
    const allBlank = [
      rateInInput?.value,
      rateCrInput?.value,
      rateCw5mInput?.value,
      rateCw1hInput?.value,
      rateOutInput?.value
    ].every((v) => String(v ?? '').trim() === '');

    if (targetKey === '__custom__' && !String(rateCustomModelInput?.value || '').trim() && allBlank) {
      await persistPricingConfig({
        ...currentPricingConfig,
        usdToCnyRate: rawFx
      });
      announceUsageFeedback(t('usageFeedbackRateSaved', {}, 'Pricing saved'));
      return;
    }

    const rIn = Number(rateInInput?.value);
    const rCr = Number(rateCrInput?.value);
    const rCw5m = Number(rateCw5mInput?.value);
    const rCw1h = Number(rateCw1hInput?.value);
    const rOut = Number(rateOutInput?.value);
    const allNums = [rIn, rCr, rCw5m, rCw1h, rOut];
    const anyEmpty = [
      rateInInput?.value,
      rateCrInput?.value,
      rateCw5mInput?.value,
      rateCw1hInput?.value,
      rateOutInput?.value
    ].some((v) => String(v ?? '').trim() === '');

    if (
      anyEmpty ||
      allNums.some((n) => !Number.isFinite(n) || n < 0 || n > 10000)
    ) {
      announceUsageFeedback(
        t('usageFeedbackRateInvalid', {}, 'Enter valid non-negative rates')
      );
      return;
    }

    if (targetKey === '__custom__') {
      targetKey = String(rateCustomModelInput?.value || '')
        .trim()
        .toLowerCase()
        .slice(0, 80);
      if (!targetKey) {
        announceUsageFeedback(
          t('usageFeedbackRateInvalid', {}, 'Enter valid non-negative rates')
        );
        return;
      }
    }

    const nextOverrides = { ...(currentPricingConfig.overrides || {}) };
    const staticBase = PRICING_API.STATIC_CATALOG?.[targetKey] || null;
    const matchesStatic =
      staticBase &&
      !nextOverrides[targetKey] &&
      Math.abs(rIn - staticBase.in) < 1e-6 &&
      Math.abs(rCr - staticBase.cacheRead) < 1e-6 &&
      Math.abs(rCw5m - staticBase.cacheWrite5m) < 1e-6 &&
      Math.abs(rCw1h - staticBase.cacheWrite1h) < 1e-6 &&
      Math.abs(rOut - staticBase.out) < 1e-6;

    if (!matchesStatic) {
      nextOverrides[targetKey] = {
        in: rIn,
        cacheRead: rCr,
        cacheWrite: rCw5m,
        cacheWrite5m: rCw5m,
        cacheWrite1h: rCw1h,
        out: rOut
      };
    }

    await persistPricingConfig({
      ...currentPricingConfig,
      usdToCnyRate: rawFx,
      overrides: nextOverrides
    });
    if (rateModelSelect) {
      rateModelSelect.value = targetKey;
      syncRateInputsForSelectedModel();
    }
    announceUsageFeedback(t('usageFeedbackRateSaved', {}, 'Pricing saved'));
  });
}

if (resetRateOverrideBtn) {
  resetRateOverrideBtn.addEventListener('click', () => {
    const sel = rateModelSelect?.value || '';
    if (!sel || sel === '__custom__') return;
    void removeCustomOverride(sel);
  });
}

if (exportJsonBtn) {
  exportJsonBtn.addEventListener('click', () => {
    if (!PRICING_API) return;
    const now = Date.now();
    const dateKey = PRICING_API.formatLocalDateKey(now);
    const payload = PRICING_API.buildUsageExportJson(
      currentUsageLedger,
      currentPricingConfig,
      now
    );
    triggerBlobDownload(
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8',
      `antigravity-usage-${dateKey}.json`
    );
    announceUsageFeedback(t('usageFeedbackExportedJson', {}, 'JSON exported'));
  });
}

if (exportCsvBtn) {
  exportCsvBtn.addEventListener('click', () => {
    if (!PRICING_API) return;
    const dateKey = PRICING_API.formatLocalDateKey(Date.now());
    const csvStr = PRICING_API.buildUsageCsv(currentUsageLedger, currentPricingConfig);
    triggerBlobDownload(
      csvStr,
      'text/csv;charset=utf-8',
      `antigravity-usage-${dateKey}.csv`
    );
    announceUsageFeedback(t('usageFeedbackExportedCsv', {}, 'CSV exported'));
  });
}

if (clearUsageBtn) {
  clearUsageBtn.addEventListener('click', () => {
    clearUsageBtn.classList.add('hidden');
    if (clearUsageConfirmWrap) clearUsageConfirmWrap.classList.remove('hidden');
    clearUsageCancelBtn?.focus();
    if (clearConfirmTimerId !== null) clearTimeout(clearConfirmTimerId);
    clearConfirmTimerId = setTimeout(() => {
      clearConfirmTimerId = null;
      hideClearConfirmation(false);
    }, 6000);
  });
}

if (clearUsageCancelBtn) {
  clearUsageCancelBtn.addEventListener('click', () => {
    hideClearConfirmation(true);
  });
}

if (clearUsageConfirmWrap) {
  clearUsageConfirmWrap.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      hideClearConfirmation(true);
    }
  });
}

if (clearUsageConfirmBtn) {
  clearUsageConfirmBtn.addEventListener('click', async () => {
    hideClearConfirmation(false);
    try {
      const resp = await chrome.runtime.sendMessage({ type: 'CLEAR_USAGE_HISTORY' });
      if (PRICING_API?.createEmptyLedger) {
        currentUsageLedger = PRICING_API.createEmptyLedger(resp?.clearedAt || Date.now());
      }
    } catch {
      if (PRICING_API?.createEmptyLedger) {
        currentUsageLedger = PRICING_API.createEmptyLedger(Date.now());
      }
    }
    renderUsageSummaryPill();
    if (usageDrawer?.open) {
      renderUsageDrawerBody();
    } else {
      usageDrawerBodyDirty = true;
    }
    announceUsageFeedback(t('usageFeedbackCleared', {}, 'Usage history cleared'));
  });
}

window.addEventListener('pagehide', () => {
  for (const url of activeExportBlobUrls) {
    URL.revokeObjectURL(url);
  }
  activeExportBlobUrls.clear();
});

// ============================================================================
// P2 Optional Read-Only Local Magpie Gateway Integration
// ============================================================================

function announceMagpieFeedback(msg, durationMs = 2400) {
  if (!magpieFeedback) return;
  magpieFeedback.textContent = msg;
  if (magpieFeedbackTimerId !== null) clearTimeout(magpieFeedbackTimerId);
  magpieFeedbackTimerId = setTimeout(() => {
    magpieFeedbackTimerId = null;
    if (magpieFeedback) magpieFeedback.textContent = '';
  }, durationMs);
}

function formatUsdForDisplay(costUsd) {
  if (!PRICING_API?.formatCostValue) return '--';
  if (costUsd === null || costUsd === undefined || !Number.isFinite(costUsd)) return '--';
  const fx = currentPricingConfig.currency === 'CNY' ? currentPricingConfig.usdToCnyRate : 1;
  return PRICING_API.formatCostValue(costUsd * fx, currentPricingConfig.currency, {
    approx: costUsd > 0
  });
}

function syncMagpieControlStates() {
  const enabled = Boolean(currentMagpieConfig?.enabled);
  if (magpieToggleBtn) {
    magpieToggleBtn.textContent = enabled
      ? t('magpieDisableBtn', {}, 'Disable')
      : t('magpieEnableBtn', {}, 'Enable');
    magpieToggleBtn.setAttribute('aria-pressed', String(enabled));
  }
  if (magpieUrlInput && document.activeElement !== magpieUrlInput) {
    magpieUrlInput.value = currentMagpieConfig?.endpoint || 'http://127.0.0.1:3425';
  }
  if (magpieLiveCard) {
    magpieLiveCard.classList.toggle('hidden', !enabled);
  }
}

function renderMagpieLiveCard(snapshot) {
  if (!magpieLiveCard) return;
  if (!currentMagpieConfig?.enabled) {
    magpieLiveCard.classList.add('hidden');
    return;
  }
  magpieLiveCard.classList.remove('hidden');

  const online = Boolean(snapshot?.reachable);
  if (magpieStatusPill) {
    magpieStatusPill.textContent = online
      ? t('magpieStatusOnline', {}, 'Connected')
      : t('magpieStatusOffline', {}, 'Offline');
    magpieStatusPill.className = `magpie-status-pill ${online ? 'is-online' : 'is-offline'}`;
  }

  if (!online) {
    if (magpieSummaryLine) {
      magpieSummaryLine.classList.add('hidden');
      magpieSummaryLine.textContent = '';
    }
    if (magpieAgentsSection) magpieAgentsSection.classList.add('hidden');
    if (magpieQuotasSection) magpieQuotasSection.classList.add('hidden');
    if (magpieOfflineNote) {
      magpieOfflineNote.classList.remove('hidden');
      const ep = snapshot?.endpoint || currentMagpieConfig.endpoint || 'http://127.0.0.1:3425';
      magpieOfflineNote.textContent =
        snapshot?.status === 'permission_missing'
          ? t('magpieFeedbackPermDenied', {}, 'Localhost permission required')
          : t('magpieOfflineNote', { endpoint: ep }, `No active Magpie gateway at ${ep}.`);
    }
    return;
  }

  if (magpieOfflineNote) {
    magpieOfflineNote.classList.add('hidden');
    magpieOfflineNote.textContent = '';
  }

  const usage = snapshot?.usage || null;
  if (magpieSummaryLine) {
    if (usage) {
      const tokensStr = formatTokenCount(usage.totalTokens || 0);
      const costStr = formatUsdForDisplay(usage.costUsd);
      const callsStr = String(usage.calls || 0);
      magpieSummaryLine.textContent = t(
        'magpieSummaryLine',
        { tokens: tokensStr, cost: costStr, calls: callsStr },
        `${tokensStr} tokens · ${costStr} · ${callsStr} reqs`
      );
      magpieSummaryLine.classList.remove('hidden');
    } else {
      magpieSummaryLine.classList.add('hidden');
      magpieSummaryLine.textContent = '';
    }
  }

  const agents = Array.isArray(usage?.byAgent) ? usage.byAgent : [];
  if (magpieAgentsSection && magpieAgentsList) {
    magpieAgentsSection.classList.toggle('hidden', agents.length === 0);
    if (agents.length > 0) {
      renderUsageRankList(magpieAgentsList, agents, false, { convertFromUsd: true });
    } else {
      magpieAgentsList.textContent = '';
    }
  }

  const quotas = Array.isArray(snapshot?.quotas) ? snapshot.quotas : [];
  if (magpieQuotasSection && magpieQuotasList) {
    magpieQuotasSection.classList.toggle('hidden', quotas.length === 0);
    magpieQuotasList.textContent = '';
    for (const q of quotas) {
      const pill = document.createElement('span');
      const pct = Math.max(0, Math.min(100, Number(q.remainingPct) || 0));
      const sevCls = pct <= 20 ? ' is-danger' : pct <= 50 ? ' is-warn' : '';
      pill.className = `magpie-quota-pill${sevCls}`;
      const winPart = q.windowLabel ? ` (${q.windowLabel})` : '';
      const pacePart =
        typeof q.paceRatio === 'number' && Number.isFinite(q.paceRatio)
          ? ` · ${q.paceRatio.toFixed(1)}x`
          : '';
      pill.textContent = `${q.label}${winPart}: ${pct}%${pacePart}`;
      magpieQuotasList.appendChild(pill);
    }
  }
}

async function refreshMagpieSnapshot({ force = false } = {}) {
  if (!currentMagpieConfig?.enabled) {
    latestMagpieSnapshot = null;
    syncMagpieControlStates();
    return;
  }
  syncMagpieControlStates();
  if (magpieRefreshBtn && force) {
    magpieRefreshBtn.classList.add('is-syncing');
  }
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'FETCH_MAGPIE_SNAPSHOT',
      period: currentUsagePeriod,
      force
    });
    latestMagpieSnapshot = resp || {
      ok: true,
      enabled: true,
      reachable: false,
      status: 'offline',
      endpoint: currentMagpieConfig.endpoint
    };
    renderMagpieLiveCard(latestMagpieSnapshot);
  } catch {
    latestMagpieSnapshot = {
      ok: true,
      enabled: true,
      reachable: false,
      status: 'offline',
      endpoint: currentMagpieConfig.endpoint
    };
    renderMagpieLiveCard(latestMagpieSnapshot);
  } finally {
    if (magpieRefreshBtn) {
      magpieRefreshBtn.classList.remove('is-syncing');
    }
  }
}

async function persistMagpieConfig(nextCfg) {
  if (!PRICING_API?.normalizeMagpieConfig) return;
  currentMagpieConfig = PRICING_API.normalizeMagpieConfig(nextCfg);
  try {
    await chrome.storage.local.set({ [MAGPIE_CONFIG_STORAGE_KEY]: currentMagpieConfig });
  } catch {}
  syncMagpieControlStates();
}

if (magpieToggleBtn) {
  magpieToggleBtn.addEventListener('click', async () => {
    if (!PRICING_API?.validateMagpieBaseUrl) return;
    if (!currentMagpieConfig.enabled) {
      const v = PRICING_API.validateMagpieBaseUrl(magpieUrlInput?.value);
      if (!v.ok) {
        announceMagpieFeedback(
          t(
            'magpieFeedbackInvalidUrl',
            {},
            'Use http://127.0.0.1:<port> or http://localhost:<port>'
          )
        );
        return;
      }
      if (!chrome.permissions?.request) return;
      // Invoke chrome.permissions.request synchronously before any await!
      const permPromise = chrome.permissions.request({ origins: LOCALHOST_ORIGINS });
      try {
        const granted = Boolean(await permPromise);
        if (!granted) {
          announceMagpieFeedback(
            t('magpieFeedbackPermDenied', {}, 'Localhost permission required')
          );
          return;
        }
        syncLocalhostBtnUI(true);
        chrome.runtime.sendMessage(
          { type: 'SYNC_LOCALHOST_SCRIPTS', injectOpenTabs: false },
          () => {
            void chrome.runtime.lastError;
          }
        );
        await persistMagpieConfig({ version: 1, enabled: true, endpoint: v.origin });
        void refreshMagpieSnapshot({ force: true });
      } catch {}
    } else {
      latestMagpieSnapshot = null;
      await persistMagpieConfig({
        version: 1,
        enabled: false,
        endpoint: currentMagpieConfig.endpoint
      });
      announceMagpieFeedback(t('magpieFeedbackDisabled', {}, 'Magpie sync disabled'));
    }
  });
}

if (magpieSaveUrlBtn) {
  magpieSaveUrlBtn.addEventListener('click', async () => {
    if (!PRICING_API?.validateMagpieBaseUrl) return;
    const v = PRICING_API.validateMagpieBaseUrl(magpieUrlInput?.value);
    if (!v.ok) {
      announceMagpieFeedback(
        t(
          'magpieFeedbackInvalidUrl',
          {},
          'Use http://127.0.0.1:<port> or http://localhost:<port>'
        )
      );
      return;
    }
    if (currentMagpieConfig.enabled && !localhostGranted && chrome.permissions?.request) {
      const permPromise = chrome.permissions.request({ origins: LOCALHOST_ORIGINS });
      try {
        const granted = Boolean(await permPromise);
        syncLocalhostBtnUI(granted);
      } catch {}
    }
    await persistMagpieConfig({
      version: 1,
      enabled: Boolean(currentMagpieConfig.enabled),
      endpoint: v.origin
    });
    announceMagpieFeedback(t('magpieFeedbackSaved', {}, 'Magpie endpoint saved'));
    if (currentMagpieConfig.enabled) {
      void refreshMagpieSnapshot({ force: true });
    }
  });
}

if (magpieRefreshBtn) {
  magpieRefreshBtn.addEventListener('click', () => {
    void refreshMagpieSnapshot({ force: true });
  });
}
