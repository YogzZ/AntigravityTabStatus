/**
 * Antigravity Tab Status - Multi-Project Popup Controller (v2.7.0)
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

const VALID_INDICATOR_STYLES = new Set(['antigravity', 'gemini', 'glow', 'claude', 'geek', 'emoji']);
const VALID_ICON_LAYOUTS = new Set(['standalone', 'badge']);
const VALID_BADGE_SIZES = new Set(['standard', 'large']);

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

const enabledToggle = document.getElementById('enabledToggle');
const statusDot = document.getElementById('statusDot');
const statusLabel = document.getElementById('statusLabel');
const statusReason = document.getElementById('statusReason');
const markAllReadBtn = document.getElementById('markAllReadBtn');
const statPills = document.getElementById('statPills');
const pillWaiting = document.getElementById('pillWaiting');
const pillUnread = document.getElementById('pillUnread');
const pillRunning = document.getElementById('pillRunning');
const pillTotal = document.getElementById('pillTotal');
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
const autoProbeCollapsedToggle = document.getElementById('autoProbeCollapsedToggle');
const waitingInput = document.getElementById('waitingSelector');
const runningInput = document.getElementById('runningSelector');
const saveSelectorsBtn = document.getElementById('saveSelectorsBtn');
const inspectBtn = document.getElementById('inspectBtn');
const saveFeedback = document.getElementById('saveFeedback');

let activeTabId = null;
let currentFilter = 'all'; // 'all' | 'active'
let currentIndicatorStyle = 'glow';
let currentIconLayout = 'standalone';
let currentBadgeSize = 'standard';
let currentPrimaryAction = null; // 'open' | 'reload' | null
let lastRenderedDigest = '';
let feedbackTimerId = null;
let lastFeedbackText = '';

function isAntigravityUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
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

function focusSidebarItem(taskId, projectName = '', taskTitle = '') {
  if (!activeTabId || !taskId) return;
  sendTopFrameMessage(activeTabId, {
    type: 'FOCUS_TASK',
    taskId,
    projectName,
    taskTitle
  });
  chrome.runtime.sendMessage(
    {
      type: 'FOCUS_TASK_BROADCAST',
      tabId: activeTabId,
      taskId,
      projectName,
      taskTitle
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
  setTimeout(refreshCurrentTabStatus, 180);
  setTimeout(refreshCurrentTabStatus, 480);
}

function renderProjectsTree(projects) {
  const safeProjects = Array.isArray(projects) ? projects : [];
  const filteredProjects = safeProjects
    .map((p) => ({
      projectName: p.projectName,
      projectType: p.projectType || 'local',
      headerTaskId: p.headerTaskId || '',
      isCollapsed: Boolean(p.isCollapsed),
      knownEmpty: Boolean(p.knownEmpty),
      tasks:
        currentFilter === 'active'
          ? (p.tasks || []).filter((task) => task.state !== 'idle')
          : p.tasks || []
    }))
    .filter((p) => (currentFilter === 'active' ? p.tasks.length > 0 : true));

  const digest = JSON.stringify({ filter: currentFilter, list: filteredProjects });
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
        focusSidebarItem(proj.headerTaskId, proj.projectName, '')
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
        if (task.reason) {
          rowBtn.title = `${proj.projectName} › ${task.title}\n${task.reason}`;
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
          focusSidebarItem(task.taskId, proj.projectName, task.title)
        );
        itemLi.appendChild(rowBtn);
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

  const showMarkRead = resp.enabled && (counts.unread > 0 || Boolean(resp.previewState));
  markAllReadBtn.classList.toggle('hidden', !showMarkRead);

  previewTag.classList.toggle('hidden', !resp.previewState);
  setToggleGroupState(previewButtons, (btn) => {
    const mode = btn.dataset.preview;
    return resp.previewState ? resp.previewState === mode : mode === 'clear';
  });

  projectsSection.classList.remove('hidden');
  renderProjectsTree(resp.projects);
}

async function refreshCurrentTabStatus() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];

  if (!tab || !isAntigravityUrl(tab.url)) {
    activeTabId = null;
    currentPrimaryAction = 'open';
    statusDot.className = 'status-dot idle';
    statusDot.dataset.indicatorStyle = currentIndicatorStyle;
    statusLabel.textContent = t('notAgyTitle', {}, 'Not an Antigravity tab');
    statusReason.textContent = t('notAgyReason', {}, 'Switch to an antigravity.google.com tab to view project status.');
    statPills.classList.add('hidden');
    projectsSection.classList.add('hidden');
    markAllReadBtn.classList.add('hidden');
    actionBanner.classList.remove('hidden');
    primaryActionBtn.textContent = t('openAgyBtn', {}, 'Open antigravity.google.com');
    return;
  }

  activeTabId = tab.id;
  const resp = await sendTopFrameMessage(activeTabId, { type: 'GET_STATUS' });

  if (!resp) {
    currentPrimaryAction = 'reload';
    statusDot.className = 'status-dot waiting';
    statusDot.dataset.indicatorStyle = currentIndicatorStyle;
    statusLabel.textContent = t('needRefreshTitle', {}, 'Refresh tab to activate');
    statusReason.textContent = t('needRefreshReason', {}, 'Extension updated to v2.7.0. Refresh this tab once to enable status lights.');
    statPills.classList.add('hidden');
    projectsSection.classList.add('hidden');
    markAllReadBtn.classList.add('hidden');
    actionBanner.classList.remove('hidden');
    primaryActionBtn.textContent = t('refreshNowBtn', {}, 'Refresh current tab');
    return;
  }

  currentPrimaryAction = null;
  actionBanner.classList.add('hidden');
  renderStatusUI(resp);
}

primaryActionBtn.addEventListener('click', () => {
  if (currentPrimaryAction === 'open') {
    chrome.tabs.create({ url: 'https://antigravity.google.com/' });
    window.close();
  } else if (currentPrimaryAction === 'reload' && activeTabId) {
    chrome.tabs.reload(activeTabId);
    window.close();
  }
});

chrome.storage.sync.get(
  {
    enabled: true,
    indicatorStyle: 'glow',
    iconLayout: 'standalone',
    badgeSize: 'standard',
    autoProbeCollapsed: false,
    customWaitingSelector: '',
    customRunningSelector: ''
  },
  (cfg) => {
    enabledToggle.checked = Boolean(cfg.enabled);
    if (autoProbeCollapsedToggle) {
      autoProbeCollapsedToggle.checked = Boolean(cfg.autoProbeCollapsed);
    }
    waitingInput.value = cfg.customWaitingSelector || '';
    runningInput.value = cfg.customRunningSelector || '';

    const nextStyle = VALID_INDICATOR_STYLES.has(cfg.indicatorStyle) ? cfg.indicatorStyle : 'glow';
    const nextLayout = VALID_ICON_LAYOUTS.has(cfg.iconLayout) ? cfg.iconLayout : 'standalone';
    const nextSize = VALID_BADGE_SIZES.has(cfg.badgeSize) ? cfg.badgeSize : 'standard';
    syncStyleControls(nextStyle, nextLayout, nextSize);
  }
);

enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked }, () => {
    setTimeout(refreshCurrentTabStatus, 80);
  });
});

if (autoProbeCollapsedToggle) {
  autoProbeCollapsedToggle.addEventListener('change', () => {
    chrome.storage.sync.set({ autoProbeCollapsed: autoProbeCollapsedToggle.checked });
  });
}

if (syncCollapsedBtn) {
  syncCollapsedBtn.addEventListener('click', async () => {
    if (!activeTabId) return;
    syncCollapsedBtn.classList.add('is-syncing');
    if (syncCollapsedLabel) syncCollapsedLabel.textContent = t('syncingBtn', {}, 'Syncing...');
    sendTopFrameMessage(activeTabId, { type: 'PROBE_COLLAPSED' });
    chrome.runtime.sendMessage(
      {
        type: 'PROBE_COLLAPSED_BROADCAST',
        tabId: activeTabId
      },
      () => {
        void chrome.runtime.lastError;
      }
    );
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
  if (!activeTabId) return;
  await sendTopFrameMessage(activeTabId, { type: 'MARK_ALL_READ' });
  lastRenderedDigest = '';
  await refreshCurrentTabStatus();
});

for (const btn of indicatorStyleButtons) {
  btn.addEventListener('click', () => {
    const nextStyle = btn.dataset.style;
    if (!VALID_INDICATOR_STYLES.has(nextStyle)) return;
    syncStyleControls(nextStyle, null, null);
    chrome.storage.sync.set({ indicatorStyle: nextStyle }, () => {
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
      setTimeout(refreshCurrentTabStatus, 80);
    });
  });
}

for (const btn of previewButtons) {
  btn.addEventListener('click', async () => {
    if (!activeTabId) return;
    const mode = btn.dataset.preview;
    const state = mode === 'clear' ? null : mode;
    await sendTopFrameMessage(activeTabId, { type: 'SET_PREVIEW', state });
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
      announceFeedback(t('feedbackSaved', {}, 'Saved'), 1800);
      setTimeout(refreshCurrentTabStatus, 100);
    }
  );
});

inspectBtn.addEventListener('click', async () => {
  if (!activeTabId) return;
  const resp = await sendTopFrameMessage(activeTabId, { type: 'INSPECT_PAGE' });
  if (resp && resp.ok && resp.snapshot) {
    try {
      await navigator.clipboard.writeText(JSON.stringify(resp.snapshot, null, 2));
      announceFeedback(t('feedbackCopied', {}, 'Diagnostics copied'), 2000);
    } catch {
      announceFeedback(t('feedbackCopyFailed', {}, 'Copy failed'), 2000);
    }
  }
});

refreshCurrentTabStatus();
setInterval(refreshCurrentTabStatus, 1000);
