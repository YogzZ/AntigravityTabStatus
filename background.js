/**
 * Antigravity Tab Status - Background Service Worker (v2.9.0)
 *
 * 1. 在扩展后台使用 OffscreenCanvas 解码原站 Favicon 像素，零页面 CSP 消耗。
 * 2. 提供免 CSP、免后台标签页节流的 Port 计时器（动画帧驱动 + 1.5s 完成防抖）。
 * 3. 转发子工作区 iframe 的多项目状态与遥测同步及任务点击跳转指令。
 * 4. 在 chrome.storage.session 中汇总所有 Antigravity 标签页的全局角标计数。
 * 5. 动态同步工具栏图标点击模式（快捷弹窗 / 常驻 Side Panel）。
 * 6. 按需动态注册并向已授权的 localhost / 127.0.0.1 本地工作区注入监测脚本。
 */

if (typeof importScripts === 'function') {
  importScripts('i18n.js', 'pricing.js');
}

const ALLOWED_FAVICON_HOST_RE = /(?:^|\.)(?:antigravity\.google(?:\.com)?|gstatic\.com)$/i;
const ANTIGRAVITY_TAB_HOST_RE = /(?:^|\.)antigravity\.google(?:\.com)?$/i;
const LOCALHOST_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];
const LOCALHOST_SCRIPT_IDS = ['agy-local-main', 'agy-local-top', 'agy-local-child'];
const SESSION_BADGE_KEY = 'agyTabBadges';
const LEDGER_STORAGE_KEY =
  globalThis.__AGY_PRICING__?.LEDGER_STORAGE_KEY || 'agyUsageLedgerV1';
const PRICING_CONFIG_STORAGE_KEY =
  globalThis.__AGY_PRICING__?.PRICING_CONFIG_STORAGE_KEY || 'agyPricingConfigV1';
const NOTIF_STATE_STORAGE_KEY =
  globalThis.__AGY_PRICING__?.NOTIF_STATE_STORAGE_KEY || 'agyNotifStateV1';
const MAGPIE_CONFIG_STORAGE_KEY =
  globalThis.__AGY_PRICING__?.MAGPIE_CONFIG_STORAGE_KEY || 'agyMagpieConfigV1';
const MAGPIE_CACHE_SESSION_KEY =
  globalThis.__AGY_PRICING__?.MAGPIE_CACHE_SESSION_KEY || 'agyMagpieCacheV1';

const MAGPIE_FETCH_TIMEOUT_MS = 1800;
const MAGPIE_POLL_THROTTLE_MS = 30_000;
const MAGPIE_FORCE_MIN_COOLDOWN_MS = 2_000;
const MAGPIE_MAX_BODY_CHARS = 512_000;
const VALID_MAGPIE_PERIODS = new Set(['today', '7d', '30d']);

let memoryBadgeFallback = {};
let memoryLedgerFallback = null;
let memoryNotifFallback = null;
let memoryMagpieCacheFallback = null;
let badgeSyncLock = Promise.resolve();
let localhostSyncLock = Promise.resolve();
let ledgerWriteLock = Promise.resolve();
let notifStateLock = Promise.resolve();
let notifListenersBound = false;

function t(key, vars = {}, fallback = '') {
  try {
    const res = globalThis.__AGY_I18N__?.t?.(key, vars);
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

function isLocalhostHostname(hostname) {
  const host = String(hostname || '').toLowerCase();
  return host === 'localhost' || host === '127.0.0.1';
}

function isAllowedFaviconUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length === 0 || rawUrl.length > 4096) {
    return false;
  }
  if (rawUrl.startsWith('data:image/')) {
    return true;
  }
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:' && ALLOWED_FAVICON_HOST_RE.test(parsed.hostname)) {
      return true;
    }
    return parsed.protocol === 'http:' && isLocalhostHostname(parsed.hostname);
  } catch {
    return false;
  }
}

function isAntigravityUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl) return false;
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol === 'https:') {
      return ANTIGRAVITY_TAB_HOST_RE.test(parsed.hostname);
    }
    if (parsed.protocol === 'http:') {
      return isLocalhostHostname(parsed.hostname);
    }
    return false;
  } catch {
    return false;
  }
}

function isExtensionSurfaceSender(sender) {
  if (!sender || typeof sender !== 'object') return false;
  if (sender.id && chrome.runtime?.id && sender.id !== chrome.runtime.id) {
    return false;
  }
  if (!sender.tab) return true;
  try {
    const extPrefix = chrome.runtime.getURL('');
    return typeof sender.url === 'string' && sender.url.startsWith(extPrefix);
  } catch {
    return false;
  }
}

async function hasLocalhostPermission() {
  try {
    if (!chrome.permissions?.contains) return false;
    return Boolean(await chrome.permissions.contains({ origins: LOCALHOST_ORIGINS }));
  } catch {
    return false;
  }
}

async function hasNotificationsPermission() {
  try {
    if (!chrome.permissions?.contains) return false;
    return Boolean(await chrome.permissions.contains({ permissions: ['notifications'] }));
  } catch {
    return false;
  }
}

function formatNotifDuration(ms) {
  const totalMins = Math.max(1, Math.round((Number(ms) || 0) / 60000));
  const hrs = Math.floor(totalMins / 60);
  const mins = totalMins % 60;
  return hrs > 0 ? (mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`) : `${totalMins}m`;
}

function getNotifPoolDisplayName(poolKey) {
  return poolKey === 'premium'
    ? t('quotaPoolPremium', {}, 'Claude / GPT')
    : t('quotaPoolGemini', {}, 'Gemini');
}

async function handleQuotaNotificationClick(notificationId) {
  if (!String(notificationId || '').startsWith('agy-quota-')) return;
  try {
    chrome.notifications?.clear?.(notificationId, () => {
      void chrome.runtime.lastError;
    });
  } catch {}

  let targetTab = null;
  try {
    const raw = await chrome.storage.local.get(NOTIF_STATE_STORAGE_KEY);
    const state = globalThis.__AGY_PRICING__?.normalizeNotifState?.(
      raw?.[NOTIF_STATE_STORAGE_KEY] ?? memoryNotifFallback
    );
    const srcTabId = state?.lastSourceTabId;
    if (typeof srcTabId === 'number' && srcTabId > 0) {
      const candidate = await getTabSafe(srcTabId);
      if (candidate && isAntigravityUrl(candidate.url || candidate.pendingUrl || '')) {
        targetTab = candidate;
      }
    }
  } catch {}

  if (!targetTab && chrome.tabs?.query) {
    try {
      const tabs = await chrome.tabs.query({});
      targetTab =
        (tabs || []).find((tab) => tab && isAntigravityUrl(tab.url || tab.pendingUrl || '')) ||
        null;
    } catch {}
  }

  if (targetTab && typeof targetTab.id === 'number') {
    try {
      await chrome.tabs.update(targetTab.id, { active: true });
      if (typeof targetTab.windowId === 'number' && chrome.windows?.update) {
        await chrome.windows.update(targetTab.windowId, { focused: true });
      }
    } catch {}
    return;
  }

  try {
    await chrome.tabs?.create?.({ url: 'https://antigravity.google.com/' });
  } catch {}
}

function ensureNotificationListenersBound() {
  if (notifListenersBound) return;
  try {
    if (chrome.notifications?.onClicked?.addListener) {
      chrome.notifications.onClicked.addListener((notificationId) => {
        void handleQuotaNotificationClick(notificationId);
      });
      notifListenersBound = true;
    }
  } catch {}
}

async function enqueueNotifOp(mutatorFn) {
  const prev = notifStateLock;
  let release;
  notifStateLock = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await prev;
    const pricingApi = globalThis.__AGY_PRICING__;
    if (!pricingApi?.normalizeNotifState) {
      return { ok: false, error: 'pricing_missing' };
    }
    let rawState = memoryNotifFallback;
    try {
      const store = await chrome.storage.local.get(NOTIF_STATE_STORAGE_KEY);
      rawState = store?.[NOTIF_STATE_STORAGE_KEY] ?? memoryNotifFallback;
    } catch {}
    const state = pricingApi.normalizeNotifState(rawState);
    const res = await mutatorFn(state, pricingApi);
    if (res?.dirty) {
      const nextState = res.state || state;
      memoryNotifFallback = nextState;
      try {
        await chrome.storage.local.set({ [NOTIF_STATE_STORAGE_KEY]: nextState });
      } catch {}
    }
    return res;
  } finally {
    release();
  }
}

async function resetQuotaNotifState() {
  try {
    for (const id of [
      'agy-quota-back-gemini',
      'agy-quota-back-premium',
      'agy-quota-rem-gemini',
      'agy-quota-rem-premium'
    ]) {
      chrome.notifications?.clear?.(id, () => {
        void chrome.runtime.lastError;
      });
    }
  } catch {}
  return enqueueNotifOp((_state, pricingApi) => ({
    ok: true,
    dirty: true,
    state: pricingApi.createEmptyNotifState()
  }));
}

async function syncLocalhostContentScripts({ force = false } = {}) {
  const previousLock = localhostSyncLock;
  let releaseLock;
  localhostSyncLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;
    const granted = await hasLocalhostPermission();
    if (!chrome.scripting?.getRegisteredContentScripts) {
      return granted;
    }

    const existing = await chrome.scripting.getRegisteredContentScripts({
      ids: LOCALHOST_SCRIPT_IDS
    });
    const existingIds = Array.isArray(existing)
      ? existing.map((s) => s.id).filter(Boolean)
      : [];

    // Registered scripts persist across SW restarts; skip churn when already in the desired state.
    if (!force) {
      const allPresent = LOCALHOST_SCRIPT_IDS.every((id) => existingIds.includes(id));
      if (granted && allPresent) return true;
      if (!granted && existingIds.length === 0) return false;
    }

    if (existingIds.length > 0) {
      await chrome.scripting.unregisterContentScripts({ ids: existingIds });
    }

    if (!granted) {
      return false;
    }

    await chrome.scripting.registerContentScripts([
      {
        id: 'agy-local-main',
        matches: LOCALHOST_ORIGINS,
        js: ['page-bridge.js'],
        world: 'MAIN',
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: 'document_start'
      },
      {
        id: 'agy-local-top',
        matches: LOCALHOST_ORIGINS,
        js: ['i18n.js', 'pricing.js', 'scanner.js', 'content.js'],
        allFrames: false,
        runAt: 'document_idle'
      },
      {
        id: 'agy-local-child',
        matches: LOCALHOST_ORIGINS,
        js: ['i18n.js', 'pricing.js', 'scanner.js', 'frame-detector.js'],
        allFrames: true,
        matchOriginAsFallback: true,
        runAt: 'document_idle'
      }
    ]);
    return true;
  } catch {
    return false;
  } finally {
    releaseLock();
  }
}

async function injectLocalhostOpenTabs() {
  if (!chrome.tabs?.query || !chrome.scripting?.executeScript) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({ url: LOCALHOST_ORIGINS });
  } catch {
    return;
  }

  for (const tab of tabs || []) {
    if (!tab || typeof tab.id !== 'number') continue;
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['page-bridge.js'],
        world: 'MAIN'
      });
    } catch {}
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, frameIds: [0] },
        files: ['i18n.js', 'pricing.js', 'scanner.js', 'content.js']
      });
    } catch {}
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['i18n.js', 'pricing.js', 'scanner.js', 'frame-detector.js']
      });
    } catch {}
  }
}

async function syncActionClickBehavior() {
  try {
    const cfg = await chrome.storage.sync.get({ actionClickMode: 'popup' });
    const openSidePanel = cfg?.actionClickMode === 'sidepanel';
    if (chrome.sidePanel && typeof chrome.sidePanel.setPanelBehavior === 'function') {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: openSidePanel });
    }
    if (chrome.action && typeof chrome.action.setPopup === 'function') {
      await chrome.action.setPopup({ popup: openSidePanel ? '' : 'popup.html' });
    }
  } catch {
    // Ignore errors on Chromium builds lacking sidePanel.setPanelBehavior.
  }
}

async function readSessionBadges() {
  try {
    if (chrome.storage?.session?.get) {
      const res = await chrome.storage.session.get({ [SESSION_BADGE_KEY]: memoryBadgeFallback });
      const raw = res?.[SESSION_BADGE_KEY];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        memoryBadgeFallback = { ...raw };
        return { ...raw };
      }
    }
  } catch {}
  return { ...memoryBadgeFallback };
}

async function writeSessionBadges(nextMap) {
  memoryBadgeFallback = { ...nextMap };
  try {
    if (chrome.storage?.session?.set) {
      await chrome.storage.session.set({ [SESSION_BADGE_KEY]: nextMap });
    }
  } catch {}
}

function getTabSafe(tabId) {
  return new Promise((resolve) => {
    try {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError || !tab) {
          resolve(null);
          return;
        }
        resolve(tab);
      });
    } catch {
      resolve(null);
    }
  });
}

function applyActionBadge(count, hasWaiting) {
  const safeCount = Math.max(0, Number(count) || 0);
  const text = safeCount > 0 ? (safeCount > 99 ? '99+' : String(safeCount)) : '';
  const bgColor = hasWaiting ? '#EF4444' : '#10B981';

  try {
    chrome.action.setBadgeText({ text }, () => {
      void chrome.runtime.lastError;
    });
    if (safeCount > 0) {
      chrome.action.setBadgeBackgroundColor({ color: bgColor }, () => {
        void chrome.runtime.lastError;
      });
      if (typeof chrome.action.setBadgeTextColor === 'function') {
        chrome.action.setBadgeTextColor({ color: '#FFFFFF' }, () => {
          void chrome.runtime.lastError;
        });
      }
    }
  } catch {}
}

async function enqueueBadgeSync(mutatorFn) {
  const previousLock = badgeSyncLock;
  let releaseLock;
  badgeSyncLock = new Promise((resolve) => {
    releaseLock = resolve;
  });

  try {
    await previousLock;
    const map = await readSessionBadges();
    const trustedTabId = mutatorFn ? mutatorFn(map) : null;

    for (const key of Object.keys(map)) {
      const numId = Number(key);
      if (!Number.isInteger(numId) || numId <= 0) {
        delete map[key];
        continue;
      }
      if (typeof trustedTabId === 'number' && numId === trustedTabId) {
        continue;
      }
      const tab = await getTabSafe(numId);
      if (!tab || !isAntigravityUrl(tab.url || tab.pendingUrl || '')) {
        delete map[key];
      }
    }

    await writeSessionBadges(map);

    let globalCount = 0;
    let globalHasWaiting = false;
    for (const entry of Object.values(map)) {
      if (!entry || typeof entry !== 'object') continue;
      const entryCount = Math.max(0, Number(entry.count) || 0);
      globalCount += entryCount;
      if (entryCount > 0 && entry.hasWaiting) {
        globalHasWaiting = true;
      }
    }

    applyActionBadge(globalCount, globalHasWaiting);
  } catch {
  } finally {
    releaseLock();
  }
}

chrome.runtime.onInstalled.addListener(() => {
  void syncActionClickBehavior();
  // Force re-registration so updated script definitions replace persisted ones.
  void syncLocalhostContentScripts({ force: true });
  void enqueueBadgeSync(() => {});
});

if (chrome.permissions?.onAdded) {
  chrome.permissions.onAdded.addListener(() => {
    void syncLocalhostContentScripts();
    ensureNotificationListenersBound();
  });
}

if (chrome.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener((perms) => {
    void syncLocalhostContentScripts();
    void enqueueBadgeSync(() => {});
    void (async () => {
      const removedPerms = Array.isArray(perms?.permissions) ? perms.permissions : [];
      if (
        removedPerms.includes('notifications') ||
        (removedPerms.length === 0 && !(await hasNotificationsPermission()))
      ) {
        try {
          await chrome.storage.sync.set({ quotaNotifications: false });
        } catch {}
        await resetQuotaNotifState();
      }
    })();
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'sync' || !changes) return;
  if ('actionClickMode' in changes) {
    void syncActionClickBehavior();
  }
  if ('quotaNotifications' in changes && changes.quotaNotifications?.newValue === false) {
    void resetQuotaNotifState();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void enqueueBadgeSync((map) => {
    delete map[String(tabId)];
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' || 'url' in changeInfo) {
    const candidateUrl = tab?.url || tab?.pendingUrl || changeInfo.url || '';
    void enqueueBadgeSync((map) => {
      if (!map[String(tabId)]) return;
      if (
        (candidateUrl && !isAntigravityUrl(candidateUrl)) ||
        (changeInfo.status === 'loading' && changeInfo.url)
      ) {
        delete map[String(tabId)];
      }
    });
  }
});

ensureNotificationListenersBound();
void syncActionClickBehavior();
void syncLocalhostContentScripts();
void enqueueBadgeSync(() => {});

// 1. 免页面 CSP、免后台标签页节流的后台计时器通道
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'agy-timer') return;

  let animIntervalId = null;
  let pollIntervalId = null;
  const pendingTimeouts = new Map();

  const clearAll = () => {
    if (animIntervalId !== null) {
      clearInterval(animIntervalId);
      animIntervalId = null;
    }
    if (pollIntervalId !== null) {
      clearInterval(pollIntervalId);
      pollIntervalId = null;
    }
    for (const tid of pendingTimeouts.values()) {
      clearTimeout(tid);
    }
    pendingTimeouts.clear();
  };

  port.onMessage.addListener((msg) => {
    if (!msg || typeof msg !== 'object') return;

    if (msg.cmd === 'START_INTERVAL') {
      if (animIntervalId !== null) clearInterval(animIntervalId);
      const ms = Math.max(80, Number(msg.intervalMs) || 140);
      animIntervalId = setInterval(() => {
        try {
          port.postMessage({ type: 'TICK' });
        } catch {
          clearAll();
        }
      }, ms);
    } else if (msg.cmd === 'STOP_INTERVAL') {
      if (animIntervalId !== null) {
        clearInterval(animIntervalId);
        animIntervalId = null;
      }
    } else if (msg.cmd === 'START_POLL') {
      if (pollIntervalId !== null) clearInterval(pollIntervalId);
      const ms = Math.max(500, Number(msg.intervalMs) || 1000);
      pollIntervalId = setInterval(() => {
        try {
          port.postMessage({ type: 'POLL_TICK' });
        } catch {
          clearAll();
        }
      }, ms);
    } else if (msg.cmd === 'STOP_POLL') {
      if (pollIntervalId !== null) {
        clearInterval(pollIntervalId);
        pollIntervalId = null;
      }
    } else if (msg.cmd === 'SET_TIMEOUT') {
      const id = msg.id;
      if (pendingTimeouts.has(id)) {
        clearTimeout(pendingTimeouts.get(id));
      }
      const delay = Math.max(50, Number(msg.delayMs) || 1500);
      const tid = setTimeout(() => {
        pendingTimeouts.delete(id);
        try {
          port.postMessage({ type: 'TIMEOUT_FIRE', id });
        } catch {
          clearAll();
        }
      }, delay);
      pendingTimeouts.set(id, tid);
    } else if (msg.cmd === 'CLEAR_TIMEOUT') {
      const id = msg.id;
      if (pendingTimeouts.has(id)) {
        clearTimeout(pendingTimeouts.get(id));
        pendingTimeouts.delete(id);
      }
    }
  });

  port.onDisconnect.addListener(clearAll);
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || typeof message !== 'object') {
    return false;
  }

  if (message.type === 'SYNC_LOCALHOST_SCRIPTS') {
    if (!isExtensionSurfaceSender(sender)) {
      sendResponse({ ok: false, granted: false, error: 'forbidden' });
      return false;
    }
    (async () => {
      try {
        const granted = await syncLocalhostContentScripts();
        if (granted && message.injectOpenTabs) {
          await injectLocalhostOpenTabs();
        }
        sendResponse({ ok: true, granted });
      } catch (err) {
        sendResponse({
          ok: false,
          granted: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  // 2. 子工作区 iframe 全量同步至顶层页面 (frameId: 0)
  if (message.type === 'CHILD_FRAME_SYNC' && sender?.tab?.id && sender.frameId > 0) {
    chrome.tabs.sendMessage(
      sender.tab.id,
      {
        type: 'RELAYED_CHILD_SYNC',
        frameKey: message.frameUid || `frame-${sender.frameId}`,
        activePane: message.activePane,
        projects: message.projects,
        telemetry: message.telemetry || null,
        remoteHost: message.remoteHost || null,
        remoteHosts: Array.isArray(message.remoteHosts) ? message.remoteHosts : []
      },
      { frameId: 0 },
      () => {
        void chrome.runtime.lastError;
      }
    );
    sendResponse({ ok: true });
    return false;
  }

  // 2b. 子工作区 iframe 卸载时通知顶层页面移除陈旧快照
  if (message.type === 'CHILD_FRAME_UNLOAD' && sender?.tab?.id && sender.frameId > 0) {
    chrome.tabs.sendMessage(
      sender.tab.id,
      {
        type: 'RELAYED_CHILD_UNLOAD',
        frameKey: message.frameUid || `frame-${sender.frameId}`
      },
      { frameId: 0 },
      () => {
        void chrome.runtime.lastError;
      }
    );
    sendResponse({ ok: true });
    return false;
  }

  // 2c. 主动唤醒所有子工作区 iframe 立即推送最新快照
  if (message.type === 'PING_CHILD_FRAMES') {
    const tabId = sender?.tab?.id ?? message.tabId;
    if (tabId) {
      chrome.tabs.sendMessage(
        tabId,
        { type: 'SYNC_NOW_IN_FRAME' },
        () => {
          void chrome.runtime.lastError;
        }
      );
    }
    sendResponse({ ok: true });
    return false;
  }

  // 3. 更新扩展工具栏图标全局数字角标（汇总所有 Antigravity 标签页的待处理 + 未读数量）
  if (message.type === 'UPDATE_ACTION_BADGE') {
    const tabId = sender?.tab?.id ?? message.tabId;
    if (typeof tabId === 'number') {
      const count = Math.max(0, Number(message.count) || 0);
      const hasWaiting = Boolean(message.hasWaiting);
      try {
        chrome.action.setBadgeText({ tabId, text: null }, () => {
          void chrome.runtime.lastError;
        });
      } catch {}
      void enqueueBadgeSync((map) => {
        if (count > 0) {
          map[String(tabId)] = {
            count,
            hasWaiting,
            updatedAt: Date.now()
          };
        } else {
          delete map[String(tabId)];
        }
        return tabId;
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  // 3b. 顶层 Antigravity 页面卸载或跳离时移除该标签页角标计数
  if (message.type === 'TOP_FRAME_UNLOAD') {
    const tabId = sender?.tab?.id ?? message.tabId;
    if (typeof tabId === 'number') {
      void enqueueBadgeSync((map) => {
        delete map[String(tabId)];
      });
    }
    sendResponse({ ok: true });
    return false;
  }

  // 4. 从弹窗点击某个任务时，向该标签页所有框架广播定位点击指令（含已折叠项目自动展开参数）
  if (
    message.type === 'FOCUS_TASK_BROADCAST' &&
    isExtensionSurfaceSender(sender) &&
    message.tabId &&
    message.taskId
  ) {
    chrome.tabs.sendMessage(
      message.tabId,
      {
        type: 'FOCUS_TASK_IN_FRAME',
        taskId: message.taskId,
        projectName: message.projectName || '',
        taskTitle: message.taskTitle || ''
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
    sendResponse({ ok: true });
    return false;
  }

  // 4b. 手动触发所有框架对已折叠项目的展开快照同步
  if (
    message.type === 'PROBE_COLLAPSED_BROADCAST' &&
    isExtensionSurfaceSender(sender) &&
    message.tabId
  ) {
    chrome.tabs.sendMessage(
      message.tabId,
      {
        type: 'PROBE_COLLAPSED_IN_FRAME'
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
    sendResponse({ ok: true });
    return false;
  }

  // 4c. 从弹窗/侧边栏切换远程主机实例
  if (
    message.type === 'SWITCH_REMOTE_HOST_BROADCAST' &&
    isExtensionSurfaceSender(sender) &&
    message.tabId &&
    message.hostId
  ) {
    chrome.tabs.sendMessage(
      message.tabId,
      {
        type: 'SWITCH_REMOTE_HOST_IN_FRAME',
        hostId: String(message.hostId)
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
    sendResponse({ ok: true });
    return false;
  }

  // 5. 在后台使用 OffscreenCanvas 解码网站原图标为 64x64 RGBA 数组，彻底避开页面 img-src / connect-src CSP
  if (message.type === 'FETCH_FAVICON_PIXELS' && typeof message.url === 'string') {
    if (!sender?.tab?.id || !isAllowedFaviconUrl(message.url)) {
      sendResponse({ ok: false, error: 'Disallowed favicon URL' });
      return false;
    }
    const parsedSize = Number(message.size);
    const size = Number.isFinite(parsedSize)
      ? Math.max(16, Math.min(256, Math.round(parsedSize)))
      : 64;
    (async () => {
      try {
        if (message.url.startsWith('http://') && !(await hasLocalhostPermission())) {
          sendResponse({ ok: false, error: 'Localhost permission not granted' });
          return;
        }
        const response = await fetch(message.url, {
          credentials: 'omit',
          cache: 'force-cache'
        });
        if (!response.ok) {
          sendResponse({ ok: false, error: `HTTP ${response.status}` });
          return;
        }
        const blob = await response.blob();
        if (!blob || blob.size === 0) {
          sendResponse({ ok: false, error: 'Empty blob' });
          return;
        }
        const bitmap = await createImageBitmap(blob);
        const oc = new OffscreenCanvas(size, size);
        const ctx = oc.getContext('2d');
        ctx.clearRect(0, 0, size, size);
        ctx.drawImage(bitmap, 0, 0, size, size);
        bitmap.close();
        const imgData = ctx.getImageData(0, 0, size, size);
        sendResponse({
          ok: true,
          width: size,
          height: size,
          pixels: Array.from(imgData.data)
        });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  // 6. 高水位去重 Token 用量账本写入（串行互斥锁防并发覆盖 + 配额降级重试）
  if (message.type === 'INGEST_USAGE_DELTAS' && Array.isArray(message.batches)) {
    if (!sender?.tab?.id || (sender.tab.url && !isAntigravityUrl(sender.tab.url))) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    (async () => {
      try {
        const res = await enqueueLedgerOp((ledger, pricingCfg) => {
          const ingestRes = globalThis.__AGY_PRICING__.ingestLedgerBatches(
            ledger,
            message.batches,
            Date.now(),
            pricingCfg,
            message.projectHints || null
          );
          return {
            ok: true,
            dirty: Boolean(ingestRes?.dirty),
            addedCalls: ingestRes?.addedCalls || 0,
            addedTokens: ingestRes?.addedTokens || 0
          };
        });
        sendResponse(res || { ok: false, error: 'ledger_unavailable' });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  // 7. 清空本地用量历史并通知所有已打开标签页推进游标基线
  if (message.type === 'CLEAR_USAGE_HISTORY') {
    if (!isExtensionSurfaceSender(sender)) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    (async () => {
      try {
        const res = await enqueueLedgerOp((ledger) => {
          const clearedAt = Date.now();
          ledger.version = 1;
          ledger.clearedAt = clearedAt;
          ledger.updatedAt = clearedAt;
          ledger.watermarks = {};
          ledger.daily = {};
          return { ok: true, clearedAt, dirty: true };
        });
        if (res?.ok) {
          await broadcastLedgerCleared(res.clearedAt);
        }
        sendResponse(res || { ok: false });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  // 8. 可选桌面配额提醒（5h 配额恢复 / 重置前未使用余量提示）
  if (message.type === 'REPORT_QUOTA_SNAPSHOT') {
    if (!sender?.tab?.id || (sender.tab.url && !isAntigravityUrl(sender.tab.url))) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    (async () => {
      try {
        const syncCfg = await chrome.storage.sync.get({
          enabled: true,
          quotaNotifications: false
        });
        if (!syncCfg?.enabled || !syncCfg?.quotaNotifications) {
          sendResponse({ ok: true, skipped: 'disabled' });
          return;
        }
        if (!(await hasNotificationsPermission())) {
          sendResponse({ ok: true, skipped: 'no_permission' });
          return;
        }
        const res = await enqueueNotifOp((state, pricingApi) => {
          const evalRes = pricingApi.evaluateQuotaNotificationTransitions(
            state,
            {
              tabId: sender.tab.id,
              isTabHidden: Boolean(message.isTabHidden),
              fetchedAt: message.fetchedAt,
              quotaPools: message.quotaPools
            },
            Date.now()
          );
          return {
            ok: true,
            dirty: evalRes.dirty,
            state: evalRes.state,
            events: evalRes.events
          };
        });
        const events = Array.isArray(res?.events) ? res.events : [];
        if (events.length > 0 && chrome.notifications?.create) {
          ensureNotificationListenersBound();
          const iconUrl = chrome.runtime.getURL('icons/icon128.png');
          for (const ev of events) {
            const poolName = getNotifPoolDisplayName(ev.poolKey);
            const title =
              ev.type === 'allowance_back'
                ? t('notifAllowanceBackTitle', { pool: poolName }, `${poolName} Quota Restored`)
                : t('notifPreResetTitle', { pool: poolName }, `${poolName} Quota Refreshing Soon`);
            const body =
              ev.type === 'allowance_back'
                ? t(
                    'notifAllowanceBackBody',
                    { pct: ev.pct, pool: poolName },
                    `Your 5-hour ${poolName} allowance is available again (${ev.pct}% remaining).`
                  )
                : t(
                    'notifPreResetBody',
                    { pct: ev.pct, pool: poolName, time: formatNotifDuration(ev.timeLeftMs) },
                    `${ev.pct}% unused ${poolName} quota resets in ${formatNotifDuration(ev.timeLeftMs)}.`
                  );
            try {
              chrome.notifications.create(
                ev.notificationId,
                {
                  type: 'basic',
                  iconUrl,
                  title,
                  message: body
                },
                () => {
                  void chrome.runtime.lastError;
                }
              );
            } catch {}
          }
        }
        sendResponse({ ok: true, fired: events.length });
      } catch (err) {
        sendResponse({
          ok: false,
          error: err instanceof Error ? err.message : String(err)
        });
      }
    })();
    return true;
  }

  if (message.type === 'SYNC_QUOTA_NOTIFICATIONS_STATE') {
    if (!isExtensionSurfaceSender(sender)) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    ensureNotificationListenersBound();
    (async () => {
      if (message.seedBaseline) {
        await resetQuotaNotifState();
      }
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === 'CLEAR_QUOTA_NOTIFICATIONS') {
    if (!isExtensionSurfaceSender(sender)) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    (async () => {
      await resetQuotaNotifState();
      sendResponse({ ok: true });
    })();
    return true;
  }

  // 9. 可选只读本地 Magpie 网关聚合快照（30s 会话缓存 + 1.8s 超时 + 零账本污染）
  if (message.type === 'FETCH_MAGPIE_SNAPSHOT') {
    if (!isExtensionSurfaceSender(sender)) {
      sendResponse({ ok: false, error: 'forbidden' });
      return false;
    }
    (async () => {
      try {
        const res = await handleFetchMagpieSnapshot({
          period: message.period,
          force: Boolean(message.force)
        });
        sendResponse(res);
      } catch {
        sendResponse({ ok: true, enabled: false, reachable: false, status: 'offline' });
      }
    })();
    return true;
  }

  return false;
});

async function writeLedgerWithQuotaFallback(ledger) {
  try {
    await chrome.storage.local.set({ [LEDGER_STORAGE_KEY]: ledger });
    return { ok: true };
  } catch {
    try {
      globalThis.__AGY_PRICING__?.emergencyTrimLedger?.(ledger, {
        maxDays: 30,
        maxWatermarks: 100
      });
      await chrome.storage.local.set({ [LEDGER_STORAGE_KEY]: ledger });
      return { ok: true, trimmed: true };
    } catch {
      memoryLedgerFallback = ledger;
      return { ok: false, error: 'storage_quota' };
    }
  }
}

async function enqueueLedgerOp(mutatorFn) {
  const pricingApi = globalThis.__AGY_PRICING__;
  if (!pricingApi) {
    return { ok: false, error: 'pricing_missing' };
  }
  const prev = ledgerWriteLock;
  let release;
  ledgerWriteLock = new Promise((resolve) => {
    release = resolve;
  });
  try {
    await prev;
    const rawStore = await chrome.storage.local.get([
      LEDGER_STORAGE_KEY,
      PRICING_CONFIG_STORAGE_KEY
    ]);
    const ledger = pricingApi.normalizeLedger(
      rawStore?.[LEDGER_STORAGE_KEY] ?? memoryLedgerFallback
    );
    const pricingCfg = pricingApi.normalizePricingConfig(
      rawStore?.[PRICING_CONFIG_STORAGE_KEY]
    );
    const result = await mutatorFn(ledger, pricingCfg);
    if (result?.dirty) {
      pricingApi.pruneLedgerBeforeWrite(ledger, Date.now());
      memoryLedgerFallback = ledger;
      const writeRes = await writeLedgerWithQuotaFallback(ledger);
      if (!writeRes.ok) {
        return { ...result, ...writeRes };
      }
    }
    return result;
  } finally {
    release();
  }
}

async function broadcastLedgerCleared(clearedAt) {
  if (!chrome.tabs?.query || !chrome.tabs?.sendMessage) return;
  let tabs = [];
  try {
    tabs = await chrome.tabs.query({});
  } catch {
    return;
  }
  for (const tab of tabs || []) {
    if (!tab || typeof tab.id !== 'number') continue;
    const tabUrl = tab.url || tab.pendingUrl || '';
    if (!isAntigravityUrl(tabUrl)) continue;
    try {
      chrome.tabs.sendMessage(
        tab.id,
        { type: 'LEDGER_HISTORY_CLEARED', clearedAt },
        () => {
          void chrome.runtime.lastError;
        }
      );
    } catch {}
  }
}

async function readSessionMagpieCache() {
  try {
    if (chrome.storage?.session?.get) {
      const res = await chrome.storage.session.get(MAGPIE_CACHE_SESSION_KEY);
      const raw = res?.[MAGPIE_CACHE_SESSION_KEY];
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        memoryMagpieCacheFallback = raw;
        return raw;
      }
    }
  } catch {}
  return memoryMagpieCacheFallback && typeof memoryMagpieCacheFallback === 'object'
    ? memoryMagpieCacheFallback
    : {};
}

async function writeSessionMagpieCache(nextCache) {
  memoryMagpieCacheFallback = nextCache;
  try {
    if (chrome.storage?.session?.set) {
      await chrome.storage.session.set({ [MAGPIE_CACHE_SESSION_KEY]: nextCache });
    }
  } catch {}
}

async function fetchMagpieJson(url, timeoutMs = MAGPIE_FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timerId = setTimeout(() => {
    try {
      controller.abort();
    } catch {}
  }, timeoutMs);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      headers: { Accept: 'application/json' },
      signal: controller.signal
    });
    if (!resp.ok) {
      return { ok: false, httpStatus: resp.status, data: null };
    }
    const txt = await resp.text();
    if (!txt || txt.length > MAGPIE_MAX_BODY_CHARS) {
      return { ok: false, httpStatus: resp.status, data: null };
    }
    const parsed = JSON.parse(txt);
    return { ok: true, httpStatus: resp.status, data: parsed };
  } catch {
    return { ok: false, httpStatus: 0, data: null };
  } finally {
    clearTimeout(timerId);
  }
}

async function handleFetchMagpieSnapshot({ period = 'today', force = false } = {}) {
  const pricingApi = globalThis.__AGY_PRICING__;
  if (!pricingApi?.normalizeMagpieConfig || !pricingApi?.validateMagpieBaseUrl) {
    return { ok: false, enabled: false, reachable: false, status: 'pricing_missing' };
  }
  const rawCfg = await chrome.storage.local.get(MAGPIE_CONFIG_STORAGE_KEY).catch(() => ({}));
  const cfg = pricingApi.normalizeMagpieConfig(rawCfg?.[MAGPIE_CONFIG_STORAGE_KEY]);
  if (!cfg.enabled) {
    return { ok: true, enabled: false, reachable: false, status: 'disabled', endpoint: cfg.endpoint };
  }
  const v = pricingApi.validateMagpieBaseUrl(cfg.endpoint);
  if (!v.ok) {
    return { ok: false, enabled: false, reachable: false, status: 'invalid_endpoint' };
  }
  if (!(await hasLocalhostPermission())) {
    return {
      ok: true,
      enabled: true,
      reachable: false,
      status: 'permission_missing',
      endpoint: v.origin
    };
  }

  const validPeriod = VALID_MAGPIE_PERIODS.has(period) ? period : 'today';
  const now = Date.now();
  const cached = await readSessionMagpieCache();
  const sameEndpoint = cached?.endpoint === v.origin;
  const cachedPeriod = sameEndpoint ? cached?.periods?.[validPeriod] || null : null;

  if (cachedPeriod) {
    const age = now - (Number(cachedPeriod.fetchedAt) || 0);
    if ((!force && age < MAGPIE_POLL_THROTTLE_MS) || (force && age < MAGPIE_FORCE_MIN_COOLDOWN_MS)) {
      return {
        ok: true,
        enabled: true,
        reachable: Boolean(cachedPeriod.reachable),
        status: cachedPeriod.status || (cachedPeriod.reachable ? 'online' : 'offline'),
        endpoint: v.origin,
        period: validPeriod,
        fetchedAt: cachedPeriod.fetchedAt,
        usage: cachedPeriod.usage || null,
        quotas: Array.isArray(cached.quotas) ? cached.quotas : [],
        fromCache: true
      };
    }
  }

  const quotasCacheValid =
    !force &&
    sameEndpoint &&
    cached?.quotasStatus === 'online' &&
    now - (Number(cached?.quotasFetchedAt) || 0) < MAGPIE_POLL_THROTTLE_MS &&
    Array.isArray(cached?.quotas);

  const usagePromise = fetchMagpieJson(`${v.origin}/v1/magpie/usage?period=${validPeriod}`);
  const quotasPromise = quotasCacheValid
    ? Promise.resolve({ ok: true, fromCache: true, data: null })
    : (async () => {
        let qRes = await fetchMagpieJson(`${v.origin}/v1/magpie/quotas`);
        if (!qRes.ok && qRes.httpStatus === 404) {
          qRes = await fetchMagpieJson(`${v.origin}/v1/magpie/quotas/cards`);
        }
        return qRes;
      })();

  const [usageRes, quotasRes] = await Promise.all([usagePromise, quotasPromise]);
  const normUsage = usageRes.ok ? pricingApi.normalizeMagpieUsage(usageRes.data) : null;
  let normQuotas = null;
  let quotasFetchedAt = cached?.quotasFetchedAt || 0;
  let quotasStatus = cached?.quotasStatus || 'offline';

  if (quotasCacheValid) {
    normQuotas = cached.quotas;
  } else {
    normQuotas = quotasRes.ok ? pricingApi.normalizeMagpieQuotas(quotasRes.data) : null;
    quotasFetchedAt = now;
    quotasStatus = quotasRes.ok && normQuotas !== null ? 'online' : 'offline';
  }

  const usageOk = Boolean(usageRes.ok && normUsage !== null);
  const quotasOk = quotasCacheValid
    ? cached?.quotasStatus === 'online'
    : Boolean(quotasRes.ok && normQuotas !== null);
  const reachable = usageOk || quotasOk;
  const status = reachable ? 'online' : 'offline';

  const prevPeriods = sameEndpoint && cached?.periods && typeof cached.periods === 'object'
    ? cached.periods
    : {};
  const nextPeriods = {};
  for (const pKey of VALID_MAGPIE_PERIODS) {
    if (pKey === validPeriod) {
      nextPeriods[pKey] = {
        fetchedAt: now,
        reachable,
        status,
        usage: normUsage
      };
    } else if (prevPeriods[pKey]) {
      nextPeriods[pKey] = prevPeriods[pKey];
    }
  }

  await writeSessionMagpieCache({
    endpoint: v.origin,
    quotasFetchedAt,
    quotasStatus,
    quotas: Array.isArray(normQuotas) ? normQuotas : [],
    periods: nextPeriods
  });

  return {
    ok: true,
    enabled: true,
    reachable,
    status,
    endpoint: v.origin,
    period: validPeriod,
    fetchedAt: now,
    usage: normUsage,
    quotas: Array.isArray(normQuotas) ? normQuotas : []
  };
}
