/**
 * Antigravity Tab Status - Child Iframe Reporter (v2.0.1)
 *
 * 运行于 https://antigravity.google(.com) 内部的子工作区 iframe：
 * - 非 Antigravity 顶层页面首行 0.01ms 立即退出
 * - 零 Worker / 零 Blob，完全遵循严格 CSP 策略
 * - 扩展重载后旧脚本自动静默清理，不产生 Extension context invalidated 报错
 */

(() => {
  if (window.top === window.self) return;
  if (!window.__AGY_SCANNER__) return;
  if (window.__AGY_FRAME_REPORTER_V201__) return;
  window.__AGY_FRAME_REPORTER_V201__ = true;

  const FRAME_UID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  let lastSnapshotHash = '';
  let domObserver = null;
  let heartbeatId = null;

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
    if (!res || res.ignore) return;

    const snapshotPayload = {
      type: 'ANTIGRAVITY_WORKSPACE_SYNC',
      frameUid: FRAME_UID,
      activePane: res.activePane,
      projects: res.projects
    };

    const hash = JSON.stringify({ a: res.activePane, p: res.projects });
    if (!force && hash === lastSnapshotHash) return;
    lastSnapshotHash = hash;

    // 通道 1：直接 postMessage 零延迟上报至顶层窗口
    try {
      window.top.postMessage(snapshotPayload, '*');
    } catch {}

    // 通道 2：通过后台 Service Worker 转发至 frameId: 0（带回调消费 lastError，防止未捕获 Promise 报错）
    try {
      if (isContextAlive()) {
        chrome.runtime.sendMessage(
          {
            type: 'CHILD_FRAME_SYNC',
            frameUid: FRAME_UID,
            activePane: res.activePane,
            projects: res.projects
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
      window.__AGY_SCANNER__.probeCollapsedProjects?.(true).then(() => {
        dispatchSnapshot(true);
      });
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
          window.__AGY_SCANNER__.probeCollapsedProjects?.(true).then(() => {
            dispatchSnapshot(true);
          });
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
    if (isContextAlive() && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener(() => runWithTimestamp(true));
    }
  } catch {}

  heartbeatId = setInterval(() => runWithTimestamp(true), 900);
  runWithTimestamp(true);
})();
