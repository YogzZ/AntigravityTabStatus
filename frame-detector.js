/**
 * Antigravity Tab Status - Child Iframe Reporter (v2.9.0)
 *
 * 运行于 https://antigravity.google(.com) 或已授权本地调试源内部的子工作区 iframe：
 * - 非 Antigravity 顶层页面首行 0.01ms 立即退出
 * - 零 Worker / 零 Blob，完全遵循严格 CSP 策略
 * - 扩展重载后旧脚本自动静默清理，不产生 Extension context invalidated 报错
 */

(() => {
  if (window.top === window.self) return;
  if (!window.__AGY_SCANNER__) return;
  if (window.__AGY_FRAME_REPORTER_V201__) return;
  window.__AGY_FRAME_REPORTER_V201__ = true;

  const AGY_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
  const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

  function isAllowedTopOrigin(origin) {
    return AGY_ORIGIN_RE.test(origin || '') || LOCAL_ORIGIN_RE.test(origin || '');
  }

  let topOrigin = '';
  try {
    const origins = window.location.ancestorOrigins;
    if (origins && origins.length > 0) {
      const candidate = origins[origins.length - 1] || '';
      if (isAllowedTopOrigin(candidate)) {
        topOrigin = candidate;
      }
    }
  } catch {}

  const FRAME_UID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let lastSnapshotHash = '';
  let domObserver = null;
  let heartbeatId = null;
  let capsuleConfig = { enabled: true, showInPageCapsule: false };

  function isContextAlive() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function shutdownIfInvalidated() {
    if (isContextAlive()) return false;
    if (domObserver) {
      domObserver.disconnect();
      domObserver = null;
    }
    if (heartbeatId !== null) {
      clearInterval(heartbeatId);
      heartbeatId = null;
    }
    return true;
  }

  function dispatchSnapshot(force = false) {
    if (shutdownIfInvalidated()) return;
    const res = window.__AGY_SCANNER__.scanWorkspace();
    if (!res || res.ignore) {
      window.__AGY_SCANNER__?.syncInPageCapsules?.(false, null);
      return;
    }

    const telemetry = res.telemetry || null;
    const capsuleEnabled = Boolean(capsuleConfig.enabled && capsuleConfig.showInPageCapsule);
    window.__AGY_SCANNER__?.syncInPageCapsules?.(capsuleEnabled, telemetry);

    const snapshotPayload = {
      type: 'ANTIGRAVITY_WORKSPACE_SYNC',
      frameUid: FRAME_UID,
      activePane: res.activePane,
      projects: res.projects,
      telemetry
    };

    const hash = JSON.stringify({ a: res.activePane, p: res.projects, t: telemetry });
    if (!force && hash === lastSnapshotHash) return;
    lastSnapshotHash = hash;

    // 通道 1：直接 postMessage 零延迟上报至顶层窗口（仅定向发送到已验证的 Antigravity 源）
    if (topOrigin) {
      try {
        window.top.postMessage(snapshotPayload, topOrigin);
      } catch {}
    }

    // 通道 2：通过后台 Service Worker 转发至 frameId: 0（带回调消费 lastError，防止未捕获 Promise 报错）
    try {
      if (isContextAlive()) {
        chrome.runtime.sendMessage(
          {
            type: 'CHILD_FRAME_SYNC',
            frameUid: FRAME_UID,
            activePane: res.activePane,
            projects: res.projects,
            telemetry
          },
          () => {
            void chrome.runtime.lastError;
          }
        );
      }
    } catch {}
  }

  window.addEventListener('message', (event) => {
    if (shutdownIfInvalidated()) return;
    if (event.source !== window.top) return;
    if (!isAllowedTopOrigin(event.origin || '')) return;
    if (event.data?.type === 'AGY_FOCUS_TASK' && event.data.taskId) {
      if (
        window.__AGY_SCANNER__.focusTaskById(
          event.data.taskId,
          event.data.projectName || '',
          event.data.taskTitle || ''
        )
      ) {
        setTimeout(() => dispatchSnapshot(true), 160);
      }
    } else if (event.data?.type === 'AGY_PROBE_COLLAPSED') {
      void (async () => {
        await window.__AGY_SCANNER__.probeCollapsedProjects?.(true);
        dispatchSnapshot(true);
      })();
    } else if (event.data?.type === 'AGY_SYNC_NOW') {
      runWithTimestamp(true);
    }
  });

  if (typeof window.__AGY_SCANNER__.onProbeComplete === 'function') {
    window.__AGY_SCANNER__.onProbeComplete(() => dispatchSnapshot(true));
  }

  if (isContextAlive()) {
    try {
      chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
        if (!isContextAlive()) return false;
        if (message?.type === 'FOCUS_TASK_IN_FRAME' && message.taskId) {
          const hit = window.__AGY_SCANNER__.focusTaskById(
            message.taskId,
            message.projectName || '',
            message.taskTitle || ''
          );
          if (hit) setTimeout(() => dispatchSnapshot(true), 160);
          sendResponse({ ok: hit });
        } else if (message?.type === 'PROBE_COLLAPSED_IN_FRAME') {
          void (async () => {
            await window.__AGY_SCANNER__.probeCollapsedProjects?.(true);
            dispatchSnapshot(true);
          })();
          sendResponse({ ok: true });
        } else if (message?.type === 'SYNC_NOW_IN_FRAME') {
          runWithTimestamp(true);
          sendResponse({ ok: true });
        }
        return false;
      });
    } catch {}
  }

  let lastRunTs = 0;
  let throttleTimer = null;

  function runWithTimestamp(force = false) {
    lastRunTs = Date.now();
    dispatchSnapshot(force);
  }

  const scheduleCheck = () => {
    if (shutdownIfInvalidated()) return;
    const elapsed = Date.now() - lastRunTs;
    if (elapsed >= 150) {
      if (throttleTimer) {
        clearTimeout(throttleTimer);
        throttleTimer = null;
      }
      runWithTimestamp(false);
      return;
    }
    if (!throttleTimer) {
      throttleTimer = setTimeout(() => {
        throttleTimer = null;
        runWithTimestamp(false);
      }, 160 - elapsed);
    }
  };

  const root = document.body || document.documentElement;
  if (root) {
    domObserver = new MutationObserver(scheduleCheck);
    domObserver.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'aria-label', 'aria-current', 'aria-selected', 'aria-expanded', 'disabled']
    });
  }

  try {
    if (isContextAlive() && chrome.storage?.sync) {
      chrome.storage.sync.get({ enabled: true, showInPageCapsule: false }, (items) => {
        if (chrome.runtime.lastError) return;
        capsuleConfig = {
          enabled: items?.enabled !== false,
          showInPageCapsule: Boolean(items?.showInPageCapsule)
        };
        runWithTimestamp(true);
      });
    }
    if (isContextAlive() && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'sync' && changes) {
          if ('enabled' in changes) {
            capsuleConfig.enabled = changes.enabled.newValue !== false;
          }
          if ('showInPageCapsule' in changes) {
            capsuleConfig.showInPageCapsule = Boolean(changes.showInPageCapsule.newValue);
          }
        }
        runWithTimestamp(true);
      });
    }
  } catch {}

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) runWithTimestamp(true);
  });
  window.addEventListener('focus', () => runWithTimestamp(true));
  window.addEventListener('pagehide', () => {
    try {
      if (isContextAlive()) {
        chrome.runtime.sendMessage(
          { type: 'CHILD_FRAME_UNLOAD', frameUid: FRAME_UID },
          () => {
            void chrome.runtime.lastError;
          }
        );
      }
    } catch {}
  });

  if (LOCAL_ORIGIN_RE.test(topOrigin) || window.location.protocol === 'http:') {
    setTimeout(() => runWithTimestamp(true), 1500);
    setTimeout(() => runWithTimestamp(true), 4500);
  }

  heartbeatId = setInterval(() => runWithTimestamp(true), 900);
  runWithTimestamp(true);
})();
