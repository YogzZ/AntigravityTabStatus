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

const ALLOWED_FAVICON_HOST_RE = /(?:^|\.)(?:antigravity\.google(?:\.com)?|gstatic\.com)$/i;
const ANTIGRAVITY_TAB_HOST_RE = /(?:^|\.)antigravity\.google(?:\.com)?$/i;
const LOCALHOST_ORIGINS = ['http://localhost/*', 'http://127.0.0.1/*'];
const LOCALHOST_SCRIPT_IDS = ['agy-local-main', 'agy-local-top', 'agy-local-child'];
const SESSION_BADGE_KEY = 'agyTabBadges';

let memoryBadgeFallback = {};
let badgeSyncLock = Promise.resolve();
let localhostSyncLock = Promise.resolve();

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

async function hasLocalhostPermission() {
  try {
    if (!chrome.permissions?.contains) return false;
    return Boolean(await chrome.permissions.contains({ origins: LOCALHOST_ORIGINS }));
  } catch {
    return false;
  }
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
        js: ['i18n.js', 'scanner.js', 'content.js'],
        allFrames: false,
        runAt: 'document_idle'
      },
      {
        id: 'agy-local-child',
        matches: LOCALHOST_ORIGINS,
        js: ['i18n.js', 'scanner.js', 'frame-detector.js'],
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
        files: ['i18n.js', 'scanner.js', 'content.js']
      });
    } catch {}
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ['i18n.js', 'scanner.js', 'frame-detector.js']
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
  });
}

if (chrome.permissions?.onRemoved) {
  chrome.permissions.onRemoved.addListener(() => {
    void syncLocalhostContentScripts();
    void enqueueBadgeSync(() => {});
  });
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes && 'actionClickMode' in changes) {
    void syncActionClickBehavior();
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
      if (map[String(tabId)] && candidateUrl && !isAntigravityUrl(candidateUrl)) {
        delete map[String(tabId)];
      }
    });
  }
});

void syncActionClickBehavior();
void syncLocalhostContentScripts();
void enqueueBadgeSync(() => {});

// 1. 免页面 CSP、免后台标签页节流的后台计时器通道
chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'agy-timer') return;

  let animIntervalId = null;
  const pendingTimeouts = new Map();

  const clearAll = () => {
    if (animIntervalId !== null) {
      clearInterval(animIntervalId);
      animIntervalId = null;
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
        telemetry: message.telemetry || null
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
  if (message.type === 'FOCUS_TASK_BROADCAST' && !sender?.tab && message.tabId && message.taskId) {
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
  if (message.type === 'PROBE_COLLAPSED_BROADCAST' && !sender?.tab && message.tabId) {
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

  return false;
});
