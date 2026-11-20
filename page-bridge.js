/**
 * Antigravity Tab Status - Main World Lightweight React Memory & Stream Bridge (v2.9.0)
 *
 * 优雅、零 UI 点击、高性能的内存直读与遥测架构：
 * - 非 Antigravity 页面首行 0.01ms 立即退出；localhost/127.0.0.1 仅在验证为 Antigravity 宿主后激活
 * - 通过 Manifest V3 原生 `world: "MAIN"` 注入（零内联脚本，100% 兼容严格 CSP）
 * - 支持毫秒级结果缓存与节流（默认 500ms 内重复查询直接 O(1) 返回，几乎零 CPU 占用）
 * - 精准直读 React 18/19 内存树与 `.agy-composer-footer` 面板：
 *   1) 沿 `.return` 完整回溯至 HostRoot，识别高层 Context.Provider (`tag === 10`) 与 `dependencies.firstContext` (`useContext`)
 *   2) 识别 TanStack `QueryClient`、Redux/Zustand `Store` 与标准化字典 `{ [convId]: { summary, status, workspaceUris } }`
 *   3) 兼容 Google `)]}'` 前缀与 Connect/SSE/JSON 的 `fetch` / `XHR` / `WebSocket` 被动只读观测与受控同源 Connect-RPC 补充
 */

(() => {
  const isTop = window.top === window.self;
  const AGY_HOST_RE = /^(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
  const AGY_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
  const LOCAL_HOST_RE = /^(?:localhost|127\.0\.0\.1)$/i;
  const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

  const locHost = window.location.hostname || '';
  const locProto = window.location.protocol || '';
  let isOfficialHost = false;
  let isLocalCandidate = false;

  if (isTop) {
    if ((!locProto || locProto === 'https:') && AGY_HOST_RE.test(locHost)) {
      isOfficialHost = true;
    } else if (locProto === 'http:' && LOCAL_HOST_RE.test(locHost)) {
      isLocalCandidate = true;
    }
  } else {
    const origins = window.location.ancestorOrigins;
    if (!origins || origins.length === 0) return;
    const topOrigin = origins[origins.length - 1] || '';
    if (AGY_ORIGIN_RE.test(topOrigin)) {
      isOfficialHost = true;
    } else if (LOCAL_ORIGIN_RE.test(topOrigin)) {
      isLocalCandidate = true;
    }
  }

  if (!isOfficialHost && !isLocalCandidate) return;
  if (window.__AGY_MAIN_BRIDGE_V24__) return;

  function isVerifiedLocalAntigravity() {
    try {
      if (window.__APP_CONFIG__?.csrfToken) return true;
      if (
        typeof document !== 'undefined' &&
        document.querySelector?.(
          '.agy-composer-footer, button[data-testid="permissions-selector-trigger"]'
        )
      ) {
        return true;
      }
      if (!isTop) {
        try {
          if (
            window.top?.__APP_CONFIG__?.csrfToken ||
            window.top?.document?.documentElement?.hasAttribute?.('data-agy-local-host')
          ) {
            return true;
          }
        } catch {}
      }
    } catch {}
    return false;
  }

  if (isLocalCandidate) {
    if (window.__AGY_LOCAL_PROBE_V29__) return;
    window.__AGY_LOCAL_PROBE_V29__ = true;
    let activated = false;
    let t1500 = null;
    let t4500 = null;

    const tryLocalActivate = (isFinal = false) => {
      if (activated || window.__AGY_MAIN_BRIDGE_V24__) return true;
      if (!isVerifiedLocalAntigravity()) {
        if (isFinal) {
          try {
            delete window.__AGY_LOCAL_PROBE_V29__;
          } catch {
            window.__AGY_LOCAL_PROBE_V29__ = false;
          }
        }
        return false;
      }
      activated = true;
      if (t1500) {
        clearTimeout(t1500);
        t1500 = null;
      }
      if (t4500) {
        clearTimeout(t4500);
        t4500 = null;
      }
      try {
        document.documentElement?.setAttribute('data-agy-local-host', '1');
      } catch {}
      initBridge();
      return true;
    };

    if (!tryLocalActivate(false)) {
      if (typeof document !== 'undefined' && document.readyState === 'loading') {
        document.addEventListener?.('DOMContentLoaded', () => tryLocalActivate(false), { once: true });
      }
      t1500 = setTimeout(() => tryLocalActivate(false), 1500);
      t4500 = setTimeout(() => tryLocalActivate(true), 4500);
    }
    return;
  }

  initBridge();

  function initBridge() {
    if (window.__AGY_MAIN_BRIDGE_V24__) return;
    window.__AGY_MAIN_BRIDGE_V24__ = true;

  const NAV_SKIP_RE =
    /^(antigravity|projects|conversation\s*history|history|settings|preferences|customizations|plugins|new\s*conversation|new\s*chat|idle|running|waiting|completed|pending|active|archived|pinned)$/i;
  const GENERIC_CONTAINER_KEY_RE =
    /^(data|state|props|value|result|items|list|map|cache|meta|metadata|config|options|headers|children|style|theme|styles|actions|dispatch|subscribe|getState|queryClient|client|store|current|firstContext|dependencies|summaries|externalSummaries|indexes|pendingAnnotations|annotations|artifactMetadata|trajectorySummaries|conversations|cascades|trajectories|threads|sessions|chats|tasks|steps|messages|turns|trueState|optimisticState|agentState|summary|detail|details|statusInfo|statusDetail|contextWindowUsage|executorMetadata|modelUsage|modelConfig|currentModelConfig|container|trajectory|cascade|segment|segments|payload|response|request|body|args)$/i;

  // 网络层被动观测到的项目与对话字典（只读克隆，绝不篡改原请求/响应，限制上限防止长期驻留增长）
  const netProjectsById = new Map();
  const netProjectsByName = new Map();
  const netConvsById = new Map();
  let authoritativeTrajectoryIds = null;
  const MAX_NET_CACHE_ENTRIES = 1000;

  function pruneMapToLimit(map, limit = MAX_NET_CACHE_ENTRIES) {
    if (!map || map.size <= limit) return;
    const excess = map.size - limit;
    let deleted = 0;
    for (const key of map.keys()) {
      map.delete(key);
      deleted += 1;
      if (deleted >= excess) break;
    }
  }

  // 性能优化：桥接器结果短时缓存（同一渲染周期多次 Mutation 合并为 0.02ms 缓存命中）
  const BRIDGE_CACHE_TTL_MS = 500;
  let lastBridgeCacheTs = 0;
  let lastBridgeNamesKey = '';
  let lastBridgeResultJson = '';
  let lastBridgeHostPath = '';
  let netDataDirty = false;

  function formatRelativeTime(rawTs) {
    if (!rawTs) return '';
    let ms = 0;
    if (typeof rawTs === 'number') {
      ms = rawTs > 1e12 ? rawTs : rawTs > 1e9 ? rawTs * 1000 : 0;
    } else if (typeof rawTs === 'string') {
      const parsed = Date.parse(rawTs);
      if (!Number.isNaN(parsed)) ms = parsed;
    } else if (typeof rawTs === 'object') {
      const sec = Number(rawTs.seconds ?? rawTs.sec ?? 0);
      if (sec > 1e9) ms = sec * 1000;
    }
    if (!ms) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    if (diffSec < 45) return 'Just now';
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    return `${Math.floor(hrs / 24)}d`;
  }

  function extractBasenameFromUri(uriStr) {
    if (typeof uriStr !== 'string' || !uriStr) return '';
    try {
      const decoded = decodeURIComponent(uriStr).replace(/\\/g, '/').replace(/\/+$/, '');
      const idx = decoded.lastIndexOf('/');
      const base = idx >= 0 ? decoded.slice(idx + 1) : decoded;
      return base.trim();
    } catch {
      return '';
    }
  }

  function inferProjectType(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (obj.isRemote === true || obj.remote === true) return 'remote';
    if (obj.isLocal === true || obj.local === true) return 'local';
    if (obj.remoteHost || obj.sshHost || obj.vmId || obj.cloudWorkspaceId || obj.remoteInstanceId) {
      return 'remote';
    }
    const kindStr = String(
      obj.type ?? obj.projectType ?? obj.kind ?? obj.environment ?? obj.hostType ?? obj.location ?? ''
    ).toLowerCase();
    if (/remote|cloud|ssh|vm|container|devbox|codespace|server/.test(kindStr)) return 'remote';
    if (/local|disk|folder|desktop|laptop/.test(kindStr)) return 'local';
    const uri = String(obj.uri ?? obj.workspaceUri ?? obj.rootUri ?? obj.path ?? '');
    if (/vscode-remote:\/\/|ssh-remote|cloud:/i.test(uri)) return 'remote';
    return null;
  }

  const WAITING_STATUS_RE =
    /WAIT|AWAIT|NEEDS_INPUT|NEEDS_APPROVAL|NEEDS_REVIEW|NEEDS_USER|NEEDS_CONFIRM|PENDING_APPROVAL|PENDING_INPUT|PENDING_USER|PENDING_QUESTION|PENDING_REVIEW|PENDING_INTERACTION|PENDING_ACTION|USER_INPUT|USER_ACTION|ACTION_REQUIRED|CONFIRM|PERMISSION|PAUSED_FOR_USER|BLOCKED|ASKING_QUESTION|ASK_QUESTION|REVIEW_REQUIRED|REQUEST_FEEDBACK|HALTED_FOR_USER/;
  const TERMINAL_CONV_STATUS_RE =
    /^(?:IDLE|DONE|COMPLETED|FINISHED|STOPPED|CANCELLED|CANCELED|ABORTED|FAILED|ERROR|RESOLVED|DISMISSED)$|(?:_IDLE|_DONE|_COMPLETED|_FINISHED|_STOPPED|_CANCELLED|_CANCELED|_ABORTED|_FAILED)$/;
  const UI_WAITING_INDICATOR_RE =
    /^(?:QUESTION|QUESTION_MARK|HELP|HELP_OUTLINE|QUIZ|REVIEW|RATE_REVIEW|FACT_CHECK|APPROVAL|ATTENTION|NOTIFICATION|NOTIFICATIONS_ACTIVE|BELL|WARNING|ALERT|INPUT_NEEDED|WAITING)$/;

  const DEBUG_STATUS_KEY_RE =
    /status|state|wait|pending|approval|review|input|question|block|running|working|unread|icon|badge|indicator|attention|step/i;

  function summarizeConvDebugFields(c) {
    if (!c || typeof c !== 'object') return {};
    const out = {};
    let keys;
    try {
      keys = Object.keys(c);
    } catch {
      return out;
    }
    let count = 0;
    for (let i = 0; i < keys.length && count < 14; i++) {
      const k = keys[i];
      try {
        if (k === 'steps' || k === 'messages') {
          const arr = c[k];
          if (Array.isArray(arr)) {
            out[k] = `Array(${arr.length})`;
            count++;
            if (k === 'steps' && arr.length > 0) {
              const last = arr[arr.length - 1];
              if (last && typeof last === 'object') {
                const lastMeta = {};
                if (last.status != null) lastMeta.status = String(last.status).slice(0, 64);
                if (last.stepStatus != null) lastMeta.stepStatus = String(last.stepStatus).slice(0, 64);
                if (last.type != null) lastMeta.type = String(last.type).slice(0, 64);
                if (last.waitingForUser != null) lastMeta.waitingForUser = Boolean(last.waitingForUser);
                if (Object.keys(lastMeta).length > 0) {
                  out.lastStepMeta = lastMeta;
                  count++;
                }
              }
            }
          }
          continue;
        }
        if (!DEBUG_STATUS_KEY_RE.test(k)) continue;
        if (/title|summary|headline|topic|subject|uri|path|body|content|text|prompt|html/i.test(k)) continue;
        const v = c[k];
        if (v === undefined) continue;
        if (v === null || typeof v === 'boolean' || typeof v === 'number') {
          out[k] = v;
          count++;
        } else if (typeof v === 'string') {
          out[k] = v.slice(0, 64);
          count++;
        } else if (Array.isArray(v)) {
          out[k] = `Array(${v.length})`;
          count++;
        } else if (typeof v === 'object') {
          const nestedKeys = Object.keys(v).slice(0, 5).join(',');
          out[k] = nestedKeys ? `{${nestedKeys}}` : '{}';
          count++;
        }
      } catch {}
    }
    return out;
  }

  function hasPendingPayload(val) {
    if (val === true) return true;
    if (!val) return false;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.keys(val).length > 0;
    if (typeof val === 'string') {
      const s = val.trim();
      return Boolean(
        s &&
          !/^(none|false|0|null|undefined|idle|done|completed|resolved|dismissed|cancelled|canceled)$/i.test(s)
      );
    }
    return false;
  }

  function collectStatusValues(obj, fields) {
    const out = [];
    if (!obj || typeof obj !== 'object') return out;
    for (const f of fields) {
      try {
        const v = obj[f];
        if (typeof v === 'string' && v.trim()) {
          out.push(v.trim().toUpperCase());
        }
      } catch {}
    }
    return out;
  }

  const WAITING_BOOL_KEYS = [
    'waiting',
    'waitingForUser',
    'waitingForInput',
    'waitingOnUser',
    'isWaiting',
    'isWaitingForUser',
    'isWaitingForInput',
    'needsApproval',
    'needsInput',
    'needsReview',
    'needsUserAction',
    'needsConfirmation',
    'pendingApproval',
    'hasPendingApproval',
    'hasPendingInput',
    'hasPendingQuestion',
    'hasPendingReview',
    'hasPendingInteraction',
    'hasPendingUserAction',
    'hasPendingAction',
    'pendingUserAction',
    'userInputRequired',
    'requiresUserAction',
    'attentionRequired',
    'needsAttention',
    'hasUnreadApproval',
    'actionRequired',
    'userActionRequired',
    'isBlocked',
    'blockedOnUser',
    'askingQuestion',
    'awaitingUser',
    'awaitingInput',
    'awaitingApproval',
    'awaitingReview',
    'requiresApproval',
    'requiresInput',
    'requiresReview'
  ];

  function hasWaitingBool(obj) {
    if (!obj || typeof obj !== 'object') return false;
    for (const key of WAITING_BOOL_KEYS) {
      try {
        if (obj[key] === true) return true;
      } catch {}
    }
    return false;
  }

  function stepHasUnansweredWaitingTool(step) {
    if (!step || typeof step !== 'object') return false;
    const stepStatuses = collectStatusValues(step, ['status', 'stepStatus', 'state']);
    if (stepStatuses.some((s) => TERMINAL_CONV_STATUS_RE.test(s))) return false;
    const calls = Array.isArray(step.toolCalls)
      ? step.toolCalls
      : Array.isArray(step.tool_calls)
        ? step.tool_calls
        : null;
    if (!calls || calls.length === 0) return false;
    for (const tc of calls) {
      if (!tc || typeof tc !== 'object') continue;
      const toolName = String(tc.name ?? tc.toolName ?? tc.function?.name ?? tc.type ?? '');
      if (!/ask_question|request_feedback|confirm|approval/i.test(toolName)) continue;
      const tcStatuses = collectStatusValues(tc, ['status', 'state']);
      if (tcStatuses.some((s) => TERMINAL_CONV_STATUS_RE.test(s))) continue;
      if (tc.result || tc.response || tc.answer) continue;
      return true;
    }
    return false;
  }

  function normalizeConvState(c) {
    if (!c || typeof c !== 'object') {
      return {
        state: 'idle',
        reasonCode: 'reasonMemIdle',
        reasonVars: {},
        reason: '',
        hasExplicitStatus: false,
        isDetailRecord: false,
        isTerminal: false,
        debugFields: {}
      };
    }

    const isDetailRecord = Boolean(
      (Array.isArray(c.steps) && c.steps.length > 0) ||
        (Array.isArray(c.messages) && c.messages.length > 0) ||
        (c.activeStep && typeof c.activeStep === 'object') ||
        (c.currentStep && typeof c.currentStep === 'object') ||
        (c.lastStep && typeof c.lastStep === 'object') ||
        (c.latestStep && typeof c.latestStep === 'object')
    );
    const debugFields = summarizeConvDebugFields(c);
    const nestedStatusObjs = [
      c.metadata,
      c.statusInfo,
      c.statusDetail,
      c.runState,
      c.executionState,
      c.summaryMetadata
    ].filter((v) => v && typeof v === 'object');

    if (hasWaitingBool(c) || nestedStatusObjs.some(hasWaitingBool)) {
      return {
        state: 'waiting',
        reasonCode: 'reasonMemWaiting',
        reasonVars: {},
        reason: 'Waiting for confirmation (memory state)',
        hasExplicitStatus: true,
        isDetailRecord,
        isTerminal: false,
        debugFields
      };
    }

    const pendingInteractionFields = [
      c.pendingUserInput,
      c.pendingInteraction,
      c.requestedInteraction,
      c.userInteraction,
      c.activeInteraction,
      c.pendingQuestion,
      c.pendingQuestions,
      c.pendingApprovalRequest,
      c.pendingPermission,
      c.pendingReview,
      c.reviewRequest,
      c.blockingStep,
      c.waitingStep,
      c.waitingSteps,
      c.pendingAction,
      c.interrupt,
      c.blocker,
      c.userPrompt,
      c.pendingToolCall,
      c.waitingFor
    ];
    if (pendingInteractionFields.some(hasPendingPayload)) {
      return {
        state: 'waiting',
        reasonCode: 'reasonMemWaiting',
        reasonVars: {},
        reason: 'Waiting for confirmation (memory state)',
        hasExplicitStatus: true,
        isDetailRecord,
        isTerminal: false,
        debugFields
      };
    }

    const uiIndicatorValues = collectStatusValues(c, [
      'icon',
      'statusIcon',
      'iconName',
      'badge',
      'badgeType',
      'attentionType',
      'indicator',
      'uiState',
      'displayStatus',
      'activeToolName',
      'pendingToolName'
    ]);
    for (const uiVal of uiIndicatorValues) {
      if (WAITING_STATUS_RE.test(uiVal) || UI_WAITING_INDICATOR_RE.test(uiVal)) {
        const detail = uiVal.slice(0, 24);
        return {
          state: 'waiting',
          reasonCode: 'reasonMemWaiting',
          reasonVars: { detail },
          reason: `Waiting for confirmation (${detail})`,
          hasExplicitStatus: true,
          isDetailRecord,
          isTerminal: false,
          debugFields
        };
      }
    }

    const convStatusFields = [
      'runStatus',
      'executionStatus',
      'agentState',
      'agentStatus',
      'cascadeStatus',
      'trajectoryStatus',
      'stepStatus',
      'currentStepStatus',
      'lastStepStatus',
      'latestStepStatus',
      'activeStepStatus',
      'plannerStatus',
      'turnStatus',
      'interactionStatus',
      'reviewStatus',
      'approvalStatus',
      'pendingActionType',
      'waitingReason',
      'blockReason',
      'pauseReason',
      'status',
      'state'
    ];
    const convStatuses = collectStatusValues(c, convStatusFields);
    for (const sub of nestedStatusObjs) {
      convStatuses.push(...collectStatusValues(sub, convStatusFields));
    }

    for (const st of convStatuses) {
      if (WAITING_STATUS_RE.test(st)) {
        const detail = st.slice(0, 24);
        return {
          state: 'waiting',
          reasonCode: 'reasonMemWaiting',
          reasonVars: { detail },
          reason: `Waiting for confirmation (${detail})`,
          hasExplicitStatus: true,
          isDetailRecord,
          isTerminal: false,
          debugFields
        };
      }
    }

    const isSummaryShape =
      'backgroundTaskCount' in c ||
      'trajectoryId' in c ||
      'notFullyIdle' in c ||
      (typeof c.$typeName === 'string' && /CascadeTrajectorySummary|AgentState/i.test(c.$typeName));
    const hasActiveBgTasks =
      (typeof c.backgroundTaskCount === 'number' && c.backgroundTaskCount > 0) ||
      c.hasRunningSubagents === true ||
      (Array.isArray(c.backgroundCommands) && c.backgroundCommands.length > 0);
    const isNumericIdle =
      isSummaryShape &&
      c.status === 1 &&
      !hasActiveBgTasks &&
      (!Array.isArray(c.waitingSteps) || c.waitingSteps.length === 0);
    const isNumericRunning = isSummaryShape && c.status === 2;

    const isTerminalConv =
      convStatuses.some((st) => TERMINAL_CONV_STATUS_RE.test(st)) || isNumericIdle;
    let hasRunningStepInTail = false;
    const directStepCandidates = [c.activeStep, c.currentStep, c.lastStep, c.latestStep];
    if (!isTerminalConv || hasActiveBgTasks) {
      for (const step of directStepCandidates) {
        if (!step || typeof step !== 'object') continue;
        if (hasWaitingBool(step) || stepHasUnansweredWaitingTool(step)) {
          return {
            state: 'waiting',
            reasonCode: 'reasonMemWaiting',
            reasonVars: {},
            reason: 'Waiting for confirmation (memory state)',
            hasExplicitStatus: true,
            isDetailRecord,
            isTerminal: false,
            debugFields
          };
        }
        const stepStatuses = collectStatusValues(step, ['status', 'stepStatus', 'state']);
        for (const sst of stepStatuses) {
          if (WAITING_STATUS_RE.test(sst)) {
            const detail = sst.slice(0, 24);
            return {
              state: 'waiting',
              reasonCode: 'reasonMemWaiting',
              reasonVars: { detail },
              reason: `Waiting for confirmation (${detail})`,
              hasExplicitStatus: true,
              isDetailRecord,
              isTerminal: false,
              debugFields
            };
          }
        }
      }

      if (Array.isArray(c.steps) && c.steps.length > 0) {
        const minIdx = Math.max(0, c.steps.length - 5);
        for (let i = c.steps.length - 1; i >= minIdx; i--) {
          const step = c.steps[i];
          if (!step || typeof step !== 'object') continue;
          if (
            step.taskDetails &&
            step.taskDetails.requiresInputApproval === true &&
            step.status !== 3
          ) {
            return {
              state: 'waiting',
              reasonCode: 'reasonMemWaiting',
              reasonVars: {},
              reason: 'Waiting for confirmation (memory state)',
              hasExplicitStatus: true,
              isDetailRecord,
              isTerminal: false,
              debugFields
            };
          }
          if (hasWaitingBool(step) || stepHasUnansweredWaitingTool(step)) {
            return {
              state: 'waiting',
              reasonCode: 'reasonMemWaiting',
              reasonVars: {},
              reason: 'Waiting for confirmation (memory state)',
              hasExplicitStatus: true,
              isDetailRecord,
              isTerminal: false,
              debugFields
            };
          }
          const stepStatuses = collectStatusValues(step, ['status', 'stepStatus', 'state']);
          for (const sst of stepStatuses) {
            if (WAITING_STATUS_RE.test(sst)) {
              const detail = sst.slice(0, 24);
              return {
                state: 'waiting',
                reasonCode: 'reasonMemWaiting',
                reasonVars: { detail },
                reason: `Waiting for confirmation (${detail})`,
                hasExplicitStatus: true,
                isDetailRecord,
                isTerminal: false,
                debugFields
              };
            }
          }
          if (
            stepStatuses.some((sst) => /RUNNING|WORKING|IN_PROGRESS|GENERATING|STREAMING|EXECUTING/.test(sst)) ||
            (step.taskDetails && step.status === 2)
          ) {
            hasRunningStepInTail = true;
            break;
          }
          const stepKind = String(step.type ?? step.role ?? step.stepType ?? '').toUpperCase();
          if (
            /USER_INPUT|^USER$/.test(stepKind) &&
            (stepStatuses.length === 0 || stepStatuses.some((sst) => TERMINAL_CONV_STATUS_RE.test(sst)))
          ) {
            break;
          }
        }
      }
    }

    if (
      c.isRunning === true ||
      c.isWorking === true ||
      c.isStreaming === true ||
      c.isGenerating === true ||
      c.agentWorking === true ||
      hasActiveBgTasks ||
      isNumericRunning ||
      hasRunningStepInTail
    ) {
      return {
        state: 'running',
        reasonCode: 'reasonMemRunning',
        reasonVars: {},
        reason: 'Running in background (memory state)',
        hasExplicitStatus: true,
        isDetailRecord,
        isTerminal: false,
        debugFields
      };
    }

    for (const st of convStatuses) {
      if (/RUNNING|WORKING|IN_PROGRESS|GENERATING|STREAMING|THINKING|EXECUTING|BUSY/.test(st)) {
        const detail = st.slice(0, 24);
        return {
          state: 'running',
          reasonCode: 'reasonMemRunning',
          reasonVars: { detail },
          reason: `Running (${detail})`,
          hasExplicitStatus: true,
          isDetailRecord,
          isTerminal: false,
          debugFields
        };
      }
    }

    if (
      c.unread === true ||
      c.isUnread === true ||
      c.hasUnread === true ||
      (typeof c.unreadCount === 'number' && c.unreadCount > 0)
    ) {
      return {
        state: 'unread',
        reasonCode: 'reasonMemUnread',
        reasonVars: {},
        reason: 'Unread conversation (memory state)',
        hasExplicitStatus: true,
        isDetailRecord,
        isTerminal: true,
        debugFields
      };
    }

    for (const st of convStatuses) {
      if (/UNREAD/.test(st)) {
        return {
          state: 'unread',
          reasonCode: 'reasonMemUnread',
          reasonVars: {},
          reason: 'Unread conversation',
          hasExplicitStatus: true,
          isDetailRecord,
          isTerminal: true,
          debugFields
        };
      }
    }

    const hasExplicitStatus =
      convStatuses.length > 0 ||
      isSummaryShape ||
      'isRunning' in c ||
      'isWorking' in c ||
      'waitingForUser' in c ||
      'waitingForInput' in c ||
      'needsApproval' in c ||
      'needsInput' in c ||
      'needsReview' in c ||
      'unread' in c ||
      'isUnread' in c;

    const isTerminal = Boolean(
      isTerminalConv || (convStatuses.length === 0 && (c.isRunning === false || c.isWorking === false))
    );

    return {
      state: 'idle',
      reasonCode: 'reasonMemIdle',
      reasonVars: {},
      reason: '',
      hasExplicitStatus,
      isDetailRecord,
      isTerminal,
      debugFields
    };
  }

  function looksLikeConversationObject(obj, fallbackMapKey = '') {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
    if (obj.$$typeof || obj.nodeType || obj.stateNode || obj._owner) return false;

    const validFallback =
      typeof fallbackMapKey === 'string' &&
      fallbackMapKey.trim() &&
      !GENERIC_CONTAINER_KEY_RE.test(fallbackMapKey.trim())
        ? fallbackMapKey.trim()
        : '';
    const explicitCascadeId = obj.conversationId ?? obj.cascadeId ?? null;
    const rawId =
      explicitCascadeId ??
      (validFallback || null) ??
      obj.trajectoryId ??
      obj.threadId ??
      obj.sessionId ??
      obj.chatId ??
      obj.taskId ??
      obj.id ??
      '';
    if (typeof rawId !== 'string' && typeof rawId !== 'number') return false;
    const idStr = String(rawId).trim();
    if (!idStr || idStr.length > 160 || GENERIC_CONTAINER_KEY_RE.test(idStr)) return false;

    const title =
      obj.title ??
      obj.summary ??
      obj.headline ??
      obj.topic ??
      obj.subject ??
      obj.displayName ??
      obj.conversationTitle ??
      obj.name ??
      obj.annotations?.title;
    if (typeof title !== 'string') return false;
    const cleanTitle = title.replace(/\s+/g, ' ').trim();
    if (!cleanTitle || cleanTitle.length > 200 || NAV_SKIP_RE.test(cleanTitle)) return false;

    // 排除 Project 容器对象本身
    if (
      Array.isArray(obj.conversations) ||
      Array.isArray(obj.cascades) ||
      Array.isArray(obj.trajectories) ||
      Array.isArray(obj.threads)
    ) {
      return false;
    }

    const hasConvField =
      'conversationId' in obj ||
      'cascadeId' in obj ||
      'trajectoryId' in obj ||
      'threadId' in obj ||
      'projectId' in obj ||
      'workspaceId' in obj ||
      'workspaceUris' in obj ||
      'workspaces' in obj ||
      'workspaceUri' in obj ||
      'runStatus' in obj ||
      'cascadeStatus' in obj ||
      'stepStatus' in obj ||
      'agentState' in obj ||
      'waitingForUser' in obj ||
      'isRunning' in obj ||
      'isWorking' in obj ||
      'unread' in obj ||
      'isUnread' in obj ||
      'unreadCount' in obj ||
      'updatedAt' in obj ||
      'lastModifiedTime' in obj ||
      'lastActivityAt' in obj ||
      'createdAt' in obj ||
      'stepCount' in obj ||
      'messages' in obj ||
      'steps' in obj ||
      ('status' in obj && ('title' in obj || 'summary' in obj));

    return hasConvField;
  }

  function collectWorkspaceBasenames(obj) {
    if (!obj || typeof obj !== 'object') return [];
    const uriCandidates = [];
    if (typeof obj.workspaceUri === 'string') uriCandidates.push(obj.workspaceUri);
    if (typeof obj.projectPath === 'string') uriCandidates.push(obj.projectPath);
    if (typeof obj.rootUri === 'string') uriCandidates.push(obj.rootUri);
    if (typeof obj.repository?.name === 'string') uriCandidates.push(obj.repository.name);
    if (typeof obj.repository?.computedName === 'string') {
      uriCandidates.push(obj.repository.computedName);
    }
    if (Array.isArray(obj.workspaceUris)) {
      for (const u of obj.workspaceUris) {
        if (typeof u === 'string') uriCandidates.push(u);
      }
    }
    if (Array.isArray(obj.workspaces)) {
      for (const w of obj.workspaces) {
        if (typeof w === 'string') uriCandidates.push(w);
        else if (w && typeof w === 'object') {
          const u =
            w.workspaceFolderAbsoluteUri ??
            w.uri ??
            w.rootUri ??
            w.name ??
            w.path ??
            w.repository?.computedName ??
            w.repository?.name;
          if (typeof u === 'string') uriCandidates.push(u);
        }
      }
    }
    const bases = [];
    const seen = new Set();
    for (const raw of uriCandidates) {
      const base = extractBasenameFromUri(raw);
      if (base && !seen.has(base.toLowerCase())) {
        seen.add(base.toLowerCase());
        bases.push(base);
      }
    }
    return bases;
  }

  function matchKnownProjectFromUris(obj, knownLowerNames, lowerToCanonical) {
    if (!knownLowerNames || knownLowerNames.size === 0) return '';
    for (const raw of collectWorkspaceBasenames(obj)) {
      const base = raw.toLowerCase();
      if (base && knownLowerNames.has(base)) {
        return lowerToCanonical ? lowerToCanonical.get(base) || base : base;
      }
    }
    return '';
  }

  function extractConvRecord(
    obj,
    fallbackProjectId = '',
    fallbackProjectName = '',
    fallbackConvId = '',
    knownLowerNames = null,
    lowerToCanonical = null
  ) {
    const validFallbackConvId =
      typeof fallbackConvId === 'string' &&
      fallbackConvId.trim() &&
      !GENERIC_CONTAINER_KEY_RE.test(fallbackConvId.trim())
        ? fallbackConvId.trim()
        : '';
    const idStr = String(
      obj.conversationId ??
        obj.cascadeId ??
        (validFallbackConvId || null) ??
        obj.trajectoryId ??
        obj.threadId ??
        obj.sessionId ??
        obj.chatId ??
        obj.taskId ??
        obj.id ??
        ''
    ).trim();
    const titleStr = String(
      obj.title ??
        obj.summary ??
        obj.headline ??
        obj.topic ??
        obj.subject ??
        obj.displayName ??
        obj.conversationTitle ??
        obj.name ??
        obj.annotations?.title
    )
      .replace(/\s+/g, ' ')
      .trim();

    const projId = String(
      obj.projectId ??
        obj.workspaceId ??
        obj.trajectoryMetadata?.projectId ??
        obj.metadata?.projectId ??
        (typeof obj.project === 'string' ? obj.project : obj.project?.id) ??
        fallbackProjectId ??
        ''
    ).trim();

    let projName = String(
      obj.projectName ??
        (typeof obj.project === 'object' && obj.project
          ? obj.project.name ?? obj.project.title ?? obj.project.displayName ?? ''
          : '') ??
        fallbackProjectName ??
        ''
    ).trim();

    const workspaceNames = collectWorkspaceBasenames(obj);
    if (!projName && knownLowerNames) {
      for (const base of workspaceNames) {
        const low = base.toLowerCase();
        if (knownLowerNames.has(low)) {
          projName = lowerToCanonical ? lowerToCanonical.get(low) || low : low;
          break;
        }
      }
    }

    const {
      state,
      reasonCode,
      reasonVars,
      reason,
      hasExplicitStatus,
      isDetailRecord,
      isTerminal,
      debugFields
    } = normalizeConvState(obj);
    const rawTime =
      obj.relativeTime ??
      obj.timeAgo ??
      formatRelativeTime(
        obj.updatedAt ?? obj.lastModifiedTime ?? obj.lastActivityAt ?? obj.modifiedAt ?? obj.createdAt
      );
    const href = typeof obj.href === 'string' ? obj.href : typeof obj.url === 'string' ? obj.url : '';
    const summaryStepCount =
      typeof obj.stepCount === 'number' && Number.isFinite(obj.stepCount) ? obj.stepCount : null;
    const hasWaitingStepsField = Array.isArray(obj.waitingSteps);
    const hasExplicitEmptyWaitingSteps =
      Array.isArray(obj.waitingSteps) && obj.waitingSteps.length === 0;

    return {
      convId: idStr,
      title: titleStr,
      projectId: projId,
      projectName: projName,
      workspaceNames,
      state,
      reasonCode,
      reasonVars,
      reason,
      hasExplicitStatus: Boolean(hasExplicitStatus),
      isDetailRecord: Boolean(isDetailRecord),
      isTerminal: Boolean(isTerminal),
      debugFields: debugFields || {},
      // 对话推进指纹：提问后用户一旦回答，steps/messages/stepCount 增长；缓存里的旧快照
      // 数量不会变。mergeConvRecord 靠它判断一个 running 快照是否已跨过 waiting。
      stepsCount: Array.isArray(obj.steps) ? obj.steps.length : null,
      messagesCount: Array.isArray(obj.messages) ? obj.messages.length : null,
      summaryStepCount,
      hasWaitingStepsField,
      hasExplicitEmptyWaitingSteps,
      timeText: typeof rawTime === 'string' ? rawTime : '',
      href
    };
  }

  function getConvMergeKey(conv) {
    return conv.convId
      ? `id::${conv.convId}`
      : `${conv.projectName || conv.projectId}::${conv.title}`;
  }

  function mergeDebugFields(prevDebug, nextDebug, nextIsDetail, prevIsDetail) {
    const out = { ...(prevDebug || {}), ...(nextDebug || {}) };
    if (nextDebug && typeof nextDebug === 'object' && Object.keys(nextDebug).length > 0) {
      if (nextIsDetail) {
        const snap = { ...nextDebug };
        delete snap.lastDetail;
        delete snap.lastSummary;
        out.lastDetail = snap;
      } else {
        const snap = { ...nextDebug };
        delete snap.lastDetail;
        delete snap.lastSummary;
        out.lastSummary = snap;
      }
    }
    if (prevDebug?.lastDetail && !out.lastDetail) {
      out.lastDetail = prevDebug.lastDetail;
    } else if (prevIsDetail && prevDebug && !out.lastDetail) {
      const snap = { ...prevDebug };
      delete snap.lastDetail;
      delete snap.lastSummary;
      out.lastDetail = snap;
    }
    if (prevDebug?.lastSummary && !out.lastSummary) {
      out.lastSummary = prevDebug.lastSummary;
    } else if (!prevIsDetail && prevDebug && !out.lastSummary) {
      const snap = { ...prevDebug };
      delete snap.lastDetail;
      delete snap.lastSummary;
      out.lastSummary = snap;
    }
    return out;
  }

  // 对话在 waiting 之后是否真正推进过：只有 steps/messages/stepCount 数量比记录 waiting 时增长了，
  // 才说明提问已被回答、会话重新开跑。缓存里的旧快照数量不会增长，不能据此清除 waiting。
  function hasProgressedBeyondWaiting(prev, next) {
    const stepsGrew =
      typeof next.stepsCount === 'number' &&
      typeof prev.waitingSteps === 'number' &&
      next.stepsCount > prev.waitingSteps;
    const messagesGrew =
      typeof next.messagesCount === 'number' &&
      typeof prev.waitingMessages === 'number' &&
      next.messagesCount > prev.waitingMessages;
    const summaryStepGrew =
      typeof next.summaryStepCount === 'number' &&
      typeof prev.waitingSummarySteps === 'number' &&
      next.summaryStepCount > prev.waitingSummarySteps;
    return stepsGrew || messagesGrew || summaryStepGrew;
  }

  function mergeConvRecord(prev, next, { preferLatestExplicit = false } = {}) {
    if (!prev) {
      const rec = {
        ...next,
        debugFields: mergeDebugFields(null, next.debugFields, Boolean(next.isDetailRecord), false)
      };
      if (next.state === 'waiting') {
        if (typeof next.stepsCount === 'number') rec.waitingSteps = next.stepsCount;
        if (typeof next.messagesCount === 'number') rec.waitingMessages = next.messagesCount;
        if (typeof next.summaryStepCount === 'number') {
          rec.waitingSummarySteps = next.summaryStepCount;
        }
      }
      return rec;
    }
    const rank = { waiting: 4, unread: 3, running: 2, idle: 1 };
    let takeNextState = false;

    if (prev.state === 'waiting' && next.state === 'running') {
      // waiting 是粘性的：缺乏 waitingSteps 字段的粗粒度摘要与提问前缓存的旧快照不得降级 waiting，
      // 但明确携带 waitingSteps: [] 的实时摘要，或步骤数已增长且为详情/权威摘要的 running 应立即切回 running。
      takeNextState = Boolean(
        preferLatestExplicit &&
          (next.hasExplicitEmptyWaitingSteps ||
            ((next.isDetailRecord || next.hasWaitingStepsField) &&
              hasProgressedBeyondWaiting(prev, next)))
      );
    } else if (prev.state === 'waiting' && (next.state === 'idle' || next.state === 'unread')) {
      // 终态（IDLE / DONE / COMPLETED）或未读、或详情显式回到 idle 才清除 waiting
      takeNextState = Boolean(preferLatestExplicit && (next.isTerminal || next.isDetailRecord));
    } else if (preferLatestExplicit && prev.state === 'running' && next.state === 'idle') {
      takeNextState = Boolean(next.isTerminal || next.isDetailRecord);
    } else if (preferLatestExplicit && next.hasExplicitStatus) {
      takeNextState = true;
    } else if (next.hasExplicitStatus && !prev.hasExplicitStatus) {
      takeNextState = true;
    } else if (!next.hasExplicitStatus && prev.hasExplicitStatus) {
      takeNextState = false;
    } else if ((rank[next.state] || 0) > (rank[prev.state] || 0)) {
      takeNextState = true;
    } else if ((rank[next.state] || 0) === (rank[prev.state] || 0)) {
      takeNextState = Boolean(next.isDetailRecord || !prev.isDetailRecord);
    }

    const resultState = takeNextState ? next.state : prev.state;
    const sameState = resultState === prev.state && resultState === next.state;
    const pickCount = (field) => {
      const nextVal = next[field];
      const prevVal = prev[field];
      if (takeNextState || sameState) {
        if (next.isDetailRecord && typeof nextVal === 'number') return nextVal;
        if (!prev.isDetailRecord && typeof nextVal === 'number') return nextVal;
      }
      return typeof prevVal === 'number'
        ? prevVal
        : (takeNextState || sameState) && typeof nextVal === 'number'
          ? nextVal
          : null;
    };
    const stepsCount = pickCount('stepsCount');
    const messagesCount = pickCount('messagesCount');
    const summaryStepCount =
      typeof next.summaryStepCount === 'number'
        ? next.summaryStepCount
        : typeof prev.summaryStepCount === 'number'
          ? prev.summaryStepCount
          : null;

    let waitingSteps = takeNextState ? (next.waitingSteps ?? prev.waitingSteps) : prev.waitingSteps;
    let waitingMessages = takeNextState ? (next.waitingMessages ?? prev.waitingMessages) : prev.waitingMessages;
    let waitingSummarySteps = takeNextState
      ? (next.waitingSummarySteps ?? prev.waitingSummarySteps)
      : prev.waitingSummarySteps;
    if (resultState === 'waiting') {
      const src = takeNextState ? next : prev;
      if (typeof src.stepsCount === 'number') waitingSteps = src.stepsCount;
      if (typeof src.messagesCount === 'number') waitingMessages = src.messagesCount;
      if (typeof src.summaryStepCount === 'number') waitingSummarySteps = src.summaryStepCount;
    } else if (prev.state === 'waiting' && takeNextState) {
      waitingSteps = undefined;
      waitingMessages = undefined;
      waitingSummarySteps = undefined;
    }

    return {
      convId: prev.convId || next.convId,
      title: next.title || prev.title,
      projectId: next.projectId || prev.projectId,
      projectName: next.projectName || prev.projectName,
      workspaceNames:
        Array.isArray(next.workspaceNames) && next.workspaceNames.length > 0
          ? next.workspaceNames
          : prev.workspaceNames || [],
      state: resultState,
      reasonCode: takeNextState ? next.reasonCode : prev.reasonCode,
      reasonVars: takeNextState ? next.reasonVars : prev.reasonVars,
      reason: takeNextState ? next.reason : prev.reason,
      hasExplicitStatus: Boolean(prev.hasExplicitStatus || next.hasExplicitStatus),
      isDetailRecord: Boolean(
        sameState ? (prev.isDetailRecord || next.isDetailRecord) : (takeNextState ? next.isDetailRecord : prev.isDetailRecord)
      ),
      isTerminal: Boolean(takeNextState ? next.isTerminal : prev.isTerminal),
      stepsCount,
      messagesCount,
      summaryStepCount,
      hasWaitingStepsField: Boolean(prev.hasWaitingStepsField || next.hasWaitingStepsField),
      hasExplicitEmptyWaitingSteps:
        resultState === 'running' &&
        Boolean(takeNextState ? next.hasExplicitEmptyWaitingSteps : prev.hasExplicitEmptyWaitingSteps),
      waitingSteps,
      waitingMessages,
      waitingSummarySteps,
      debugFields: mergeDebugFields(
        prev.debugFields,
        next.debugFields,
        Boolean(next.isDetailRecord),
        Boolean(prev.isDetailRecord)
      ),
      timeText: next.timeText || prev.timeText,
      href: next.href || prev.href
    };
  }

  function isBlockedBridgeValue(val) {
    if (!val || typeof val !== 'object') return true;
    try {
      if (val === window || val === window.top || val === window.parent) return true;
    } catch {
      return true;
    }
    return false;
  }

  /**
   * 递归扫描内存数据对象树（带访问预算与深度保护，单次调用耗时 < 0.4ms）
   */
  function scanArbitraryDataTree(
    rootVal,
    knownLowerNames,
    lowerToCanonical,
    outProjects,
    outConvs,
    contextProjId = '',
    contextProjName = ''
  ) {
    const visited = new WeakSet();
    let budget = 1400;

    function walk(val, depth, curProjId, curProjName, parentKey = '', inheritedConvId = '') {
      if (budget <= 0 || depth > 8 || isBlockedBridgeValue(val)) return;
      try {
        if (val instanceof Node || val instanceof Window || val.$$typeof) return;
        if (visited.has(val)) return;
        visited.add(val);
        budget--;

        if (val instanceof Map) {
          for (const [k, v] of val.entries()) {
            const keyStr = typeof k === 'string' ? k : '';
            const matchedProjById = keyStr ? outProjects.byId.get(keyStr) : null;
            let nextProjId = matchedProjById ? matchedProjById.id : curProjId;
            let nextProjName = matchedProjById ? matchedProjById.name : curProjName;
            if (!matchedProjById && keyStr) {
              const lowK = extractBasenameFromUri(keyStr).toLowerCase();
              if (knownLowerNames.has(lowK)) {
                nextProjName = lowerToCanonical ? lowerToCanonical.get(lowK) || lowK : lowK;
              }
            }
            walk(v, depth + 1, nextProjId, nextProjName, keyStr, inheritedConvId);
          }
          return;
        }

        if (val instanceof Set) {
          for (const item of val.values()) {
            walk(item, depth + 1, curProjId, curProjName, '', inheritedConvId);
          }
          return;
        }

        if (Array.isArray(val)) {
          for (let i = 0; i < val.length && i < 120; i++) {
            walk(val[i], depth + 1, curProjId, curProjName, '', inheritedConvId);
          }
          return;
        }

        let nextProjId = curProjId;
        let nextProjName = curProjName;
        const ownCascadeId =
          typeof val.cascadeId === 'string' && val.cascadeId.trim().length >= 6
            ? val.cascadeId.trim()
            : typeof val.conversationId === 'string' && val.conversationId.trim().length >= 6
              ? val.conversationId.trim()
              : '';
        const nextConvId = ownCascadeId || inheritedConvId;

        // 识别 Project 对象
        try {
          const maybeName = String(
            val.projectName ??
              val.workspaceName ??
              val.repoName ??
              val.displayName ??
              val.name ??
              val.title ??
              val.label ??
              extractBasenameFromUri(val.uri ?? val.workspaceUri ?? val.rootUri ?? '') ??
              ''
          )
            .replace(/\s+/g, ' ')
            .trim();
          const lowerName = maybeName.toLowerCase();

          if (maybeName && (knownLowerNames.size === 0 || knownLowerNames.has(lowerName))) {
            const pid = String(val.projectId ?? val.workspaceId ?? val.id ?? '').trim();
            const pType = inferProjectType(val);
            const childArr =
              val.conversations ??
              val.cascades ??
              val.trajectories ??
              val.threads ??
              val.sessions ??
              val.chats ??
              val.tasks;

            if (pid || pType || Array.isArray(childArr)) {
              const canonical = lowerToCanonical?.get(lowerName) || maybeName;
              const rec = outProjects.byName.get(lowerName) || {
                id: pid,
                name: canonical,
                projectType: pType || null,
                hasEmptyArray: false
              };
              if (pid && !rec.id) rec.id = pid;
              if (pType) rec.projectType = pType;
              if (Array.isArray(childArr) && childArr.length === 0) {
                rec.hasEmptyArray = true;
              }
              outProjects.byName.set(lowerName, rec);
              if (rec.id) outProjects.byId.set(rec.id, rec);

              nextProjId = rec.id || curProjId;
              nextProjName = rec.name;
            }
          }
        } catch {}

        // 识别 Conversation 对象（兼容字典键或外层 cascadeId 作 convId 的情况）
        const fallbackConvId =
          nextConvId ||
          (parentKey && parentKey.length >= 4 && !GENERIC_CONTAINER_KEY_RE.test(parentKey)
            ? parentKey
            : '');
        try {
          if (looksLikeConversationObject(val, fallbackConvId)) {
            const conv = extractConvRecord(
              val,
              nextProjId,
              nextProjName,
              fallbackConvId,
              knownLowerNames,
              lowerToCanonical
            );
            const key = getConvMergeKey(conv);
            const prev = outConvs.get(key);
            outConvs.set(key, mergeConvRecord(prev, conv));
            return;
          }
          if (
            val.$typeName === 'exa.jetski_cortex_pb.CascadeTrajectorySummary' ||
            ('trajectoryMetadata' in val && 'stepCount' in val && 'workspaces' in val)
          ) {
            return;
          }
        } catch {}

        // 遍历普通对象键值
        const keys = Object.keys(val);
        const maxKeys =
          parentKey === 'summaries' || parentKey === 'trajectorySummaries' ? 200 : 65;
        for (let i = 0; i < keys.length && i < maxKeys; i++) {
          const k = keys[i];
          if (
            k.startsWith('_') ||
            k === 'children' ||
            k === 'stateNode' ||
            k === 'return' ||
            k === 'sibling' ||
            k === 'child'
          ) {
            continue;
          }
          let childVal;
          try {
            childVal = val[k];
          } catch {
            continue;
          }
          if (!childVal || typeof childVal !== 'object') continue;

          let subProjId = nextProjId;
          let subProjName = nextProjName;
          if (outProjects.byId.has(k)) {
            subProjId = k;
            subProjName = outProjects.byId.get(k).name;
          } else {
            const lowK = extractBasenameFromUri(k).toLowerCase();
            if (knownLowerNames.has(lowK)) {
              subProjName = lowerToCanonical?.get(lowK) || k;
            }
          }
          walk(childVal, depth + 1, subProjId, subProjName, k, nextConvId);
        }
      } catch {
        return;
      }
    }

    walk(rootVal, 0, contextProjId, contextProjName, '', '');
  }

  // ============================================================================
  // 1. 遥测常量、时间与配额归一化、Step 汇总与上下文/压缩/流式测速引擎 (v2.9.0)
  // ============================================================================
  const MAX_TELEMETRY_CONVS = 40;
  const MAX_STEPS_PER_CONV = 240;
  const MAX_PRICED_STEP_LOG = 512;
  const MAX_MODELS_CACHE = 80;
  const LS_ENDPOINT_MARKER = '/exa.language_server_pb.LanguageServerService/';
  const URL_CONV_ID_RE =
    /(?:jetski_remote_agents_3p\/|conversations?\/|c\/|cascadeId=)([a-zA-Z0-9_-]{8,})/i;
  const SHADOW_MODEL_RE =
    /(?:^|[^A-Z0-9])(M50|M21)(?:$|[^A-Z0-9])|FLASH[_-]?LITE|IMAGE|BANANA/i;
  const SENTINEL_CUTOFF_MS = Date.UTC(2000, 0, 1);

  const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000;
  const QUOTA_PRE_RESET_WINDOW_MS = 30 * 60 * 1000;
  const QUOTA_PRE_RESET_MIN_FRAC = 0.4;
  const QUOTA_HISTORY_MAX_AGE_MS = 30 * 60 * 1000;
  const QUOTA_HISTORY_MAX_SAMPLES = 36;
  const QUOTA_MIN_SLOPE_SPAN_MS = 60 * 1000;
  const QUOTA_MIN_SLOPE_DROP_FRAC = 0.01;
  const QUOTA_STALE_IDLE_MS = 15 * 60 * 1000;
  const READ_ONLY_POLL_ENDPOINT_RE =
    /(?:GetUserStatus|GetAllCascadeTrajectories|GetCascadeTrajectorySteps|GetCascadeTrajectory)\b/i;

  const RPC_USER_STATUS_TTL_MS = 30000;
  const RPC_TRAJECTORIES_TTL_MS = 4000;
  const RPC_STEPS_RUNNING_TTL_MS = 3000;
  const RPC_STEPS_IDLE_TTL_MS = 15000;
  const RPC_TIMEOUT_MS = 5000;

  const KNOWN_QUOTA_POOLS = {
    MODEL_PLACEHOLDER_M18: 'gemini',
    MODEL_PLACEHOLDER_M36: 'gemini',
    MODEL_PLACEHOLDER_M37: 'gemini',
    MODEL_PLACEHOLDER_M47: 'gemini',
    MODEL_PLACEHOLDER_M26: 'premium',
    MODEL_PLACEHOLDER_M35: 'premium',
    MODEL_PLACEHOLDER_M12: 'premium'
  };

  const CONTEXT_LIMIT_KEYS = [
    'maxContextTokens',
    'contextLimit',
    'contextWindow',
    'contextWindowSize',
    'maxContextLength',
    'maxContextWindow',
    'compactionThresholdTokens',
    'compactionThreshold',
    'compactionLimit',
    'compactionTokenLimit',
    'autoCompactThreshold',
    'autoCompactLimit',
    'maxInputTokens',
    'inputTokenLimit',
    'maxPromptTokens',
    'promptTokenLimit',
    'tokenLimit'
  ];

  const STEP_META_SKIP_KEYS = new Set([
    'modelUsage',
    'usage',
    'tokenUsage',
    'type',
    'role',
    'status',
    'stepStatus',
    'state',
    'createdAt',
    'finishedGeneratingAt',
    'timestamp',
    'updatedAt',
    'id',
    'stepId',
    'cascadeId',
    'conversationId',
    'trajectoryId',
    'generatorModel',
    'requestedModel',
    'model',
    'modelId',
    'uri',
    'path',
    'href',
    'url',
    'icon',
    'iconName'
  ]);

  const netModelsById = new Map();
  const netModelIdByNumValue = new Map();
  const convTelemetryById = new Map();
  const quotaHistoryByPool = { gemini: [], premium: [] };
  const composerFallbackIds = new WeakMap();
  let composerFallbackSeq = 0;
  let lastKnownActiveConvId = '';
  let lastResolvedActiveConvId = '';
  let sawLanguageServerEndpoint = false;
  let capturedCsrfToken = '';
  let nativeFetchRef = null;

  const rpcState = {
    userStatusAt: 0,
    userStatusInFlight: false,
    trajectoriesAt: 0,
    trajectoriesInFlight: false,
    stepsAtByConv: new Map(),
    stepsInFlight: new Set(),
    hasSuccess: false
  };

  function isShadowModel(modelId, label = '') {
    const combined = `${String(modelId || '')} ${String(label || '')}`.trim();
    return Boolean(combined && SHADOW_MODEL_RE.test(combined));
  }

  function classifyQuotaPool(modelId, label = '') {
    const upper = `${String(modelId || '')} ${String(label || '')}`.toUpperCase();
    if (/CLAUDE|OPUS|SONNET|GPT|OSS/.test(upper)) return 'premium';
    if (/GEMINI|ARGON|FLASH|HYDROGEN/.test(upper)) return 'gemini';
    const idKey = String(modelId || '').trim().toUpperCase();
    if (idKey && KNOWN_QUOTA_POOLS[idKey]) return KNOWN_QUOTA_POOLS[idKey];
    return null;
  }

  function toNonNegInt(val) {
    if (typeof val === 'number') return Number.isFinite(val) && val > 0 ? Math.round(val) : 0;
    if (typeof val === 'string' && /^\d+(?:\.\d+)?$/.test(val.trim())) {
      const n = Number(val.trim());
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
    }
    if (typeof val === 'bigint' && val > 0n) return Number(val);
    return 0;
  }

  function parseResetTimeMs(raw, depth = 0) {
    if (
      raw === null ||
      raw === undefined ||
      raw === '' ||
      typeof raw === 'boolean' ||
      depth > 3
    ) {
      return null;
    }
    let ms = NaN;
    if (raw instanceof Date) {
      ms = raw.getTime();
    } else if (typeof raw === 'bigint') {
      const n = Number(raw);
      if (Number.isFinite(n) && n > 0) {
        if (n > 1e16) ms = Math.floor(n / 1e6);
        else if (n > 1e14) ms = Math.floor(n / 1e3);
        else if (n > 1e11) ms = n;
        else ms = n * 1000;
      }
    } else if (typeof raw === 'number') {
      if (Number.isFinite(raw) && raw > 0) {
        if (raw > 1e16) ms = Math.floor(raw / 1e6);
        else if (raw > 1e14) ms = Math.floor(raw / 1e3);
        else if (raw > 1e11) ms = raw;
        else ms = raw * 1000;
      }
    } else if (typeof raw === 'string') {
      let s = raw.trim();
      if (!s) return null;
      if (s.startsWith('"') && s.endsWith('"') && s.length >= 2) {
        s = s.slice(1, -1).trim();
      }
      if (/^-?\d+(?:\.\d+)?$/.test(s)) {
        return parseResetTimeMs(Number(s), depth + 1);
      }
      // 截断超过 3 位的亚秒小数（Protobuf Timestamp ISO 字符串常见 6-9 位小数）
      const normIso = s.replace(/(\.\d{3})\d+(?=(?:Z|[+-]\d{2}:?\d{2})?$)/i, '$1');
      ms = Date.parse(normIso);
      if (Number.isNaN(ms) && normIso !== s) {
        ms = Date.parse(s);
      }
    } else if (typeof raw === 'object') {
      try {
        if (typeof raw.toDate === 'function') {
          const d = raw.toDate();
          if (d instanceof Date) return parseResetTimeMs(d, depth + 1);
        }
      } catch {}
      try {
        if (typeof raw.toJsonString === 'function') {
          return parseResetTimeMs(raw.toJsonString(), depth + 1);
        }
      } catch {}
      const rawSec = raw.seconds !== undefined ? raw.seconds : raw.sec;
      if (rawSec !== undefined && rawSec !== null) {
        const secNum = typeof rawSec === 'bigint' ? Number(rawSec) : Number(rawSec);
        const rawNanos = raw.nanos !== undefined ? raw.nanos : raw.nano;
        const nanosNum =
          rawNanos !== undefined && rawNanos !== null
            ? typeof rawNanos === 'bigint'
              ? Number(rawNanos)
              : Number(rawNanos)
            : 0;
        if (Number.isFinite(secNum) && secNum > 0) {
          ms = secNum * 1000 + (Number.isFinite(nanosNum) ? Math.floor(nanosNum / 1e6) : 0);
        }
      }
    }
    if (!Number.isFinite(ms) || ms <= SENTINEL_CUTOFF_MS) return null;
    return Math.round(ms);
  }

  function normalizeQuotaInfo(rawQuota, nowMs = Date.now()) {
    if (!rawQuota || typeof rawQuota !== 'object') return null;
    const resetRaw =
      rawQuota.resetTime ??
      rawQuota.reset_time ??
      rawQuota.resetTimestamp ??
      rawQuota.resetAt ??
      rawQuota.resetTimeMs;
    const resetTimeMs = parseResetTimeMs(resetRaw);

    const rawFrac =
      rawQuota.remainingFraction !== undefined
        ? rawQuota.remainingFraction
        : rawQuota.remaining_fraction;
    let remainingFraction = null;
    if (typeof rawFrac === 'number' && Number.isFinite(rawFrac)) {
      remainingFraction = Math.max(0, Math.min(1, rawFrac));
    } else if (typeof rawFrac === 'string' && rawFrac.trim() !== '') {
      const parsedFrac = Number(rawFrac);
      if (Number.isFinite(parsedFrac)) {
        remainingFraction = Math.max(0, Math.min(1, parsedFrac));
      }
    } else if (rawFrac === undefined && resetTimeMs !== null && resetTimeMs > nowMs) {
      // Proto3 默认值 0.0 会被省略；存在未来 resetTime 时还原为 0
      remainingFraction = 0;
    }

    if (remainingFraction === null && resetTimeMs === null) return null;
    return { remainingFraction, resetTimeMs };
  }

  function extractContextLimitFromConfig(cfg) {
    if (!cfg || typeof cfg !== 'object') return 0;
    const candidates = [
      cfg,
      cfg.compactionConfig,
      cfg.contextConfig,
      cfg.limits,
      cfg.modelMetadata,
      cfg.metadata
    ];
    for (const obj of candidates) {
      if (!obj || typeof obj !== 'object') continue;
      for (const key of CONTEXT_LIMIT_KEYS) {
        const raw = obj[key];
        const n =
          typeof raw === 'number'
            ? raw
            : typeof raw === 'string' && /^\d+$/.test(raw)
              ? Number(raw)
              : NaN;
        if (Number.isFinite(n) && n > 10000 && n <= 100_000_000) {
          return Math.round(n);
        }
      }
      try {
        for (const k of Object.keys(obj)) {
          if (
            /(?:context|compaction).*(?:limit|window|tokens?|threshold|size|length)/i.test(k) &&
            !/output|completion|cache/i.test(k)
          ) {
            const raw = obj[k];
            const n =
              typeof raw === 'number'
                ? raw
                : typeof raw === 'string' && /^\d+$/.test(raw)
                  ? Number(raw)
                  : NaN;
            if (Number.isFinite(n) && n > 10000 && n <= 100_000_000) {
              return Math.round(n);
            }
          }
        }
      } catch {}
    }
    return 0;
  }

  function extractModelConfigInfo(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    const modelId = String(
      cfg.modelOrAlias?.model ??
        cfg.modelOrAlias?.alias ??
        cfg.modelId ??
        (typeof cfg.model === 'string' ? cfg.model : '') ??
        cfg.modelName ??
        cfg.alias ??
        cfg.id ??
        ''
    ).trim();
    const label = String(
      cfg.label ?? cfg.displayName ?? cfg.name ?? cfg.modelLabel ?? modelId
    ).trim();
    const resolvedId = modelId || label;
    if (!resolvedId || isShadowModel(resolvedId, label)) return null;
    const contextLimit = extractContextLimitFromConfig(cfg);
    const rawQuota = cfg.quotaInfo ?? cfg.quota;
    const quota = normalizeQuotaInfo(rawQuota);
    const pool = classifyQuotaPool(resolvedId, label);
    const numVal =
      typeof cfg.value === 'number' && Number.isFinite(cfg.value) && cfg.value > 0
        ? String(Math.round(cfg.value))
        : typeof cfg.model === 'number' && Number.isFinite(cfg.model) && cfg.model > 0
          ? String(Math.round(cfg.model))
          : '';
    return {
      modelId: resolvedId,
      numericId: numVal,
      label: label || resolvedId,
      pool,
      contextLimit: contextLimit > 10000 ? contextLimit : 0,
      hasQuotaInfo: Boolean(quota),
      remainingFraction: quota ? quota.remainingFraction : null,
      resetTimeMs: quota ? quota.resetTimeMs : null
    };
  }

  function upsertModelConfig(info, source = 'network') {
    if (!info || !info.modelId || isShadowModel(info.modelId, info.label)) return false;
    if (info.numericId) {
      netModelIdByNumValue.set(info.numericId, info.modelId);
    }
    const prev = netModelsById.get(info.modelId);
    const observedNow = Date.now();
    const isPassiveFiber = source === 'fiber';
    const quotaChanged =
      info.hasQuotaInfo &&
      (!prev ||
        prev.remainingFraction !== info.remainingFraction ||
        prev.resetTimeMs !== info.resetTimeMs);
    const nextQuotaObservedAt = info.hasQuotaInfo
      ? isPassiveFiber && prev?.quotaObservedAt != null && !quotaChanged
        ? prev.quotaObservedAt
        : observedNow
      : prev?.quotaObservedAt ?? null;
    const next = {
      modelId: info.modelId,
      label:
        info.label && info.label !== info.modelId
          ? info.label
          : prev?.label || info.label || info.modelId,
      pool: info.pool || prev?.pool || classifyQuotaPool(info.modelId, info.label),
      contextLimit:
        info.contextLimit > 10000
          ? info.contextLimit
          : prev?.contextLimit > 10000
            ? prev.contextLimit
            : 0,
      remainingFraction: info.hasQuotaInfo
        ? info.remainingFraction
        : prev?.remainingFraction ?? null,
      resetTimeMs: info.hasQuotaInfo ? info.resetTimeMs : prev?.resetTimeMs ?? null,
      quotaObservedAt: nextQuotaObservedAt
    };
    const changed =
      !prev ||
      prev.label !== next.label ||
      prev.pool !== next.pool ||
      prev.contextLimit !== next.contextLimit ||
      prev.remainingFraction !== next.remainingFraction ||
      prev.resetTimeMs !== next.resetTimeMs;
    netModelsById.set(info.modelId, next);
    pruneMapToLimit(netModelsById, MAX_MODELS_CACHE);
    return changed;
  }

  function findModelMeta(modelId, modelLabel) {
    const rawId = String(modelId || '').trim();
    const mappedId = rawId && netModelIdByNumValue.get(rawId) ? netModelIdByNumValue.get(rawId) : rawId;
    if (mappedId && netModelsById.has(mappedId)) {
      return netModelsById.get(mappedId);
    }
    const lowId = mappedId.toLowerCase();
    const lowLabel = String(modelLabel || '').trim().toLowerCase();
    for (const m of netModelsById.values()) {
      if (lowId && m.modelId.toLowerCase() === lowId) return m;
      if (lowLabel && m.label.toLowerCase() === lowLabel) return m;
    }
    return null;
  }

  function getDynamicContextLimit(modelId, modelLabel) {
    const meta = findModelMeta(modelId, modelLabel);
    if (meta && meta.contextLimit > 10000) return meta.contextLimit;
    const combined = `${String(modelId || '')} ${String(modelLabel || '')}`.toUpperCase();
    if (/GPT[_-]?OSS|120B/.test(combined)) return 80000;
    return 256000;
  }

  function estimateTokensFromText(str) {
    if (typeof str !== 'string' || !str) return 0;
    let ascii = 0;
    let nonAscii = 0;
    const sampleLen = Math.min(str.length, 200000);
    for (let i = 0; i < sampleLen; i++) {
      if (str.charCodeAt(i) <= 0x7f) ascii++;
      else nonAscii++;
    }
    const scale = str.length > sampleLen ? str.length / sampleLen : 1;
    return Math.ceil((ascii / 4 + nonAscii / 1.5) * scale);
  }

  function estimateStepTokens(step) {
    if (!step || typeof step !== 'object') return 0;
    if (typeof step.estTokens === 'number' && Number.isFinite(step.estTokens)) {
      return Math.max(0, Math.round(step.estTokens));
    }
    let total = 0;
    let nodes = 0;
    const seen = new WeakSet();

    function walkText(val, depth) {
      if (nodes >= 80 || depth > 5 || val === null || val === undefined) return;
      if (typeof val === 'string') {
        if (val.length > 0) total += estimateTokensFromText(val);
        return;
      }
      if (typeof val !== 'object') return;
      try {
        if ((typeof Node !== 'undefined' && val instanceof Node) || val.$$typeof) return;
      } catch {
        return;
      }
      if (seen.has(val)) return;
      seen.add(val);
      nodes++;
      if (Array.isArray(val)) {
        for (let i = 0; i < val.length && i < 30; i++) {
          walkText(val[i], depth + 1);
        }
        return;
      }
      let keys;
      try {
        keys = Object.keys(val);
      } catch {
        return;
      }
      for (let i = 0; i < keys.length && i < 25; i++) {
        const k = keys[i];
        if (k.startsWith('_') || STEP_META_SKIP_KEYS.has(k)) continue;
        try {
          walkText(val[k], depth + 1);
        } catch {}
      }
    }

    walkText(step, 0);
    return total;
  }

  function extractStepModelUsage(step) {
    if (!step || typeof step !== 'object') return null;
    const rawMu =
      step.metadata?.modelUsage ??
      step.modelUsage ??
      step.plannerResponse?.modelUsage ??
      step.metadata?.generatorMetadata?.modelUsage ??
      step.usageMetadata ??
      step.metadata?.usageMetadata ??
      step.plannerResponse?.usageMetadata ??
      step.metadata?.tokenUsage ??
      step.usage ??
      step.tokenUsage;
    const fallbackModel = String(
      step.metadata?.generatorModel ??
        step.metadata?.requestedModel?.model ??
        step.metadata?.model ??
        (typeof step.model === 'string' || typeof step.model === 'number' ? step.model : '') ??
        ''
    ).trim();
    if (!rawMu || typeof rawMu !== 'object') {
      const resolvedFallback = netModelIdByNumValue.get(fallbackModel) || fallbackModel;
      return resolvedFallback
        ? {
            model: resolvedFallback,
            inputTokens: 0,
            cacheReadTokens: 0,
            cacheCreationTokens: 0,
            cacheWrite5mTokens: 0,
            cacheWrite1hTokens: 0,
            outputTokens: 0,
            reasoningTokens: 0,
            reasoningInOutput: false
          }
        : null;
    }
    const rawModel = String(rawMu.model ?? rawMu.modelId ?? rawMu.modelName ?? fallbackModel).trim();
    const model = netModelIdByNumValue.get(rawModel) || rawModel;
    const inputTokens = toNonNegInt(
      rawMu.inputTokens ??
        rawMu.input_tokens ??
        rawMu.promptTokens ??
        rawMu.prompt_tokens ??
        rawMu.promptTokenCount ??
        rawMu.prompt_token_count
    );
    const cacheReadTokens = toNonNegInt(
      rawMu.cacheReadTokens ??
        rawMu.cache_read_tokens ??
        rawMu.cachedContentTokenCount ??
        rawMu.cached_content_token_count ??
        rawMu.cacheReadInputTokens ??
        rawMu.cache_read_input_tokens
    );
    const rawCacheObj =
      (rawMu.cache_creation && typeof rawMu.cache_creation === 'object'
        ? rawMu.cache_creation
        : null) ||
      (rawMu.cacheCreation && typeof rawMu.cacheCreation === 'object'
        ? rawMu.cacheCreation
        : null);
    const flatCacheCreationTokens = toNonNegInt(
      rawMu.cacheCreationTokens ??
        rawMu.cache_creation_tokens ??
        rawMu.cacheCreationInputTokens ??
        rawMu.cache_creation_input_tokens ??
        rawMu.cacheWriteTokens ??
        rawMu.cache_write_tokens
    );
    const cacheWrite5mTokens = toNonNegInt(
      rawMu.cacheWrite5mTokens ??
        rawMu.cache_write_5m_tokens ??
        rawMu.ephemeral5mInputTokens ??
        rawMu.ephemeral_5m_input_tokens ??
        rawCacheObj?.ephemeral5mInputTokens ??
        rawCacheObj?.ephemeral_5m_input_tokens ??
        rawCacheObj?.cacheWrite5mTokens ??
        rawCacheObj?.cache_write_5m_tokens
    );
    const cacheWrite1hTokens = toNonNegInt(
      rawMu.cacheWrite1hTokens ??
        rawMu.cache_write_1h_tokens ??
        rawMu.ephemeral1hInputTokens ??
        rawMu.ephemeral_1h_input_tokens ??
        rawCacheObj?.ephemeral1hInputTokens ??
        rawCacheObj?.ephemeral_1h_input_tokens ??
        rawCacheObj?.cacheWrite1hTokens ??
        rawCacheObj?.cache_write_1h_tokens
    );
    const cacheCreationTokens = Math.max(
      flatCacheCreationTokens,
      cacheWrite5mTokens + cacheWrite1hTokens
    );
    const outputTokens = toNonNegInt(
      rawMu.outputTokens ??
        rawMu.output_tokens ??
        rawMu.candidatesTokenCount ??
        rawMu.candidates_token_count ??
        rawMu.completionTokens ??
        rawMu.completion_tokens
    );
    const directReasoningRaw =
      rawMu.reasoningTokens ??
      rawMu.reasoning_tokens ??
      rawMu.thoughtsTokenCount ??
      rawMu.thoughts_token_count ??
      rawMu.thinkingTokens ??
      rawMu.thinking_tokens;
    const nestedReasoningRaw =
      rawMu.completionTokensDetails?.reasoningTokens ??
      rawMu.completion_tokens_details?.reasoning_tokens ??
      rawMu.outputTokensDetails?.reasoningTokens ??
      rawMu.output_tokens_details?.reasoning_tokens;
    const reasoningTokens = toNonNegInt(directReasoningRaw ?? nestedReasoningRaw);
    const reasoningInOutput =
      directReasoningRaw === undefined &&
      nestedReasoningRaw !== undefined &&
      reasoningTokens > 0 &&
      outputTokens >= reasoningTokens;
    if (
      !model &&
      inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens + reasoningTokens === 0
    ) {
      return null;
    }
    return {
      model,
      inputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      cacheWrite5mTokens,
      cacheWrite1hTokens,
      outputTokens,
      reasoningTokens,
      reasoningInOutput
    };
  }

  function parseDurationMs(raw, maxMs = 3_600_000) {
    if (raw === null || raw === undefined || raw === '' || typeof raw === 'boolean') return null;
    if (typeof raw === 'number') {
      return Number.isFinite(raw) && raw > 0 && raw <= maxMs ? Math.round(raw) : null;
    }
    if (typeof raw === 'string') {
      const s = raw.trim();
      let ms = NaN;
      if (/^\d+(?:\.\d+)?ms$/i.test(s)) {
        ms = parseFloat(s.slice(0, -2));
      } else if (/^\d+(?:\.\d+)?s$/i.test(s)) {
        ms = parseFloat(s.slice(0, -1)) * 1000;
      } else if (/^\d+(?:\.\d+)?$/.test(s)) {
        ms = parseFloat(s);
      }
      return Number.isFinite(ms) && ms > 0 && ms <= maxMs ? Math.round(ms) : null;
    }
    if (typeof raw === 'object') {
      const rawSec = raw.seconds !== undefined ? raw.seconds : raw.sec;
      const rawNanos = raw.nanos !== undefined ? raw.nanos : raw.nano;
      if (rawSec !== undefined || rawNanos !== undefined) {
        const ms = Number(rawSec ?? 0) * 1000 + Number(rawNanos ?? 0) / 1e6;
        return Number.isFinite(ms) && ms > 0 && ms <= maxMs ? Math.round(ms) : null;
      }
    }
    return null;
  }

  function summarizeStep(step) {
    if (!step || typeof step !== 'object') {
      return {
        modelUsage: null,
        type: '',
        role: '',
        createdAt: null,
        finishedGeneratingAt: null,
        status: '',
        estTokens: 0,
        durationMs: null,
        ttftMs: null,
        hasOutputContent: false,
        sourceCascadeId: ''
      };
    }
    const modelUsage = extractStepModelUsage(step);
    const sourceCascadeId = String(
      step.metadata?.sourceTrajectoryStepInfo?.cascadeId || ''
    )
      .trim()
      .slice(0, 160);
    const type = typeof step.type === 'string' ? step.type.slice(0, 64) : '';
    const role = typeof step.role === 'string' ? step.role.slice(0, 32) : '';
    const status = String(step.status ?? step.stepStatus ?? step.state ?? '').slice(0, 48);
    const createdAt = parseResetTimeMs(
      step.metadata?.createdAt ?? step.createdAt ?? step.timestamp
    );
    const finishedGeneratingAt = parseResetTimeMs(
      step.metadata?.finishedGeneratingAt ??
        step.finishedGeneratingAt ??
        step.metadata?.completedAt ??
        step.completedAt
    );
    const explicitDuration = parseDurationMs(
      step.metadata?.durationMs ??
        step.metadata?.duration_ms ??
        step.metadata?.latencyMs ??
        step.durationMs ??
        step.duration_ms ??
        step.latencyMs ??
        step.metadata?.duration
    );
    let durationMs = explicitDuration;
    if (
      durationMs === null &&
      createdAt !== null &&
      finishedGeneratingAt !== null &&
      finishedGeneratingAt > createdAt &&
      finishedGeneratingAt - createdAt <= 3_600_000
    ) {
      durationMs = Math.round(finishedGeneratingAt - createdAt);
    }

    const explicitTtft = parseDurationMs(
      step.metadata?.ttftMs ??
        step.metadata?.ttft_ms ??
        step.metadata?.firstTokenMs ??
        step.metadata?.first_token_ms ??
        step.metadata?.timeToFirstTokenMs ??
        step.ttftMs ??
        step.firstTextMs ??
        step.first_text_ms,
      600_000
    );
    let ttftMs = explicitTtft;
    if (ttftMs === null) {
      const firstTokenAt = parseResetTimeMs(
        step.metadata?.firstTokenAt ??
          step.metadata?.firstGeneratingAt ??
          step.metadata?.startedGeneratingAt ??
          step.firstTokenAt
      );
      if (
        firstTokenAt !== null &&
        createdAt !== null &&
        firstTokenAt > createdAt &&
        firstTokenAt - createdAt <= 600_000
      ) {
        ttftMs = Math.round(firstTokenAt - createdAt);
      }
    }
    if (durationMs !== null && ttftMs !== null && ttftMs > durationMs) {
      ttftMs = null;
    }

    const estTokens = estimateStepTokens(step);
    const isUserStep = type.toUpperCase().includes('USER') || role.toUpperCase() === 'USER';
    const hasOutputContent = Boolean(
      (modelUsage && (modelUsage.outputTokens > 0 || modelUsage.reasoningTokens > 0)) ||
        (!isUserStep && estTokens > 0)
    );
    return {
      modelUsage,
      type,
      role,
      createdAt,
      finishedGeneratingAt,
      status,
      estTokens,
      durationMs,
      ttftMs,
      hasOutputContent,
      sourceCascadeId
    };
  }

  function createEmptyStepAccumulator() {
    return {
      hasExactSnapshot: false,
      baseTokens: 0,
      inputTokens: 0,
      cacheReadTokens: 0,
      cacheCreationTokens: 0,
      cacheWrite5mTokens: 0,
      cacheWrite1hTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      estimatedDelta: 0,
      latestStepModelId: '',
      prevCacheInclusiveInput: 0,
      prevContextUsed: 0,
      prevSnapshotModel: '',
      compressionDetected: false,
      compressionBefore: 0,
      compressionAfter: 0,
      compressionDrop: 0,
      sessionInputTokens: 0,
      sessionCacheReadTokens: 0,
      sessionCacheCreationTokens: 0,
      sessionCacheWrite5mTokens: 0,
      sessionCacheWrite1hTokens: 0,
      sessionOutputTokens: 0,
      sessionReasoningTokens: 0,
      sessionStepPricedCount: 0,
      subagentTotalTokens: 0,
      lastStepTs: null,
      lastStepDurationMs: null,
      lastStepTtftMs: null
    };
  }

  function foldStepIntoAccumulator(acc, s) {
    if (!s || typeof s !== 'object') return;
    const mu = s.modelUsage;
    const sModel = String(mu?.model || '').trim();
    // 过滤影子/子代理/生图模型，防止覆盖主模型 ID、上下文上限或快照
    if (sModel && isShadowModel(sModel)) {
      if (mu) {
        const shIn = toNonNegInt(mu.inputTokens);
        const shCr = toNonNegInt(mu.cacheReadTokens);
        const shCw = toNonNegInt(mu.cacheCreationTokens);
        const shOut = toNonNegInt(mu.outputTokens);
        const shReason = toNonNegInt(mu.reasoningTokens);
        const shEffOut = mu.reasoningInOutput ? Math.max(0, shOut - shReason) : shOut;
        acc.subagentTotalTokens += shIn + shCr + shCw + shEffOut + shReason;
      }
      return;
    }

    if (
      (typeof s.durationMs === 'number' && s.durationMs > 0) ||
      (typeof s.ttftMs === 'number' && s.ttftMs > 0)
    ) {
      acc.lastStepDurationMs =
        typeof s.durationMs === 'number' && s.durationMs > 0 ? Math.round(s.durationMs) : null;
      acc.lastStepTtftMs =
        typeof s.ttftMs === 'number' && s.ttftMs > 0 ? Math.round(s.ttftMs) : null;
    }

    const inTok = toNonNegInt(mu?.inputTokens);
    const cacheRead = toNonNegInt(mu?.cacheReadTokens);
    const cacheCreate = toNonNegInt(mu?.cacheCreationTokens);
    const cacheW5m = toNonNegInt(mu?.cacheWrite5mTokens);
    const cacheW1h = toNonNegInt(mu?.cacheWrite1hTokens);
    const outTok = toNonNegInt(mu?.outputTokens);
    const reasonTok = toNonNegInt(mu?.reasoningTokens);
    const effOutTok = mu?.reasoningInOutput ? Math.max(0, outTok - reasonTok) : outTok;
    const totalMu = inTok + cacheRead + cacheCreate + outTok;
    const sessionStepTotal = inTok + cacheRead + cacheCreate + effOutTok + reasonTok;

    if (mu && sessionStepTotal > 0) {
      acc.sessionInputTokens += inTok;
      acc.sessionCacheReadTokens += cacheRead;
      acc.sessionCacheCreationTokens += cacheCreate;
      acc.sessionCacheWrite5mTokens += cacheW5m;
      acc.sessionCacheWrite1hTokens += cacheW1h;
      acc.sessionOutputTokens += effOutTok;
      acc.sessionReasoningTokens += reasonTok;
      acc.sessionStepPricedCount += 1;
      const stepTs = s.finishedGeneratingAt ?? s.createdAt ?? null;
      if (typeof stepTs === 'number' && Number.isFinite(stepTs) && stepTs > (acc.lastStepTs || 0)) {
        acc.lastStepTs = stepTs;
      }
    }

    if (mu && totalMu > 0) {
      const cacheInclusiveInput = inTok + cacheRead + cacheCreate;
      const hitInputDrop =
        acc.prevCacheInclusiveInput > 0 && acc.prevCacheInclusiveInput - cacheInclusiveInput > 5000;
      const hitSameModelDrop =
        Boolean(acc.prevSnapshotModel && sModel && acc.prevSnapshotModel === sModel) &&
        acc.prevContextUsed > 0 &&
        acc.prevContextUsed - totalMu > 5000;

      if (hitInputDrop || hitSameModelDrop) {
        acc.compressionDetected = true;
        if (acc.prevContextUsed > totalMu) {
          acc.compressionBefore = acc.prevContextUsed;
          acc.compressionAfter = totalMu;
        } else {
          acc.compressionBefore = acc.prevCacheInclusiveInput;
          acc.compressionAfter = cacheInclusiveInput;
        }
        const rawDrop = Math.max(0, acc.compressionBefore - acc.compressionAfter);
        acc.compressionDrop =
          acc.compressionBefore > 0
            ? Math.max(1, Math.round((rawDrop / acc.compressionBefore) * 100))
            : 0;
      }

      acc.prevCacheInclusiveInput = cacheInclusiveInput;
      acc.prevContextUsed = totalMu;
      if (sModel) acc.prevSnapshotModel = sModel;

      acc.hasExactSnapshot = true;
      acc.baseTokens = totalMu;
      acc.inputTokens = inTok;
      acc.cacheReadTokens = cacheRead;
      acc.cacheCreationTokens = cacheCreate;
      acc.cacheWrite5mTokens = cacheW5m;
      acc.cacheWrite1hTokens = cacheW1h;
      acc.outputTokens = outTok;
      acc.reasoningTokens = reasonTok;
      acc.estimatedDelta = 0;
      if (sModel) acc.latestStepModelId = sModel;
    } else {
      if (sModel && !acc.latestStepModelId) acc.latestStepModelId = sModel;
      if (!mu || sessionStepTotal === 0) {
        acc.estimatedDelta += toNonNegInt(s.estTokens);
      }
    }
  }

  function getOrCreateConvTelemetry(convId) {
    let entry = convTelemetryById.get(convId);
    if (!entry) {
      entry = {
        convId,
        title: '',
        modelId: '',
        modelLabel: '',
        isRunning: false,
        totalStepCount: 0,
        stepOffsetBase: 0,
        steps: [],
        evictedSessionAcc: createEmptyStepAccumulator(),
        pricedStepLog: new Map(),
        minLoggedPricedIdx: 0,
        liveStepTimings: new Map(),
        hasExactSourceSteps: false,
        contextWindowUsage: null,
        lastStreamTs: 0,
        lastStreamTokens: 0,
        tokPerSec: 0,
        speedSamples: [],
        avgTokPerSec: 0,
        updatedAt: 0
      };
      convTelemetryById.set(convId, entry);
      pruneMapToLimit(convTelemetryById, MAX_TELEMETRY_CONVS);
    }
    return entry;
  }

  function analyzeConversationSteps(convEntry, composerInfo = null) {
    const convId = String(convEntry?.convId || '');
    const steps = Array.isArray(convEntry?.steps) ? convEntry.steps : [];
    const acc = convEntry?.evictedSessionAcc
      ? { ...convEntry.evictedSessionAcc }
      : createEmptyStepAccumulator();

    for (let i = 0; i < steps.length; i++) {
      foldStepIntoAccumulator(acc, steps[i]);
    }

    const composerOwned = Boolean(composerInfo && composerInfo.convId === convId);
    const rawPrimaryModelId =
      (composerOwned && composerInfo.modelId && !isShadowModel(composerInfo.modelId)
        ? composerInfo.modelId
        : '') ||
      acc.latestStepModelId ||
      (convEntry?.modelId && !isShadowModel(convEntry.modelId) ? convEntry.modelId : '') ||
      (composerInfo?.modelId && !isShadowModel(composerInfo.modelId) ? composerInfo.modelId : '') ||
      '';
    const primaryModelId = netModelIdByNumValue.get(rawPrimaryModelId) || rawPrimaryModelId;

    const modelMeta = findModelMeta(
      primaryModelId,
      (composerOwned ? composerInfo.modelLabel : '') || convEntry?.modelLabel || ''
    );
    const modelLabel =
      (composerOwned && composerInfo.modelLabel) ||
      modelMeta?.label ||
      convEntry?.modelLabel ||
      primaryModelId ||
      '';
    const cwu = convEntry?.contextWindowUsage || null;
    const contextLimit =
      cwu && cwu.limit > 10000 ? cwu.limit : getDynamicContextLimit(primaryModelId, modelLabel);

    let precision = 'estimated';
    let contextUsed = acc.estimatedDelta;
    let inputTokens = acc.inputTokens;
    let cacheReadTokens = acc.cacheReadTokens;
    let cacheCreationTokens = acc.cacheCreationTokens;
    let cacheWrite5mTokens = acc.cacheWrite5mTokens;
    let cacheWrite1hTokens = acc.cacheWrite1hTokens;
    let outputTokens = acc.outputTokens;
    let reasoningTokens = acc.reasoningTokens;
    let cacheHitRate = 0;

    if (acc.hasExactSnapshot) {
      precision = 'exact';
      contextUsed = acc.baseTokens + acc.estimatedDelta;
      const totalInSide = inputTokens + cacheReadTokens + cacheCreationTokens;
      cacheHitRate = totalInSide > 0 ? Math.round((cacheReadTokens / totalInSide) * 100) : 0;
    } else {
      if (cwu && cwu.used > 0 && contextUsed === 0) {
        contextUsed = cwu.used;
      }
      inputTokens = 0;
      cacheReadTokens = 0;
      cacheCreationTokens = 0;
      cacheWrite5mTokens = 0;
      cacheWrite1hTokens = 0;
      outputTokens = 0;
      reasoningTokens = 0;
      cacheHitRate = 0;
    }
    let compressionDetected = acc.compressionDetected;
    if (!compressionDetected && cwu && cwu.estimatedAfterCompaction === true) {
      compressionDetected = true;
    }

    const usagePercent =
      contextLimit > 0 ? Math.min(100, Math.round((contextUsed / contextLimit) * 100)) : 0;
    const remainPercent = Math.max(0, 100 - usagePercent);

    const now = Date.now();
    const tokPerSec =
      !convEntry?.isRunning && convEntry?.lastStreamTs && now - convEntry.lastStreamTs > 15000
        ? 0
        : convEntry?.tokPerSec || 0;
    const avgTokPerSec = convEntry?.avgTokPerSec || 0;

    const remainingFraction =
      composerOwned && composerInfo.remainingFraction !== null
        ? composerInfo.remainingFraction
        : modelMeta?.remainingFraction ?? null;
    const resetTimeMs =
      composerOwned && composerInfo.resetTimeMs !== null
        ? composerInfo.resetTimeMs
        : modelMeta?.resetTimeMs ?? null;

    const stepCount = Math.max(
      convEntry?.totalStepCount || 0,
      (convEntry?.stepOffsetBase || 0) + steps.length
    );

    const sessionTotalTokens =
      acc.sessionInputTokens +
      acc.sessionCacheReadTokens +
      acc.sessionCacheCreationTokens +
      acc.sessionOutputTokens +
      acc.sessionReasoningTokens;
    const sessionInputSide =
      acc.sessionInputTokens + acc.sessionCacheReadTokens + acc.sessionCacheCreationTokens;
    const sessionCacheHitRate =
      sessionInputSide > 0 ? Math.round((acc.sessionCacheReadTokens / sessionInputSide) * 100) : 0;

    return {
      convId,
      modelId: primaryModelId,
      modelLabel,
      contextUsed,
      contextLimit,
      usagePercent,
      remainPercent,
      inputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      cacheWrite5mTokens,
      cacheWrite1hTokens,
      outputTokens,
      reasoningTokens,
      estimatedDelta: acc.estimatedDelta,
      cacheHitRate,
      tokPerSec,
      avgTokPerSec,
      compressionDetected,
      compressionBefore: acc.compressionBefore,
      compressionAfter: acc.compressionAfter,
      compressionDrop: acc.compressionDrop,
      precision,
      isRunning: Boolean(convEntry?.isRunning),
      remainingFraction,
      resetTimeMs,
      stepCount,
      sessionInputTokens: acc.sessionInputTokens,
      sessionCacheReadTokens: acc.sessionCacheReadTokens,
      sessionCacheCreationTokens: acc.sessionCacheCreationTokens,
      sessionCacheWrite5mTokens: acc.sessionCacheWrite5mTokens,
      sessionCacheWrite1hTokens: acc.sessionCacheWrite1hTokens,
      sessionOutputTokens: acc.sessionOutputTokens,
      sessionReasoningTokens: acc.sessionReasoningTokens,
      sessionTotalTokens,
      sessionCacheHitRate,
      sessionStepPricedCount: acc.sessionStepPricedCount,
      lastStepTs: acc.lastStepTs,
      subagentTotalTokens: acc.subagentTotalTokens,
      lastStepDurationMs: acc.lastStepDurationMs,
      lastStepTtftMs: acc.lastStepTtftMs
    };
  }

  function updateStreamSpeed(entry, isRunningNow) {
    if (!entry) return;
    if (!isRunningNow) return;
    const analysis = analyzeConversationSteps(entry, null);
    const curTokens = analysis.contextUsed;
    const now = Date.now();
    if (!entry.lastStreamTs || curTokens < entry.lastStreamTokens) {
      entry.lastStreamTs = now;
      entry.lastStreamTokens = curTokens;
      return;
    }
    if (curTokens > entry.lastStreamTokens) {
      const dt = (now - entry.lastStreamTs) / 1000;
      if (dt >= 0.25 && dt <= 12) {
        const spd = (curTokens - entry.lastStreamTokens) / dt;
        if (spd > 0 && spd < 500) {
          const rounded = spd >= 10 ? Math.round(spd) : Math.round(spd * 10) / 10;
          entry.tokPerSec = rounded;
          entry.speedSamples.push(spd);
          if (entry.speedSamples.length > 20) entry.speedSamples.shift();
          const sum = entry.speedSamples.reduce((a, b) => a + b, 0);
          const avg = sum / entry.speedSamples.length;
          entry.avgTokPerSec = avg >= 10 ? Math.round(avg) : Math.round(avg * 10) / 10;
        }
        entry.lastStreamTs = now;
        entry.lastStreamTokens = curTokens;
      } else if (dt > 12) {
        entry.lastStreamTs = now;
        entry.lastStreamTokens = curTokens;
      }
    }
  }

  function isStepStatusRunning(step) {
    if (!step || typeof step !== 'object') return false;
    const st = String(step.status ?? step.stepStatus ?? step.state ?? '').toUpperCase();
    return /RUNNING|WORKING|IN_PROGRESS|GENERATING|STREAMING|EXECUTING/.test(st);
  }

  function applyStepLiveTiming(entry, absIdx, rawStep, next, prev, ctx) {
    if (!next || typeof next !== 'object') return next;
    const isUserStep =
      next.type.toUpperCase().includes('USER') || next.role.toUpperCase() === 'USER';
    if (isUserStep) return next;

    if (!(entry.liveStepTimings instanceof Map)) {
      entry.liveStepTimings = new Map();
    }
    const now = ctx.now;
    const isRunningStep = isStepStatusRunning(rawStep);
    const hasOutput = Boolean(next.hasOutputContent);
    let timing = entry.liveStepTimings.get(absIdx) || null;

    if (!timing && (ctx.source !== 'fiber' || isRunningStep)) {
      if (
        isRunningStep &&
        (!hasOutput || next.createdAt === null || now - next.createdAt <= 15_000)
      ) {
        const rawStart = next.createdAt ?? ctx.streamReqStartedAt ?? now;
        timing = {
          startAt: Number.isFinite(rawStart) ? rawStart : now,
          firstOutputAt: null,
          finishedAt: null
        };
        entry.liveStepTimings.set(absIdx, timing);
        if (entry.liveStepTimings.size > 32) {
          const oldestKey = entry.liveStepTimings.keys().next().value;
          if (oldestKey !== undefined) entry.liveStepTimings.delete(oldestKey);
        }
      }
    }

    if (timing) {
      if (
        timing.firstOutputAt === null &&
        hasOutput &&
        now > timing.startAt &&
        now - timing.startAt <= 600_000
      ) {
        timing.firstOutputAt = now;
      }
      if (
        timing.finishedAt === null &&
        !isRunningStep &&
        hasOutput &&
        now >= timing.startAt &&
        now - timing.startAt <= 3_600_000
      ) {
        timing.finishedAt =
          next.finishedGeneratingAt !== null && next.finishedGeneratingAt > timing.startAt
            ? next.finishedGeneratingAt
            : now;
      }
    }

    const observedTtft =
      timing && timing.firstOutputAt !== null && timing.firstOutputAt > timing.startAt
        ? Math.round(timing.firstOutputAt - timing.startAt)
        : null;
    const streamTailTtft =
      ctx.isTail &&
      isRunningStep &&
      typeof ctx.streamTtftMs === 'number' &&
      ctx.streamTtftMs > 0 &&
      ctx.streamTtftMs <= 600_000
        ? Math.round(ctx.streamTtftMs)
        : null;
    const observedDur =
      timing && timing.finishedAt !== null && timing.finishedAt > timing.startAt
        ? Math.round(timing.finishedAt - timing.startAt)
        : null;

    let mergedTtft = next.ttftMs ?? prev?.ttftMs ?? observedTtft ?? streamTailTtft ?? null;
    let mergedDur = next.durationMs ?? prev?.durationMs ?? observedDur ?? null;
    if (typeof mergedTtft !== 'number' || !Number.isFinite(mergedTtft) || mergedTtft <= 0) {
      mergedTtft = null;
    } else {
      mergedTtft = Math.round(mergedTtft);
    }
    if (typeof mergedDur !== 'number' || !Number.isFinite(mergedDur) || mergedDur <= 0) {
      mergedDur = null;
    } else {
      mergedDur = Math.round(mergedDur);
    }
    if (mergedDur !== null && mergedTtft !== null && mergedTtft > mergedDur) {
      mergedTtft = mergedDur;
    }

    const mergedCreatedAt = next.createdAt ?? prev?.createdAt ?? timing?.startAt ?? null;
    const mergedFinishedAt =
      next.finishedGeneratingAt ?? prev?.finishedGeneratingAt ?? timing?.finishedAt ?? null;

    if (
      mergedTtft !== next.ttftMs ||
      mergedDur !== next.durationMs ||
      mergedCreatedAt !== next.createdAt ||
      mergedFinishedAt !== next.finishedGeneratingAt
    ) {
      return {
        ...next,
        ttftMs: mergedTtft,
        durationMs: mergedDur,
        createdAt: mergedCreatedAt,
        finishedGeneratingAt: mergedFinishedAt
      };
    }
    return next;
  }

  function isEligibleLedgerConvId(convId) {
    return (
      typeof convId === 'string' &&
      convId.length >= 6 &&
      convId.length <= 160 &&
      !convId.startsWith('composer-panel-') &&
      !GENERIC_CONTAINER_KEY_RE.test(convId)
    );
  }

  function recordPricedStep(entry, absIndex, s, rawStep) {
    if (!entry || !s || typeof s !== 'object') return;
    const convId = String(entry.convId || '');
    if (!isEligibleLedgerConvId(convId)) return;
    const mu = s.modelUsage;
    if (!mu || typeof mu !== 'object') return;
    if (mu.model && isShadowModel(mu.model)) return;

    const inTok = toNonNegInt(mu.inputTokens);
    const crTok = toNonNegInt(mu.cacheReadTokens);
    const cw5mTok = toNonNegInt(mu.cacheWrite5mTokens);
    const cw1hTok = toNonNegInt(mu.cacheWrite1hTokens);
    const cwTok = Math.max(toNonNegInt(mu.cacheCreationTokens), cw5mTok + cw1hTok);
    const rawOutTok = toNonNegInt(mu.outputTokens);
    const rsTok = toNonNegInt(mu.reasoningTokens);
    const effOutTok = mu.reasoningInOutput ? Math.max(0, rawOutTok - rsTok) : rawOutTok;
    const stepTotal = inTok + crTok + cwTok + effOutTok + rsTok;
    if (stepTotal <= 0) return;

    const rawModelId = String(mu.model || entry.modelId || '').trim();
    const resolvedModelId = netModelIdByNumValue.get(rawModelId) || rawModelId;
    const modelLabel =
      findModelMeta(resolvedModelId, entry.modelLabel)?.label || entry.modelLabel || '';
    const observedLive = Boolean(
      entry.liveStepTimings?.has(absIndex) || isStepStatusRunning(rawStep)
    );

    if (!(entry.pricedStepLog instanceof Map)) {
      entry.pricedStepLog = new Map();
    }
    const prevRec = entry.pricedStepLog.get(absIndex);
    const liveTiming = entry.liveStepTimings?.get(absIndex) || null;
    entry.pricedStepLog.set(absIndex, {
      idx: absIndex,
      m: resolvedModelId,
      ml: modelLabel,
      in: inTok,
      cr: crTok,
      cw: cwTok,
      cw5m: cw5mTok,
      cw1h: cw1hTok,
      out: effOutTok,
      rs: rsTok,
      ts:
        s.finishedGeneratingAt ??
        s.createdAt ??
        liveTiming?.finishedAt ??
        liveTiming?.startAt ??
        prevRec?.ts ??
        (observedLive ? Date.now() : null),
      dur: s.durationMs ?? prevRec?.dur ?? null,
      ttft: s.ttftMs ?? prevRec?.ttft ?? null,
      fork: Boolean((s.sourceCascadeId && s.sourceCascadeId !== convId) || prevRec?.fork),
      live: Boolean(observedLive || prevRec?.live)
    });

    if (entry.pricedStepLog.size > MAX_PRICED_STEP_LOG) {
      let oldestIdx = Infinity;
      for (const k of entry.pricedStepLog.keys()) {
        if (k < oldestIdx) oldestIdx = k;
      }
      if (Number.isFinite(oldestIdx)) {
        entry.pricedStepLog.delete(oldestIdx);
        entry.minLoggedPricedIdx = Math.max(entry.minLoggedPricedIdx || 0, oldestIdx + 1);
      }
    }
  }

  function upsertConvSteps(
    convId,
    rawSteps,
    {
      stepOffset = 0,
      isIncremental = false,
      isStepsSource = true,
      source = 'network',
      isRunningHint = false,
      streamReqStartedAt = null,
      streamTtftMs = null
    } = {}
  ) {
    if (!convId || !Array.isArray(rawSteps) || rawSteps.length === 0) return false;
    const entry = getOrCreateConvTelemetry(convId);
    const summarized = rawSteps.map(summarizeStep);
    const hasUsageInNew = summarized.some(
      (s) =>
        s.modelUsage &&
        !isShadowModel(s.modelUsage.model) &&
        s.modelUsage.inputTokens +
          s.modelUsage.cacheReadTokens +
          s.modelUsage.cacheCreationTokens +
          s.modelUsage.outputTokens +
          s.modelUsage.reasoningTokens >
          0
    );

    // 避免用无 modelUsage 的 Fiber UI messages 降级已获取的精确 RPC steps
    if (source === 'fiber' && !isStepsSource && entry.hasExactSourceSteps && !hasUsageInNew) {
      return false;
    }

    let effOffset = Math.max(0, toNonNegInt(stepOffset));
    if (
      isIncremental &&
      effOffset > 0 &&
      entry.totalStepCount > 0 &&
      summarized.length >= entry.totalStepCount &&
      summarized.length > entry.totalStepCount - effOffset + 5
    ) {
      effOffset = 0;
    }

    const now = Date.now();
    const timingBaseCtx = {
      source,
      streamReqStartedAt,
      streamTtftMs,
      now
    };

    if (entry.steps.length === 0 || (!isIncremental && effOffset === 0)) {
      const prevSteps = entry.steps;
      const prevBase = entry.stepOffsetBase;
      if (effOffset === 0 && summarized.length < prevBase && entry.pricedStepLog instanceof Map) {
        entry.pricedStepLog.clear();
        entry.minLoggedPricedIdx = 0;
      }
      entry.evictedSessionAcc = createEmptyStepAccumulator();
      const merged = summarized.map((s, idx) => {
        const prev = prevBase === 0 ? prevSteps[idx] : null;
        let next =
          source === 'fiber' &&
          !s.modelUsage &&
          prev?.modelUsage &&
          prev.type === s.type &&
          prev.role === s.role
            ? { ...s, modelUsage: prev.modelUsage }
            : s;
        next = applyStepLiveTiming(entry, effOffset + idx, rawSteps[idx], next, prev, {
          ...timingBaseCtx,
          isTail: idx === summarized.length - 1
        });
        recordPricedStep(entry, effOffset + idx, next, rawSteps[idx]);
        return next;
      });
      entry.stepOffsetBase = effOffset;
      entry.steps = merged;
    } else if (effOffset < entry.stepOffsetBase) {
      entry.evictedSessionAcc = createEmptyStepAccumulator();
      entry.stepOffsetBase = effOffset;
      entry.steps = summarized.map((s, idx) => {
        const next = applyStepLiveTiming(entry, effOffset + idx, rawSteps[idx], s, null, {
          ...timingBaseCtx,
          isTail: idx === summarized.length - 1
        });
        recordPricedStep(entry, effOffset + idx, next, rawSteps[idx]);
        return next;
      });
    } else {
      const relStart = effOffset - entry.stepOffsetBase;
      for (let i = 0; i < summarized.length; i++) {
        const targetIdx = relStart + i;
        const prev = entry.steps[targetIdx];
        let next = summarized[i];
        if (
          source === 'fiber' &&
          !next.modelUsage &&
          prev?.modelUsage &&
          prev.type === next.type &&
          prev.role === next.role
        ) {
          next = { ...next, modelUsage: prev.modelUsage };
        }
        next = applyStepLiveTiming(entry, effOffset + i, rawSteps[i], next, prev, {
          ...timingBaseCtx,
          isTail: i === summarized.length - 1
        });
        entry.steps[targetIdx] = next;
        recordPricedStep(entry, effOffset + i, next, rawSteps[i]);
      }
      if (entry.totalStepCount === 0 || effOffset + summarized.length >= entry.totalStepCount) {
        entry.steps.length = relStart + summarized.length;
      }
    }

    if (entry.steps.length > MAX_STEPS_PER_CONV) {
      const drop = entry.steps.length - MAX_STEPS_PER_CONV;
      const evicted = entry.steps.splice(0, drop);
      if (!entry.evictedSessionAcc) {
        entry.evictedSessionAcc = createEmptyStepAccumulator();
      }
      for (let i = 0; i < evicted.length; i++) {
        foldStepIntoAccumulator(entry.evictedSessionAcc, evicted[i]);
      }
      entry.stepOffsetBase += drop;
    }

    if (hasUsageInNew) {
      entry.hasExactSourceSteps = true;
    }
    entry.totalStepCount = Math.max(entry.totalStepCount, entry.stepOffsetBase + entry.steps.length);
    entry.updatedAt = Date.now();

    const lastStep = rawSteps[rawSteps.length - 1];
    const lastStepRawStatus = String(
      lastStep?.status ?? lastStep?.stepStatus ?? lastStep?.state ?? ''
    ).trim();
    const lastStepTerminal =
      isStepsSource &&
      effOffset + summarized.length >= entry.totalStepCount &&
      /^(?:CORTEX_STEP_STATUS_)?(?:DONE|COMPLETED|COMPLETE|FINISHED|FAILED|ERROR|CANCELLED|CANCELED|ABORTED|STOPPED)$/i.test(
        lastStepRawStatus
      );
    const netConv = netConvsById.get(`id::${convId}`);
    const runningNow = lastStepTerminal && !isRunningHint && netConv?.state !== 'running'
      ? false
      : Boolean(
          isRunningHint ||
            entry.isRunning ||
            netConv?.state === 'running' ||
            isStepStatusRunning(lastStep)
        );
    entry.isRunning = runningNow;
    updateStreamSpeed(entry, runningNow);

    // 刷新 FIFO 顺序（最新活跃保留在队尾）
    convTelemetryById.delete(convId);
    convTelemetryById.set(convId, entry);
    pruneMapToLimit(convTelemetryById, MAX_TELEMETRY_CONVS);
    return true;
  }

  function looksLikeStepArray(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return false;
    const first = arr[0];
    if (!first || typeof first !== 'object' || Array.isArray(first)) return false;
    try {
      if ((typeof Node !== 'undefined' && first instanceof Node) || first.$$typeof) return false;
    } catch {
      return false;
    }
    return (
      'type' in first ||
      'role' in first ||
      'status' in first ||
      'stepStatus' in first ||
      'metadata' in first ||
      'modelUsage' in first ||
      'plannerResponse' in first ||
      'userInput' in first ||
      'content' in first ||
      'text' in first ||
      'parts' in first ||
      'runCommand' in first
    );
  }

  function extractConvIdFromUrl(rawUrl) {
    if (typeof rawUrl !== 'string' || !rawUrl) return '';
    const m1 = rawUrl.match(URL_CONV_ID_RE);
    if (m1) return m1[1];
    try {
      const decoded = decodeURIComponent(rawUrl);
      const m2 = decoded.match(URL_CONV_ID_RE);
      if (m2) return m2[1];
    } catch {}
    return '';
  }

  function extractDirectConvId(obj, fallbackKey = '') {
    if (!obj || typeof obj !== 'object') return '';
    const raw =
      obj.cascadeId ??
      obj.conversationId ??
      obj.trajectoryId ??
      obj.threadId ??
      obj.activeCascadeId ??
      obj.activeConversationId ??
      obj.currentCascadeId ??
      obj.currentConversationId ??
      '';
    if (typeof raw === 'string' && raw.trim().length >= 4 && raw.trim().length <= 160) {
      return raw.trim();
    }
    if (
      typeof fallbackKey === 'string' &&
      fallbackKey.trim().length >= 6 &&
      fallbackKey.trim().length <= 160 &&
      !GENERIC_CONTAINER_KEY_RE.test(fallbackKey.trim())
    ) {
      return fallbackKey.trim();
    }
    return '';
  }

  function ingestTrajectorySummaries(summariesObj, { isAuthoritative = false } = {}) {
    if (!summariesObj || typeof summariesObj !== 'object') return false;
    const pairs =
      summariesObj instanceof Map
        ? Array.from(summariesObj.entries())
        : Object.entries(summariesObj);
    if (pairs.length === 0) {
      if (isAuthoritative) {
        authoritativeTrajectoryIds = new Set();
        if (netConvsById.size > 0) {
          netConvsById.clear();
          return true;
        }
      }
      return false;
    }

    // 按更新时间升序插入，确保 FIFO 淘汰最旧对话、保留最新 40 条
    const sorted = pairs
      .filter(
        ([id, val]) =>
          typeof id === 'string' &&
          id.trim().length >= 4 &&
          !GENERIC_CONTAINER_KEY_RE.test(id.trim()) &&
          val &&
          typeof val === 'object'
      )
      .map(([id, val]) => ({
        id: id.trim(),
        val,
        ts:
          parseResetTimeMs(val.lastModifiedTime ?? val.updatedAt ?? val.lastActivityAt ?? val.createdTime) ||
          0
      }))
      .sort((a, b) => a.ts - b.ts);

    let changed = false;
    if (isAuthoritative) {
      const nextIds = new Set(sorted.map((item) => item.id));
      authoritativeTrajectoryIds = nextIds;
      for (const [k, rec] of netConvsById.entries()) {
        if (rec?.convId && !nextIds.has(rec.convId)) {
          netConvsById.delete(k);
          changed = true;
        }
      }
      for (const id of convTelemetryById.keys()) {
        if (!nextIds.has(id)) {
          convTelemetryById.delete(id);
          changed = true;
        }
      }
    }
    for (const { id, val } of sorted) {
      const entry = getOrCreateConvTelemetry(id);
      const norm = normalizeConvState(val);
      const stepCount = toNonNegInt(val.stepCount ?? val.stepsCount ?? val.numSteps);
      if (stepCount > entry.totalStepCount) {
        entry.totalStepCount = stepCount;
        changed = true;
      }
      const nextRunning = norm.state === 'running';
      if (entry.isRunning !== nextRunning) {
        entry.isRunning = nextRunning;
        changed = true;
      }
      const title = String(val.summary ?? val.title ?? '').trim();
      if (title && !entry.title) entry.title = title;

      const latestStep = val.latestTaskBoundaryStep ?? val.lastStep ?? val.latestStep;
      if (latestStep && typeof latestStep === 'object') {
        const mu = extractStepModelUsage(latestStep);
        if (mu?.model && !isShadowModel(mu.model) && !entry.modelId) {
          entry.modelId = mu.model;
        }
      }

      if (looksLikeConversationObject(val, id)) {
        const rec = extractConvRecord(val, '', '', id, null, null);
        const key = getConvMergeKey(rec);
        netConvsById.set(key, mergeConvRecord(netConvsById.get(key), rec, { preferLatestExplicit: true }));
      }
      entry.updatedAt = Date.now();
      convTelemetryById.delete(id);
      convTelemetryById.set(id, entry);
      pruneMapToLimit(convTelemetryById, MAX_TELEMETRY_CONVS);
    }
    return changed;
  }

  function ingestTelemetryDataTree(rootVal, meta = {}) {
    if (!rootVal || typeof rootVal !== 'object') return false;
    const visited = meta.visited instanceof WeakSet ? meta.visited : new WeakSet();
    let budget = typeof meta.budget === 'number' ? meta.budget : meta.source === 'fiber' ? 450 : 500;
    let changed = false;
    const isAuthoritativeTrajectories = Boolean(
      meta.endpoint === 'GetAllCascadeTrajectories' ||
        (typeof meta.url === 'string' && /GetAllCascadeTrajectories\b/i.test(meta.url))
    );

    function walk(val, depth, inheritedConvId, parentKey) {
      if (budget <= 0 || depth > 7 || isBlockedBridgeValue(val)) return;
      try {
        if ((typeof Node !== 'undefined' && val instanceof Node) || val.$$typeof) return;
        if (visited.has(val)) return;
        visited.add(val);
        budget--;

        if (val instanceof Map) {
          for (const [k, v] of val.entries()) {
            const ks = typeof k === 'string' ? k : '';
            walk(v, depth + 1, inheritedConvId, ks);
          }
          return;
        }
        if (val instanceof Set) {
          for (const item of val.values()) {
            walk(item, depth + 1, inheritedConvId, '');
          }
          return;
        }
        if (Array.isArray(val)) {
          for (let i = 0; i < val.length && i < 60; i++) {
            walk(val[i], depth + 1, inheritedConvId, '');
          }
          return;
        }

        // 1. 捕获 activeConversationId / activeCascadeId
        const activeCand =
          val.activeCascadeId ??
          val.activeConversationId ??
          val.currentCascadeId ??
          val.currentConversationId ??
          val.selectedCascadeId;
        if (typeof activeCand === 'string' && activeCand.trim().length >= 6) {
          lastKnownActiveConvId = activeCand.trim();
        }

        // 2. 捕获模型配额与上下文配置 (`userStatus` / `cascadeModelConfigData` / `clientModelConfigs` / `currentModelConfig`)
        const ingestSource = meta.source || 'network';
        const clientConfigs =
          val.userStatus?.cascadeModelConfigData?.clientModelConfigs ??
          val.cascadeModelConfigData?.clientModelConfigs ??
          val.clientModelConfigs;
        if (Array.isArray(clientConfigs)) {
          for (const cfg of clientConfigs) {
            if (upsertModelConfig(extractModelConfigInfo(cfg), ingestSource)) changed = true;
          }
        }
        for (const key of ['currentModelConfig', 'selectedModelConfig', 'activeModelConfig', 'modelConfig']) {
          if (val[key] && typeof val[key] === 'object') {
            if (upsertModelConfig(extractModelConfigInfo(val[key]), ingestSource)) changed = true;
          }
        }
        if ('quotaInfo' in val && ('modelOrAlias' in val || 'modelId' in val || 'label' in val)) {
          if (upsertModelConfig(extractModelConfigInfo(val), ingestSource)) changed = true;
        }

        // 3. 捕获 `trajectorySummaries`
        if (val.trajectorySummaries && typeof val.trajectorySummaries === 'object') {
          const rawSummaries =
            val.trajectorySummaries.summaries && typeof val.trajectorySummaries.summaries === 'object'
              ? val.trajectorySummaries.summaries
              : val.trajectorySummaries;
          if (ingestTrajectorySummaries(rawSummaries, { isAuthoritative: isAuthoritativeTrajectories })) {
            changed = true;
          }
        }

        // 4. 捕获 `steps` / `trajectory.steps` / `turns` / `messages` / `contextWindowUsage`
        const localConvId =
          extractDirectConvId(val, parentKey) ||
          extractDirectConvId(val.trajectory, '') ||
          extractDirectConvId(val.cascade, '') ||
          extractDirectConvId(val.metadata, '') ||
          inheritedConvId;

        if (val.contextWindowUsage && typeof val.contextWindowUsage === 'object' && localConvId) {
          const cwu = val.contextWindowUsage;
          const used = toNonNegInt(cwu.estimatedTokensUsed);
          const limit = toNonNegInt(cwu.maxContextTokens);
          const lastStepIdx =
            typeof cwu.lastStepIndex === 'number' && Number.isFinite(cwu.lastStepIndex)
              ? Math.max(0, Math.round(cwu.lastStepIndex))
              : -1;
          if (used > 0 || limit > 10000) {
            const entry = getOrCreateConvTelemetry(localConvId);
            entry.contextWindowUsage = {
              used,
              limit: limit > 10000 ? limit : 0,
              lastStepIndex: lastStepIdx,
              estimatedAfterCompaction: Boolean(cwu.estimatedAfterCompaction),
              updatedAt: Date.now()
            };
            if (lastStepIdx >= 0 && lastStepIdx + 1 > entry.totalStepCount) {
              entry.totalStepCount = lastStepIdx + 1;
            }
            changed = true;
          }
        }

        const primarySteps = Array.isArray(val.steps)
          ? val.steps
          : Array.isArray(val.trajectory?.steps)
            ? val.trajectory.steps
            : Array.isArray(val.cascade?.trajectory?.steps)
              ? val.cascade.trajectory.steps
              : Array.isArray(val.container?.steps)
                ? val.container.steps
                : null;
        const fallbackTurns = !primarySteps
          ? Array.isArray(val.turns)
            ? val.turns
            : Array.isArray(val.messages)
              ? val.messages
              : null
          : null;
        const targetArr = primarySteps || fallbackTurns;
        const stepConvId =
          localConvId ||
          (Array.isArray(targetArr) &&
            typeof targetArr[0]?.metadata?.sourceTrajectoryStepInfo?.cascadeId === 'string' &&
            targetArr[0].metadata.sourceTrajectoryStepInfo.cascadeId.trim()) ||
          '';
        if (targetArr && stepConvId && looksLikeStepArray(targetArr)) {
          const norm = normalizeConvState(val);
          const stepOffset = toNonNegInt(
            val.stepOffset ?? (depth === 0 ? meta.requestStepOffset : 0)
          );
          const isInc = Boolean(stepOffset > 0 || (depth === 0 && meta.isStepsEndpoint));
          if (
            upsertConvSteps(stepConvId, targetArr, {
              stepOffset,
              isIncremental: isInc,
              isStepsSource: Boolean(primarySteps),
              source: meta.source || 'network',
              isRunningHint: norm.state === 'running',
              streamReqStartedAt: !meta.isReadPoll ? meta.reqStartedAt || null : null,
              streamTtftMs: !meta.isReadPoll ? meta.streamTtftMs || null : null
            })
          ) {
            changed = true;
          }
        }

        // 单步流式增量更新
        if (val.step && typeof val.step === 'object' && localConvId) {
          const idx = typeof val.stepIndex === 'number' ? val.stepIndex : toNonNegInt(val.index);
          if (idx >= 0) {
            if (
              upsertConvSteps(localConvId, [val.step], {
                stepOffset: idx,
                isIncremental: true,
                isStepsSource: true,
                source: meta.source || 'network',
                isRunningHint: isStepStatusRunning(val.step),
                streamReqStartedAt: !meta.isReadPoll ? meta.reqStartedAt || null : null,
                streamTtftMs: !meta.isReadPoll ? meta.streamTtftMs || null : null
              })
            ) {
              changed = true;
            }
          }
        }

        const keys = Object.keys(val);
        for (let i = 0; i < keys.length && i < 45; i++) {
          const k = keys[i];
          if (
            k.startsWith('_') ||
            k === 'steps' ||
            k === 'turns' ||
            k === 'messages' ||
            k === 'clientModelConfigs' ||
            k === 'trajectorySummaries' ||
            k === 'children' ||
            k === 'stateNode' ||
            k === 'return' ||
            k === 'sibling' ||
            k === 'child' ||
            k === 'renderers' ||
            k === 'lexicalEditor' ||
            k === 'cssVariablesProvider' ||
            k === 'PluginCardRenderer' ||
            k === 'MermaidDiagram' ||
            k === 'slashCommandItems' ||
            k === 'mentionsConfig' ||
            k === 'renderConfig' ||
            k === 'getStepRendererConfig' ||
            k === 'tokenizationService'
          ) {
            continue;
          }
          const child = val[k];
          if (child && typeof child === 'object') {
            walk(child, depth + 1, localConvId, k);
          }
        }
      } catch {}
    }

    walk(rootVal, 0, meta.hintConvId || '', '');
    return changed;
  }

  function parseJsonSafely(rawText) {
    if (typeof rawText !== 'string' || rawText.length < 2 || rawText.length > 2_500_000) return null;
    let clean = rawText.trimStart();
    // 兼容 Google 系 `)]}'` 防 XSSI 前缀
    if (clean.startsWith(")]}'")) {
      const nlIdx = clean.indexOf('\n');
      clean = nlIdx >= 0 ? clean.slice(nlIdx + 1).trimStart() : clean.slice(4).trimStart();
    }
    if (!clean || (clean[0] !== '{' && clean[0] !== '[')) return null;
    try {
      return JSON.parse(clean);
    } catch {
      return null;
    }
  }

  function ingestNetworkPayload(data, meta = {}) {
    if (!data || typeof data !== 'object') return false;
    let changed = false;
    const outProjects = { byId: netProjectsById, byName: netProjectsByName };
    const tempConvs = new Map();
    scanArbitraryDataTree(data, new Set(), null, outProjects, tempConvs);
    if (tempConvs.size > 0) {
      for (const [k, conv] of tempConvs.entries()) {
        netConvsById.set(k, mergeConvRecord(netConvsById.get(k), conv, { preferLatestExplicit: true }));
      }
      changed = true;
    }
    if (ingestTelemetryDataTree(data, meta)) {
      changed = true;
    }
    if (changed) {
      netDataDirty = true;
    }
    pruneMapToLimit(netProjectsById);
    pruneMapToLimit(netProjectsByName);
    pruneMapToLimit(netConvsById);
    return changed;
  }

  // ============================================================================
  // 2. 被动只读监听 Fetch / XHR / WebSocket + 受控同源 Connect-RPC 补充
  // ============================================================================
  function readHeaderCaseInsensitive(headers, targetLower) {
    if (!headers) return '';
    try {
      if (typeof headers.get === 'function') {
        return String(headers.get(targetLower) || '').trim();
      }
      if (Array.isArray(headers)) {
        for (const pair of headers) {
          if (
            Array.isArray(pair) &&
            pair.length >= 2 &&
            String(pair[0] || '').toLowerCase() === targetLower
          ) {
            return String(pair[1] || '').trim();
          }
        }
        return '';
      }
      if (typeof headers === 'object') {
        for (const k of Object.keys(headers)) {
          if (k.toLowerCase() === targetLower) {
            return String(headers[k] || '').trim();
          }
        }
      }
    } catch {}
    return '';
  }

  function parseReqBodyHint(rawBody) {
    if (typeof rawBody !== 'string' || rawBody.length < 2 || rawBody.length > 32768) return null;
    try {
      const obj = JSON.parse(rawBody);
      if (!obj || typeof obj !== 'object') return null;
      const convId = String(obj.cascadeId ?? obj.conversationId ?? obj.trajectoryId ?? '').trim();
      const stepOffset = toNonNegInt(obj.stepOffset);
      return { convId, stepOffset };
    } catch {
      return null;
    }
  }

  function inspectFetchArgs(input, init) {
    const urlStr =
      typeof input === 'string'
        ? input
        : input && typeof input.url === 'string'
          ? input.url
          : '';
    if (urlStr.includes(LS_ENDPOINT_MARKER)) {
      sawLanguageServerEndpoint = true;
    }
    let isSameOrigin = false;
    try {
      const resolved = new URL(urlStr, window.location.href);
      isSameOrigin = resolved.origin === window.location.origin;
    } catch {}
    if (isSameOrigin) {
      const csrf =
        readHeaderCaseInsensitive(init?.headers, 'x-codeium-csrf-token') ||
        readHeaderCaseInsensitive(input?.headers, 'x-codeium-csrf-token');
      if (csrf) {
        capturedCsrfToken = csrf;
      }
    }
    const bodyHint = parseReqBodyHint(init?.body);
    return {
      source: 'fetch',
      url: urlStr,
      hintConvId: bodyHint?.convId || extractConvIdFromUrl(urlStr),
      requestStepOffset: bodyHint?.stepOffset || 0,
      isStepsEndpoint: /GetCascadeTrajectorySteps|GetCascadeTrajectory/i.test(urlStr),
      reqStartedAt: Date.now(),
      isReadPoll: READ_ONLY_POLL_ENDPOINT_RE.test(urlStr),
      firstChunkAt: null,
      streamTtftMs: null
    };
  }

  function ingestTextLines(text, meta) {
    if (!text) return;
    const single = parseJsonSafely(text);
    if (single) {
      ingestNetworkPayload(single, meta);
      return;
    }
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length && i < 120; i++) {
      let line = lines[i].trim();
      if (!line) continue;
      if (line.startsWith('data:')) {
        line = line.slice(5).trim();
        if (!line || line === '[DONE]') continue;
      }
      const parsed = parseJsonSafely(line);
      if (parsed) ingestNetworkPayload(parsed, meta);
    }
  }

  async function observeStreamingResponse(resp, meta, ct) {
    try {
      const cloned = resp.clone();
      const reader = cloned.body?.getReader?.();
      if (!reader || typeof TextDecoder !== 'function') return;
      const decoder = new TextDecoder('utf-8');
      const isConnectStream = ct.includes('connect+json');
      let byteBuf = new Uint8Array(0);
      let textBuf = '';
      let totalBytes = 0;
      let chunks = 0;

      while (chunks < 400 && totalBytes < 5_000_000) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value || !value.byteLength) continue;
        chunks++;
        totalBytes += value.byteLength;
        if (meta && !meta.isReadPoll && meta.firstChunkAt === null) {
          meta.firstChunkAt = Date.now();
          if (
            typeof meta.reqStartedAt === 'number' &&
            meta.firstChunkAt > meta.reqStartedAt &&
            meta.firstChunkAt - meta.reqStartedAt <= 600_000
          ) {
            meta.streamTtftMs = meta.firstChunkAt - meta.reqStartedAt;
          }
        }

        if (isConnectStream) {
          const merged = new Uint8Array(byteBuf.length + value.byteLength);
          merged.set(byteBuf, 0);
          merged.set(value, byteBuf.length);
          byteBuf = merged;

          while (byteBuf.length >= 5) {
            const flags = byteBuf[0];
            const frameLen =
              ((byteBuf[1] << 24) | (byteBuf[2] << 16) | (byteBuf[3] << 8) | byteBuf[4]) >>> 0;
            if ((flags === 0 || flags === 2) && frameLen > 0 && frameLen <= 2_500_000) {
              if (byteBuf.length < 5 + frameLen) break;
              const payloadStr = decoder.decode(byteBuf.subarray(5, 5 + frameLen));
              byteBuf = byteBuf.subarray(5 + frameLen);
              const parsed = parseJsonSafely(payloadStr);
              if (parsed) ingestNetworkPayload(parsed, meta);
            } else {
              const fallbackTxt = decoder.decode(byteBuf, { stream: true });
              byteBuf = new Uint8Array(0);
              ingestTextLines(fallbackTxt, meta);
              break;
            }
          }
        } else {
          textBuf += decoder.decode(value, { stream: true });
          const lastNl = textBuf.lastIndexOf('\n');
          if (lastNl >= 0) {
            const ready = textBuf.slice(0, lastNl);
            textBuf = textBuf.slice(lastNl + 1);
            ingestTextLines(ready, meta);
          }
        }
      }
      if (!isConnectStream && textBuf.trim()) {
        ingestTextLines(textBuf, meta);
      }
      try {
        reader.releaseLock?.();
      } catch {}
    } catch {}
  }

  async function observeFetchResponse(resp, meta) {
    try {
      if (!resp) return;
      if (typeof resp.url === 'string' && resp.url.includes(LS_ENDPOINT_MARKER)) {
        sawLanguageServerEndpoint = true;
      }
      const ct = (resp.headers?.get('content-type') || '').toLowerCase();
      if (ct.includes('event-stream') || ct.includes('ndjson') || ct.includes('connect+json')) {
        await observeStreamingResponse(resp, meta, ct);
        return;
      }
      if (ct.includes('json') || ct.includes('text/plain')) {
        const txt = await resp.clone().text();
        ingestTextLines(txt, meta);
      }
    } catch {}
  }

  async function observeFetchPromise(p, meta) {
    try {
      const resp = await p;
      await observeFetchResponse(resp, meta);
    } catch {}
  }

  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      nativeFetchRef = origFetch;
      window.fetch = function (...args) {
        let meta = null;
        try {
          meta = inspectFetchArgs(args[0], args[1]);
        } catch {}
        const p = origFetch.apply(this, args);
        observeFetchPromise(p, meta);
        return p;
      };
    }
  } catch {}

  try {
    if (typeof XMLHttpRequest !== 'undefined' && XMLHttpRequest.prototype) {
      const origOpen = XMLHttpRequest.prototype.open;
      const origSend = XMLHttpRequest.prototype.send;
      XMLHttpRequest.prototype.open = function (...args) {
        this.__agyTracked = true;
        try {
          const rawUrl = typeof args[1] === 'string' ? args[1] : String(args[1] || '');
          this.__agyUrl = rawUrl;
          if (rawUrl.includes(LS_ENDPOINT_MARKER)) {
            sawLanguageServerEndpoint = true;
          }
        } catch {}
        return origOpen.apply(this, args);
      };
      XMLHttpRequest.prototype.send = function (...args) {
        if (this.__agyTracked) {
          let reqHint = null;
          try {
            reqHint = parseReqBodyHint(args[0]);
          } catch {}
          this.addEventListener('load', function () {
            try {
              const ct = (this.getResponseHeader('content-type') || '').toLowerCase();
              if ((ct.includes('json') || ct.includes('text/plain')) && typeof this.responseText === 'string') {
                const url = this.__agyUrl || '';
                const parsed = parseJsonSafely(this.responseText);
                if (parsed) {
                  ingestNetworkPayload(parsed, {
                    source: 'xhr',
                    url,
                    hintConvId: reqHint?.convId || extractConvIdFromUrl(url),
                    requestStepOffset: reqHint?.stepOffset || 0,
                    isStepsEndpoint: /GetCascadeTrajectorySteps|GetCascadeTrajectory/i.test(url)
                  });
                }
              }
            } catch {}
          });
        }
        return origSend.apply(this, args);
      };
    }
  } catch {}

  try {
    const OrigWS = window.WebSocket;
    if (typeof OrigWS === 'function') {
      const PatchedWS = function (...args) {
        const wsUrl = typeof args[0] === 'string' ? args[0] : String(args[0] || '');
        if (wsUrl.includes(LS_ENDPOINT_MARKER)) {
          sawLanguageServerEndpoint = true;
        }
        const ws = new OrigWS(...args);
        ws.addEventListener('message', (ev) => {
          try {
            netDataDirty = true;
            lastBridgeCacheTs = 0;
            let textData = '';
            if (typeof ev.data === 'string') {
              textData = ev.data;
            } else if (
              typeof TextDecoder === 'function' &&
              (ev.data instanceof ArrayBuffer || ArrayBuffer.isView(ev.data)) &&
              ev.data.byteLength <= 2_000_000
            ) {
              textData = new TextDecoder().decode(ev.data);
            }
            if (!textData) return;
            const parsed = parseJsonSafely(textData);
            if (parsed) {
              ingestNetworkPayload(parsed, {
                source: 'ws',
                url: wsUrl,
                hintConvId: extractConvIdFromUrl(wsUrl)
              });
            }
          } catch {}
        });
        return ws;
      };
      PatchedWS.prototype = OrigWS.prototype;
      Object.assign(PatchedWS, OrigWS);
      window.WebSocket = PatchedWS;
    }
  } catch {}

  async function callLsRpc(methodName, bodyObj) {
    if (typeof document !== 'undefined' && document.hidden === true) return null;
    const fetchFn = nativeFetchRef || window.fetch;
    if (typeof fetchFn !== 'function') return null;

    const controller = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = controller
      ? setTimeout(() => {
          try {
            controller.abort();
          } catch {}
        }, RPC_TIMEOUT_MS)
      : null;

    try {
      const csrf = String(window.__APP_CONFIG__?.csrfToken || capturedCsrfToken || '').trim();
      const headers = {
        'Content-Type': 'application/json',
        'Connect-Protocol-Version': '1'
      };
      if (csrf) {
        headers['x-codeium-csrf-token'] = csrf;
      }
      const resp = await fetchFn.call(window, `${LS_ENDPOINT_MARKER}${methodName}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify(bodyObj || {}),
        signal: controller ? controller.signal : undefined
      });
      if (!resp || !resp.ok) return null;
      const txt = await resp.text();
      return parseJsonSafely(txt);
    } catch {
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async function refreshLsSteps(preferredConvId) {
    if (typeof document !== 'undefined' && document.hidden === true) return;
    const now = Date.now();
    const candidateIds = [];
    const seenIds = new Set();

    const addCandidate = (id) => {
      if (!id || typeof id !== 'string') return;
      const clean = id.trim();
      if (!clean || clean.startsWith('composer-panel-') || seenIds.has(clean)) return;
      seenIds.add(clean);
      candidateIds.push(clean);
    };

    addCandidate(preferredConvId);
    for (const [id, entry] of convTelemetryById.entries()) {
      if (entry.isRunning) addCandidate(id);
    }
    for (const conv of netConvsById.values()) {
      if (conv.convId && (conv.state === 'running' || conv.state === 'waiting')) {
        addCandidate(conv.convId);
      }
    }
    if (candidateIds.length < 3 && convTelemetryById.size > 0) {
      const recentIds = Array.from(convTelemetryById.keys());
      for (let i = recentIds.length - 1; i >= 0 && candidateIds.length < 3; i--) {
        addCandidate(recentIds[i]);
      }
    }

    const targets = candidateIds.slice(0, 3);
    for (const convId of targets) {
      if (rpcState.stepsInFlight.has(convId)) continue;
      const entry = convTelemetryById.get(convId);
      const knownEnd = entry ? entry.stepOffsetBase + entry.steps.length : 0;
      const totalSteps = entry?.totalStepCount || 0;
      const needsCatchup = !entry || entry.steps.length === 0 || (totalSteps > 0 && knownEnd < totalSteps);
      const ttl = entry?.isRunning ? RPC_STEPS_RUNNING_TTL_MS : RPC_STEPS_IDLE_TTL_MS;
      const lastAt = rpcState.stepsAtByConv.get(convId) || 0;

      if (!needsCatchup && now - lastAt < ttl) continue;
      if (needsCatchup && now - lastAt < 1500) continue;

      const stepOffset =
        !entry || entry.steps.length === 0
          ? totalSteps > MAX_STEPS_PER_CONV
            ? totalSteps - MAX_STEPS_PER_CONV
            : 0
          : Math.max(0, knownEnd - 5);

      rpcState.stepsInFlight.add(convId);
      rpcState.stepsAtByConv.set(convId, now);
      (async () => {
        try {
          const data = await callLsRpc('GetCascadeTrajectorySteps', {
            cascadeId: convId,
            stepOffset
          });
          if (data) {
            rpcState.hasSuccess = true;
            if (
              ingestNetworkPayload(data, {
                source: 'rpc',
                endpoint: 'GetCascadeTrajectorySteps',
                hintConvId: convId,
                requestStepOffset: stepOffset,
                isStepsEndpoint: true
              })
            ) {
              netDataDirty = true;
            }
          }
        } finally {
          rpcState.stepsInFlight.delete(convId);
        }
      })();
    }
  }

  function maybeRefreshLsRpc(preferredConvId = '') {
    if (typeof document !== 'undefined' && document.hidden === true) return;
    const hasAuthOrEndpoint = Boolean(window.__APP_CONFIG__?.csrfToken) || sawLanguageServerEndpoint;
    if (!hasAuthOrEndpoint) return;
    // 在官方 antigravity.google(.com) 域名下，除非确实观测到 LanguageServerService 流量，否则绝不主动发 RPC
    if (isOfficialHost && !sawLanguageServerEndpoint) return;

    const now = Date.now();
    if (!rpcState.userStatusInFlight && now - rpcState.userStatusAt >= RPC_USER_STATUS_TTL_MS) {
      rpcState.userStatusInFlight = true;
      rpcState.userStatusAt = now;
      (async () => {
        try {
          const data = await callLsRpc('GetUserStatus', {});
          if (data) {
            rpcState.hasSuccess = true;
            if (ingestNetworkPayload(data, { source: 'rpc', endpoint: 'GetUserStatus' })) {
              netDataDirty = true;
            }
          }
        } finally {
          rpcState.userStatusInFlight = false;
        }
      })();
    }

    if (!rpcState.trajectoriesInFlight && now - rpcState.trajectoriesAt >= RPC_TRAJECTORIES_TTL_MS) {
      rpcState.trajectoriesInFlight = true;
      rpcState.trajectoriesAt = now;
      (async () => {
        try {
          const data = await callLsRpc('GetAllCascadeTrajectories', {});
          if (data) {
            rpcState.hasSuccess = true;
            if (ingestNetworkPayload(data, { source: 'rpc', endpoint: 'GetAllCascadeTrajectories' })) {
              netDataDirty = true;
            }
            refreshLsSteps(preferredConvId);
          }
        } finally {
          rpcState.trajectoriesInFlight = false;
        }
      })();
    } else {
      refreshLsSteps(preferredConvId);
    }
  }

  // ============================================================================
  // 3. React 18/19 Fiber 全深度 + Composer 面板 + Context/QueryClient/Store 提取器
  // ============================================================================

  function getReactFiber(el) {
    if (!el || typeof el !== 'object') return null;
    const candidates = [el, el.firstElementChild, el.parentElement].filter(Boolean);
    for (const node of candidates) {
      for (const k of Object.keys(node)) {
        if (k.startsWith('__reactFiber$') || k.startsWith('__reactInternalInstance$')) {
          return node[k];
        }
      }
    }
    return null;
  }

  function findHostRootFiber(startFiber) {
    let cur = startFiber;
    let last = startFiber;
    for (let i = 0; i < 90 && cur; i++) {
      last = cur;
      if (cur.tag === 3) return cur; // HostRoot
      cur = cur.return;
    }
    return last;
  }

  function fiberContainsMultipleSelector(fiber, selector) {
    let cur = fiber;
    for (let d = 0; d < 4 && cur; d++) {
      if (typeof Element !== 'undefined' && cur.stateNode instanceof Element) {
        const count = cur.stateNode.querySelectorAll?.(selector)?.length || 0;
        if (count >= 2) return true;
        if (count === 1) return false;
      }
      cur = cur.return;
    }
    return false;
  }

  function collectFiberHooksAndContexts(fiber) {
    const vals = [];

    // Hooks 链表 (`useState` / `useMemo` / `useRef` / `useSyncExternalStore`)
    let hook = fiber?.memoizedState;
    let guard = 0;
    while (hook && typeof hook === 'object' && guard < 40) {
      guard++;
      if ('memoizedState' in hook && hook.memoizedState && typeof hook.memoizedState === 'object') {
        vals.push(hook.memoizedState);
      }
      if (
        hook.queue &&
        'lastRenderedState' in hook.queue &&
        hook.queue.lastRenderedState &&
        typeof hook.queue.lastRenderedState === 'object'
      ) {
        vals.push(hook.queue.lastRenderedState);
      }
      hook = hook.next;
    }

    // React `useContext` 依赖链表 (`fiber.dependencies.firstContext`)
    let dep = fiber?.dependencies?.firstContext;
    let depGuard = 0;
    while (dep && typeof dep === 'object' && depGuard < 25) {
      depGuard++;
      if (dep.memoizedValue && typeof dep.memoizedValue === 'object') {
        vals.push(dep.memoizedValue);
      }
      if (
        dep.context &&
        '_currentValue' in dep.context &&
        dep.context._currentValue &&
        typeof dep.context._currentValue === 'object'
      ) {
        vals.push(dep.context._currentValue);
      }
      dep = dep.next;
    }

    // Context.Provider (`tag === 10`) 的 value
    if (fiber?.tag === 10 && fiber.memoizedProps && 'value' in fiber.memoizedProps) {
      const v = fiber.memoizedProps.value;
      if (v && typeof v === 'object') vals.push(v);
    }

    return vals;
  }

  // 缓存已定位到的全局 Store / QueryClient，后续刷新直接 O(1) 读取，无需每次爬全树
  const discoveredQueryClients = new Set();
  const discoveredStores = new Set();

  function inspectCandidateContainers(obj) {
    if (!obj || typeof obj !== 'object') return;
    const maybeClient =
      obj.client ||
      obj.queryClient ||
      obj.value?.queryClient ||
      (typeof obj.getQueryCache === 'function' ? obj : null);
    if (maybeClient && typeof maybeClient.getQueryCache === 'function') {
      discoveredQueryClients.add(maybeClient);
    }
    const maybeStore =
      obj.store || obj.value?.store || (typeof obj.getState === 'function' ? obj : null);
    if (maybeStore && typeof maybeStore.getState === 'function') {
      discoveredStores.add(maybeStore);
    }
  }

  function scanTopLevelProvidersOnce(
    hostRoot,
    knownLowerNames,
    lowerToCanonical,
    outProjects,
    outConvs,
    telemetryVisited
  ) {
    if (!hostRoot) return;
    const queue = [hostRoot.stateNode?.current || hostRoot];
    let visited = 0;
    const seen = new WeakSet();
    while (queue.length > 0 && visited < 220) {
      const f = queue.shift();
      if (!f || typeof f !== 'object' || seen.has(f)) continue;
      seen.add(f);
      visited++;

      if (
        f.tag === 10 &&
        f.memoizedProps &&
        typeof f.memoizedProps.value === 'object' &&
        f.memoizedProps.value
      ) {
        inspectCandidateContainers(f.memoizedProps.value);
        scanArbitraryDataTree(
          f.memoizedProps.value,
          knownLowerNames,
          lowerToCanonical,
          outProjects,
          outConvs,
          '',
          ''
        );
        ingestTelemetryDataTree(f.memoizedProps.value, { source: 'fiber', visited: telemetryVisited });
      }
      if (f.memoizedProps && typeof f.memoizedProps === 'object') {
        inspectCandidateContainers(f.memoizedProps);
      }

      if (f.child) queue.push(f.child);
      if (f.sibling && visited < 160) queue.push(f.sibling);
    }
  }

  function getFallbackComposerConvId(el) {
    if (!el || typeof el !== 'object') return `composer-panel-${++composerFallbackSeq}`;
    let id = composerFallbackIds.get(el);
    if (!id) {
      composerFallbackSeq += 1;
      id = `composer-panel-${composerFallbackSeq}`;
      composerFallbackIds.set(el, id);
    }
    return id;
  }

  function scanComposerFooters(telemetryVisited) {
    const composers = [];
    const footerEls = Array.from(document.querySelectorAll?.('.agy-composer-footer') || []);
    let rootFound = null;
    const urlConvId = extractConvIdFromUrl(window.location?.href || '');

    for (let panelIndex = 0; panelIndex < footerEls.length; panelIndex++) {
      const footerEl = footerEls[panelIndex];
      let convId = '';
      let modelId = '';
      let modelLabel = '';
      let quota = null;
      const pendingStepChunks = [];

      try {
        const attrEl = footerEl.closest?.('[data-cascade-id], [data-conversation-id], [data-trajectory-id]');
        if (attrEl) {
          const attrId =
            attrEl.getAttribute('data-cascade-id') ||
            attrEl.getAttribute('data-conversation-id') ||
            attrEl.getAttribute('data-trajectory-id') ||
            '';
          if (attrId.trim().length >= 4) convId = attrId.trim();
        }
      } catch {}

      let fiber = getReactFiber(footerEl);
      if (fiber && !rootFound) {
        rootFound = findHostRootFiber(fiber);
      }
      let reachedShared = false;

      const inspectPanelObj = (obj, isPanelLocal) => {
        if (!obj || typeof obj !== 'object') return;
        inspectCandidateContainers(obj);
        ingestTelemetryDataTree(obj, { source: 'fiber', visited: telemetryVisited });

        if (!isPanelLocal) return;

        if (!convId) {
          const directId = extractDirectConvId(obj, '');
          if (directId) convId = directId;
        }
        const modelCandidates = [
          obj.currentModelConfig,
          obj.selectedModelConfig,
          obj.activeModelConfig,
          obj.modelConfig,
          obj.selectedModel,
          obj.currentModel
        ];
        for (const mc of modelCandidates) {
          if (!mc || typeof mc !== 'object') continue;
          const info = extractModelConfigInfo(mc);
          if (info) {
            upsertModelConfig(info, 'fiber');
            if (!modelId) modelId = info.modelId;
            if (!modelLabel) modelLabel = info.label;
            if (!quota && info.hasQuotaInfo) {
              quota = {
                remainingFraction: info.remainingFraction,
                resetTimeMs: info.resetTimeMs
              };
            }
          }
        }
        if (!quota && obj.quotaInfo && typeof obj.quotaInfo === 'object') {
          const q = normalizeQuotaInfo(obj.quotaInfo);
          if (q) quota = q;
        }

        const primarySteps = Array.isArray(obj.steps)
          ? obj.steps
          : Array.isArray(obj.trajectory?.steps)
            ? obj.trajectory.steps
            : Array.isArray(obj.cascade?.trajectory?.steps)
              ? obj.cascade.trajectory.steps
              : null;
        const fallbackTurns = !primarySteps
          ? Array.isArray(obj.turns)
            ? obj.turns
            : Array.isArray(obj.messages)
              ? obj.messages
              : null
          : null;
        const arr = primarySteps || fallbackTurns;
        if (arr && looksLikeStepArray(arr)) {
          const ownId = extractDirectConvId(obj, '');
          pendingStepChunks.push({
            ownId,
            arr,
            isStepsSource: Boolean(primarySteps),
            isRunningHint: normalizeConvState(obj).state === 'running'
          });
        }
      };

      for (let depth = 0; depth < 80 && fiber; depth++, fiber = fiber.return) {
        if (!reachedShared && fiberContainsMultipleSelector(fiber, '.agy-composer-footer')) {
          reachedShared = true;
        }
        const isPanelLocal = !reachedShared;
        try {
          if (fiber.memoizedProps && typeof fiber.memoizedProps === 'object') {
            inspectPanelObj(fiber.memoizedProps, isPanelLocal);
          }
        } catch {}
        try {
          for (const val of collectFiberHooksAndContexts(fiber)) {
            inspectPanelObj(val, isPanelLocal);
          }
        } catch {}
      }

      if (!convId && (footerEls.length === 1 || panelIndex === 0) && urlConvId) {
        convId = urlConvId;
      }
      if (!convId) {
        convId = getFallbackComposerConvId(footerEl);
      }

      for (const chunk of pendingStepChunks) {
        upsertConvSteps(chunk.ownId || convId, chunk.arr, {
          stepOffset: 0,
          isIncremental: false,
          isStepsSource: chunk.isStepsSource,
          source: 'fiber',
          isRunningHint: chunk.isRunningHint
        });
      }

      const convEntry = convTelemetryById.get(convId);
      const resolvedModelId = modelId || convEntry?.modelId || '';
      const meta = findModelMeta(resolvedModelId, modelLabel);
      const resolvedLabel = modelLabel || meta?.label || resolvedModelId || '';
      const remainingFraction =
        quota?.remainingFraction !== undefined && quota?.remainingFraction !== null
          ? quota.remainingFraction
          : meta?.remainingFraction ?? null;
      const resetTimeMs =
        quota?.resetTimeMs !== undefined && quota?.resetTimeMs !== null
          ? quota.resetTimeMs
          : meta?.resetTimeMs ?? null;

      composers.push({
        panelIndex,
        convId,
        modelId: resolvedModelId,
        modelLabel: resolvedLabel,
        remainingFraction,
        resetTimeMs
      });
    }

    return { composers, rootFound, urlConvId };
  }

  function recordQuotaPoolSample(poolKey, remainingFraction, resetTimeMs, nowMs) {
    if (poolKey !== 'gemini' && poolKey !== 'premium') return;
    if (typeof remainingFraction !== 'number' || !Number.isFinite(remainingFraction)) return;
    const frac = Math.max(0, Math.min(1, remainingFraction));
    const normReset =
      typeof resetTimeMs === 'number' &&
      Number.isFinite(resetTimeMs) &&
      resetTimeMs > SENTINEL_CUTOFF_MS
        ? Math.round(resetTimeMs)
        : null;
    const buf = quotaHistoryByPool[poolKey];
    if (buf.length > 0) {
      const last = buf[buf.length - 1];
      if (
        frac > last.frac + 0.03 ||
        (normReset !== null &&
          last.resetTimeMs !== null &&
          Math.abs(normReset - last.resetTimeMs) > 10 * 60 * 1000)
      ) {
        buf.length = 0;
      } else if (Math.abs(frac - last.frac) < 1e-4 && nowMs - last.ts < 30_000) {
        return;
      }
    }
    buf.push({ ts: nowMs, frac, resetTimeMs: normReset });
    while (buf.length > 0 && nowMs - buf[0].ts > QUOTA_HISTORY_MAX_AGE_MS) {
      buf.shift();
    }
    while (buf.length > QUOTA_HISTORY_MAX_SAMPLES) {
      buf.shift();
    }
  }

  function computePoolSlopeEta(buf, frac, timeLeftMs, nowMs) {
    if (
      !Array.isArray(buf) ||
      buf.length < 2 ||
      frac <= 0 ||
      typeof timeLeftMs !== 'number' ||
      !Number.isFinite(timeLeftMs) ||
      timeLeftMs <= 0
    ) {
      return { burnRatePerHour: null, etaMs: null };
    }
    let lastDropIdx = -1;
    for (let i = buf.length - 2; i >= 0; i--) {
      if (buf[i].frac > frac + 0.002) {
        lastDropIdx = i;
        break;
      }
    }
    if (lastDropIdx === -1 || nowMs - buf[lastDropIdx + 1].ts > QUOTA_STALE_IDLE_MS) {
      return { burnRatePerHour: null, etaMs: null };
    }
    const anchor = buf[0];
    const dtMs = nowMs - anchor.ts;
    const dropFrac = anchor.frac - frac;
    if (dtMs < QUOTA_MIN_SLOPE_SPAN_MS || dropFrac < QUOTA_MIN_SLOPE_DROP_FRAC) {
      return { burnRatePerHour: null, etaMs: null };
    }
    const burnPerMs = dropFrac / dtMs;
    if (!Number.isFinite(burnPerMs) || burnPerMs <= 0) {
      return { burnRatePerHour: null, etaMs: null };
    }
    const burnRatePerHour = Math.round(burnPerMs * 3_600_000 * 1000) / 1000;
    const rawEtaMs = frac / burnPerMs;
    if (!Number.isFinite(rawEtaMs) || rawEtaMs <= 0 || rawEtaMs >= timeLeftMs) {
      return { burnRatePerHour, etaMs: null };
    }
    return {
      burnRatePerHour,
      etaMs: Math.max(60_000, Math.round(rawEtaMs))
    };
  }

  function computeQuotaPoolPaceAndEta(poolKey, rawPool, nowMs = Date.now()) {
    if (!rawPool || typeof rawPool !== 'object') return null;
    const rawFrac = rawPool.remainingFraction;
    const resetTimeMs = rawPool.resetTimeMs ?? null;
    if (typeof rawFrac !== 'number' || !Number.isFinite(rawFrac)) {
      return {
        ...rawPool,
        timeLeftMs: null,
        timeLeftRatio: null,
        paceRatio: null,
        paceStatus: null,
        burnRatePerHour: null,
        etaMs: null,
        unusedPreResetHint: false
      };
    }
    const frac = Math.max(0, Math.min(1, rawFrac));
    recordQuotaPoolSample(poolKey, frac, resetTimeMs, nowMs);

    if (
      typeof resetTimeMs !== 'number' ||
      !Number.isFinite(resetTimeMs) ||
      resetTimeMs <= SENTINEL_CUTOFF_MS ||
      resetTimeMs <= nowMs
    ) {
      const hasResetTs =
        typeof resetTimeMs === 'number' &&
        Number.isFinite(resetTimeMs) &&
        resetTimeMs > SENTINEL_CUTOFF_MS;
      return {
        ...rawPool,
        remainingFraction: frac,
        timeLeftMs: hasResetTs ? 0 : null,
        timeLeftRatio: null,
        paceRatio: null,
        paceStatus: null,
        burnRatePerHour: null,
        etaMs: null,
        unusedPreResetHint: false
      };
    }

    const timeLeftMs = Math.max(0, Math.round(resetTimeMs - nowMs));
    const timeLeftRatio = Math.min(1, Math.max(0, timeLeftMs / QUOTA_WINDOW_MS));
    let rawPace;
    if (frac <= 0) {
      rawPace = 0;
    } else if (timeLeftRatio > 0.02) {
      rawPace = frac / timeLeftRatio;
    } else {
      rawPace = Math.max(1, frac / 0.02);
    }
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
      timeLeftMs > 0 &&
        timeLeftMs <= QUOTA_PRE_RESET_WINDOW_MS &&
        frac >= QUOTA_PRE_RESET_MIN_FRAC
    );

    const { burnRatePerHour, etaMs } = computePoolSlopeEta(
      quotaHistoryByPool[poolKey],
      frac,
      timeLeftMs,
      nowMs
    );

    return {
      ...rawPool,
      remainingFraction: frac,
      timeLeftMs,
      timeLeftRatio: Math.round(timeLeftRatio * 10000) / 10000,
      paceRatio,
      paceStatus,
      burnRatePerHour,
      etaMs,
      unusedPreResetHint
    };
  }

  function buildTelemetryPayload(composers, urlConvId) {
    const payloadNow = Date.now();
    const models = [];
    for (const m of netModelsById.values()) {
      if (isShadowModel(m.modelId, m.label)) continue;
      models.push({
        modelId: m.modelId,
        label: m.label,
        pool: m.pool,
        contextLimit: getDynamicContextLimit(m.modelId, m.label),
        remainingFraction: m.remainingFraction,
        resetTimeMs: m.resetTimeMs,
        quotaObservedAt: m.quotaObservedAt ?? null
      });
    }

    const quotaPools = { gemini: null, premium: null };
    for (const m of models) {
      if (m.pool !== 'gemini' && m.pool !== 'premium') continue;
      if (m.remainingFraction === null && m.resetTimeMs === null) continue;
      const cur = quotaPools[m.pool];
      if (!cur) {
        quotaPools[m.pool] = {
          remainingFraction: m.remainingFraction,
          resetTimeMs: m.resetTimeMs,
          sampleLabel: m.label || m.modelId,
          observedAt: m.quotaObservedAt || payloadNow
        };
        continue;
      }
      let takeM = false;
      if (m.remainingFraction !== null && cur.remainingFraction === null) {
        takeM = true;
      } else if (m.remainingFraction !== null && cur.remainingFraction !== null) {
        if (m.remainingFraction < cur.remainingFraction) {
          takeM = true;
        } else if (
          m.remainingFraction === cur.remainingFraction &&
          m.resetTimeMs !== null &&
          (cur.resetTimeMs === null || m.resetTimeMs < cur.resetTimeMs)
        ) {
          takeM = true;
        }
      } else if (
        m.remainingFraction === null &&
        cur.remainingFraction === null &&
        m.resetTimeMs !== null &&
        (cur.resetTimeMs === null || m.resetTimeMs < cur.resetTimeMs)
      ) {
        takeM = true;
      }
      if (takeM) {
        quotaPools[m.pool] = {
          remainingFraction: m.remainingFraction,
          resetTimeMs: m.resetTimeMs,
          sampleLabel: m.label || m.modelId,
          observedAt: m.quotaObservedAt || payloadNow
        };
      } else if ((m.quotaObservedAt || 0) > (cur.observedAt || 0)) {
        cur.observedAt = m.quotaObservedAt;
      }
    }

    if (quotaPools.gemini) {
      quotaPools.gemini = computeQuotaPoolPaceAndEta('gemini', quotaPools.gemini, payloadNow);
    }
    if (quotaPools.premium) {
      quotaPools.premium = computeQuotaPoolPaceAndEta('premium', quotaPools.premium, payloadNow);
    }

    const composerByConvId = new Map();
    for (const c of composers) {
      if (c.convId && !composerByConvId.has(c.convId)) {
        composerByConvId.set(c.convId, c);
      }
    }

    const conversations = {};
    for (const [convId, entry] of convTelemetryById.entries()) {
      const comp = composerByConvId.get(convId) || null;
      conversations[convId] = analyzeConversationSteps(entry, comp);
    }

    // 为有活跃 composer 但尚无历史步骤的面板补齐基础条目
    for (const comp of composers) {
      if (!comp.convId || conversations[comp.convId]) continue;
      const emptyEntry = {
        convId: comp.convId,
        modelId: comp.modelId,
        modelLabel: comp.modelLabel,
        isRunning: false,
        totalStepCount: 0,
        stepOffsetBase: 0,
        steps: [],
        lastStreamTs: 0,
        tokPerSec: 0,
        avgTokPerSec: 0
      };
      conversations[comp.convId] = analyzeConversationSteps(emptyEntry, comp);
    }

    const realComposerConv = composers.find(
      (c) => c.convId && !c.convId.startsWith('composer-panel-')
    )?.convId;
    let activeConvId =
      realComposerConv || urlConvId || lastKnownActiveConvId || composers[0]?.convId || null;
    if (!activeConvId) {
      for (const [id, entry] of convTelemetryById.entries()) {
        if (entry.isRunning) activeConvId = id;
      }
    }

    return {
      fetchedAt: Date.now(),
      sourceMode: rpcState.hasSuccess ? 'rpc_assisted' : 'passive',
      quotaPools,
      models,
      activeConvId,
      composers,
      conversations
    };
  }

  function extractCollapsedProjectsFromPage(projectNames) {
    const cleanNames = Array.isArray(projectNames) ? projectNames.filter(Boolean) : [];
    const lowerToCanonical = new Map();
    const knownLowerNames = new Set();
    for (const n of cleanNames) {
      const low = n.toLowerCase();
      lowerToCanonical.set(low, n);
      knownLowerNames.add(low);
    }

    const outProjects = {
      byId: new Map(netProjectsById),
      byName: new Map(netProjectsByName)
    };
    const outConvs = new Map();
    const sharedFibersVisited = new WeakSet();
    const telemetryVisited = new WeakSet();

    const scanSingleFiberData = (fiber, contextProjId, contextProjName) => {
      try {
        const props = fiber.memoizedProps;
        if (props && typeof props === 'object') {
          inspectCandidateContainers(props);
          scanArbitraryDataTree(
            props,
            knownLowerNames,
            lowerToCanonical,
            outProjects,
            outConvs,
            contextProjId,
            contextProjName
          );
          ingestTelemetryDataTree(props, { source: 'fiber', visited: telemetryVisited });
        }
      } catch {}

      try {
        for (const val of collectFiberHooksAndContexts(fiber)) {
          try {
            inspectCandidateContainers(val);
            scanArbitraryDataTree(
              val,
              knownLowerNames,
              lowerToCanonical,
              outProjects,
              outConvs,
              contextProjId,
              contextProjName
            );
            ingestTelemetryDataTree(val, { source: 'fiber', visited: telemetryVisited });
          } catch {}
        }
      } catch {}
    };

    let firstRoot = null;
    const projEls = document.querySelectorAll?.('[data-agy-proj-name]') || [];
    for (const el of projEls) {
      const projName = el.getAttribute('data-agy-proj-name') || '';
      if (!projName) continue;

      let fiber = getReactFiber(el);
      if (fiber && !firstRoot) {
        firstRoot = findHostRootFiber(fiber);
      }
      let reachedSharedAncestor = false;

      // 完整向上爬升至 80 层直到 HostRoot，避免深层组件树被提前截断
      for (let depth = 0; depth < 80 && fiber; depth++, fiber = fiber.return) {
        if (!reachedSharedAncestor && fiberContainsMultipleSelector(fiber, '[data-agy-proj-name]')) {
          reachedSharedAncestor = true;
        }

        if (reachedSharedAncestor) {
          if (sharedFibersVisited.has(fiber)) continue;
          sharedFibersVisited.add(fiber);
        }

        const contextProjName = reachedSharedAncestor ? '' : projName;
        const contextProjId =
          (!reachedSharedAncestor && outProjects.byName.get(projName.toLowerCase())?.id) || '';
        scanSingleFiberData(fiber, contextProjId, contextProjName);
      }
    }

    // 同步扫描已展开的对话行自身 Fiber，覆盖列表项组件局部 props/hooks 状态
    const taskEls = document.querySelectorAll?.('[data-agy-parent-proj]') || [];
    for (const taskEl of taskEls) {
      const parentProjName = taskEl.getAttribute('data-agy-parent-proj') || '';
      let fiber = getReactFiber(taskEl);
      if (fiber && !firstRoot) {
        firstRoot = findHostRootFiber(fiber);
      }
      let reachedSharedTaskAncestor = false;
      for (let depth = 0; depth < 16 && fiber; depth++, fiber = fiber.return) {
        if (
          !reachedSharedTaskAncestor &&
          fiberContainsMultipleSelector(fiber, '[data-agy-parent-proj]')
        ) {
          reachedSharedTaskAncestor = true;
        }
        if (reachedSharedTaskAncestor || sharedFibersVisited.has(fiber)) {
          if (sharedFibersVisited.has(fiber)) continue;
          sharedFibersVisited.add(fiber);
        }
        const contextProjName = reachedSharedTaskAncestor ? '' : parentProjName;
        const contextProjId =
          (!reachedSharedTaskAncestor &&
            contextProjName &&
            outProjects.byName.get(contextProjName.toLowerCase())?.id) ||
          '';
        scanSingleFiberData(fiber, contextProjId, contextProjName);
      }
    }

    // 扫描 `.agy-composer-footer` 面板提取当前模型、配额与会话步骤
    const { composers, rootFound: composerRoot, urlConvId } = scanComposerFooters(new WeakSet());
    if (!firstRoot && composerRoot) {
      firstRoot = composerRoot;
    }

    // 扫描 `[data-step-list]` 对话消息列表祖先 Fiber，直接捕获步骤级 `modelUsage` 与 `agentState.contextWindowUsage`
    try {
      const stepListEl = document.querySelector?.('[data-step-list], [data-step-index]');
      let stepFiber = stepListEl ? getReactFiber(stepListEl) : null;
      if (stepFiber && !firstRoot) {
        firstRoot = findHostRootFiber(stepFiber);
      }
      const stepVisited = new WeakSet();
      const hintConvId =
        urlConvId ||
        composers.find((c) => c.convId && !c.convId.startsWith('composer-panel-'))?.convId ||
        '';
      for (let depth = 0; depth < 24 && stepFiber; depth++, stepFiber = stepFiber.return) {
        if (stepFiber.memoizedProps && typeof stepFiber.memoizedProps === 'object') {
          ingestTelemetryDataTree(stepFiber.memoizedProps, {
            source: 'fiber',
            hintConvId,
            visited: stepVisited,
            budget: 800
          });
        }
        for (const val of collectFiberHooksAndContexts(stepFiber)) {
          ingestTelemetryDataTree(val, {
            source: 'fiber',
            hintConvId,
            visited: stepVisited,
            budget: 800
          });
        }
      }
    } catch {}

    if (!firstRoot) {
      try {
        const fallbackNode =
          document.querySelector?.('#root, #app, main, [data-testid="permissions-selector-trigger"]') ||
          document.body?.firstElementChild;
        const f = getReactFiber(fallbackNode);
        if (f) firstRoot = findHostRootFiber(f);
      } catch {}
    }

    // 扫描顶层 Provider（仅覆盖顶层 Context.Provider 节点，速度极快）
    if (firstRoot) {
      scanTopLevelProvidersOnce(
        firstRoot,
        knownLowerNames,
        lowerToCanonical,
        outProjects,
        outConvs,
        new WeakSet()
      );
    }

    // 直接读取缓存到的 QueryClient 与 Store
    for (const qc of discoveredQueryClients) {
      try {
        for (const q of qc.getQueryCache().getAll()) {
          if (q?.state?.data) {
            scanArbitraryDataTree(
              q.state.data,
              knownLowerNames,
              lowerToCanonical,
              outProjects,
              outConvs,
              '',
              ''
            );
            ingestTelemetryDataTree(q.state.data, { source: 'fiber' });
          }
        }
      } catch {}
    }
    for (const st of discoveredStores) {
      try {
        const stVal = st.getState();
        if (stVal && typeof stVal === 'object') {
          if (stVal.sidebarProjects && typeof stVal.sidebarProjects === 'object') {
            scanArbitraryDataTree(
              stVal.sidebarProjects,
              knownLowerNames,
              lowerToCanonical,
              outProjects,
              outConvs,
              '',
              ''
            );
          }
          if (stVal.trajectorySummaries && typeof stVal.trajectorySummaries === 'object') {
            const rawSummaries =
              stVal.trajectorySummaries.summaries &&
              typeof stVal.trajectorySummaries.summaries === 'object'
                ? stVal.trajectorySummaries.summaries
                : stVal.trajectorySummaries;
            ingestTrajectorySummaries(rawSummaries, { isAuthoritative: false });
            scanArbitraryDataTree(
              rawSummaries,
              knownLowerNames,
              lowerToCanonical,
              outProjects,
              outConvs,
              '',
              ''
            );
          }
          if (stVal.userStatus && typeof stVal.userStatus === 'object') {
            ingestTelemetryDataTree({ userStatus: stVal.userStatus }, { source: 'fiber' });
          }
        }
        scanArbitraryDataTree(stVal, knownLowerNames, lowerToCanonical, outProjects, outConvs, '', '');
        ingestTelemetryDataTree(stVal, { source: 'fiber' });
      } catch {}
    }

    // 双向粘性合并：同时将 live Fiber 的 waiting / detail-running / terminal 状态回写 netConvsById，
    // 确保切走路由或摘要轮询刷新时 waiting 不会被粗粒度 RUNNING 覆盖，且回答后能准确解除 waiting
    for (const [k, liveRec] of outConvs.entries()) {
      const merged = mergeConvRecord(netConvsById.get(k), liveRec, { preferLatestExplicit: true });
      netConvsById.set(k, merged);
      outConvs.set(k, merged);
    }
    pruneMapToLimit(netProjectsById);
    pruneMapToLimit(netProjectsByName);
    pruneMapToLimit(netConvsById);
    for (const [k, netRec] of netConvsById.entries()) {
      if (
        authoritativeTrajectoryIds &&
        netRec?.convId &&
        !authoritativeTrajectoryIds.has(netRec.convId)
      ) {
        netConvsById.delete(k);
        continue;
      }
      if (!outConvs.has(k)) {
        outConvs.set(k, { ...netRec });
      }
    }

    const telemetry = buildTelemetryPayload(composers, urlConvId);

    // 汇总每个已知项目的 projectType 与 conversations
    // 若侧边栏已收起（cleanNames 为空），自动从内存项目表与对话工作区反推项目列表
    const projectsResult = {};
    const ensureProjectBucket = (name, projMeta = null) => {
      if (!name) return '';
      const low = name.toLowerCase();
      const canonical = lowerToCanonical.get(low) || name;
      if (!lowerToCanonical.has(low)) {
        lowerToCanonical.set(low, canonical);
        knownLowerNames.add(low);
      }
      if (!projectsResult[canonical]) {
        const meta = projMeta || outProjects.byName.get(low);
        projectsResult[canonical] = {
          projectId: meta?.id || '',
          projectType: meta?.projectType || null,
          hasEmptyArray: Boolean(meta?.hasEmptyArray),
          tasks: []
        };
      }
      return canonical;
    };

    for (const canonicalName of cleanNames) {
      ensureProjectBucket(canonicalName);
    }

    if (cleanNames.length === 0) {
      for (const projMeta of outProjects.byName.values()) {
        if (projMeta?.name && !NAV_SKIP_RE.test(projMeta.name)) {
          ensureProjectBucket(projMeta.name, projMeta);
        }
      }
      for (const conv of outConvs.values()) {
        const inferredName =
          (conv.projectId && outProjects.byId.get(conv.projectId)?.name) ||
          conv.projectName ||
          (Array.isArray(conv.workspaceNames) ? conv.workspaceNames[0] : '') ||
          '';
        if (inferredName && !NAV_SKIP_RE.test(inferredName)) {
          ensureProjectBucket(inferredName);
        }
      }
    }

    const diagnostics = [];
    for (const conv of outConvs.values()) {
      if (diagnostics.length < 25) {
        diagnostics.push({
          convId: conv.convId,
          title: conv.title,
          projectName: conv.projectName,
          state: conv.state,
          isDetailRecord: Boolean(conv.isDetailRecord),
          isTerminal: Boolean(conv.isTerminal),
          stepsCount: conv.stepsCount ?? null,
          waitingSteps: conv.waitingSteps ?? null,
          debugFields: conv.debugFields || {}
        });
      }

      let targetProjName = '';
      if (conv.projectId && outProjects.byId.has(conv.projectId)) {
        const mapped = outProjects.byId.get(conv.projectId).name;
        if (mapped && lowerToCanonical.has(mapped.toLowerCase())) {
          targetProjName = lowerToCanonical.get(mapped.toLowerCase());
        }
      }
      if (!targetProjName && conv.projectName && lowerToCanonical.has(conv.projectName.toLowerCase())) {
        targetProjName = lowerToCanonical.get(conv.projectName.toLowerCase());
      } else if (!targetProjName && Array.isArray(conv.workspaceNames)) {
        for (const wName of conv.workspaceNames) {
          const lowW = String(wName || '').toLowerCase();
          if (lowW && lowerToCanonical.has(lowW)) {
            targetProjName = lowerToCanonical.get(lowW);
            break;
          }
        }
      }

      if (!targetProjName || !projectsResult[targetProjName]) continue;
      const pid = projectsResult[targetProjName].projectId;
      // 若当前同名项目已有明确 projectId，且对话归属于另一个不同的 projectId（例如已删除的旧同名项目），跳过
      if (pid && conv.projectId && conv.projectId !== pid) continue;
      const computedHref =
        conv.href ||
        (conv.convId && pid
          ? `?p=${encodeURIComponent(`c/${conv.convId}?project=${pid}`)}`
          : '');

      const reasonVars =
        conv.reasonVars && Object.keys(conv.reasonVars).length > 0
          ? conv.reasonVars
          : conv.timeText
            ? { time: conv.timeText }
            : {};

      const convTelemetry = conv.convId ? telemetry.conversations[conv.convId] || null : null;

      projectsResult[targetProjName].tasks.push({
        taskId: computedHref ? `href:${computedHref}` : `bridge:${targetProjName}::${conv.convId}`,
        convId: conv.convId,
        title: conv.title,
        state: conv.state,
        confirmedDetail: Boolean(conv.isDetailRecord),
        confirmedNotWaiting: Boolean(
          conv.state === 'running' && (conv.isDetailRecord || conv.hasExplicitEmptyWaitingSteps)
        ),
        reasonCode: conv.reasonCode || 'reasonMemIdle',
        reasonVars,
        reason: conv.reason || (conv.timeText ? `Active ${conv.timeText}` : 'Idle (memory sync)'),
        timeText: conv.timeText || '',
        isActive: false,
        telemetry: convTelemetry
      });
    }

    try {
      window.__AGY_LAST_DIAG__ = {
        ts: Date.now(),
        url: window.location.href,
        conversations: diagnostics
      };
    } catch {}

    return { ok: true, projects: projectsResult, telemetry, diagnostics };
  }

  // 验证过的 localhost 宿主页激活后主动预热一次受控同源 RPC
  if (isLocalCandidate) {
    setTimeout(() => {
      try {
        maybeRefreshLsRpc(extractConvIdFromUrl(window.location?.href || ''));
      } catch {}
    }, 50);
  }

  // 跨世界同步桥接协议（内置 500ms 短时缓存，路由或主机变化自动失效，支持强制刷新）
  window.addEventListener('__AGY_BRIDGE_REQ__', () => {
    try {
      const rootEl = document.documentElement;
      if (!rootEl) return;
      const forceRefresh = rootEl.getAttribute('data-agy-bridge-force') === '1';
      if (forceRefresh) {
        rootEl.removeAttribute('data-agy-bridge-force');
      }

      const hostMatch = (window.location.pathname || '').match(/^\/r\/([^/?#]+)/);
      const nextHostPath = hostMatch ? hostMatch[1] : '';
      if (lastBridgeHostPath && nextHostPath && nextHostPath !== lastBridgeHostPath) {
        netConvsById.clear();
        netProjectsById.clear();
        netProjectsByName.clear();
        quotaHistoryByPool.gemini.length = 0;
        quotaHistoryByPool.premium.length = 0;
        authoritativeTrajectoryIds = null;
        lastBridgeCacheTs = 0;
        netDataDirty = true;
      }
      if (nextHostPath) {
        lastBridgeHostPath = nextHostPath;
      }

      const rawIn = rootEl.getAttribute('data-agy-bridge-in') || '[]';
      const routeKey = `${window.location.pathname || ''}${window.location.search || ''}::${rawIn}`;
      const now = Date.now();
      if (
        !forceRefresh &&
        !netDataDirty &&
        routeKey === lastBridgeNamesKey &&
        lastBridgeResultJson &&
        now - lastBridgeCacheTs < BRIDGE_CACHE_TTL_MS
      ) {
        maybeRefreshLsRpc(lastResolvedActiveConvId);
        rootEl.setAttribute('data-agy-bridge-out', lastBridgeResultJson);
        return;
      }

      const projectNames = JSON.parse(rawIn);
      const res = extractCollapsedProjectsFromPage(projectNames);
      if (res?.telemetry?.activeConvId) {
        lastResolvedActiveConvId = res.telemetry.activeConvId;
      }
      maybeRefreshLsRpc(lastResolvedActiveConvId);
      const outJson = JSON.stringify(res);
      lastBridgeNamesKey = routeKey;
      lastBridgeResultJson = outJson;
      lastBridgeCacheTs = now;
      netDataDirty = false;
      rootEl.setAttribute('data-agy-bridge-out', outJson);
    } catch (err) {
      try {
        document.documentElement?.setAttribute(
          'data-agy-bridge-out',
          JSON.stringify({ ok: false, error: String(err) })
        );
      } catch {}
    }
  });

  // P1 精确步级用量增量采集通道（仅按需读取游标后的精确主模型步，不膨胀 500ms 轮询载荷）
  window.addEventListener('__AGY_BRIDGE_LEDGER_REQ__', () => {
    try {
      const rootEl = document.documentElement;
      if (!rootEl) return;
      const rawIn = rootEl.getAttribute('data-agy-ledger-in') || '{}';
      let cursors = {};
      try {
        const parsed = JSON.parse(rawIn);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          cursors = parsed;
        }
      } catch {}

      const batches = [];
      for (const [convId, entry] of convTelemetryById.entries()) {
        if (!isEligibleLedgerConvId(convId)) continue;
        if (!(entry?.pricedStepLog instanceof Map) || entry.pricedStepLog.size === 0) continue;

        const allSorted = Array.from(entry.pricedStepLog.values()).sort(
          (a, b) => a.idx - b.idx
        );
        if (allSorted.length === 0) continue;

        const cursorVal =
          typeof cursors[convId] === 'number' && Number.isFinite(cursors[convId])
            ? cursors[convId]
            : null;
        const minIdx = cursorVal !== null ? Math.max(0, cursorVal - 3) : 0;
        const steps = allSorted.filter((st) => st.idx >= minIdx);
        if (steps.length === 0) continue;

        const s0 = allSorted[0];
        const sigModel = String(s0.m || s0.ml || 'unknown').trim().toLowerCase();
        const firstSig = `${sigModel}:${s0.idx}:${s0.in}:${s0.cr}:${s0.cw}:${s0.out}:${s0.rs}:${s0.ts || 0}`;
        const netRec = netConvsById.get(`id::${convId}`);
        const projectName = String(
          netRec?.projectName || netRec?.workspaceNames?.[0] || ''
        ).trim();

        batches.push({
          convId,
          projectName,
          firstSig,
          steps
        });
      }

      rootEl.setAttribute('data-agy-ledger-out', JSON.stringify({ ok: true, batches }));
    } catch (err) {
      try {
        document.documentElement?.setAttribute(
          'data-agy-ledger-out',
          JSON.stringify({ ok: false, error: String(err) })
        );
      } catch {}
    }
  });
  }
})();
