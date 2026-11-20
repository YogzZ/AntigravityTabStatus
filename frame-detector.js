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
  let timerPort = null;
  let portReconnectTimer = null;
  let portReconnectAttempt = 0;
  let pollTickCount = 0;
  let capsuleConfig = { enabled: true, showInPageCapsule: false };
  const PRICING_CONFIG_STORAGE_KEY =
    window.__AGY_PRICING__?.PRICING_CONFIG_STORAGE_KEY || 'agyPricingConfigV1';
  let pricingConfig =
    window.__AGY_PRICING__?.normalizePricingConfig?.(null) || {
      version: 1,
      currency: 'USD',
      usdToCnyRate: 7.25,
      overrides: {}
    };

  const LEDGER_FLUSH_DEBOUNCE_MS = 5000;
  const LEDGER_FLUSH_MAX_WAIT_MS = 15000;
  const childLedgerMeta = new Map();
  const childLedgerCursor = Object.create(null);
  const childClearedFloorByConv = Object.create(null);
  let latestChildProjects = [];
  let latestChildTelemetry = null;
  let childLedgerDirty = false;
  let childLedgerDebounceId = null;
  let childLedgerMaxWaitId = null;
  let childLedgerFlushInFlight = false;

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
    if (portReconnectTimer !== null) {
      clearTimeout(portReconnectTimer);
      portReconnectTimer = null;
    }
    if (childLedgerDebounceId !== null) {
      clearTimeout(childLedgerDebounceId);
      childLedgerDebounceId = null;
    }
    if (childLedgerMaxWaitId !== null) {
      clearTimeout(childLedgerMaxWaitId);
      childLedgerMaxWaitId = null;
    }
    if (timerPort) {
      try {
        timerPort.disconnect();
      } catch {}
      timerPort = null;
    }
    return true;
  }

  function schedulePortReconnect() {
    if (portReconnectTimer !== null || shutdownIfInvalidated()) return;
    const delays = [250, 1000, 2500];
    const delay = delays[Math.min(portReconnectAttempt, delays.length - 1)];
    portReconnectAttempt++;
    portReconnectTimer = setTimeout(() => {
      portReconnectTimer = null;
      if (!shutdownIfInvalidated()) {
        ensurePollPort();
      }
    }, delay);
  }

  function ensurePollPort() {
    if (timerPort) return timerPort;
    if (shutdownIfInvalidated()) return null;
    try {
      const port = chrome.runtime.connect({ name: 'agy-timer' });
      portReconnectAttempt = 0;
      port.onMessage.addListener((msg) => {
        if (!msg || msg.type !== 'POLL_TICK') return;
        pollTickCount++;
        runWithTimestamp(pollTickCount % 4 === 0);
      });
      port.onDisconnect.addListener(() => {
        void chrome.runtime.lastError;
        timerPort = null;
        schedulePortReconnect();
      });
      timerPort = port;
      try {
        port.postMessage({ cmd: 'START_POLL', intervalMs: 1000 });
      } catch {}
      return port;
    } catch {
      timerPort = null;
      schedulePortReconnect();
      return null;
    }
  }

  function clearChildLedgerTimers() {
    if (childLedgerDebounceId !== null) {
      clearTimeout(childLedgerDebounceId);
      childLedgerDebounceId = null;
    }
    if (childLedgerMaxWaitId !== null) {
      clearTimeout(childLedgerMaxWaitId);
      childLedgerMaxWaitId = null;
    }
  }

  function scheduleChildLedgerFlush() {
    if (shutdownIfInvalidated()) return;
    if (childLedgerDebounceId !== null) {
      clearTimeout(childLedgerDebounceId);
    }
    childLedgerDebounceId = setTimeout(() => {
      childLedgerDebounceId = null;
      void flushChildLedgerDeltasNow();
    }, LEDGER_FLUSH_DEBOUNCE_MS);
    if (childLedgerMaxWaitId === null) {
      childLedgerMaxWaitId = setTimeout(() => {
        childLedgerMaxWaitId = null;
        void flushChildLedgerDeltasNow();
      }, LEDGER_FLUSH_MAX_WAIT_MS);
    }
  }

  function noteChildLedgerTelemetry(projects, telemetry) {
    latestChildProjects = Array.isArray(projects) ? projects : [];
    latestChildTelemetry = telemetry || null;
    const convs =
      telemetry?.conversations && typeof telemetry.conversations === 'object'
        ? telemetry.conversations
        : null;
    if (!convs) return;

    let changed = false;
    for (const [convId, conv] of Object.entries(convs)) {
      if (
        !convId ||
        convId.length < 6 ||
        convId.length > 160 ||
        convId.startsWith('composer-panel-')
      ) {
        continue;
      }
      if (conv?.precision !== 'exact') continue;
      const pricedCount = Number(conv.sessionStepPricedCount) || 0;
      const sessionTotal = Number(conv.sessionTotalTokens) || 0;
      if (pricedCount <= 0 || sessionTotal <= 0) continue;

      const prev = childLedgerMeta.get(convId);
      const stepHint = Math.max(0, (Number(conv.stepCount) || 1) - 1);
      if (!prev || prev.pricedCount !== pricedCount || prev.sessionTotal !== sessionTotal) {
        childLedgerMeta.set(convId, {
          maxIdx: Math.max(prev?.maxIdx ?? 0, stepHint),
          sessionTotal,
          pricedCount
        });
        changed = true;
      }
    }
    if (changed) {
      childLedgerDirty = true;
      scheduleChildLedgerFlush();
    }
  }

  function flushChildLedgerDeltasNow({ syncOnly = false } = {}) {
    if (shutdownIfInvalidated()) return;
    clearChildLedgerTimers();
    if (childLedgerFlushInFlight && !syncOnly) return;

    const rawBatches =
      window.__AGY_SCANNER__?.harvestLedgerDeltas?.(childLedgerCursor, latestChildProjects) || [];
    childLedgerDirty = false;
    if (!Array.isArray(rawBatches) || rawBatches.length === 0) return;

    const batches = [];
    const batchMaxByConv = Object.create(null);
    for (const batch of rawBatches) {
      if (!batch?.convId || !Array.isArray(batch.steps)) continue;
      const floor = typeof childClearedFloorByConv[batch.convId] === 'number' ? childClearedFloorByConv[batch.convId] : -1;
      const filteredSteps = floor >= 0 ? batch.steps.filter((st) => typeof st?.idx === 'number' && st.idx > floor) : batch.steps;
      if (filteredSteps.length === 0) continue;
      let maxIdx = -1;
      for (const st of filteredSteps) {
        if (typeof st?.idx === 'number' && st.idx > maxIdx) maxIdx = st.idx;
      }
      if (maxIdx >= 0) {
        batchMaxByConv[batch.convId] = maxIdx;
      }
      batches.push({ ...batch, steps: filteredSteps });
    }
    if (batches.length === 0) return;

    const payload = {
      type: 'INGEST_USAGE_DELTAS',
      batches
    };

    try {
      if (syncOnly) {
        chrome.runtime.sendMessage(payload, () => {
          void chrome.runtime.lastError;
        });
        return;
      }
      childLedgerFlushInFlight = true;
      chrome.runtime.sendMessage(payload, (resp) => {
        childLedgerFlushInFlight = false;
        if (!chrome.runtime.lastError && resp?.ok === true) {
          for (const [cid, maxIdx] of Object.entries(batchMaxByConv)) {
            childLedgerCursor[cid] = Math.max(childLedgerCursor[cid] ?? -1, maxIdx);
          }
        } else {
          childLedgerDirty = true;
        }
      });
    } catch {
      childLedgerFlushInFlight = false;
      childLedgerDirty = true;
    }
  }

  function handleChildLedgerCleared() {
    clearChildLedgerTimers();
    childLedgerDirty = false;
    try {
      const allBatches =
        window.__AGY_SCANNER__?.harvestLedgerDeltas?.({}, latestChildProjects) || [];
      for (const batch of allBatches) {
        if (!batch?.convId || !Array.isArray(batch.steps)) continue;
        let maxIdx = -1;
        for (const st of batch.steps) {
          if (typeof st?.idx === 'number' && st.idx > maxIdx) maxIdx = st.idx;
        }
        if (maxIdx >= 0) {
          childLedgerCursor[batch.convId] = Math.max(childLedgerCursor[batch.convId] ?? -1, maxIdx);
          childClearedFloorByConv[batch.convId] = Math.max(childClearedFloorByConv[batch.convId] ?? -1, maxIdx);
        }
      }
    } catch {}
    const convs =
      latestChildTelemetry?.conversations && typeof latestChildTelemetry.conversations === 'object'
        ? latestChildTelemetry.conversations
        : null;
    if (convs) {
      for (const [convId, conv] of Object.entries(convs)) {
        if (!conv || conv.precision !== 'exact') continue;
        childLedgerMeta.set(convId, {
          maxIdx: Math.max(childLedgerCursor[convId] ?? 0, (Number(conv.stepCount) || 1) - 1),
          sessionTotal: Number(conv.sessionTotalTokens) || 0,
          pricedCount: Number(conv.sessionStepPricedCount) || 0
        });
      }
    }
  }

  function dispatchSnapshot(force = false) {
    if (shutdownIfInvalidated()) return;
    const res = window.__AGY_SCANNER__.scanWorkspace({ forceBridge: force });
    if (!res || res.ignore) {
      window.__AGY_SCANNER__?.syncInPageCapsules?.(false, null, pricingConfig);
      return;
    }

    const telemetry = res.telemetry || null;
    const remoteHost = res.remoteHost || null;
    const remoteHosts = Array.isArray(res.remoteHosts) ? res.remoteHosts : [];
    const capsuleEnabled = Boolean(capsuleConfig.enabled && capsuleConfig.showInPageCapsule);
    window.__AGY_SCANNER__?.syncInPageCapsules?.(capsuleEnabled, telemetry, pricingConfig);
    noteChildLedgerTelemetry(res.projects, telemetry);

    const snapshotPayload = {
      type: 'ANTIGRAVITY_WORKSPACE_SYNC',
      frameUid: FRAME_UID,
      activePane: res.activePane,
      projects: res.projects,
      telemetry,
      remoteHost,
      remoteHosts
    };

    const hash = JSON.stringify({
      a: res.activePane,
      p: res.projects,
      t: telemetry,
      rh: remoteHost,
      rhs: remoteHosts
    });
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
            telemetry,
            remoteHost,
            remoteHosts
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
    } else if (event.data?.type === 'AGY_SWITCH_REMOTE_HOST' && event.data.hostId) {
      if (window.__AGY_SCANNER__.switchRemoteHost?.(event.data.hostId)) {
        setTimeout(() => runWithTimestamp(true), 220);
        setTimeout(() => runWithTimestamp(true), 650);
      }
    } else if (event.data?.type === 'AGY_PROBE_COLLAPSED') {
      void (async () => {
        await window.__AGY_SCANNER__.probeCollapsedProjects?.(true);
        dispatchSnapshot(true);
      })();
    } else if (event.data?.type === 'AGY_SYNC_NOW') {
      runWithTimestamp(true);
      if (childLedgerDirty) {
        void flushChildLedgerDeltasNow();
      }
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
        } else if (message?.type === 'SWITCH_REMOTE_HOST_IN_FRAME' && message.hostId) {
          const hit = Boolean(window.__AGY_SCANNER__.switchRemoteHost?.(message.hostId));
          if (hit) {
            setTimeout(() => runWithTimestamp(true), 220);
            setTimeout(() => runWithTimestamp(true), 650);
          }
          sendResponse({ ok: hit });
        } else if (message?.type === 'PROBE_COLLAPSED_IN_FRAME') {
          void (async () => {
            await window.__AGY_SCANNER__.probeCollapsedProjects?.(true);
            dispatchSnapshot(true);
          })();
          sendResponse({ ok: true });
        } else if (message?.type === 'SYNC_NOW_IN_FRAME') {
          runWithTimestamp(true);
          if (childLedgerDirty) {
            void flushChildLedgerDeltasNow();
          }
          sendResponse({ ok: true });
        } else if (message?.type === 'LEDGER_HISTORY_CLEARED') {
          handleChildLedgerCleared();
          return false;
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
      attributeFilter: [
        'class',
        'style',
        'aria-label',
        'aria-current',
        'aria-selected',
        'aria-expanded',
        'disabled',
        'data-testid',
        'data-selected',
        'data-state',
        'data-subtext',
        'data-project-icon'
      ]
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
    if (isContextAlive() && chrome.storage?.local) {
      chrome.storage.local.get(PRICING_CONFIG_STORAGE_KEY, (res) => {
        if (chrome.runtime.lastError) return;
        if (window.__AGY_PRICING__?.normalizePricingConfig) {
          pricingConfig = window.__AGY_PRICING__.normalizePricingConfig(
            res?.[PRICING_CONFIG_STORAGE_KEY]
          );
          runWithTimestamp(true);
        }
      });
    }
    if (isContextAlive() && chrome.storage?.onChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes && PRICING_CONFIG_STORAGE_KEY in changes) {
          if (window.__AGY_PRICING__?.normalizePricingConfig) {
            pricingConfig = window.__AGY_PRICING__.normalizePricingConfig(
              changes[PRICING_CONFIG_STORAGE_KEY]?.newValue
            );
            runWithTimestamp(true);
          }
          return;
        }
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
    if (shutdownIfInvalidated()) return;
    if (document.hidden) {
      if (childLedgerDirty) {
        void flushChildLedgerDeltasNow();
      }
    } else {
      runWithTimestamp(true);
    }
  });
  window.addEventListener('focus', () => runWithTimestamp(true));
  window.addEventListener('pagehide', () => {
    flushChildLedgerDeltasNow({ syncOnly: true });
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

  ensurePollPort();
  heartbeatId = setInterval(() => {
    ensurePollPort();
    if (Date.now() - lastRunTs >= 2400) {
      runWithTimestamp(true);
    }
  }, 2500);
  runWithTimestamp(true);
})();
