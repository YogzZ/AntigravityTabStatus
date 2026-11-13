/**
 * Antigravity Tab Status - Main World Lightweight React Memory & Stream Bridge (v2.6.0)
 *
 * 优雅、零 UI 点击、高性能的内存直读架构：
 * - 非 Antigravity 页面首行 0.01ms 立即退出
 * - 通过 Manifest V3 原生 `world: "MAIN"` 注入（零内联脚本，100% 兼容严格 CSP）
 * - 支持毫秒级结果缓存与节流（默认 550ms 内重复查询直接 O(1) 返回，几乎零 CPU 占用）
 * - 精准直读 React 18/19 内存树（解决深度截断、Context dependencies 与字典映射问题）：
 *   1) 沿 `.return` 完整回溯至 HostRoot，识别高层 Context.Provider (`tag === 10`) 与 `dependencies.firstContext` (`useContext`)
 *   2) 识别 TanStack `QueryClient`、Redux/Zustand `Store` 与标准化字典 `{ [convId]: { summary, status, workspaceUris } }`
 *   3) 兼容 Google `)]}'` 前缀与常规 JSON 的 `fetch` / `XHR` / `WebSocket` 被动只读观测
 */

(() => {
  const isTop = window.top === window.self;
  const AGY_HOST_RE = /^([a-z0-9-]+\.)?antigravity\.google(\.com)?$/i;
  const AGY_ORIGIN_RE = /^https:\/\/([a-z0-9-]+\.)?antigravity\.google(\.com)?$/i;

  if (isTop) {
    if (!AGY_HOST_RE.test(window.location.hostname || '')) return;
  } else {
    const origins = window.location.ancestorOrigins;
    if (!origins || origins.length === 0) return;
    const topOrigin = origins[origins.length - 1] || '';
    if (!AGY_ORIGIN_RE.test(topOrigin)) return;
  }

  if (window.__AGY_MAIN_BRIDGE_V24__) return;
  window.__AGY_MAIN_BRIDGE_V24__ = true;

  const NAV_SKIP_RE =
    /^(antigravity|projects|conversation\s*history|history|settings|preferences|customizations|plugins|new\s*conversation|new\s*chat|idle|running|waiting|completed|pending|active|archived|pinned)$/i;
  const GENERIC_CONTAINER_KEY_RE =
    /^(data|state|props|value|result|items|list|map|cache|meta|metadata|config|options|headers|children|style|theme|styles|actions|dispatch|subscribe|getState|queryClient|client|store|current|firstContext|dependencies)$/i;

  // 网络层被动观测到的项目与对话字典（只读克隆，绝不篡改原请求/响应）
  const netProjectsById = new Map();
  const netProjectsByName = new Map();
  const netConvsById = new Map();

  // 性能优化：桥接器结果短时缓存（同一渲染周期多次 Mutation 合并为 0.02ms 缓存命中）
  const BRIDGE_CACHE_TTL_MS = 500;
  let lastBridgeCacheTs = 0;
  let lastBridgeNamesKey = '';
  let lastBridgeResultJson = '';
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
    const keys = Object.keys(c);
    let count = 0;
    for (let i = 0; i < keys.length && count < 14; i++) {
      const k = keys[i];
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
      const v = obj[f];
      if (typeof v === 'string' && v.trim()) {
        out.push(v.trim().toUpperCase());
      }
    }
    return out;
  }

  function hasWaitingBool(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return (
      obj.waiting === true ||
      obj.waitingForUser === true ||
      obj.waitingForInput === true ||
      obj.waitingOnUser === true ||
      obj.isWaiting === true ||
      obj.isWaitingForUser === true ||
      obj.isWaitingForInput === true ||
      obj.needsApproval === true ||
      obj.needsInput === true ||
      obj.needsReview === true ||
      obj.needsUserAction === true ||
      obj.needsConfirmation === true ||
      obj.pendingApproval === true ||
      obj.hasPendingApproval === true ||
      obj.hasPendingInput === true ||
      obj.hasPendingQuestion === true ||
      obj.hasPendingReview === true ||
      obj.hasPendingInteraction === true ||
      obj.hasPendingUserAction === true ||
      obj.hasPendingAction === true ||
      obj.pendingUserAction === true ||
      obj.userInputRequired === true ||
      obj.requiresUserAction === true ||
      obj.attentionRequired === true ||
      obj.needsAttention === true ||
      obj.hasUnreadApproval === true ||
      obj.actionRequired === true ||
      obj.userActionRequired === true ||
      obj.isBlocked === true ||
      obj.blockedOnUser === true ||
      obj.askingQuestion === true ||
      obj.awaitingUser === true ||
      obj.awaitingInput === true ||
      obj.awaitingApproval === true ||
      obj.awaitingReview === true ||
      obj.requiresApproval === true ||
      obj.requiresInput === true ||
      obj.requiresReview === true
    );
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

    const isTerminalConv = convStatuses.some((st) => TERMINAL_CONV_STATUS_RE.test(st));
    const directStepCandidates = [c.activeStep, c.currentStep, c.lastStep, c.latestStep];
    if (!isTerminalConv) {
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
        const minIdx = Math.max(0, c.steps.length - 3);
        for (let i = c.steps.length - 1; i >= minIdx; i--) {
          const step = c.steps[i];
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
          if (stepStatuses.some((sst) => /RUNNING|WORKING|IN_PROGRESS|GENERATING|STREAMING|EXECUTING/.test(sst))) {
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
      c.agentWorking === true
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

    const rawId =
      obj.conversationId ??
      obj.cascadeId ??
      obj.trajectoryId ??
      obj.threadId ??
      obj.sessionId ??
      obj.chatId ??
      obj.taskId ??
      obj.id ??
      fallbackMapKey;
    if (typeof rawId !== 'string' && typeof rawId !== 'number') return false;
    const idStr = String(rawId).trim();
    if (!idStr || idStr.length > 160) return false;

    const title =
      obj.title ??
      obj.summary ??
      obj.headline ??
      obj.topic ??
      obj.subject ??
      obj.displayName ??
      obj.conversationTitle ??
      obj.name;
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

  function matchKnownProjectFromUris(obj, knownLowerNames, lowerToCanonical) {
    if (!knownLowerNames || knownLowerNames.size === 0) return '';
    const uriCandidates = [];
    if (typeof obj.workspaceUri === 'string') uriCandidates.push(obj.workspaceUri);
    if (typeof obj.projectPath === 'string') uriCandidates.push(obj.projectPath);
    if (typeof obj.rootUri === 'string') uriCandidates.push(obj.rootUri);
    if (typeof obj.repository?.name === 'string') uriCandidates.push(obj.repository.name);
    if (Array.isArray(obj.workspaceUris)) {
      for (const u of obj.workspaceUris) {
        if (typeof u === 'string') uriCandidates.push(u);
      }
    }
    if (Array.isArray(obj.workspaces)) {
      for (const w of obj.workspaces) {
        if (typeof w === 'string') uriCandidates.push(w);
        else if (w && typeof w === 'object') {
          const u = w.workspaceFolderAbsoluteUri ?? w.uri ?? w.rootUri ?? w.name ?? w.path;
          if (typeof u === 'string') uriCandidates.push(u);
        }
      }
    }

    for (const raw of uriCandidates) {
      const base = extractBasenameFromUri(raw).toLowerCase();
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
    const idStr = String(
      obj.conversationId ??
        obj.cascadeId ??
        obj.trajectoryId ??
        obj.threadId ??
        obj.sessionId ??
        obj.chatId ??
        obj.taskId ??
        obj.id ??
        fallbackConvId
    ).trim();
    const titleStr = String(
      obj.title ??
        obj.summary ??
        obj.headline ??
        obj.topic ??
        obj.subject ??
        obj.displayName ??
        obj.conversationTitle ??
        obj.name
    )
      .replace(/\s+/g, ' ')
      .trim();

    const projId = String(
      obj.projectId ??
        obj.workspaceId ??
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

    if (!projName && knownLowerNames) {
      projName = matchKnownProjectFromUris(obj, knownLowerNames, lowerToCanonical);
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

    return {
      convId: idStr,
      title: titleStr,
      projectId: projId,
      projectName: projName,
      state,
      reasonCode,
      reasonVars,
      reason,
      hasExplicitStatus: Boolean(hasExplicitStatus),
      isDetailRecord: Boolean(isDetailRecord),
      isTerminal: Boolean(isTerminal),
      debugFields: debugFields || {},
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

  function mergeConvRecord(prev, next, { preferLatestExplicit = false } = {}) {
    if (!prev) {
      return {
        ...next,
        debugFields: mergeDebugFields(null, next.debugFields, Boolean(next.isDetailRecord), false)
      };
    }
    const rank = { waiting: 4, unread: 3, running: 2, idle: 1 };
    let takeNextState = false;

    if (prev.state === 'waiting' && next.state === 'running') {
      // waiting 是粘性的：粗粒度列表摘要的 RUNNING 绝不能降级已确认的 waiting，只有详情记录才能覆盖
      takeNextState = Boolean(preferLatestExplicit && next.isDetailRecord);
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
    } else if ((rank[next.state] || 0) >= (rank[prev.state] || 0)) {
      takeNextState = true;
    }

    return {
      convId: prev.convId || next.convId,
      title: next.title || prev.title,
      projectId: next.projectId || prev.projectId,
      projectName: next.projectName || prev.projectName,
      state: takeNextState ? next.state : prev.state,
      reasonCode: takeNextState ? next.reasonCode : prev.reasonCode,
      reasonVars: takeNextState ? next.reasonVars : prev.reasonVars,
      reason: takeNextState ? next.reason : prev.reason,
      hasExplicitStatus: Boolean(prev.hasExplicitStatus || next.hasExplicitStatus),
      isDetailRecord: Boolean(takeNextState ? next.isDetailRecord : prev.isDetailRecord),
      isTerminal: Boolean(takeNextState ? next.isTerminal : prev.isTerminal),
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

    function walk(val, depth, curProjId, curProjName, parentKey = '') {
      if (budget <= 0 || depth > 8 || !val || typeof val !== 'object') return;
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
          walk(v, depth + 1, nextProjId, nextProjName, keyStr);
        }
        return;
      }

      if (val instanceof Set) {
        for (const item of val.values()) {
          walk(item, depth + 1, curProjId, curProjName, '');
        }
        return;
      }

      if (Array.isArray(val)) {
        for (let i = 0; i < val.length && i < 120; i++) {
          walk(val[i], depth + 1, curProjId, curProjName, '');
        }
        return;
      }

      // 识别 Project 对象
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

      let nextProjId = curProjId;
      let nextProjName = curProjName;

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

      // 识别 Conversation 对象（兼容字典键作 convId 的情况）
      const fallbackConvId =
        parentKey && parentKey.length >= 4 && !GENERIC_CONTAINER_KEY_RE.test(parentKey)
          ? parentKey
          : '';
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

      // 遍历普通对象键值
      const keys = Object.keys(val);
      for (let i = 0; i < keys.length && i < 65; i++) {
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
        walk(childVal, depth + 1, subProjId, subProjName, k);
      }
    }

    walk(rootVal, 0, contextProjId, contextProjName, '');
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

  function ingestNetworkPayload(data) {
    if (!data || typeof data !== 'object') return;
    const outProjects = { byId: netProjectsById, byName: netProjectsByName };
    const tempConvs = new Map();
    scanArbitraryDataTree(data, new Set(), null, outProjects, tempConvs);
    if (tempConvs.size > 0) {
      for (const [k, conv] of tempConvs.entries()) {
        netConvsById.set(k, mergeConvRecord(netConvsById.get(k), conv, { preferLatestExplicit: true }));
      }
      netDataDirty = true;
    }
  }

  // ============================================================================
  // 1. 被动只读监听 Fetch / XHR / WebSocket（兼容 JSON 与 Google `)]}'` 响应）
  // ============================================================================
  try {
    const origFetch = window.fetch;
    if (typeof origFetch === 'function') {
      window.fetch = function (...args) {
        const p = origFetch.apply(this, args);
        p.then((resp) => {
          try {
            const ct = (resp.headers?.get('content-type') || '').toLowerCase();
            if (ct.includes('json') || ct.includes('text/plain')) {
              resp
                .clone()
                .text()
                .then((txt) => {
                  const parsed = parseJsonSafely(txt);
                  if (parsed) ingestNetworkPayload(parsed);
                })
                .catch(() => {});
            }
          } catch {}
        }).catch(() => {});
        return p;
      };
    }
  } catch {}

  try {
    const origOpen = XMLHttpRequest.prototype.open;
    const origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (...args) {
      this.__agyTracked = true;
      return origOpen.apply(this, args);
    };
    XMLHttpRequest.prototype.send = function (...args) {
      if (this.__agyTracked) {
        this.addEventListener('load', function () {
          try {
            const ct = (this.getResponseHeader('content-type') || '').toLowerCase();
            if ((ct.includes('json') || ct.includes('text/plain')) && typeof this.responseText === 'string') {
              const parsed = parseJsonSafely(this.responseText);
              if (parsed) ingestNetworkPayload(parsed);
            }
          } catch {}
        });
      }
      return origSend.apply(this, args);
    };
  } catch {}

  try {
    const OrigWS = window.WebSocket;
    if (typeof OrigWS === 'function') {
      const PatchedWS = function (...args) {
        const ws = new OrigWS(...args);
        ws.addEventListener('message', (ev) => {
          const parsed = parseJsonSafely(ev.data);
          if (parsed) ingestNetworkPayload(parsed);
        });
        return ws;
      };
      PatchedWS.prototype = OrigWS.prototype;
      Object.assign(PatchedWS, OrigWS);
      window.WebSocket = PatchedWS;
    }
  } catch {}

  // ============================================================================
  // 2. React 18/19 Fiber 全深度 + Context dependencies + QueryClient/Store 提取器
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
      if (cur.stateNode instanceof Element) {
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
      if (dep.context && '_currentValue' in dep.context && dep.context._currentValue && typeof dep.context._currentValue === 'object') {
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

  function inspectCandidateContainers(obj, knownLowerNames, lowerToCanonical, outProjects, outConvs) {
    if (!obj || typeof obj !== 'object') return;
    const maybeClient = obj.client || obj.queryClient || obj.value?.queryClient || (typeof obj.getQueryCache === 'function' ? obj : null);
    if (maybeClient && typeof maybeClient.getQueryCache === 'function') {
      discoveredQueryClients.add(maybeClient);
    }
    const maybeStore = obj.store || obj.value?.store || (typeof obj.getState === 'function' ? obj : null);
    if (maybeStore && typeof maybeStore.getState === 'function') {
      discoveredStores.add(maybeStore);
    }
  }

  function scanTopLevelProvidersOnce(hostRoot, knownLowerNames, lowerToCanonical, outProjects, outConvs) {
    if (!hostRoot) return;
    const queue = [hostRoot.stateNode?.current || hostRoot];
    let visited = 0;
    const seen = new WeakSet();
    while (queue.length > 0 && visited < 220) {
      const f = queue.shift();
      if (!f || typeof f !== 'object' || seen.has(f)) continue;
      seen.add(f);
      visited++;

      if (f.tag === 10 && f.memoizedProps && typeof f.memoizedProps.value === 'object' && f.memoizedProps.value) {
        inspectCandidateContainers(f.memoizedProps.value, knownLowerNames, lowerToCanonical, outProjects, outConvs);
        scanArbitraryDataTree(f.memoizedProps.value, knownLowerNames, lowerToCanonical, outProjects, outConvs, '', '');
      }
      if (f.memoizedProps && typeof f.memoizedProps === 'object') {
        inspectCandidateContainers(f.memoizedProps, knownLowerNames, lowerToCanonical, outProjects, outConvs);
      }

      if (f.child) queue.push(f.child);
      if (f.sibling && visited < 160) queue.push(f.sibling);
    }
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

    const scanSingleFiberData = (fiber, contextProjId, contextProjName) => {
      const props = fiber.memoizedProps;
      if (props && typeof props === 'object') {
        inspectCandidateContainers(props, knownLowerNames, lowerToCanonical, outProjects, outConvs);
        scanArbitraryDataTree(
          props,
          knownLowerNames,
          lowerToCanonical,
          outProjects,
          outConvs,
          contextProjId,
          contextProjName
        );
      }

      for (const val of collectFiberHooksAndContexts(fiber)) {
        inspectCandidateContainers(val, knownLowerNames, lowerToCanonical, outProjects, outConvs);
        scanArbitraryDataTree(
          val,
          knownLowerNames,
          lowerToCanonical,
          outProjects,
          outConvs,
          contextProjId,
          contextProjName
        );
      }
    };

    let firstRoot = null;
    const projEls = document.querySelectorAll('[data-agy-proj-name]');
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
    const taskEls = document.querySelectorAll('[data-agy-parent-proj]');
    for (const taskEl of taskEls) {
      const parentProjName = taskEl.getAttribute('data-agy-parent-proj') || '';
      let fiber = getReactFiber(taskEl);
      if (fiber && !firstRoot) {
        firstRoot = findHostRootFiber(fiber);
      }
      let reachedSharedTaskAncestor = false;
      for (let depth = 0; depth < 16 && fiber; depth++, fiber = fiber.return) {
        if (!reachedSharedTaskAncestor && fiberContainsMultipleSelector(fiber, '[data-agy-parent-proj]')) {
          reachedSharedTaskAncestor = true;
        }
        if (reachedSharedTaskAncestor || sharedFibersVisited.has(fiber)) {
          if (sharedFibersVisited.has(fiber)) continue;
          sharedFibersVisited.add(fiber);
        }
        const contextProjName = reachedSharedTaskAncestor ? '' : parentProjName;
        const contextProjId =
          (!reachedSharedTaskAncestor && contextProjName && outProjects.byName.get(contextProjName.toLowerCase())?.id) || '';
        scanSingleFiberData(fiber, contextProjId, contextProjName);
      }
    }

    // 扫描顶层 Provider（仅覆盖顶层 Context.Provider 节点，速度极快）
    if (firstRoot) {
      scanTopLevelProvidersOnce(firstRoot, knownLowerNames, lowerToCanonical, outProjects, outConvs);
    }

    // 直接读取缓存到的 QueryClient 与 Store
    for (const qc of discoveredQueryClients) {
      try {
        for (const q of qc.getQueryCache().getAll()) {
          if (q?.state?.data) {
            scanArbitraryDataTree(q.state.data, knownLowerNames, lowerToCanonical, outProjects, outConvs, '', '');
          }
        }
      } catch {}
    }
    for (const st of discoveredStores) {
      try {
        scanArbitraryDataTree(st.getState(), knownLowerNames, lowerToCanonical, outProjects, outConvs, '', '');
      } catch {}
    }

    // 双向粘性合并：同时将 live Fiber 的 waiting / detail-running / terminal 状态回写 netConvsById，
    // 确保切走路由或摘要轮询刷新时 waiting 不会被粗粒度 RUNNING 覆盖，且回答后能准确解除 waiting
    for (const [k, liveRec] of outConvs.entries()) {
      const merged = mergeConvRecord(netConvsById.get(k), liveRec, { preferLatestExplicit: true });
      netConvsById.set(k, merged);
      outConvs.set(k, merged);
    }
    for (const [k, netRec] of netConvsById.entries()) {
      if (!outConvs.has(k)) {
        outConvs.set(k, { ...netRec });
      }
    }

    // 汇总每个已知项目的 projectType 与 conversations
    const projectsResult = {};
    for (const canonicalName of cleanNames) {
      const low = canonicalName.toLowerCase();
      const projMeta = outProjects.byName.get(low);
      projectsResult[canonicalName] = {
        projectId: projMeta?.id || '',
        projectType: projMeta?.projectType || null,
        hasEmptyArray: Boolean(projMeta?.hasEmptyArray),
        tasks: []
      };
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
          debugFields: conv.debugFields || {}
        });
      }

      let targetProjName = '';
      if (conv.projectName && lowerToCanonical.has(conv.projectName.toLowerCase())) {
        targetProjName = lowerToCanonical.get(conv.projectName.toLowerCase());
      } else if (conv.projectId && outProjects.byId.has(conv.projectId)) {
        const mapped = outProjects.byId.get(conv.projectId).name;
        if (mapped && lowerToCanonical.has(mapped.toLowerCase())) {
          targetProjName = lowerToCanonical.get(mapped.toLowerCase());
        }
      }

      if (!targetProjName || !projectsResult[targetProjName]) continue;
      const pid = projectsResult[targetProjName].projectId;
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

      projectsResult[targetProjName].tasks.push({
        taskId: computedHref ? `href:${computedHref}` : `bridge:${targetProjName}::${conv.convId}`,
        convId: conv.convId,
        title: conv.title,
        state: conv.state,
        confirmedDetail: Boolean(conv.isDetailRecord),
        reasonCode: conv.reasonCode || 'reasonMemIdle',
        reasonVars,
        reason: conv.reason || (conv.timeText ? `Active ${conv.timeText}` : 'Idle (memory sync)'),
        timeText: conv.timeText || '',
        isActive: false
      });
    }

    try {
      window.__AGY_LAST_DIAG__ = {
        ts: Date.now(),
        url: window.location.href,
        conversations: diagnostics
      };
    } catch {}

    return { ok: true, projects: projectsResult, diagnostics };
  }

  // 跨世界同步桥接协议（内置 500ms 短时缓存，路由变化自动失效）
  window.addEventListener('__AGY_BRIDGE_REQ__', () => {
    try {
      const rootEl = document.documentElement;
      if (!rootEl) return;
      const rawIn = rootEl.getAttribute('data-agy-bridge-in') || '[]';
      const routeKey = `${window.location.pathname || ''}${window.location.search || ''}::${rawIn}`;
      const now = Date.now();
      if (
        !netDataDirty &&
        routeKey === lastBridgeNamesKey &&
        lastBridgeResultJson &&
        now - lastBridgeCacheTs < BRIDGE_CACHE_TTL_MS
      ) {
        rootEl.setAttribute('data-agy-bridge-out', lastBridgeResultJson);
        return;
      }

      const projectNames = JSON.parse(rawIn);
      const res = extractCollapsedProjectsFromPage(projectNames);
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
})();
