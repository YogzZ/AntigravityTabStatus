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
const waitingInput = document.getElementById('waitingSelector');
const runningInput = document.getElementById('runningSelector');
const saveSelectorsBtn = document.getElementById('saveSelectorsBtn');
const inspectBtn = document.getElementById('inspectBtn');
const saveFeedback = document.getElementById('saveFeedback');

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
let currentPrimaryAction = null; // 'open' | 'reload' | null
let lastRenderedDigest = '';
let lastQuotaDigest = '';
let lastInstanceBarDigest = '';
let feedbackTimerId = null;
let lastFeedbackText = '';
let isRefreshingStatus = false;

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
  let geminiPool = null;
  let geminiFetchedAt = -1;
  let premiumPool = null;
  let premiumFetchedAt = -1;
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
      if (
        pools.gemini &&
        typeof pools.gemini.remainingFraction === 'number' &&
        (!geminiPool || fetchedAt >= geminiFetchedAt)
      ) {
        geminiPool = pools.gemini;
        geminiFetchedAt = fetchedAt;
      }
      if (
        pools.premium &&
        typeof pools.premium.remainingFraction === 'number' &&
        (!premiumPool || fetchedAt >= premiumFetchedAt)
      ) {
        premiumPool = pools.premium;
        premiumFetchedAt = fetchedAt;
      }
    }

    const convs = tel.conversations;
    if (convs && typeof convs === 'object') {
      for (const [convId, conv] of Object.entries(convs)) {
        if (!conv || typeof conv !== 'object') continue;
        const prev = convMeta.get(convId);
        const isExact = conv.precision === 'exact';
        const prevExact = prev ? prev.precision === 'exact' : false;
        if (
          !prev ||
          (isExact && !prevExact) ||
          (isExact === prevExact && fetchedAt >= prev.fetchedAt)
        ) {
          mergedConversations[convId] = conv;
          convMeta.set(convId, { precision: conv.precision, fetchedAt });
        }
      }
    }
  }

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

  const normalized = entries.map(({ key, label, pool }) => {
    const frac = Math.max(0, Math.min(1, Number(pool.remainingFraction)));
    const remainPct = Math.round(frac * 100);
    const healthClass = remainPct <= 20 ? 'is-danger' : remainPct <= 50 ? 'is-warn' : '';
    const resetText = formatQuotaReset(pool.resetTimeMs);
    const metaText = resetText ? `${remainPct}% · ${resetText}` : `${remainPct}%`;
    return {
      key,
      label,
      remainPct,
      healthClass,
      metaText,
      sampleLabel: typeof pool.sampleLabel === 'string' ? pool.sampleLabel : ''
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
    if (item.sampleLabel) {
      itemEl.title = item.sampleLabel;
    }

    const headEl = document.createElement('div');
    headEl.className = 'quota-head';

    const labelEl = document.createElement('span');
    labelEl.className = 'quota-label';
    labelEl.textContent = item.label;

    const metaEl = document.createElement('span');
    metaEl.className = item.healthClass ? `quota-meta ${item.healthClass}` : 'quota-meta';
    metaEl.textContent = item.metaText;

    headEl.appendChild(labelEl);
    headEl.appendChild(metaEl);

    const progressEl = document.createElement('progress');
    progressEl.className = item.healthClass ? `quota-progress ${item.healthClass}` : 'quota-progress';
    progressEl.max = 100;
    progressEl.value = item.remainPct;
    progressEl.setAttribute('aria-label', `${item.label}: ${item.metaText}`);

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

function createJumpButton(inst) {
  const jumpBtn = document.createElement('button');
  jumpBtn.type = 'button';
  jumpBtn.className = 'instance-jump-btn';
  jumpBtn.title = t('switchToTabTitle', {}, 'Jump to this Antigravity browser tab');

  const labelSpan = document.createElement('span');
  labelSpan.textContent = t('switchToTabBtn', {}, 'Switch tab');

  const glyphSpan = document.createElement('span');
  glyphSpan.className = 'jump-glyph';
  glyphSpan.setAttribute('aria-hidden', 'true');

  jumpBtn.appendChild(labelSpan);
  jumpBtn.appendChild(glyphSpan);
  jumpBtn.addEventListener('click', () => activateBrowserTab(inst.tabId, inst.windowId));
  return jumpBtn;
}

function renderInstanceBar() {
  if (!instanceBarEl) return;

  if (
    liveInstances.length === 0 ||
    (liveInstances.length === 1 && liveInstances[0].tabId === currentActiveTabId)
  ) {
    if (lastInstanceBarDigest !== 'hidden') {
      lastInstanceBarDigest = 'hidden';
      instanceBarEl.classList.add('hidden');
      instanceBarEl.textContent = '';
    }
    return;
  }

  if (liveInstances.length === 1) {
    const inst = liveInstances[0];
    const connectedText = t('connectedInstanceLabel', { name: inst.label }, `Connected: ${inst.label}`);
    const switchBtnText = t('switchToTabBtn', {}, 'Switch tab');
    const switchBtnTitle = t('switchToTabTitle', {}, 'Jump to this Antigravity browser tab');
    const digest = JSON.stringify({
      mode: 'single',
      tabId: inst.tabId,
      windowId: inst.windowId,
      state: inst.state,
      connectedText,
      switchBtnText,
      switchBtnTitle
    });
    if (digest === lastInstanceBarDigest) return;
    lastInstanceBarDigest = digest;

    instanceBarEl.textContent = '';
    instanceBarEl.classList.remove('hidden');

    const mainWrap = document.createElement('div');
    mainWrap.className = 'instance-connected-main';

    const dotEl = document.createElement('span');
    dotEl.className = `instance-mini-dot ${inst.state}`;
    dotEl.setAttribute('aria-hidden', 'true');

    const textEl = document.createElement('span');
    textEl.className = 'instance-connected-label';
    textEl.textContent = connectedText;

    mainWrap.appendChild(dotEl);
    mainWrap.appendChild(textEl);
    instanceBarEl.appendChild(mainWrap);
    instanceBarEl.appendChild(createJumpButton(inst));
    return;
  }

  const allLabel = t('instanceAll', { count: liveInstances.length }, `All (${liveInstances.length})`);
  const barAria = t('instanceBarAria', {}, 'Open Antigravity instances');
  const selectedInst =
    selectedInstanceKey !== 'all'
      ? liveInstances.find((i) => i.tabId === selectedInstanceKey) || null
      : null;
  const showJump = Boolean(selectedInst && selectedInst.tabId !== currentActiveTabId);
  const digest = JSON.stringify({
    mode: 'multi',
    selected: selectedInstanceKey,
    showJump,
    allLabel,
    barAria,
    items: liveInstances.map((i) => ({
      tabId: i.tabId,
      windowId: i.windowId,
      label: i.label,
      state: i.state
    }))
  });
  if (digest === lastInstanceBarDigest) return;
  lastInstanceBarDigest = digest;

  instanceBarEl.textContent = '';
  instanceBarEl.classList.remove('hidden');

  const pillsGroup = document.createElement('div');
  pillsGroup.className = 'instance-pills';
  pillsGroup.setAttribute('role', 'group');
  pillsGroup.setAttribute('aria-label', barAria);

  const selectView = (nextKey) => {
    selectedInstanceKey = nextKey;
    hasUserSelectedInstance = true;
    lastRenderedDigest = '';
    lastQuotaDigest = '';
    renderInstanceBar();
    if (selectedInstanceKey === 'all') {
      renderStatusUI(buildAggregatedResponse(liveInstances));
    } else {
      const target = liveInstances.find((i) => i.tabId === selectedInstanceKey) || liveInstances[0];
      if (target) renderStatusUI(buildSingleInstanceResponse(target));
    }
  };

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = `instance-pill${selectedInstanceKey === 'all' ? ' active' : ''}`;
  allBtn.setAttribute('aria-pressed', String(selectedInstanceKey === 'all'));
  const allTextSpan = document.createElement('span');
  allTextSpan.className = 'instance-pill-text';
  allTextSpan.textContent = allLabel;
  allBtn.appendChild(allTextSpan);
  allBtn.addEventListener('click', () => selectView('all'));
  pillsGroup.appendChild(allBtn);

  for (const inst of liveInstances) {
    const isActive = selectedInstanceKey === inst.tabId;
    const pillBtn = document.createElement('button');
    pillBtn.type = 'button';
    pillBtn.className = `instance-pill${isActive ? ' active' : ''}`;
    pillBtn.setAttribute('aria-pressed', String(isActive));
    pillBtn.title = inst.label;

    const dotSpan = document.createElement('span');
    dotSpan.className = `instance-mini-dot ${inst.state}`;
    dotSpan.setAttribute('aria-hidden', 'true');

    const textSpan = document.createElement('span');
    textSpan.className = 'instance-pill-text';
    textSpan.textContent = inst.label;

    pillBtn.appendChild(dotSpan);
    pillBtn.appendChild(textSpan);
    pillBtn.addEventListener('click', () => selectView(inst.tabId));
    pillsGroup.appendChild(pillBtn);
  }

  instanceBarEl.appendChild(pillsGroup);
  if (showJump && selectedInst) {
    instanceBarEl.appendChild(createJumpButton(selectedInst));
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

function renderProjectsTree(projects, telemetry = null) {
  const safeProjects = Array.isArray(projects) ? projects : [];
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
          return {
            ...task,
            _resolvedTel:
              convTel && Number(convTel.contextUsed) > 0
                ? {
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
                    tokPerSec: Number(convTel.tokPerSec) || 0,
                    compressionDetected: Boolean(convTel.compressionDetected),
                    compressionDrop: Number(convTel.compressionDrop) || 0,
                    cacheReadTokens: Number(convTel.cacheReadTokens) || 0,
                    inputTokens: Number(convTel.inputTokens) || 0,
                    outputTokens: Number(convTel.outputTokens) || 0,
                    cacheHitRate: Number(convTel.cacheHitRate) || 0
                  }
                : null
          };
        })
      };
    })
    .filter((p) => (currentFilter === 'active' ? p.tasks.length > 0 : true));

  const digest = JSON.stringify({
    filter: currentFilter,
    showContextMetrics: currentShowContextMetrics,
    list: filteredProjects
  });
  if (digest === lastRenderedDigest) return;
  lastRenderedDigest = digest;

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

        const rowBtn = document.createElement('button');
        rowBtn.type = 'button';
        rowBtn.className = `task-row is-${task.state}`;

        const convTel = task._resolvedTel;
        const exactLine =
          convTel && convTel.precision === 'exact'
            ? t(
                'ctxExactBreakdown',
                {
                  cache: formatTokenCount(convTel.cacheReadTokens),
                  input: formatTokenCount(convTel.inputTokens),
                  output: formatTokenCount(convTel.outputTokens),
                  hit: Math.round(convTel.cacheHitRate)
                },
                `Cache ${formatTokenCount(convTel.cacheReadTokens)} · In ${formatTokenCount(convTel.inputTokens)} · Out ${formatTokenCount(convTel.outputTokens)} (${Math.round(convTel.cacheHitRate)}% hit)`
              )
            : '';

        if (task.reason && exactLine) {
          rowBtn.title = `${proj.projectName} › ${task.title}\n${task.reason}\n${exactLine}`;
        } else if (task.reason) {
          rowBtn.title = `${proj.projectName} › ${task.title}\n${task.reason}`;
        } else if (exactLine) {
          rowBtn.title = `${proj.projectName} › ${task.title}\n${exactLine}`;
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

        if (convTel) {
          const telRow = document.createElement('div');
          telRow.className = 'task-telemetry-row';

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

          itemLi.appendChild(telRow);
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
  if (isRefreshingStatus) return;
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
          String(resp.workspaceLabel || resp.pageTitle || '').trim() ||
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
  if (areaName !== 'sync' || !changes) return;
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
  chrome.tabs?.onActivated?.addListener(() => {
    void refreshCurrentTabStatus();
  });
  chrome.tabs?.onRemoved?.addListener(() => {
    void refreshCurrentTabStatus();
  });
  chrome.windows?.onFocusChanged?.addListener(() => {
    void refreshCurrentTabStatus();
  });
  chrome.permissions?.onAdded?.addListener(() => {
    void refreshLocalhostPermissionState();
    setTimeout(() => {
      void refreshCurrentTabStatus();
    }, 250);
  });
  chrome.permissions?.onRemoved?.addListener(() => {
    void refreshLocalhostPermissionState();
    lastRenderedDigest = '';
    lastQuotaDigest = '';
    void refreshCurrentTabStatus();
  });
} catch {}

void refreshLocalhostPermissionState();
refreshCurrentTabStatus();
setInterval(refreshCurrentTabStatus, 1000);
