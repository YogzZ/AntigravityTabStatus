/**
 * Antigravity Tab Status - Background Service Worker (v2.0.1)
 *
 * 1. 在扩展后台使用 OffscreenCanvas 解码原站 Favicon 像素，零页面 CSP 消耗。
 * 2. 提供免 CSP、免后台标签页节流的 Port 计时器（动画帧驱动 + 1.5s 完成防抖）。
 * 3. 转发子工作区 iframe 的多项目状态同步与任务点击跳转指令。
 * 4. 在浏览器扩展工具栏图标上实时显示「待处理 + 未读」任务数量角标。
 */

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

  // 2. 子工作区 iframe 全量同步至顶层页面 (frameId: 0)
  if (message.type === 'CHILD_FRAME_SYNC' && sender?.tab?.id && sender.frameId > 0) {
    chrome.tabs.sendMessage(
      sender.tab.id,
      {
        type: 'RELAYED_CHILD_SYNC',
        frameKey: message.frameUid || `frame-${sender.frameId}`,
        activePane: message.activePane,
        projects: message.projects
      },
      { frameId: 0 },
      () => {
        void chrome.runtime.lastError;
      }
    );
    sendResponse({ ok: true });
    return false;
  }

  // 3. 更新浏览器右上角插件图标上的数字角标（待处理 + 未读数量）
  if (message.type === 'UPDATE_ACTION_BADGE') {
    const tabId = message.tabId || sender?.tab?.id;
    if (tabId) {
      const count = Number(message.count) || 0;
      const text = count > 0 ? (count > 99 ? '99+' : String(count)) : '';
      const bgColor = message.hasWaiting ? '#EF4444' : '#10B981';

      chrome.action.setBadgeText({ tabId, text }, () => {
        void chrome.runtime.lastError;
      });
      if (count > 0) {
        chrome.action.setBadgeBackgroundColor({ tabId, color: bgColor }, () => {
          void chrome.runtime.lastError;
        });
        if (typeof chrome.action.setBadgeTextColor === 'function') {
          chrome.action.setBadgeTextColor({ tabId, color: '#FFFFFF' }, () => {
            void chrome.runtime.lastError;
          });
        }
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  // 4. 从弹窗点击某个任务时，向该标签页所有框架广播定位点击指令（含已折叠项目自动展开参数）
  if (message.type === 'FOCUS_TASK_BROADCAST' && message.tabId && message.taskId) {
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
  if (message.type === 'PROBE_COLLAPSED_BROADCAST' && message.tabId) {
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
    const size = Number(message.size) || 64;
    (async () => {
      try {
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
