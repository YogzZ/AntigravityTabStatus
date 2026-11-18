/**
 * Antigravity Tab Status - Unified Sidebar Projects & Active Pane Scanner (v2.9.0)
 *
 * 针对真实 Antigravity 工作区侧边栏结构与「折叠项目」深度校准：
 * - 严格限定采集左侧 `Projects` 下方至 `Settings` / 实例切换器上方的当前实例项目
 * - 三重机制突破「项目折叠后读不到对话」限制：
 *   1) 通过 `page-bridge.js` (`world: "MAIN"`) 从 React Fiber / QueryCache / 网络流直接提取已折叠项目的对话与实时状态
 *   2) 展开态记忆缓存：用户展开过再折叠时完整保留对话列表与已知状态
 *   3) 懒加载项目一次性静默展开快照探测（自动展开采集后立即恢复折叠）及手动「同步折叠」按钮
 * - 可选 Shadow DOM 对话框上下文胶囊（默认关闭，遵守 WCAG 1.4.13、reduced-motion 与 forced-colors）
 */

(() => {
  const isTop = window.top === window.self;
  const AGY_HOST_RE = /^(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
  const AGY_ORIGIN_RE = /^https:\/\/(?:[a-z0-9-]+\.)*antigravity\.google(?:\.com)?$/i;
  const LOCAL_HOST_RE = /^(?:localhost|127\.0\.0\.1)$/i;
  const LOCAL_ORIGIN_RE = /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/i;

  let isLocalContext = false;
  if (isTop) {
    const officialOk = AGY_HOST_RE.test(window.location.hostname || '');
    const localOk =
      window.location.protocol === 'http:' && LOCAL_HOST_RE.test(window.location.hostname || '');
    if (!officialOk && !localOk) return;
    isLocalContext = localOk && !officialOk;
  } else {
    const origins = window.location.ancestorOrigins;
    if (!origins || origins.length === 0) return;
    const topOrigin = origins[origins.length - 1] || '';
    const officialOk = AGY_ORIGIN_RE.test(topOrigin);
    const localOk = LOCAL_ORIGIN_RE.test(topOrigin);
    if (!officialOk && !localOk) return;
    isLocalContext = localOk && !officialOk;
  }

  if (window.__AGY_SCANNER_V22__) return;
  window.__AGY_SCANNER_V22__ = true;

  function isLocalAntigravityConfirmed() {
    if (!isLocalContext) return true;
    try {
      if (document.documentElement?.hasAttribute('data-agy-local-host')) return true;
      if (
        document.querySelector(
          '.agy-composer-footer, button[data-testid="permissions-selector-trigger"]'
        )
      ) {
        return true;
      }
    } catch {}
    return false;
  }

  function t(key, vars = {}, fallback = '') {
    try {
      const res = window.__AGY_I18N__?.t?.(key, vars);
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

  const EXCLUDED_CODE_SELECTOR = 'pre, code, agent-embed, script, style, noscript, template';
  const ICON_FONT_RE = /material\s*symbols|material\s*icons|google\s*symbols|codicon|lucide|fontawesome/i;

  // 时间戳匹配（如 21m, 16m, 2h, 3d, Just now, Yesterday, 刚刚, 5分钟前）
  const RELATIVE_TIME_RE =
    /^(just\s*now|now|\d+\s*(s|sec|secs|m|min|mins|h|hr|hrs|d|w|mo|yr|y)|yesterday|\d+\s*(秒|分钟?|小时|天|周|个月|年)前?|刚刚|昨天)$/i;

  // 忽略的侧边栏顶部/底部功能按钮文本
  const NAV_CHROME_TEXT_RE =
    /^(antigravity|projects|conversation\s*history|history|settings|preferences|customizations|plugins|extensions|documentation|docs|help|feedback|sign\s*out|log\s*out|new\s*chat|new\s*task|new\s*conversation|new\s*project|search|filter|show\s*more|load\s*more|collapse|expand|设置|历史对话|历史记录|插件|文档|帮助|反馈|退出登录|新建对话|新建任务|搜索)$/i;

  // 空项目下的占位提示文本（跳过，不作为对话也不作为项目）
  const EMPTY_PLACEHOLDER_RE =
    /^(no\s+(conversations?|chats?|tasks?|threads?|sessions?|items?)(\s+yet|\s+found)?|empty|nothing\s+here|暂无对话|暂无任务|没有对话|尚无对话)$/i;

  const DESTRUCTIVE_BTN_RE = /^(delete|remove|sign out|log out|disconnect|删除|移除|退出登录|断开连接)$/i;

  // Google Symbols / Material Symbols 图标字形映射
  const WAITING_LIGATURES = new Set([
    'notifications',
    'notifications_active',
    'notification_important',
    'warning',
    'warning_amber',
    'error',
    'error_outline',
    'priority_high',
    'pending_actions',
    'help',
    'help_outline',
    'quiz',
    'live_help',
    'contact_support',
    'rate_review',
    'assignment_late',
    'rule',
    'fact_check',
    'approval',
    'chat_error',
    'pan_tool',
    'front_hand',
    'gpp_maybe',
    'report',
    'announcement'
  ]);

  const RUNNING_LIGATURES = new Set([
    'progress_activity',
    'autorenew',
    'sync',
    'cyclone',
    'hourglass_top',
    'hourglass_bottom',
    'hourglass_empty',
    'stop_circle',
    'bolt'
  ]);

  const UNREAD_LIGATURES = new Set([
    'mark_chat_unread',
    'mark_unread_chat_alt',
    'fiber_manual_record'
  ]);

  const PROJECT_LOCAL_LIGATURES = new Set([
    'folder',
    'folder_open',
    'folder_special',
    'workspaces',
    'work',
    'laptop',
    'computer',
    'desktop_windows',
    'terminal'
  ]);

  const PROJECT_REMOTE_LIGATURES = new Set([
    'cloud',
    'cloud_queue',
    'cloud_done',
    'cloud_sync',
    'wb_cloudy',
    'dns',
    'public',
    'language',
    'storage'
  ]);

  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = 1;
  colorCanvas.height = 1;
  const colorCtx = colorCanvas.getContext('2d', { willReadFrequently: true });

  let customSelectors = {
    autoProbeCollapsed: false,
    customWaitingSelector: '',
    customRunningSelector: ''
  };

  try {
    if (chrome?.runtime?.id && chrome.storage?.sync) {
      chrome.storage.sync.get(
        { autoProbeCollapsed: false, customWaitingSelector: '', customRunningSelector: '' },
        (items) => {
          if (chrome.runtime.lastError) return;
          customSelectors = { ...customSelectors, ...items };
        }
      );
      chrome.storage.onChanged.addListener((changes, area) => {
        try {
          if (!chrome?.runtime?.id || area !== 'sync') return;
          if (changes.autoProbeCollapsed) {
            customSelectors.autoProbeCollapsed = Boolean(changes.autoProbeCollapsed.newValue);
          }
          if (changes.customWaitingSelector) {
            customSelectors.customWaitingSelector = changes.customWaitingSelector.newValue || '';
          }
          if (changes.customRunningSelector) {
            customSelectors.customRunningSelector = changes.customRunningSelector.newValue || '';
          }
        } catch {}
      });
    }
  } catch {}

  // ============================================================================
  // 1. 通用可视性、颜色与动画解析工具
  // ============================================================================

  function parseRgba(colorStr) {
    if (!colorStr || typeof colorStr !== 'string') return null;
    const trimmed = colorStr.trim();
    const low = trimmed.toLowerCase();
    if (
      !trimmed ||
      low === 'none' ||
      low === 'transparent' ||
      low === 'rgba(0, 0, 0, 0)' ||
      low === 'currentcolor' ||
      low === 'inherit' ||
      low === 'initial' ||
      low === 'unset' ||
      low.startsWith('url(') ||
      low.startsWith('var(')
    ) {
      return null;
    }
    if (/^rgba?\(/i.test(trimmed) && !trimmed.includes('%')) {
      const nums = trimmed.match(/[\d.]+/g);
      if (!nums || nums.length < 3) return null;
      const r = Number(nums[0]);
      const g = Number(nums[1]);
      const b = Number(nums[2]);
      const a = nums.length >= 4 ? Math.round(Number(nums[3]) * 255) : 255;
      return a > 15 ? { r, g, b, a } : null;
    }
    if (!colorCtx) return null;
    try {
      colorCtx.clearRect(0, 0, 1, 1);
      colorCtx.fillStyle = 'rgba(0, 0, 0, 0)';
      colorCtx.fillStyle = trimmed;
      colorCtx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = colorCtx.getImageData(0, 0, 1, 1).data;
      return a > 15 ? { r, g, b, a } : null;
    } catch {
      return null;
    }
  }

  function isRedStopColor(colorStr) {
    const c = parseRgba(colorStr);
    return Boolean(c && c.a > 50 && c.r > 180 && c.g < 100 && c.b < 110);
  }

  function isWarmAlertColor(colorStr) {
    const c = parseRgba(colorStr);
    if (!c || c.a < 45) return false;
    const isAmberOrOrange =
      c.r >= 155 &&
      c.g >= 75 &&
      c.g <= 238 &&
      c.b <= 148 &&
      c.r >= c.g + 8 &&
      c.r - c.b >= 60;
    const isRedOrCoral =
      c.r >= 170 &&
      c.g < 145 &&
      c.b <= 140 &&
      c.r - c.g >= 65 &&
      c.r - c.b >= 65;
    return isAmberOrOrange || isRedOrCoral;
  }

  function isStopControlElement(el, rowEl) {
    let cur = el;
    while (cur && cur !== rowEl) {
      const label = `${cur.getAttribute?.('aria-label') || ''} ${cur.getAttribute?.('title') || ''} ${
        cur.getAttribute?.('data-tooltip') || ''
      }`.toLowerCase();
      if (label && /\b(stop|cancel|abort)\b|停止|取消/i.test(label)) {
        return true;
      }
      cur = cur.parentElement;
    }
    return false;
  }

  function hasWarmAlertPseudoDot(el) {
    if (!el || !(el instanceof Element)) return false;
    for (const pseudo of ['::before', '::after']) {
      try {
        const st = window.getComputedStyle(el, pseudo);
        if (!st || !st.content || st.content === 'none' || st.content === 'normal' || st.display === 'none') {
          continue;
        }
        const w = parseFloat(st.width);
        const h = parseFloat(st.height);
        if (w >= 1.2 && w <= 18 && h >= 1.2 && h <= 18) {
          if (
            isWarmAlertColor(st.backgroundColor) ||
            isWarmAlertColor(st.color) ||
            ((parseFloat(st.borderTopWidth) || 0) >= 1 && isWarmAlertColor(st.borderTopColor))
          ) {
            return true;
          }
        }
      } catch {}
    }
    return false;
  }

  function isCompactWarmBadgeElement(el, rowEl, excludedIconEl = null) {
    if (!el || !(el instanceof Element) || el === rowEl || !isElementRendered(el, 1)) return false;
    if (excludedIconEl && (el === excludedIconEl || excludedIconEl.contains(el) || el.contains(excludedIconEl))) {
      return false;
    }
    if (rowEl && isStopControlElement(el, rowEl)) return false;
    if (hasWarmAlertPseudoDot(el)) return true;

    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.width > 32 || r.height < 1 || r.height > 32) return false;

    const st = window.getComputedStyle(el);
    if (isWarmAlertColor(st.backgroundColor)) return true;
    if ((parseFloat(st.borderTopWidth) || 0) >= 1 && isWarmAlertColor(st.borderTopColor)) return true;

    const isSvgNode =
      (typeof SVGElement !== 'undefined' && el instanceof SVGElement) ||
      el.namespaceURI === 'http://www.w3.org/2000/svg';
    if (isSvgNode) {
      const ownerSvg = el.tagName.toLowerCase() === 'svg' ? el : el.closest('svg');
      if (!ownerSvg || (!isStopCircleRunningSvg(ownerSvg) && !isFourDotWorkingSvg(ownerSvg))) {
        if (
          isWarmAlertColor(st.fill) ||
          isWarmAlertColor(st.stroke) ||
          isWarmAlertColor(st.color) ||
          isWarmAlertColor(el.getAttribute('fill') || '') ||
          isWarmAlertColor(el.getAttribute('stroke') || '')
        ) {
          return true;
        }
      }
    }

    if (isIconFontElement(el) && isWarmAlertColor(st.color)) {
      return true;
    }
    return false;
  }

  function subtreeHasWarmAlert(rootEl, rowEl, excludedIconEl = null) {
    if (!rootEl || !(rootEl instanceof Element)) return false;
    if (isCompactWarmBadgeElement(rootEl, rowEl, excludedIconEl)) return true;
    for (const child of rootEl.querySelectorAll('*')) {
      if (isCompactWarmBadgeElement(child, rowEl, excludedIconEl)) {
        return true;
      }
    }
    return false;
  }

  function isUnreadDotColor(colorStr, rowBgStr) {
    const c = parseRgba(colorStr);
    if (!c || c.a < 110) return false;
    const maxC = Math.max(c.r, c.g, c.b);
    const minC = Math.min(c.r, c.g, c.b);
    if (maxC - minC >= 45 && maxC >= 120) {
      return true;
    }
    const bg = parseRgba(rowBgStr);
    if (bg) {
      const lumDot = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
      const lumBg = 0.299 * bg.r + 0.587 * bg.g + 0.114 * bg.b;
      return Math.abs(lumDot - lumBg) >= 95;
    }
    return c.r >= 210 && c.g >= 210 && c.b >= 210;
  }

  function isElementVisible(el, minSize = 2) {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') >= 0.08
    );
  }

  function isElementRendered(el, minSize = 2) {
    if (!el || !(el instanceof Element)) return false;
    if (el.hasAttribute('hidden')) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < minSize || rect.height < minSize) return false;
    const style = window.getComputedStyle(el);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      parseFloat(style.opacity || '1') >= 0.12
    );
  }

  function isIconFontElement(el) {
    if (!el || !(el instanceof Element)) return false;
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (
      cls.includes('material-symbols') ||
      cls.includes('material-icons') ||
      cls.includes('google-symbols') ||
      cls.includes('codicon')
    ) {
      return true;
    }
    const ff = window.getComputedStyle(el).fontFamily || '';
    return ICON_FONT_RE.test(ff);
  }

  function isAttentionPulseOnly(animName, targetEl) {
    const name = String(animName || '').toLowerCase();
    const isPulseName =
      /(?:^|[-_])(pulse|ping|blink|breath|breathe|flash|bell|ring|shake|wiggle|bounce)(?:$|[-_])/i.test(name) &&
      !/spin|rotate|load|progress|dash|orbit|indeterminate/i.test(name);
    if (targetEl instanceof Element) {
      if (subtreeHasWarmAlert(targetEl, null, null)) {
        return true;
      }
      if (isPulseName) {
        const rect = targetEl.getBoundingClientRect();
        if (rect.width <= 28 && rect.height <= 28 && !isFourDotWorkingSvg(targetEl)) {
          return true;
        }
      }
    }
    return false;
  }

  function hasActiveSpinOrLoopAnimation(rootEl) {
    if (!rootEl) return false;
    if (typeof rootEl.getAnimations === 'function') {
      try {
        const anims = rootEl.getAnimations({ subtree: true });
        for (const anim of anims) {
          if (anim.playState !== 'running') continue;
          const target = anim.effect?.target;
          if (target instanceof Element && !isElementRendered(target, 2)) continue;
          const timing = anim.effect?.getComputedTiming ? anim.effect.getComputedTiming() : null;
          const name = (anim.animationName || '').toLowerCase();
          if (isAttentionPulseOnly(name, target)) continue;
          if (
            (timing && (timing.iterations === Infinity || timing.iterations > 3)) ||
            /spin|rotate|load|dash|progress|indeterminate/i.test(name)
          ) {
            return true;
          }
        }
      } catch {}
    }

    if (rootEl.querySelector?.('animateTransform, animate')) {
      return true;
    }

    const candidates = [rootEl, ...Array.from(rootEl.querySelectorAll?.('svg, g, circle, rect, path, span, div') || [])];
    for (const el of candidates) {
      if (!isElementRendered(el, 2)) continue;
      const st = window.getComputedStyle(el);
      if (
        st.animationName &&
        st.animationName !== 'none' &&
        st.animationPlayState !== 'paused' &&
        !isAttentionPulseOnly(st.animationName, el)
      ) {
        return true;
      }
    }
    return false;
  }

  // ============================================================================
  // 2. 当前打开的主对话工作区（右侧主面板）状态与面包屑检测
  // ============================================================================

  /**
   * 提取右侧主对话区顶部面包屑（如 `project-name / Conversation Title`），
   * 用于在无 aria-current 时精准定位侧边栏中哪一条对话处于「当前打开」状态。
   */
  function detectMainPaneBreadcrumb() {
    if (!document.body) return null;
    const candidates = document.body.querySelectorAll('nav[aria-label="Breadcrumb"], header, nav, div');
    for (const el of candidates) {
      if (!isElementVisible(el, 20)) continue;
      const r = el.getBoundingClientRect();
      const isBreadcrumbNav = el.getAttribute('aria-label') === 'Breadcrumb';
      const minLeft = isBreadcrumbNav ? 40 : 185;
      if (r.left < minLeft || r.top > 68 || r.height > 56 || r.width < 160) continue;

      // 收集顶部栏内的短文本片段（按水平从左到右排列）
      const parts = [];
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
        acceptNode(n) {
          const p = n.parentElement;
          if (!p || !isElementRendered(p, 1) || isIconFontElement(p)) return NodeFilter.FILTER_REJECT;
          const t = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
          return t ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
        }
      });
      let node;
      while ((node = walker.nextNode())) {
        const p = node.parentElement;
        const pr = p.getBoundingClientRect();
        if (pr.top > 68) continue;
        parts.push({ txt: (node.nodeValue || '').replace(/\s+/g, ' ').trim(), left: pr.left });
      }
      parts.sort((a, b) => a.left - b.left);
      const slashIdx = parts.findIndex((item) => item.txt === '/');
      if (slashIdx >= 1 && slashIdx < parts.length - 1) {
        const projectTitle = parts[slashIdx - 1].txt;
        const convTitle = parts[slashIdx + 1].txt;
        if (projectTitle && convTitle && projectTitle !== '/') {
          return { projectName: projectTitle, conversationTitle: convTitle };
        }
      }
    }
    return null;
  }

  function detectActivePaneState() {
    if (!document.body) return { state: 'none', reason: '' };

    if (customSelectors.customWaitingSelector) {
      try {
        for (const el of document.querySelectorAll(customSelectors.customWaitingSelector)) {
          if (isElementVisible(el)) {
            return {
              state: 'waiting',
              reason: t('reasonCustomWaiting', {}, 'Custom waiting selector matched')
            };
          }
        }
      } catch {}
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || p.closest(EXCLUDED_CODE_SELECTOR)) return NodeFilter.FILTER_REJECT;
        const t = (node.nodeValue || '').trim();
        if (!t || t.length > 120) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let hasWorkingText = false;
    let node;
    while ((node = walker.nextNode())) {
      const p = node.parentElement;
      if (!p) continue;
      const txt = (node.nodeValue || '').trim();

      if (
        txt.includes('Waiting for user input...') ||
        txt === 'Waiting for user input' ||
        txt.includes('Waiting for approval') ||
        txt.includes('Allow read access to this path?') ||
        /^Allow\s+.+\?$/i.test(txt) ||
        /^Asking\s+\d+\s+questions?$/i.test(txt) ||
        /^Waiting for (?:user |your )?(?:input|approval|confirmation|response|feedback|review)\b/i.test(txt)
      ) {
        if (isElementVisible(p)) {
          const sample = txt.slice(0, 32);
          return {
            state: 'waiting',
            reason: t('reasonMainWaitingText', { text: sample }, `Waiting for input "${sample}"`)
          };
        }
      }

      if (!hasWorkingText && txt.includes('Agent working')) {
        const st = window.getComputedStyle(p);
        if (st.display !== 'none' && st.visibility !== 'hidden') {
          hasWorkingText = true;
        }
      }
    }

    const buttons = Array.from(document.querySelectorAll('button, [role="button"]')).filter(
      (b) => !b.closest(EXCLUDED_CODE_SELECTOR) && isElementVisible(b)
    );
    const btnItems = buttons.map((btn) => ({
      btn,
      txt: (btn.textContent || '').replace(/\s+/g, ' ').trim(),
      disabled: Boolean(btn.disabled || btn.getAttribute('aria-disabled') === 'true')
    }));

    for (const item of btnItems) {
      if (!item.disabled && /^(Approve|Approve all|Accept all|Always allow|Proceed)$/i.test(item.txt)) {
        return {
          state: 'waiting',
          reason: t('reasonMainWaitingBtn', { text: item.txt }, `Waiting approval button "${item.txt}"`)
        };
      }
    }

    const submitBtns = btnItems.filter((b) => /^(Submit|Next|提交|下一步)$/i.test(b.txt));
    const skipBtns = btnItems.filter((b) => !b.disabled && /^(Skip|跳过)$/i.test(b.txt));
    for (const sub of submitBtns) {
      for (const skp of skipBtns) {
        let anc = sub.btn.parentElement;
        for (let d = 0; d < 6 && anc && anc !== document.body; d++) {
          if (anc.contains(skp.btn) && anc.getBoundingClientRect().height < 720) {
            return {
              state: 'waiting',
              reason: t('reasonMainWaitingCard', {}, 'Active prompt card (Submit / Skip)')
            };
          }
          anc = anc.parentElement;
        }
      }
    }

    if (customSelectors.customRunningSelector) {
      try {
        for (const el of document.querySelectorAll(customSelectors.customRunningSelector)) {
          if (isElementVisible(el)) {
            return {
              state: 'running',
              reason: t('reasonCustomRunning', {}, 'Custom running selector matched')
            };
          }
        }
      } catch {}
    }

    if (hasWorkingText || document.querySelector('[aria-label*="Agent working" i]')) {
      return {
        state: 'running',
        reason: t('reasonMainAgentWorking', {}, 'Agent working in main pane')
      };
    }

    for (const item of btnItems) {
      if (item.disabled || item.btn.closest('nav')) continue;
      if (
        (item.btn.getAttribute('data-testid') === 'idle-status-text' ||
          /\b\d+\s+tasks?\s+running\b/i.test(item.txt)) &&
        /\b\d+\s+tasks?\s+running\b/i.test(item.txt)
      ) {
        return {
          state: 'running',
          reason: t('reasonMainAgentWorking', {}, 'Agent working in main pane')
        };
      }
    }

    // 右下角红色方形停止按钮
    for (const { btn, txt, disabled } of btnItems) {
      if (disabled || DESTRUCTIVE_BTN_RE.test(txt)) continue;
      const btnRect = btn.getBoundingClientRect();
      if (btnRect.left < 220) continue; // 仅主对话区
      const inners = btn.querySelectorAll('rect, path, div, span');
      for (const inner of inners) {
        if (!isElementRendered(inner, 4)) continue;
        const r = inner.getBoundingClientRect();
        if (r.width > 40 || r.height > 40) continue;
        const st = window.getComputedStyle(inner);
        if (isRedStopColor(st.backgroundColor) || isRedStopColor(st.fill)) {
          return {
            state: 'running',
            reason: t('reasonMainStopBtn', {}, 'Stop button active in main pane')
          };
        }
      }
    }

    return { state: 'none', reason: '' };
  }

  // ============================================================================
  // 3. 左侧 Projects 侧边栏「项目 (Project) → 对话 (Conversation)」精准层级解析器
  // ============================================================================

  function extractCleanRowTextAndTime(rowEl) {
    let timeText = '';
    const titleParts = [];
    let titleLeftX = Infinity;
    let maxTitleFontWeight = 400;
    let mainTitleEl = null;

    const rRect = rowEl.getBoundingClientRect();
    const walker = document.createTreeWalker(rowEl, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const p = node.parentElement;
        if (!p || p.closest(EXCLUDED_CODE_SELECTOR)) return NodeFilter.FILTER_REJECT;
        if (!isElementRendered(p, 1)) return NodeFilter.FILTER_REJECT;
        if (isIconFontElement(p)) return NodeFilter.FILTER_REJECT;
        // 忽略行内右侧小尺寸次级操作按钮（如 + / ⋮ / Pin）内的辅助文字
        const btn = p.closest('button, [role="button"]');
        if (btn && btn !== rowEl) {
          const bRect = btn.getBoundingClientRect();
          if (bRect.width < rRect.width * 0.45) {
            return NodeFilter.FILTER_REJECT;
          }
        }
        const txt = (node.nodeValue || '').replace(/\s+/g, ' ').trim();
        if (!txt) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    const rawTokens = [];
    let n;
    while ((n = walker.nextNode())) {
      const p = n.parentElement;
      const txt = (n.nodeValue || '').replace(/\s+/g, ' ').trim();
      const pRect = p.getBoundingClientRect();
      const fw = parseInt(window.getComputedStyle(p).fontWeight, 10) || 400;
      rawTokens.push({ txt, p, pRect, fw });
    }

    for (let i = 0; i < rawTokens.length; i++) {
      const tok = rawTokens[i];
      const isRightSide = tok.pRect.left > rRect.left + rRect.width * 0.52;
      if ((i === rawTokens.length - 1 || isRightSide) && RELATIVE_TIME_RE.test(tok.txt)) {
        timeText = tok.txt;
        continue;
      }
      if (/^[›»▸▾⌄⌃+×•·…⋮⋯]$/.test(tok.txt)) {
        continue;
      }
      titleParts.push(tok.txt);
      if (tok.pRect.left < titleLeftX) {
        titleLeftX = tok.pRect.left;
      }
      if (tok.fw > maxTitleFontWeight) {
        maxTitleFontWeight = tok.fw;
      }
      if (!mainTitleEl) {
        mainTitleEl = tok.p;
      }
    }

    const title = titleParts.join(' ').replace(/\s+/g, ' ').trim();
    return {
      title,
      timeText,
      titleLeftX: Number.isFinite(titleLeftX) ? titleLeftX : rRect.left,
      fontWeight: maxTitleFontWeight,
      mainTitleEl
    };
  }

  function isThreeDotMenuSvg(svg) {
    const circles = svg.querySelectorAll('circle');
    const paths = svg.querySelectorAll('path');
    if (circles.length === 3 && paths.length === 0) {
      const cxs = Array.from(circles).map((c) => Number(c.getAttribute('cx') || 0));
      const cys = Array.from(circles).map((c) => Number(c.getAttribute('cy') || 0));
      const sameX = Math.max(...cxs) - Math.min(...cxs) <= 1.5;
      const sameY = Math.max(...cys) - Math.min(...cys) <= 1.5;
      if (sameX || sameY) return true;
    }
    return false;
  }

  function isFourDotWorkingSvg(svg) {
    const dots = svg.querySelectorAll('circle, rect').length;
    const paths = svg.querySelectorAll('path, polygon, polyline, line').length;
    return dots >= 4 && dots <= 9 && paths === 0;
  }

  function isStopCircleRunningSvg(svg) {
    // 典型运行中停止按钮图标：外圈 circle + 中心正方形 rect（如 <svg><circle/><rect/></svg>）
    const circles = svg.querySelectorAll('circle').length;
    const rects = svg.querySelectorAll('rect').length;
    const paths = svg.querySelectorAll('path');
    if (circles === 1 && rects === 1 && paths.length === 0) {
      const circleEl = svg.querySelector('circle');
      const rectEl = svg.querySelector('rect');
      const cR = parseFloat(circleEl?.getAttribute('r') || '0');
      const rW = parseFloat(rectEl?.getAttribute('width') || '0');
      if (cR > 0 && rW > 0) {
        return cR * 2 > rW * 1.2;
      }
      const cBox = circleEl.getBoundingClientRect();
      const rBox = rectEl.getBoundingClientRect();
      return cBox.width > 0 && rBox.width > 0 ? cBox.width > rBox.width * 1.2 : true;
    }
    // 双 path 形式：外圆环 + 中心方形停止块（M9 9h6v6H9 / M9.5 9.5h5v5 / h8v8）
    if (paths.length >= 1 && paths.length <= 2 && circles <= 1) {
      const dAll = Array.from(paths)
        .map((p) => p.getAttribute('d') || '')
        .join(' ');
      const hasOuterRing = circles === 1 || /[aA]\s*(?:8|9|10)\b|C6\.48\s*2\s*2\s*6\.48|M480-80q-83/i.test(dAll);
      const hasInnerStopSquare =
        /M(?:8|8\.5|9|9\.5|10)[,\s]+(?:8|8\.5|9|9\.5|10)\s*h\s*[4-8]\s*v\s*[4-8]|M360-600v240h240v-240/i.test(dAll);
      if (hasOuterRing && hasInnerStopSquare) {
        return true;
      }
    }
    return false;
  }

  function isSecondaryActionControl(el, rowEl) {
    const btn = el.closest('button, [role="button"]');
    if (!btn || btn === rowEl) return false;
    const bRect = btn.getBoundingClientRect();
    const rRect = rowEl.getBoundingClientRect();
    if (bRect.width > rRect.width * 0.5) return false;
    const label = (
      btn.getAttribute('aria-label') ||
      btn.getAttribute('title') ||
      btn.getAttribute('data-tooltip') ||
      ''
    ).toLowerCase();

    // 若按钮是停止运行 / 待确认通知，则绝不能当作次要菜单忽略！
    if (
      /\b(stop|cancel|abort|working|running|waiting|approval|question|asking|review|input|confirm|blocked|pending|notification|bell|alert|unread)\b|停止|取消|运行|待确认|待处理|待审阅|提问|未读/i.test(
        label
      )
    ) {
      return false;
    }

    if (
      /more|menu|option|delete|remove|rename|edit|pin|keep|close|archive|add|new|copy|share|filter|更多|菜单|删除|重命名|置顶|新建/i.test(
        label
      )
    ) {
      return true;
    }

    const txt = (btn.textContent || '').trim();
    if (txt === '+' || txt === '...' || txt === '⋯' || txt === '⋮') return true;
    const svg = btn.querySelector('svg');
    if (svg) {
      if (isThreeDotMenuSvg(svg)) return true;
      if (isFourDotWorkingSvg(svg) || isStopCircleRunningSvg(svg)) return false;
    }

    if (
      !label &&
      (rowEl.tagName === 'A' ||
        rowEl.getAttribute('role') === 'listitem' ||
        rowEl.getAttribute('role') === 'treeitem' ||
        rowEl.getAttribute('role') === 'option' ||
        btn.getAttribute('aria-haspopup') === 'menu')
    ) {
      if (subtreeHasWarmAlert(btn, rowEl)) return false;
      if (!hasActiveSpinOrLoopAnimation(btn)) {
        const innerSt = svg ? window.getComputedStyle(svg) : window.getComputedStyle(btn);
        if (!isWarmAlertColor(innerSt.color) && !isWarmAlertColor(innerSt.fill) && !isWarmAlertColor(innerSt.stroke)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * 区分项目行左侧图标是远程项目（☁ Cloud -> 'remote'）还是本地项目（📁 Folder -> 'local'）
   */
  function classifyProjectSvgType(svg) {
    const meta = `${svg.getAttribute('aria-label') || ''} ${svg.getAttribute('title') || ''} ${
      svg.getAttribute('class') || ''
    } ${svg.getAttribute('data-icon') || ''} ${svg.getAttribute('data-testid') || ''} ${
      svg.parentElement?.getAttribute('aria-label') || ''
    } ${svg.parentElement?.getAttribute('title') || ''} ${
      svg.parentElement?.getAttribute('class') || ''
    }`.toLowerCase();

    if (/cloud|remote|ssh|server|globe|host|vm|远程|云/i.test(meta)) return 'remote';
    if (/folder|local|dir|workspace|本地|文件夹/i.test(meta)) return 'local';

    // 排除 <defs>/<clipPath>/<mask> 内的剪裁框以及全尺寸透明 <rect fill="none"/>
    const visibleRects = Array.from(svg.querySelectorAll('rect')).filter((r) => {
      if (r.closest('defs, clipPath, mask')) return false;
      const fill = (r.getAttribute('fill') || '').toLowerCase();
      if (fill === 'none' || fill === 'transparent') return false;
      const w = parseFloat(r.getAttribute('width') || '0');
      const h = parseFloat(r.getAttribute('height') || '0');
      if (w >= 15 && h >= 15) return false;
      return true;
    });
    if (visibleRects.length > 0) return 'local';

    const dAll = Array.from(svg.querySelectorAll('path'))
      .filter((p) => !p.closest('defs, clipPath, mask'))
      .map((p) => p.getAttribute('d') || '')
      .join(' ');
    if (!dAll) return 'local';

    // 云朵图标必含大半径圆弧（a/A 半径 >= 2.5，如 a7 7 / a4.5 4.5；而文件夹圆角仅 a2 2）
    const hasCloudArc = /[aA]\s*(?:2\.[5-9]|[3-9]|\d{2,})(?:\.\d+)?[\s,]+(?:2\.[5-9]|[3-9]|\d{2,})/.test(dAll);
    if (hasCloudArc) {
      return 'remote';
    }

    // 文件夹图标包含较长的垂直侧壁直线段（如 V8 / v12 / v13 / v-480）
    const hasLongVerticalWall = /[vV]\s*-?(?:[5-9]|\d{2,})/.test(dAll);
    if (hasLongVerticalWall) {
      return 'local';
    }

    // 多段贝塞尔云团弧线（如 Material / Codicon Cloud）
    const curveCount = (dAll.match(/[cCqQ]/g) || []).length;
    if (curveCount >= 3) {
      return 'remote';
    }

    return 'local';
  }

  function isChevronOnlySvg(svg) {
    const paths = Array.from(svg.querySelectorAll('path')).filter((p) => !p.closest('defs, clipPath, mask'));
    const polylines = svg.querySelectorAll('polyline');
    const others = Array.from(svg.querySelectorAll('circle, rect, ellipse, polygon')).filter(
      (el) => !el.closest('defs, clipPath, mask')
    );
    if (others.length > 0) return false;
    if (polylines.length === 1 && paths.length === 0) return true;
    if (paths.length === 1) {
      const d = (paths[0].getAttribute('d') || '').trim();
      if (d.length <= 42 && !/[aAcCqQsS]/.test(d)) return true;
    }
    return false;
  }

  /**
   * 检测行左侧装订线（标题文字左侧 [rowRect.left .. titleLeftX]）是否带有项目图标（📁 本地 / ☁ 远程），
   * 或行右侧是否带有项目专属「+ 新建对话」按钮。
   */
  function detectProjectHeaderInfo(rowInfo, scope, nextRawTitle) {
    const { el, timeText, titleLeftX } = rowInfo;

    if (timeText) {
      return { isProject: false, projectType: 'local' };
    }

    const ariaLevel = parseInt(el.getAttribute('aria-level') || '', 10);
    if (ariaLevel >= 2) {
      return { isProject: false, projectType: 'local' };
    }

    const rowRect = el.getBoundingClientRect();
    const maxGutterIconLeft = Math.max(
      rowRect.left + 32,
      Number.isFinite(scope.headingLeftX) ? scope.headingLeftX + 26 : 38
    );

    let foundChevronInGutter = false;
    const svgs = Array.from(el.querySelectorAll('svg')).filter((s) => isElementRendered(s, 7));
    for (const svg of svgs) {
      const sRect = svg.getBoundingClientRect();
      const inLeftGutter =
        sRect.left <= maxGutterIconLeft &&
        sRect.right <= titleLeftX + 6 &&
        sRect.width >= 9 &&
        sRect.width <= 26 &&
        sRect.height >= 7 &&
        sRect.height <= 26;

      if (!inLeftGutter) continue;

      const circles = svg.querySelectorAll('circle').length;
      const nonCircleShapes = Array.from(svg.querySelectorAll('path, rect, polygon, polyline, line')).filter(
        (n) => !n.closest('defs, clipPath, mask')
      ).length;
      if (circles === 1 && nonCircleShapes === 0) continue;

      if (isFourDotWorkingSvg(svg) || hasActiveSpinOrLoopAnimation(svg)) continue;

      if (isChevronOnlySvg(svg)) {
        foundChevronInGutter = true;
        continue;
      }

      if (nonCircleShapes >= 1) {
        return {
          isProject: true,
          projectType: classifyProjectSvgType(svg),
          iconEl: svg
        };
      }
    }

    // 检查左侧装订线内的图标字体与类名图标（兼容 Codicon `class="codicon codicon-cloud"` 等空文本图标）
    for (const iconEl of el.querySelectorAll('*')) {
      if (!isElementRendered(iconEl, 7)) continue;
      const iRect = iconEl.getBoundingClientRect();
      if (iRect.left > maxGutterIconLeft || iRect.right > titleLeftX + 6 || iRect.width > 26) continue;

      const clsAndMeta = `${iconEl.getAttribute('class') || ''} ${iconEl.getAttribute('aria-label') || ''} ${
        iconEl.getAttribute('title') || ''
      } ${iconEl.getAttribute('data-icon') || ''}`.toLowerCase();

      if (/\b(codicon-cloud|codicon-remote|codicon-vm|codicon-globe|lucide-cloud|icon-cloud|remote-icon)\b/.test(clsAndMeta)) {
        return { isProject: true, projectType: 'remote', iconEl };
      }
      if (/\b(codicon-folder|codicon-root-folder|lucide-folder|icon-folder)\b/.test(clsAndMeta)) {
        return { isProject: true, projectType: 'local', iconEl };
      }

      if (isIconFontElement(iconEl)) {
        const lig = (iconEl.textContent || '').trim().toLowerCase();
        if (PROJECT_REMOTE_LIGATURES.has(lig) || /cloud|remote|vm|globe/.test(clsAndMeta)) {
          return { isProject: true, projectType: 'remote', iconEl };
        }
        if (PROJECT_LOCAL_LIGATURES.has(lig) || /folder|workspace/.test(clsAndMeta)) {
          return { isProject: true, projectType: 'local', iconEl };
        }
        if (/^(chevron_right|expand_more|arrow_right|arrow_drop_down)$/.test(lig) || /chevron/.test(clsAndMeta)) {
          foundChevronInGutter = true;
        }
      }
    }

    if (foundChevronInGutter) {
      return { isProject: true, projectType: 'local' };
    }

    if (ariaLevel === 1) {
      return { isProject: true, projectType: 'local' };
    }

    for (const btn of el.querySelectorAll('button, [role="button"]')) {
      if (btn === el || !isElementRendered(btn, 8)) continue;
      const label = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''}`.toLowerCase();
      const txt = (btn.textContent || '').trim();
      if (
        txt === '+' ||
        /\b(new\s*(conversation|chat|task)|create\s*conversation|add\s*conversation)\b|新建对话|新建任务/i.test(label)
      ) {
        return { isProject: true, projectType: 'local' };
      }
    }

    if (nextRawTitle && EMPTY_PLACEHOLDER_RE.test(nextRawTitle)) {
      return { isProject: true, projectType: 'local' };
    }

    return { isProject: false, projectType: 'local' };
  }

  /**
   * 过滤底部实例切换器（如 `[ 🟢 workspace-instance ⌄ ]`）或底部导航栏条目
   */
  function isInstanceSwitcherOrFooterRow(rowEl, scope) {
    const r = rowEl.getBoundingClientRect();
    const cRect = scope.container.getBoundingClientRect();

    // 若已确定 Settings 上边界，任何位于 Settings 及下方的行一律排除
    if (Number.isFinite(scope.maxBottomY) && r.bottom > scope.maxBottomY + 2) {
      return true;
    }

    // 额外兜底：位于侧边栏最底部 72px 内的实例下拉选择器（combobox / listbox 触发器 / 左绿点+右展开箭头）
    const nearSidebarBottom = cRect.height >= 220 && r.bottom >= cRect.bottom - 72;
    if (!nearSidebarBottom) return false;

    if (
      rowEl.getAttribute('role') === 'combobox' ||
      rowEl.getAttribute('aria-haspopup') === 'listbox' ||
      rowEl.querySelector('[role="combobox"], [aria-haspopup="listbox"]')
    ) {
      return true;
    }

    // 特征检测：左侧有在线状态小绿点（4~12px）且右侧有下拉箭头 ⌄（而无文件夹/云朵项目图标）
    let hasLeftStatusDot = false;
    let hasRightChevron = false;

    for (const sub of rowEl.querySelectorAll('span, div, i, circle')) {
      if (!isElementRendered(sub, 3)) continue;
      const sr = sub.getBoundingClientRect();
      if (sr.left <= r.left + 28 && sr.width >= 4 && sr.width <= 12 && sr.height >= 4 && sr.height <= 12) {
        const st = window.getComputedStyle(sub);
        const col = parseRgba(sub.tagName.toLowerCase() === 'circle' ? (sub.getAttribute('fill') || st.fill) : st.backgroundColor);
        if (col && col.g > 135 && col.g > col.r + 25) {
          hasLeftStatusDot = true;
        }
      }
    }

    for (const svg of rowEl.querySelectorAll('svg')) {
      if (!isElementRendered(svg, 6)) continue;
      const sr = svg.getBoundingClientRect();
      if (sr.left >= r.left + r.width * 0.65 && isChevronOnlySvg(svg)) {
        hasRightChevron = true;
      }
    }

    return hasLeftStatusDot && hasRightChevron;
  }

  function hasNonHoverSelectionBorder(el) {
    try {
      if (el.matches(':hover')) return false;
    } catch {}
    const targets = [el, ...(el.children.length === 1 ? [el.firstElementChild] : [])].filter(Boolean);
    for (const node of targets) {
      const st = window.getComputedStyle(node);
      const bw = parseFloat(st.borderTopWidth) || 0;
      if (bw >= 0.75 && bw <= 2.5) {
        const bc = parseRgba(st.borderTopColor);
        if (bc && bc.a >= 35) return true;
      }
    }
    return false;
  }

  function matchesBreadcrumbTitle(rowTitle, breadcrumbConvTitle) {
    if (!rowTitle || !breadcrumbConvTitle) return false;
    const cleanRow = rowTitle.replace(/(?:\.{2,}|…)\s*$/, '').trim().toLowerCase();
    const cleanBc = breadcrumbConvTitle.replace(/(?:\.{2,}|…)\s*$/, '').trim().toLowerCase();
    if (!cleanRow || !cleanBc) return false;
    if (cleanRow === cleanBc) return true;
    if (cleanRow.length >= 6 && cleanBc.startsWith(cleanRow)) return true;
    if (cleanBc.length >= 6 && cleanRow.startsWith(cleanBc)) return true;
    return false;
  }

  function isRowCurrentlySelected(rowEl) {
    const ariaCurrent = rowEl.getAttribute('aria-current');
    if (ariaCurrent === 'page' || ariaCurrent === 'true' || ariaCurrent === 'step') return true;
    if (rowEl.getAttribute('aria-selected') === 'true') return true;
    if (rowEl.getAttribute('data-active') === 'true' || rowEl.getAttribute('data-selected') === 'true') {
      return true;
    }

    const cls = `${rowEl.getAttribute('class') || ''} ${rowEl.firstElementChild?.getAttribute?.('class') || ''}`;
    if (/(?:^|\s)(is-active|is-selected|selected-item|router-link-active|bg-selected)(?:\s|$)/i.test(cls)) {
      return true;
    }

    const link = rowEl.tagName === 'A' ? rowEl : rowEl.querySelector('a[href]');
    if (link) {
      if (link.getAttribute('aria-current') === 'page' || link.getAttribute('aria-selected') === 'true') {
        return true;
      }
      const href = link.getAttribute('href') || '';
      if (href && href !== '/' && href !== '#') {
        try {
          const targetUrl = new URL(href, window.location.href);
          if (
            targetUrl.origin === window.location.origin &&
            targetUrl.pathname === window.location.pathname &&
            targetUrl.search === window.location.search &&
            (targetUrl.pathname.length > 1 || targetUrl.search.length > 1)
          ) {
            return true;
          }
          // 兼容 `?p=c%2F<convId>...` 编码路由参数匹配
          const pParam = decodeURIComponent(new URLSearchParams(window.location.search).get('p') || '');
          const cleanHrefPath = href.replace(/^\//, '').split('?')[0];
          if (pParam && cleanHrefPath.length >= 6 && pParam.includes(cleanHrefPath)) {
            return true;
          }
        } catch {}
      }
    }
    return false;
  }

  function checkPseudoElementUnreadDot(el, rowBg) {
    if (!el) return false;
    for (const pseudo of ['::before', '::after']) {
      try {
        const st = window.getComputedStyle(el, pseudo);
        if (!st || st.content === 'none' || st.content === 'normal' || st.display === 'none') continue;
        const w = parseFloat(st.width);
        const h = parseFloat(st.height);
        if (w >= 4 && w <= 12 && h >= 4 && h <= 12 && Math.abs(w - h) <= 2.5) {
          const br = parseFloat(st.borderRadius) || 0;
          if ((br >= Math.min(w, h) * 0.35 || st.borderRadius.includes('%')) && isUnreadDotColor(st.backgroundColor, rowBg)) {
            return true;
          }
        }
      } catch {}
    }
    return false;
  }

  function isLikelyStaticSpinnerSvg(svg) {
    if (!svg) return false;
    if (svg.getAttribute('role') === 'progressbar') return true;
    const meta = `${svg.getAttribute('class') || ''} ${svg.getAttribute('id') || ''} ${
      svg.getAttribute('data-testid') || ''
    } ${svg.parentElement?.getAttribute('class') || ''}`.toLowerCase();
    if (/spin|load|progress|rotat|working|throbber/i.test(meta)) return true;

    const strokeEls = [svg, ...Array.from(svg.querySelectorAll('circle, path, ellipse'))];
    for (const node of strokeEls) {
      const da = node.getAttribute('stroke-dasharray');
      if (da && da !== 'none') return true;
      try {
        const st = window.getComputedStyle(node);
        if (st.strokeDasharray && st.strokeDasharray !== 'none') return true;
      } catch {}
    }

    const circles = svg.querySelectorAll('circle').length;
    const paths = svg.querySelectorAll('path');
    const others = svg.querySelectorAll('rect, polygon, polyline, line').length;
    if (circles <= 1 && paths.length === 1 && others === 0) {
      const d = paths[0].getAttribute('d') || '';
      if (/[aA]\s*[\d.]/.test(d) && d.length < 70 && !/[qQ]|v-?[\d.]+h|m9/i.test(d)) {
        return true;
      }
    }
    return false;
  }

  function hasStaticRightStatusSvg(rowEl, excludedProjectIconEl = null) {
    if (!rowEl || !(rowEl instanceof Element)) return false;
    const rowRect = rowEl.getBoundingClientRect();
    if (rowRect.width <= 0) return false;
    const svgs = Array.from(rowEl.querySelectorAll('svg'));
    for (const svg of svgs) {
      if (svg === excludedProjectIconEl) continue;
      if (!isElementRendered(svg, 3)) continue;
      if (isSecondaryActionControl(svg, rowEl) || isThreeDotMenuSvg(svg)) continue;
      if (isFourDotWorkingSvg(svg) || isStopCircleRunningSvg(svg) || isStopControlElement(svg, rowEl)) continue;

      const sRect = svg.getBoundingClientRect();
      if (sRect.width < 9 || sRect.width > 28 || sRect.height < 9 || sRect.height > 28) continue;
      if (sRect.left <= rowRect.left + rowRect.width * 0.52) continue;

      const svgAnimating = hasActiveSpinOrLoopAnimation(svg) || hasActiveSpinOrLoopAnimation(svg.parentElement);
      if (svgAnimating || isLikelyStaticSpinnerSvg(svg)) continue;

      const meta = `${svg.getAttribute('class') || ''} ${svg.getAttribute('aria-label') || ''} ${
        svg.getAttribute('title') || ''
      } ${svg.getAttribute('data-icon') || ''} ${svg.getAttribute('data-testid') || ''} ${
        svg.parentElement?.getAttribute('class') || ''
      } ${svg.parentElement?.getAttribute('aria-label') || ''} ${
        svg.parentElement?.getAttribute('title') || ''
      }`.toLowerCase();
      if (
        /spin|load|progress|rotat|working|throbber|pin|keep|lock|link|share|branch|git|trash|delete|edit|rename|copy|more|menu|close|archive|chevron|arrow|caret|expand|collapse/i.test(
          meta
        )
      ) {
        continue;
      }
      return true;
    }
    return false;
  }

  /**
   * 检测单行条目的固有视觉状态：'waiting' | 'running' | 'unread' | 'idle'
   * 优先级：waiting (待处理) > unread (未读) > running (运行中) > idle
   */
  function inspectRowSignals(rowEl, mainTitleEl, excludedProjectIconEl = null) {
    const rowStyle = window.getComputedStyle(rowEl);
    const rowBg = rowStyle.backgroundColor;
    const rowRect = rowEl.getBoundingClientRect();

    if (hasWarmAlertPseudoDot(rowEl)) {
      return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
    }

    const allEls = [rowEl, ...Array.from(rowEl.querySelectorAll('*'))];
    for (const el of allEls) {
      if (el === excludedProjectIconEl || (excludedProjectIconEl && excludedProjectIconEl.contains(el))) continue;
      if (el !== rowEl && !isElementRendered(el, 1)) continue;
      if (el !== rowEl && isSecondaryActionControl(el, rowEl)) continue;

      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('data-tooltip') ||
        el.getAttribute('data-testid') ||
        el.getAttribute('alt') ||
        ''
      ).toLowerCase();

      if (label && !isStopControlElement(el, rowEl)) {
        if (
          /\b(waiting|approval|needs?\s*input|user\s*input|asking(\s+\d+\s*questions?)?|question\s*pending|pending\s*review|review\s*required|needs?\s*review|action\s*required|confirm|permission|notification|bell|alert|blocked)\b|待确认|待批准|待处理|需要确认|等待输入|等待确认|待审阅/i.test(
            label
          )
        ) {
          return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
        }
      }

      if (isIconFontElement(el)) {
        const lig = (el.textContent || '').trim().toLowerCase();
        if (WAITING_LIGATURES.has(lig)) {
          return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
        }
      }

      if (isCompactWarmBadgeElement(el, rowEl, excludedProjectIconEl)) {
        return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
      }
    }

    const svgs = Array.from(rowEl.querySelectorAll('svg')).filter(
      (s) =>
        s !== excludedProjectIconEl &&
        isElementRendered(s, 3) &&
        !isSecondaryActionControl(s, rowEl) &&
        !isThreeDotMenuSvg(s)
    );

    for (const svg of svgs) {
      const sRect = svg.getBoundingClientRect();
      if (sRect.width > 38 || sRect.height > 38) continue;
      const svgAnimating = hasActiveSpinOrLoopAnimation(svg) || hasActiveSpinOrLoopAnimation(svg.parentElement);

      const svgText = (svg.textContent || '').trim();
      if (svgText === '!' || svgText === '？' || svgText === '?') {
        return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
      }

      if (!isFourDotWorkingSvg(svg) && !isStopCircleRunningSvg(svg) && !isStopControlElement(svg, rowEl)) {
        const shapeNodes = [
          svg,
          ...Array.from(svg.querySelectorAll('path, circle, rect, ellipse, polygon, polyline, line, stop'))
        ];
        for (const sh of shapeNodes) {
          const st = window.getComputedStyle(sh);
          if (
            isWarmAlertColor(st.fill) ||
            isWarmAlertColor(st.stroke) ||
            isWarmAlertColor(st.color) ||
            isWarmAlertColor(sh.getAttribute('fill') || '') ||
            isWarmAlertColor(sh.getAttribute('stroke') || '') ||
            isWarmAlertColor(sh.getAttribute('stop-color') || '') ||
            isWarmAlertColor(st.getPropertyValue?.('stop-color') || '')
          ) {
            return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
          }
        }

        const useHref = Array.from(svg.querySelectorAll('use'))
          .map((u) => `${u.getAttribute('href') || ''} ${u.getAttribute('xlink:href') || ''}`)
          .join(' ')
          .toLowerCase();
        if (
          useHref &&
          /question|help|quiz|review|approval|attention|bell|notif|warn|alert|waiting/i.test(useHref)
        ) {
          return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
        }

        const svgCls = `${svg.getAttribute('class') || ''} ${svg.parentElement?.getAttribute('class') || ''}`.toLowerCase();
        if (/bell|alert|warn|notif|pending-approval|attention|question|review-needed|waiting/i.test(svgCls)) {
          return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
        }
        const paths = Array.from(svg.querySelectorAll('path'));
        if (!svgAnimating && paths.length >= 1 && paths.length <= 5 && sRect.left > rowRect.left + rowRect.width * 0.52) {
          const dCombined = paths.map((p) => p.getAttribute('d') || '').join(' ');
          if (
            /M10\.3\s*21|M13\.73\s*21|M6\s*8a6\s*6|M18\s*8A6\s*6|M12\s*9v4|M12\s*8v4|M9\.09\s*9a3\s*3|M11\s*18h2v-2h-2|M12\s*6c-2\.21\s*0-4\s*1\.79-4\s*4h2|M478-240q21|M480-240q21|M424-320q0-81|M14\s*2H6|M14\.5\s*2H6|M9\s*12h6|M9\s*16h6|M19\s*3H5|M320-240h320/i.test(
              dCombined
            )
          ) {
            return { state: 'waiting', reason: t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar') };
          }
        }
      }
    }

    // 检测「正在运行 (running)」：旋转动画、四圆点 (circle/rect) 工作图标、或右侧 ◉ 停止按钮
    if (hasActiveSpinOrLoopAnimation(rowEl)) {
      return { state: 'running', reason: t('reasonSidebarRunningAnim', {}, 'Running indicator in sidebar') };
    }

    for (const el of allEls) {
      if (el !== rowEl && !isElementRendered(el, 2)) continue;
      if (el.getAttribute('role') === 'progressbar') {
        return { state: 'running', reason: t('reasonSidebarRunningAnim', {}, 'Running indicator in sidebar') };
      }
      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('data-tooltip') ||
        ''
      ).toLowerCase();
      if (
        label &&
        /working|running|generating|thinking|loading|in\s*progress|\bstop(\s+generating|\s+agent|\s+conversation|\s+run)?\b|运行中|执行中|加载中|停止运行|停止生成/i.test(
          label
        )
      ) {
        return { state: 'running', reason: t('reasonSidebarRunningAnim', {}, 'Running indicator in sidebar') };
      }
      if (isIconFontElement(el)) {
        const lig = (el.textContent || '').trim().toLowerCase();
        if (RUNNING_LIGATURES.has(lig)) {
          return { state: 'running', reason: t('reasonSidebarRunningAnim', {}, 'Running indicator in sidebar') };
        }
      }
    }

    for (const svg of svgs) {
      const sRect = svg.getBoundingClientRect();
      if (sRect.width > 38 || sRect.height > 38) continue;
      if (isFourDotWorkingSvg(svg)) {
        return { state: 'running', reason: t('reasonSidebarRunningAnim', {}, 'Running indicator in sidebar') };
      }
      if (sRect.left > rowRect.left + rowRect.width * 0.45 && isStopCircleRunningSvg(svg)) {
        return { state: 'running', reason: t('reasonSidebarRunningAnim', {}, 'Running indicator in sidebar') };
      }
    }

    // 检测「未读 (unread)」信号（小圆点 / 显式属性 / 伪元素圆点）
    const rowClassAndData = `${rowEl.getAttribute('class') || ''} ${rowEl.getAttribute('data-state') || ''}`;
    if (
      rowEl.getAttribute('data-unread') === 'true' ||
      /\b(unread|is-unread|has-unread|new-activity)\b/i.test(rowClassAndData)
    ) {
      return { state: 'unread', reason: t('reasonSidebarUnreadDot', {}, 'Unread indicator in sidebar') };
    }

    if (checkPseudoElementUnreadDot(rowEl, rowBg) || checkPseudoElementUnreadDot(mainTitleEl, rowBg)) {
      return { state: 'unread', reason: t('reasonSidebarUnreadDot', {}, 'Unread indicator in sidebar') };
    }

    for (const el of allEls) {
      if (el === rowEl || !isElementRendered(el, 3)) continue;
      if (el === excludedProjectIconEl || (excludedProjectIconEl && excludedProjectIconEl.contains(el))) continue;
      if (isSecondaryActionControl(el, rowEl)) continue;

      const label = (
        el.getAttribute('aria-label') ||
        el.getAttribute('title') ||
        el.getAttribute('data-tooltip') ||
        ''
      ).toLowerCase();
      if (label && /\bunread\b|new\s*message|new\s*reply|未读/i.test(label)) {
        return { state: 'unread', reason: t('reasonSidebarUnreadDot', {}, 'Unread indicator in sidebar') };
      }

      if (isIconFontElement(el)) {
        const lig = (el.textContent || '').trim().toLowerCase();
        if (UNREAD_LIGATURES.has(lig)) {
          return { state: 'unread', reason: t('reasonSidebarUnreadDot', {}, 'Unread indicator in sidebar') };
        }
      }

      if (
        (el.tagName === 'SPAN' || el.tagName === 'DIV' || el.tagName === 'I') &&
        el.children.length === 0 &&
        (el.textContent || '').trim() === ''
      ) {
        const r = el.getBoundingClientRect();
        if (r.width >= 4 && r.width <= 11 && r.height >= 4 && r.height <= 11 && Math.abs(r.width - r.height) <= 2.5) {
          const st = window.getComputedStyle(el);
          const br = parseFloat(st.borderRadius) || 0;
          if (
            (br >= Math.min(r.width, r.height) * 0.35 || st.borderRadius.includes('%')) &&
            isUnreadDotColor(st.backgroundColor, rowBg)
          ) {
            return { state: 'unread', reason: t('reasonSidebarUnreadDot', {}, 'Unread indicator in sidebar') };
          }
        }
      }
    }

    for (const svg of svgs) {
      const sRect = svg.getBoundingClientRect();
      if (sRect.width >= 4 && sRect.width <= 12 && sRect.height >= 4 && sRect.height <= 12) {
        const circles = svg.querySelectorAll('circle');
        const others = svg.querySelectorAll('path, rect, line, polygon, polyline');
        if (circles.length === 1 && others.length === 0) {
          const cEl = circles[0];
          const st = window.getComputedStyle(cEl);
          const fillVal = cEl.getAttribute('fill') || st.fill || st.color;
          if (fillVal && fillVal !== 'none' && isUnreadDotColor(fillVal, rowBg)) {
            return { state: 'unread', reason: t('reasonSidebarUnreadDot', {}, 'Unread indicator in sidebar') };
          }
        }
      }
    }

    return { state: 'idle', reason: '' };
  }

  /**
   * 在侧边栏容器内查找底部 `Settings` / `设置` 行上边界，严格截断其下方的实例选择器（如底部工作区切换器）
   */
  function findSettingsCutoffY(container, minTopY, maxSidebarRight) {
    let cutoffY = Infinity;
    const nodes = container.querySelectorAll('a, button, div, span, li');
    for (const el of nodes) {
      if (!isElementVisible(el, 8)) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= minTopY + 6 || r.left > 180 || r.right > maxSidebarRight + 30 || r.height > 48) continue;

      let ownTxt = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          ownTxt += child.nodeValue || '';
        } else if (child instanceof Element && !isIconFontElement(child) && child.children.length === 0) {
          ownTxt += ' ' + (child.textContent || '');
        }
      }
      ownTxt = ownTxt.replace(/\s+/g, ' ').trim();
      if (/^(settings|preferences|设置)$/i.test(ownTxt)) {
        // 向上回溯到单行包裹节点以拿到整行准确的 top 坐标
        let rowWrap = el;
        while (
          rowWrap.parentElement &&
          rowWrap.parentElement !== container &&
          rowWrap.parentElement.getBoundingClientRect().height <= 46 &&
          rowWrap.parentElement.getBoundingClientRect().top > minTopY + 6
        ) {
          rowWrap = rowWrap.parentElement;
        }
        const topY = rowWrap.getBoundingClientRect().top - 2;
        if (topY < cutoffY) {
          cutoffY = topY;
        }
      }
    }
    return cutoffY;
  }

  function findSidebarScope() {
    if (!document.body) return null;
    const vw = window.innerWidth || 1280;
    const maxSidebarRight = Math.min(540, Math.max(320, vw * 0.52));

    // 优先定位左侧 "Projects" 标题所在区域
    let projectsHeadingEl = null;
    const candidates = document.body.querySelectorAll('h1, h2, h3, h4, h5, h6, div, span, p, button, summary');
    for (const el of candidates) {
      if (!isElementVisible(el, 8)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.left > 180 || rect.right > maxSidebarRight || rect.height > 48) continue;

      if (el.querySelectorAll('a, [role="listitem"], [role="treeitem"]').length > 0) continue;
      let ownTxt = '';
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          ownTxt += child.nodeValue || '';
        } else if (child instanceof Element && !isIconFontElement(child) && child.children.length === 0) {
          ownTxt += ' ' + (child.textContent || '');
        }
      }
      ownTxt = ownTxt.replace(/\s+/g, ' ').trim();
      if (/^(projects|项目)(\s*\(\d+\))?$/i.test(ownTxt)) {
        projectsHeadingEl = el;
        break;
      }
    }

    if (projectsHeadingEl) {
      const hRect = projectsHeadingEl.getBoundingClientRect();
      let anc = projectsHeadingEl.parentElement;
      let bestContainer = null;
      while (anc && anc !== document.body && anc !== document.documentElement) {
        const r = anc.getBoundingClientRect();
        if (r.width > maxSidebarRight + 30) break;
        if (r.height >= hRect.height + 24 && r.width >= 130) {
          bestContainer = anc;
          if (anc.tagName === 'ASIDE' || anc.tagName === 'NAV' || anc.tagName === 'SECTION') {
            break;
          }
        }
        anc = anc.parentElement;
      }
      if (bestContainer) {
        const maxBottomY = findSettingsCutoffY(bestContainer, hRect.bottom, maxSidebarRight);
        return {
          container: bestContainer,
          headingBottom: hRect.bottom - 2,
          headingLeftX: hRect.left,
          maxBottomY,
          headingEl: projectsHeadingEl
        };
      }
    }

    const structural = document.body.querySelectorAll(
      'aside, nav, [role="navigation"], [role="tree"], [data-sidebar], [class*="sidebar" i]'
    );
    for (const el of structural) {
      if (!isElementVisible(el, 80)) continue;
      const r = el.getBoundingClientRect();
      if (r.left <= 90 && r.width >= 130 && r.right <= maxSidebarRight + 20 && r.height >= 140) {
        const maxBottomY = findSettingsCutoffY(el, r.top + 24, maxSidebarRight);
        return {
          container: el,
          headingBottom: r.top,
          headingLeftX: r.left + 8,
          maxBottomY,
          headingEl: null
        };
      }
    }

    return null;
  }

  function hasVerticallyStackedTextChildren(el) {
    let cur = el;
    let depth = 0;
    while (cur && cur.children && cur.children.length === 1 && depth < 4) {
      cur = cur.children[0];
      depth++;
    }
    const kids = Array.from(cur ? cur.children : []).filter((c) => isElementVisible(c, 11));
    if (kids.length < 2) return false;
    const textKids = kids.filter((c) => {
      const r = c.getBoundingClientRect();
      return r.height >= 11 && (c.textContent || '').trim().length > 0;
    });
    for (let i = 0; i < textKids.length - 1; i++) {
      const r1 = textKids[i].getBoundingClientRect();
      const r2 = textKids[i + 1].getBoundingClientRect();
      if (r2.top >= r1.bottom - 4 && r1.width >= 48 && r2.width >= 48) {
        return true;
      }
    }
    return false;
  }

  function collectSidebarRowElements(scope) {
    const { container, headingBottom, maxBottomY, headingEl } = scope;
    const cRect = container.getBoundingClientRect();
    const allDescendants = Array.from(container.querySelectorAll('*'));

    const singleRowCandidates = [];
    for (const el of allDescendants) {
      if (el === headingEl || (headingEl && headingEl.contains(el))) continue;
      if (el.closest(EXCLUDED_CODE_SELECTOR)) continue;
      if (!isElementVisible(el, 16)) continue;

      const r = el.getBoundingClientRect();
      if (r.top < headingBottom - 2) continue;
      if (Number.isFinite(maxBottomY) && r.bottom > maxBottomY + 2) continue;
      if (r.width < Math.min(90, cRect.width * 0.48) || r.width > cRect.width + 12) continue;
      if (r.height < 18 || r.height > 44) continue;
      if (hasVerticallyStackedTextChildren(el)) continue;

      const innerRows = Array.from(el.querySelectorAll('a, li, [role="listitem"], [role="treeitem"], [role="option"]')).filter(
        (sub) => sub !== el && isElementVisible(sub, 14)
      );
      if (innerRows.length >= 2) {
        const ir0 = innerRows[0].getBoundingClientRect();
        const ir1 = innerRows[1].getBoundingClientRect();
        if (ir1.top >= ir0.bottom - 3) continue;
      }

      singleRowCandidates.push({ el, rect: r });
    }

    const selectedRows = [];
    for (const cand of singleRowCandidates) {
      let existingIdx = -1;
      for (let i = 0; i < selectedRows.length; i++) {
        const ex = selectedRows[i];
        const overlapTop = Math.max(cand.rect.top, ex.rect.top);
        const overlapBottom = Math.min(cand.rect.bottom, ex.rect.bottom);
        const minH = Math.min(cand.rect.height, ex.rect.height);
        if (overlapBottom - overlapTop >= minH * 0.6) {
          existingIdx = i;
          break;
        }
      }

      if (existingIdx === -1) {
        selectedRows.push(cand);
      } else {
        const ex = selectedRows[existingIdx];
        if (cand.el.contains(ex.el) || cand.rect.width > ex.rect.width + 12) {
          selectedRows[existingIdx] = cand;
        }
      }
    }

    selectedRows.sort((a, b) => a.rect.top - b.rect.top);
    return selectedRows.map((item) => item.el);
  }

  function makeStableTaskKey(projectName, title, href, indexInProject) {
    const cleanHref = (href || '').replace(/^https?:\/\/[^/]+/i, '');
    if (cleanHref && cleanHref !== '/' && cleanHref !== '#') {
      return `href:${cleanHref}`;
    }
    return `item:${projectName}::${title}::${indexInProject}`;
  }

  function extractConvIdFromTaskId(taskId) {
    if (typeof taskId !== 'string' || !taskId) return '';
    try {
      const decoded = decodeURIComponent(taskId);
      const m = decoded.match(/(?:^|[/?=&#])c\/([a-zA-Z0-9_-]{6,})/i);
      if (m) return m[1];
    } catch {}
    const rawMatch = taskId.match(/(?:^|[/?=&#])c\/([a-zA-Z0-9_-]{6,})/i);
    return rawMatch ? rawMatch[1] : '';
  }

  function resolveTaskTelemetry(taskId, isActive, matchedBridgeTask = null) {
    const urlConvId = extractConvIdFromTaskId(taskId);
    const bridgeConvId =
      matchedBridgeTask && typeof matchedBridgeTask.convId === 'string'
        ? matchedBridgeTask.convId
        : '';
    const activeConvId =
      isActive && lastBridgeTelemetry?.activeConvId ? String(lastBridgeTelemetry.activeConvId) : '';
    const convId = urlConvId || bridgeConvId || activeConvId || '';
    const convMap = lastBridgeTelemetry?.conversations;
    const telemetry =
      (convId && convMap && typeof convMap === 'object' && convMap[convId]) ||
      (bridgeConvId && convMap && typeof convMap === 'object' && convMap[bridgeConvId]) ||
      (activeConvId && convMap && typeof convMap === 'object' && convMap[activeConvId]) ||
      (matchedBridgeTask && matchedBridgeTask.telemetry) ||
      null;
    return { convId, telemetry };
  }

  const lastKnownSidebarProjects = [];

  function isTaskActiveByBreadcrumbOrConv(projectName, title, taskId, convId, breadcrumb) {
    if (
      breadcrumb &&
      breadcrumb.projectName.toLowerCase() === String(projectName || '').toLowerCase() &&
      matchesBreadcrumbTitle(title, breadcrumb.conversationTitle)
    ) {
      return true;
    }
    const activeConvId = lastBridgeTelemetry?.activeConvId ? String(lastBridgeTelemetry.activeConvId) : '';
    const resolvedId = convId || extractConvIdFromTaskId(taskId);
    return Boolean(activeConvId && resolvedId && resolvedId === activeConvId);
  }

  function hydrateProjectTasksFromBridgeOrCache(proj, bridgeEntry, breadcrumb, activePaneResult) {
    if (bridgeEntry && Array.isArray(bridgeEntry.tasks) && bridgeEntry.tasks.length > 0) {
      proj.tasks = bridgeEntry.tasks.map((bt, idx) => {
        const taskId = bt.taskId || `item:${proj.projectName}::${bt.title}::${idx}`;
        const preResolved = resolveTaskTelemetry(taskId, false, bt);
        const isBcActive = isTaskActiveByBreadcrumbOrConv(
          proj.projectName,
          bt.title,
          taskId,
          preResolved.convId,
          breadcrumb
        );
        let st = bt.state;
        let rsn = resolveBridgeReason(bt);
        if (isBcActive) {
          if (activePaneResult.state === 'waiting') {
            st = 'waiting';
            rsn = activePaneResult.reason;
          } else if (activePaneResult.state === 'running') {
            st = 'running';
            rsn = activePaneResult.reason;
          } else if (st === 'unread') {
            st = 'idle';
          }
        }
        const resolved = isBcActive ? resolveTaskTelemetry(taskId, true, bt) : preResolved;
        return {
          taskId,
          convId: resolved.convId,
          title: bt.title,
          state: st,
          confirmedRunning: Boolean(st === 'running' && bt.confirmedDetail),
          reason: rsn,
          timeText: bt.timeText || '',
          isActive: isBcActive,
          telemetry: resolved.telemetry
        };
      });
      frameCollapsedCache.set(proj.projectName, {
        knownEmpty: false,
        projectType: proj.projectType,
        tasks: proj.tasks.map((t) => ({ ...t }))
      });
      return true;
    }

    if (bridgeEntry?.hasEmptyArray) {
      proj.knownEmpty = true;
      frameCollapsedCache.set(proj.projectName, {
        knownEmpty: true,
        projectType: proj.projectType,
        tasks: []
      });
      return true;
    }

    if (frameCollapsedCache.has(proj.projectName)) {
      const cached = frameCollapsedCache.get(proj.projectName);
      if (cached.projectType === 'remote') {
        proj.projectType = 'remote';
      }
      if (!cached.knownEmpty && cached.tasks.length > 0) {
        proj.tasks = cached.tasks.map((ct) => {
          const isBcActive = isTaskActiveByBreadcrumbOrConv(
            proj.projectName,
            ct.title,
            ct.taskId,
            ct.convId,
            breadcrumb
          );
          let st = ct.state;
          let rsn = ct.reason;
          if (isBcActive) {
            if (activePaneResult.state === 'waiting') {
              st = 'waiting';
              rsn = activePaneResult.reason;
            } else if (activePaneResult.state === 'running') {
              st = 'running';
              rsn = activePaneResult.reason;
            } else if (st === 'unread') {
              st = 'idle';
            }
          }
          const resolved = resolveTaskTelemetry(ct.taskId, isBcActive, ct);
          return {
            ...ct,
            convId: resolved.convId || ct.convId || '',
            telemetry: resolved.telemetry || ct.telemetry || null,
            isActive: isBcActive,
            state: st,
            reason: rsn
          };
        });
      } else if (cached.knownEmpty) {
        proj.knownEmpty = true;
      }
      return true;
    }
    return false;
  }

  function scanSidebarHiddenProjects(activePaneResult) {
    const breadcrumb = detectMainPaneBreadcrumb();
    const knownNames = lastKnownSidebarProjects.map((p) => p.projectName).filter(Boolean);
    const bridgeMap = queryMainWorldBridge(knownNames);
    const projects = [];
    const seenLower = new Set();

    const addHydratedProject = (projSeed) => {
      const low = String(projSeed.projectName || '').toLowerCase();
      if (!low || seenLower.has(low)) return;
      seenLower.add(low);
      const bridgeEntry = bridgeMap ? bridgeMap[projSeed.projectName] : null;
      const proj = {
        projectName: projSeed.projectName,
        projectType:
          bridgeEntry?.projectType === 'remote'
            ? 'remote'
            : projSeed.projectType || 'local',
        headerTaskId: projSeed.headerTaskId || `proj:${projSeed.projectName}`,
        isCollapsed: Boolean(projSeed.isCollapsed),
        knownEmpty: Boolean(projSeed.knownEmpty),
        tasks: []
      };
      hydrateProjectTasksFromBridgeOrCache(proj, bridgeEntry, breadcrumb, activePaneResult);
      projects.push(proj);
    };

    for (const seed of lastKnownSidebarProjects) {
      addHydratedProject(seed);
    }
    if (bridgeMap && typeof bridgeMap === 'object') {
      for (const [projName, entry] of Object.entries(bridgeMap)) {
        addHydratedProject({
          projectName: projName,
          projectType: entry?.projectType || 'local',
          headerTaskId: `proj:${projName}`,
          isCollapsed: false,
          knownEmpty: Boolean(entry?.hasEmptyArray)
        });
      }
    }
    return projects;
  }

  function scanSidebarProjects(activePaneResult) {
    const scope = findSidebarScope();
    if (!scope) {
      const hiddenProjects = scanSidebarHiddenProjects(activePaneResult);
      if (hiddenProjects.length > 0) {
        return hiddenProjects;
      }
      return [];
    }

    const breadcrumb = detectMainPaneBreadcrumb();
    const rawRowEls = collectSidebarRowElements(scope);
    const extracted = [];

    for (const el of rawRowEls) {
      if (isInstanceSwitcherOrFooterRow(el, scope)) continue;
      const { title, timeText, titleLeftX, fontWeight, mainTitleEl } = extractCleanRowTextAndTime(el);
      if (!title || title.length > 140) continue;
      if (NAV_CHROME_TEXT_RE.test(title)) continue;

      extracted.push({
        el,
        title,
        timeText,
        titleLeftX,
        fontWeight,
        mainTitleEl
      });
    }

    if (extracted.length === 0) {
      queryMainWorldBridge([]);
      return [];
    }

    // 清理上一轮扫描残留的项目头与归属项目标记
    for (const oldEl of document.querySelectorAll('[data-agy-proj-name], [data-agy-parent-proj]')) {
      oldEl.removeAttribute('data-agy-proj-name');
      oldEl.removeAttribute('data-agy-parent-proj');
    }

    const parsedRows = [];
    for (let i = 0; i < extracted.length; i++) {
      const item = extracted[i];
      // 若遇到 `No conversations yet` 空占位文本，记录其归属项目为「已展开但确认为空」后跳过
      if (EMPTY_PLACEHOLDER_RE.test(item.title)) {
        if (parsedRows.length > 0 && parsedRows[parsedRows.length - 1].role === 'project') {
          parsedRows[parsedRows.length - 1].sawEmptyPlaceholder = true;
        }
        continue;
      }

      const nextRawTitle = extracted[i + 1]?.title || '';
      let headerInfo = { isProject: false, projectType: 'local' };
      try {
        headerInfo = detectProjectHeaderInfo(item, scope, nextRawTitle);
      } catch {}
      let signal = { state: 'idle', reason: '' };
      try {
        signal = inspectRowSignals(item.el, item.mainTitleEl, headerInfo.iconEl || null);
      } catch {}
      const isActiveExplicit = !headerInfo.isProject && isRowCurrentlySelected(item.el);
      const hasBorderBox = !headerInfo.isProject && hasNonHoverSelectionBorder(item.el);
      const linkEl = item.el.tagName === 'A' ? item.el : item.el.querySelector('a[href]');
      const href = linkEl ? linkEl.getAttribute('href') || '' : '';

      parsedRows.push({
        ...item,
        role: headerInfo.isProject ? 'project' : 'task',
        projectType: headerInfo.projectType,
        sawEmptyPlaceholder: false,
        signal,
        isActive: isActiveExplicit,
        hasBorderBox,
        href
      });
    }

    if (parsedRows.length === 0) {
      queryMainWorldBridge([]);
      return [];
    }

    // 若没有任何对话行通过 aria/href 命中 isActive，利用主面板顶部面包屑或唯一选中边框精准标记「当前」对话
    if (!parsedRows.some((r) => r.role === 'task' && r.isActive)) {
      if (breadcrumb) {
        let curProjTitle = '';
        for (const r of parsedRows) {
          if (r.role === 'project') {
            curProjTitle = r.title;
            continue;
          }
          if (
            curProjTitle.toLowerCase() === breadcrumb.projectName.toLowerCase() &&
            matchesBreadcrumbTitle(r.title, breadcrumb.conversationTitle)
          ) {
            r.isActive = true;
            break;
          }
        }
      }
      if (!parsedRows.some((r) => r.role === 'task' && r.isActive)) {
        const borderedTasks = parsedRows.filter((r) => r.role === 'task' && r.hasBorderBox);
        if (borderedTasks.length === 1) {
          borderedTasks[0].isActive = true;
        }
      }
    }

    const nonActiveTaskWeights = parsedRows
      .filter((r) => r.role === 'task' && !r.isActive)
      .map((r) => r.fontWeight);
    const baselineTaskWeight =
      nonActiveTaskWeights.length >= 2 ? Math.min(...nonActiveTaskWeights) : 400;

    for (const r of parsedRows) {
      if (r.role === 'task' && r.signal.state === 'idle' && !r.isActive) {
        const isRelativelyBolder =
          nonActiveTaskWeights.length >= 2 && r.fontWeight >= baselineTaskWeight + 150;
        const isHeavyBold = r.fontWeight >= 700;
        if (isRelativelyBolder || isHeavyBold) {
          r.signal = { state: 'unread', reason: t('reasonSidebarBoldUnread', {}, 'Bold unread title in sidebar') };
        }
      }
    }

    // 组装「项目 (Project) -> 对话列表 (Conversations)」严格二级结构
    const projects = [];
    let currentProject = null;

    for (const row of parsedRows) {
      if (row.role === 'project') {
        const projKey = `proj:${row.title}`;
        row.el.setAttribute('data-agy-task-id', projKey);
        row.el.setAttribute('data-agy-proj-name', row.title);
        if (row.mainTitleEl instanceof HTMLElement) {
          row.mainTitleEl.setAttribute('data-agy-click-target', '1');
        }
        currentProject = {
          projectName: row.title,
          projectType: row.projectType || 'local',
          sawEmptyPlaceholder: Boolean(row.sawEmptyPlaceholder),
          isCollapsed: false,
          headerSignal: row.signal,
          headerTaskId: projKey,
          tasks: []
        };
        projects.push(currentProject);
        continue;
      }

      if (!currentProject) {
        currentProject = {
          projectName: 'Projects',
          projectType: 'local',
          sawEmptyPlaceholder: false,
          isCollapsed: false,
          headerSignal: { state: 'idle', reason: '' },
          headerTaskId: '',
          tasks: []
        };
        projects.push(currentProject);
      }

      const idxInProj = currentProject.tasks.length;
      const taskKey = makeStableTaskKey(currentProject.projectName, row.title, row.href, idxInProj);
      row.el.setAttribute('data-agy-task-id', taskKey);
      row.el.setAttribute('data-agy-parent-proj', currentProject.projectName);
      if (row.mainTitleEl instanceof HTMLElement) {
        row.mainTitleEl.setAttribute('data-agy-click-target', '1');
      }

      let finalState = row.signal.state;
      let finalReason = row.signal.reason;

      if (row.isActive) {
        if (activePaneResult.state === 'waiting') {
          finalState = 'waiting';
          finalReason = activePaneResult.reason;
        } else if (activePaneResult.state === 'running' && finalState !== 'waiting') {
          finalState = 'running';
          finalReason = activePaneResult.reason;
        } else if (finalState === 'unread') {
          finalState = 'idle';
          finalReason = '';
        }
      }

      const hasStaticRightStatusIcon =
        finalState === 'idle' && !row.timeText ? hasStaticRightStatusSvg(row.el, null) : false;

      currentProject.tasks.push({
        taskId: taskKey,
        title: row.title,
        state: finalState,
        confirmedRunning: false,
        hasStaticRightStatusIcon,
        reason:
          finalReason ||
          (row.timeText
            ? t('reasonActiveTime', { time: row.timeText }, `Active ${row.timeText}`)
            : t('taskStateIdle', {}, 'Idle')),
        timeText: row.timeText || '',
        isActive: row.isActive
      });
    }

    // 判定各项目是否处于折叠态（Antigravity 展开空项目必显示 `No conversations yet`，无子项且无空提示即为已折叠）
    for (const proj of projects) {
      proj.isCollapsed = proj.tasks.length === 0 && !proj.sawEmptyPlaceholder;
    }

    // 机制 1：向 MAIN world 桥接器 (`page-bridge.js`) 查询 React Fiber / QueryCache / 网络流中的折叠项目对话与远程标记
    const bridgeMap = queryMainWorldBridge(projects.map((p) => p.projectName));
    const stateRank = { waiting: 4, unread: 3, running: 2, idle: 1 };
    const uncachedCollapsedNames = [];

    const resolveBridgeReason = (bt) => {
      if (bt.state === 'idle' && bt.timeText) {
        return t('reasonActiveTime', { time: bt.timeText }, `Active ${bt.timeText}`);
      }
      if (bt.reasonCode) {
        const translated = t(bt.reasonCode, bt.reasonVars || {}, bt.reason || '');
        if (bt.reasonVars?.detail && !translated.includes(bt.reasonVars.detail)) {
          return `${translated} (${bt.reasonVars.detail})`;
        }
        return translated;
      }
      return (
        bt.reason ||
        (bt.timeText
          ? t('reasonActiveTime', { time: bt.timeText }, `Active ${bt.timeText}`)
          : t('reasonMemIdle', {}, 'Idle (memory sync)'))
      );
    };

    for (const proj of projects) {
      const bridgeEntry = bridgeMap ? bridgeMap[proj.projectName] : null;
      if (bridgeEntry?.projectType === 'remote') {
        proj.projectType = 'remote';
      }

      if (!proj.isCollapsed) {
        // 当前项目处于展开态：同步结合桥接器更高优先级状态，并写入展开记忆缓存
        if (bridgeEntry && Array.isArray(bridgeEntry.tasks)) {
          for (const domTask of proj.tasks) {
            const matched = bridgeEntry.tasks.find(
              (bt) => matchesBreadcrumbTitle(domTask.title, bt.title)
            );
            domTask.confirmedRunning = Boolean(matched?.state === 'running' && matched?.confirmedDetail);
            if (matched && !domTask.isActive) {
              if (matched.state === 'waiting') {
                domTask.state = 'waiting';
                domTask.reason = resolveBridgeReason(matched) || domTask.reason;
              } else if (matched.state === 'running' && domTask.state === 'idle' && !domTask.timeText) {
                if (domTask.hasStaticRightStatusIcon) {
                  // 冷启动关联：行本身未展示运行动画却有右侧静态状态图标（如 ?/审阅图标），且摘要仅返回活跃 running
                  domTask.state = 'waiting';
                  domTask.reason = t('reasonSidebarWaitingIcon', {}, 'Waiting indicator in sidebar');
                } else {
                  domTask.state = 'running';
                  domTask.reason = resolveBridgeReason(matched) || domTask.reason;
                }
              } else if (
                (stateRank[matched.state] || 0) > (stateRank[domTask.state] || 0) &&
                !domTask.timeText
              ) {
                domTask.state = matched.state;
                domTask.reason = resolveBridgeReason(matched) || domTask.reason;
              }
            } else if (matched && domTask.isActive && domTask.state === 'idle' && matched.state === 'running') {
              domTask.state = 'running';
              domTask.reason = resolveBridgeReason(matched) || domTask.reason;
            }
            const resolved = resolveTaskTelemetry(domTask.taskId, domTask.isActive, matched);
            domTask.convId = resolved.convId;
            domTask.telemetry = resolved.telemetry;
            delete domTask.hasStaticRightStatusIcon;
          }
        } else {
          for (const domTask of proj.tasks) {
            const resolved = resolveTaskTelemetry(domTask.taskId, domTask.isActive, null);
            domTask.convId = resolved.convId;
            domTask.telemetry = resolved.telemetry;
            delete domTask.hasStaticRightStatusIcon;
          }
        }

        frameCollapsedCache.set(proj.projectName, {
          knownEmpty: proj.sawEmptyPlaceholder && proj.tasks.length === 0,
          projectType: proj.projectType,
          tasks: proj.tasks.map((t) => ({ ...t }))
        });
        probedProjectNames.add(proj.projectName);
      } else {
        // 当前项目处于折叠态：优先从 Fiber / QueryCache / 网络桥接器实时读取，其次读取展开记忆缓存
        if (
          !hydrateProjectTasksFromBridgeOrCache(proj, bridgeEntry, breadcrumb, activePaneResult) &&
          !probedProjectNames.has(proj.projectName)
        ) {
          uncachedCollapsedNames.push(proj.projectName);
        }
      }

      if (proj.tasks.length === 0 && proj.headerSignal && proj.headerSignal.state !== 'idle') {
        proj.tasks.push({
          taskId: proj.headerTaskId || `proj:${proj.projectName}`,
          title: t('fallbackCollapsedAlert', { project: proj.projectName }, `${proj.projectName} (Collapsed alert)`),
          state: proj.headerSignal.state,
          reason: proj.headerSignal.reason || t('reasonCollapsedAlert', {}, 'Collapsed project alert'),
          timeText: '',
          isActive: false
        });
      }
      delete proj.headerSignal;
      delete proj.sawEmptyPlaceholder;
    }

    // 机制 3：若存在首次加载即处于折叠态且懒加载尚未拉取数据的项目，安排一次性静默展开快照探测
    if (uncachedCollapsedNames.length > 0 && customSelectors.autoProbeCollapsed && !isProbingCollapsed) {
      scheduleAutoProbeCollapsed(uncachedCollapsedNames);
    }

    // 若主窗口明确检测到 WAITING / RUNNING，且侧边栏无已覆盖的同状态对话，兜底关联
    if (
      (activePaneResult.state === 'waiting' || activePaneResult.state === 'running') &&
      !projects.some((p) => p.tasks.some((t) => t.isActive))
    ) {
      const alreadyRepresented = projects.some((p) =>
        p.tasks.some((t) => t.state === activePaneResult.state)
      );
      if (!alreadyRepresented) {
        const targetProj =
          (breadcrumb &&
            projects.find((p) => p.projectName.toLowerCase() === breadcrumb.projectName.toLowerCase())) ||
          projects[0];

        const activeMeta = resolveTaskTelemetry('active-open-pane', true, null);
        if (!targetProj) {
          projects.push({
            projectName: breadcrumb?.projectName || t('fallbackWorkspaceName', {}, 'Current Workspace'),
            projectType: 'local',
            isCollapsed: false,
            tasks: [
              {
                taskId: 'active-open-pane',
                convId: activeMeta.convId,
                title: breadcrumb?.conversationTitle || t('fallbackOpenConvTitle', {}, 'Open Conversation'),
                state: activePaneResult.state,
                reason: activePaneResult.reason,
                timeText: t('taskCurrentTag', {}, 'Current'),
                isActive: true,
                telemetry: activeMeta.telemetry
              }
            ]
          });
        } else {
          targetProj.tasks.unshift({
            taskId: 'active-open-pane',
            convId: activeMeta.convId,
            title: breadcrumb?.conversationTitle || t('fallbackOpenConvTitle', {}, 'Open Conversation'),
            state: activePaneResult.state,
            reason: activePaneResult.reason,
            timeText: t('taskCurrentTag', {}, 'Current'),
            isActive: true,
            telemetry: activeMeta.telemetry
          });
        }
      }
    }

    if (projects.length > 0) {
      lastKnownSidebarProjects.length = 0;
      for (const p of projects) {
        lastKnownSidebarProjects.push({
          projectName: p.projectName,
          projectType: p.projectType,
          headerTaskId: p.headerTaskId,
          isCollapsed: p.isCollapsed,
          knownEmpty: p.knownEmpty
        });
      }
    }

    return projects;
  }

  // ============================================================================
  // 4. 跨世界桥接调用 + 折叠项目静默展开快照探测 + 折叠态点击自动展开跳转
  // ============================================================================

  const frameCollapsedCache = new Map();
  const probedProjectNames = new Set();
  let isProbingCollapsed = false;
  let autoProbeTimer = null;
  const probeListeners = new Set();
  let lastBridgeDiagnostics = [];
  let lastBridgeTelemetry = null;

  function queryMainWorldBridge(projectNames) {
    if (!document.documentElement) return null;
    const safeNames = Array.isArray(projectNames) ? projectNames : [];
    try {
      const rootEl = document.documentElement;
      rootEl.removeAttribute('data-agy-bridge-out');
      rootEl.setAttribute('data-agy-bridge-in', JSON.stringify(safeNames));
      window.dispatchEvent(new CustomEvent('__AGY_BRIDGE_REQ__'));
      const rawOut = rootEl.getAttribute('data-agy-bridge-out');
      rootEl.removeAttribute('data-agy-bridge-in');
      rootEl.removeAttribute('data-agy-bridge-out');
      if (!rawOut) return null;
      const parsed = JSON.parse(rawOut);
      if (parsed && parsed.ok) {
        lastBridgeDiagnostics = Array.isArray(parsed.diagnostics) ? parsed.diagnostics : [];
        lastBridgeTelemetry =
          parsed.telemetry && typeof parsed.telemetry === 'object' ? parsed.telemetry : null;
        return parsed.projects || {};
      }
      return null;
    } catch {
      return null;
    }
  }

  function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function notifyProbeListeners() {
    for (const fn of probeListeners) {
      try {
        fn();
      } catch {}
    }
  }

  function scheduleAutoProbeCollapsed(names) {
    if (autoProbeTimer || isProbingCollapsed) return;
    autoProbeTimer = setTimeout(() => {
      autoProbeTimer = null;
      probeCollapsedProjects(false, names);
    }, 520);
  }

  async function probeCollapsedProjects(forceAll = false, targetSubset = null) {
    if ((isLocalContext && !isLocalAntigravityConfirmed()) || isProbingCollapsed || !document.body) {
      return false;
    }
    const scope = findSidebarScope();
    if (!scope) return false;

    if (!forceAll) {
      try {
        if (scope.container.matches(':hover')) {
          // 用户鼠标正在侧边栏悬停操作时延后探测，绝不干扰点击
          scheduleAutoProbeCollapsed(targetSubset);
          return false;
        }
      } catch {}
    }

    isProbingCollapsed = true;
    const styleEl = document.createElement('style');
    styleEl.id = 'agy-silent-probe-style';
    styleEl.textContent = 'aside *, nav *, [data-sidebar] * { transition-duration: 0s !important; }';
    (document.head || document.documentElement).appendChild(styleEl);

    try {
      // 先刷新一次项目头标记
      scanSidebarProjects(detectActivePaneState());
      const headerEls = Array.from(document.querySelectorAll('[data-agy-proj-name]'));

      for (const hEl of headerEls) {
        const projName = hEl.getAttribute('data-agy-proj-name') || '';
        if (!projName) continue;
        if (!forceAll && targetSubset && !targetSubset.includes(projName)) continue;
        if (!forceAll && probedProjectNames.has(projName)) continue;

        if (!forceAll) {
          try {
            if (scope.container.matches(':hover')) break;
          } catch {}
        }

        // 检查该项目当前是否确实处于折叠态（若已展开则无需点击）
        const curScope = findSidebarScope();
        if (!curScope) break;
        const beforeRows = collectSidebarRowElements(curScope);
        const currentSnap = scanSidebarProjects(detectActivePaneState());
        const projObj = currentSnap.find((p) => p.projectName === projName);
        if (!projObj || !projObj.isCollapsed) {
          probedProjectNames.add(projName);
          continue;
        }

        const liveHeaderEl = document.querySelector(
          `[data-agy-proj-name="${CSS.escape ? CSS.escape(projName) : projName.replace(/"/g, '\\"')}"]`
        );
        if (!liveHeaderEl) continue;

        const clickTarget = liveHeaderEl.querySelector('[data-agy-click-target="1"]') || liveHeaderEl;
        clickTarget.click();

        // 等待子对话或 `No conversations yet` 挂载（最长 550ms）
        let didExpand = false;
        for (let attempt = 0; attempt < 9; attempt++) {
          await sleepMs(60);
          const nextScope = findSidebarScope();
          if (!nextScope) break;
          const nowRows = collectSidebarRowElements(nextScope);
          if (nowRows.length > beforeRows.length) {
            didExpand = true;
            break;
          }
        }

        // 在展开态执行一次完整扫描，将所有对话、状态与空项目标记写入缓存及 Fiber
        scanSidebarProjects(detectActivePaneState());
        probedProjectNames.add(projName);

        // 仅当确实展开了子项时，再次点击恢复原折叠状态
        if (didExpand) {
          const afterHeaderEl = document.querySelector(
            `[data-agy-proj-name="${CSS.escape ? CSS.escape(projName) : projName.replace(/"/g, '\\"')}"]`
          );
          const collapseTarget =
            afterHeaderEl?.querySelector('[data-agy-click-target="1"]') || afterHeaderEl;
          if (collapseTarget) {
            collapseTarget.click();
            await sleepMs(50);
          }
        }
      }
    } finally {
      styleEl.remove();
      isProbingCollapsed = false;
      notifyProbeListeners();
    }
    return true;
  }

  function scanWorkspace() {
    if (isLocalContext && !isLocalAntigravityConfirmed()) {
      return { ignore: true, activePane: { state: 'none', reason: '' }, projects: [], telemetry: null };
    }
    if (!isTop && (window.innerWidth < 60 || window.innerHeight < 60 || !document.body)) {
      return { ignore: true, activePane: { state: 'none', reason: '' }, projects: [], telemetry: null };
    }
    if (!isTop && document.getElementById('tabCanvas') && document.getElementById('zoomCanvas')) {
      return { ignore: true, activePane: { state: 'none', reason: '' }, projects: [], telemetry: null };
    }

    const activePane = detectActivePaneState();
    const projects = scanSidebarProjects(activePane);
    return {
      ignore: false,
      activePane,
      projects,
      telemetry: lastBridgeTelemetry
    };
  }

  function findMountedTaskRow(taskId, taskTitle = '') {
    for (const rowEl of document.querySelectorAll('[data-agy-task-id]')) {
      if (rowEl.getAttribute('data-agy-task-id') === taskId) {
        return rowEl;
      }
    }
    if (taskTitle) {
      for (const rowEl of document.querySelectorAll('[data-agy-task-id]')) {
        if (rowEl.hasAttribute('data-agy-proj-name')) continue;
        const { title } = extractCleanRowTextAndTime(rowEl);
        if (matchesBreadcrumbTitle(title, taskTitle)) {
          return rowEl;
        }
      }
    }
    return null;
  }

  function clickRowElement(rowEl) {
    try {
      rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch {}
    const clickTarget =
      rowEl.querySelector('a[href]') ||
      rowEl.querySelector('[data-agy-click-target="1"]') ||
      rowEl;
    clickTarget.click();
  }

  function focusTaskById(taskId, projectName = '', taskTitle = '') {
    if ((isLocalContext && !isLocalAntigravityConfirmed()) || !taskId || !document.body) return false;
    const directHit = findMountedTaskRow(taskId, taskTitle);
    if (directHit) {
      clickRowElement(directHit);
      return true;
    }

    // 若目标对话所属项目当前处于折叠态，先自动点击展开该项目，待子项挂载后立即跳转！
    if (projectName) {
      const escName = CSS.escape ? CSS.escape(projectName) : projectName.replace(/"/g, '\\"');
      const projHeaderEl = document.querySelector(`[data-agy-proj-name="${escName}"]`);
      if (projHeaderEl) {
        clickRowElement(projHeaderEl);
        (async () => {
          for (let i = 0; i < 12; i++) {
            await sleepMs(55);
            scanSidebarProjects(detectActivePaneState());
            const mounted = findMountedTaskRow(taskId, taskTitle);
            if (mounted) {
              clickRowElement(mounted);
              notifyProbeListeners();
              return;
            }
          }
        })();
        return true;
      }
    }

    // 若整条左侧边栏处于折叠状态，先自动点击展开侧边栏，再展开项目/跳转目标对话
    const sidebarToggleBtn = document.querySelector(
      'button[data-testid="sidebar-toggle"][aria-expanded="false"], button[aria-label*="Toggle Sidebar" i][aria-expanded="false"]'
    );
    if (sidebarToggleBtn && isElementVisible(sidebarToggleBtn)) {
      sidebarToggleBtn.click();
      (async () => {
        let expandedProj = false;
        for (let i = 0; i < 16; i++) {
          await sleepMs(60);
          scanSidebarProjects(detectActivePaneState());
          const mounted = findMountedTaskRow(taskId, taskTitle);
          if (mounted) {
            clickRowElement(mounted);
            notifyProbeListeners();
            return;
          }
          if (!expandedProj && projectName) {
            const escName = CSS.escape ? CSS.escape(projectName) : projectName.replace(/"/g, '\\"');
            const hdr = document.querySelector(`[data-agy-proj-name="${escName}"]`);
            if (hdr) {
              expandedProj = true;
              clickRowElement(hdr);
            }
          }
        }
      })();
      return true;
    }

    return false;
  }

  function onProbeComplete(fn) {
    if (typeof fn === 'function') probeListeners.add(fn);
  }

  function scanDiagnostics() {
    return {
      bridgeConversations: Array.isArray(lastBridgeDiagnostics) ? lastBridgeDiagnostics : [],
      telemetry: lastBridgeTelemetry
    };
  }

  // ============================================================================
  // 5. 可选 Shadow DOM 对话框上下文胶囊（默认关闭）
  // ============================================================================

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const CAPSULE_HOST_ATTR = 'data-agy-capsule-host';
  const capsuleStateMap = new WeakMap();
  const openCapsuleStates = new Set();
  let capsuleEscBound = false;

  const CAPSULE_CSS = `
:host {
  display: inline-flex;
  align-items: center;
  position: relative;
  vertical-align: middle;
  margin-inline-end: 6px;
  color-scheme: light dark;
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --cap-btn-bg: rgba(15, 23, 42, 0.06);
  --cap-btn-hover-bg: rgba(15, 23, 42, 0.11);
  --cap-btn-border: rgba(15, 23, 42, 0.18);
  --cap-btn-text: #0f172a;
  --cap-btn-muted: #475569;
  --cap-tip-bg: #ffffff;
  --cap-tip-border: rgba(15, 23, 42, 0.18);
  --cap-tip-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
  --cap-tip-text: #0f172a;
  --cap-tip-muted: #475569;
  --cap-divider: rgba(15, 23, 42, 0.1);
  --cap-track-bg: rgba(15, 23, 42, 0.12);
  --cap-warn-bg: rgba(194, 108, 119, 0.14);
  --cap-warn-text: #9f1239;
  --cap-comp-bg: rgba(198, 162, 101, 0.16);
  --cap-comp-text: #854d0e;
  --cap-focus: #0284c7;
  --cap-health: #5E9E8E;
}
@media (prefers-color-scheme: dark) {
  :host {
    --cap-btn-bg: rgba(148, 163, 184, 0.12);
    --cap-btn-hover-bg: rgba(148, 163, 184, 0.2);
    --cap-btn-border: rgba(148, 163, 184, 0.28);
    --cap-btn-text: #f1f5f9;
    --cap-btn-muted: #cbd5e1;
    --cap-tip-bg: #161b26;
    --cap-tip-border: rgba(148, 163, 184, 0.28);
    --cap-tip-shadow: 0 12px 32px rgba(2, 6, 23, 0.55);
    --cap-tip-text: #f8fafc;
    --cap-tip-muted: #94a3b8;
    --cap-divider: rgba(148, 163, 184, 0.16);
    --cap-track-bg: rgba(148, 163, 184, 0.22);
    --cap-warn-bg: rgba(194, 108, 119, 0.2);
    --cap-warn-text: #fda4af;
    --cap-comp-bg: rgba(198, 162, 101, 0.2);
    --cap-comp-text: #fde68a;
    --cap-focus: #38bdf8;
  }
}
@supports (color: light-dark(white, black)) {
  :host {
    --cap-btn-bg: light-dark(rgba(15, 23, 42, 0.06), rgba(148, 163, 184, 0.12));
    --cap-btn-hover-bg: light-dark(rgba(15, 23, 42, 0.11), rgba(148, 163, 184, 0.2));
    --cap-btn-border: light-dark(rgba(15, 23, 42, 0.18), rgba(148, 163, 184, 0.28));
    --cap-btn-text: light-dark(#0f172a, #f1f5f9);
    --cap-btn-muted: light-dark(#475569, #cbd5e1);
    --cap-tip-bg: light-dark(#ffffff, #161b26);
    --cap-tip-border: light-dark(rgba(15, 23, 42, 0.18), rgba(148, 163, 184, 0.28));
    --cap-tip-shadow: light-dark(0 10px 28px rgba(15, 23, 42, 0.16), 0 12px 32px rgba(2, 6, 23, 0.55));
    --cap-tip-text: light-dark(#0f172a, #f8fafc);
    --cap-tip-muted: light-dark(#475569, #94a3b8);
    --cap-divider: light-dark(rgba(15, 23, 42, 0.1), rgba(148, 163, 184, 0.16));
    --cap-track-bg: light-dark(rgba(15, 23, 42, 0.12), rgba(148, 163, 184, 0.22));
    --cap-warn-bg: light-dark(rgba(194, 108, 119, 0.14), rgba(194, 108, 119, 0.2));
    --cap-warn-text: light-dark(#9f1239, #fda4af);
    --cap-comp-bg: light-dark(rgba(198, 162, 101, 0.16), rgba(198, 162, 101, 0.2));
    --cap-comp-text: light-dark(#854d0e, #fde68a);
    --cap-focus: light-dark(#0284c7, #38bdf8);
  }
}
.capsule-wrap {
  position: relative;
  display: inline-flex;
  align-items: center;
}
.capsule-wrap.is-healthy {
  --cap-health: #5E9E8E;
}
.capsule-wrap.is-warn {
  --cap-health: #C6A265;
}
.capsule-wrap.is-danger {
  --cap-health: #C26C77;
}
.capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-block-size: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--cap-btn-border);
  background: var(--cap-btn-bg);
  color: var(--cap-btn-text);
  font-family: inherit;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background-color 140ms ease, border-color 140ms ease;
}
.capsule-btn:hover {
  background: var(--cap-btn-hover-bg);
}
.capsule-btn:focus-visible {
  outline: 2px solid var(--cap-focus);
  outline-offset: 2px;
}
.bolt-svg {
  flex: none;
  color: var(--cap-health);
}
.cap-speed,
.cap-ctx {
  font-variant-numeric: tabular-nums;
}
.cap-sep {
  color: var(--cap-btn-muted);
  opacity: 0.7;
}
.gauge-svg {
  flex: none;
  display: block;
}
.gauge-track {
  fill: var(--cap-track-bg);
  stroke: var(--cap-btn-border);
  stroke-width: 0.8;
}
.gauge-fill {
  fill: var(--cap-health);
  transition: width 160ms ease, fill 160ms ease;
}
.capsule-tip {
  position: absolute;
  inset-block-end: calc(100% + 6px);
  inset-inline-end: 0;
  z-index: 2147483000;
  inline-size: max-content;
  min-inline-size: 236px;
  max-inline-size: 310px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid var(--cap-tip-border);
  background: var(--cap-tip-bg);
  color: var(--cap-tip-text);
  box-shadow: var(--cap-tip-shadow);
  font-size: 11.5px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 130ms ease, visibility 130ms ease;
}
.capsule-tip::after {
  content: "";
  position: absolute;
  inset-inline: 0;
  block-size: 10px;
  inset-block-end: -10px;
}
.capsule-tip[data-place="below"] {
  inset-block-end: auto;
  inset-block-start: calc(100% + 6px);
}
.capsule-tip[data-place="below"]::after {
  inset-block-end: auto;
  inset-block-start: -10px;
}
.capsule-tip[data-align="left"] {
  inset-inline-end: auto;
  inset-inline-start: 0;
}
.capsule-tip[data-open="true"] {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
}
.tip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-block-end: 6px;
}
.tip-model {
  font-weight: 600;
  color: var(--cap-tip-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tip-used-badge {
  flex: none;
  font-weight: 600;
  color: var(--cap-health);
  font-variant-numeric: tabular-nums;
}
.tip-bar-track {
  inline-size: 100%;
  block-size: 5px;
  border-radius: 999px;
  background: var(--cap-track-bg);
  overflow: hidden;
  margin-block-end: 8px;
}
.tip-bar-fill {
  block-size: 100%;
  border-radius: 999px;
  background: var(--cap-health);
  transition: width 160ms ease, background-color 160ms ease;
}
.tip-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  margin-block: 3px;
}
.tip-key {
  color: var(--cap-tip-muted);
}
.tip-val {
  font-weight: 500;
  color: var(--cap-tip-text);
  text-align: end;
  font-variant-numeric: tabular-nums;
}
.tip-breakdown,
.tip-est-notice {
  margin-block-start: 4px;
  padding-block-start: 4px;
  border-block-start: 1px solid var(--cap-divider);
  font-size: 11px;
  color: var(--cap-tip-muted);
  font-variant-numeric: tabular-nums;
}
.tip-compressed,
.tip-warn {
  margin-block-start: 6px;
  padding: 4px 7px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}
.tip-compressed {
  background: var(--cap-comp-bg);
  color: var(--cap-comp-text);
}
.tip-warn {
  background: var(--cap-warn-bg);
  color: var(--cap-warn-text);
}
.tip-quota-wrap {
  margin-block-start: 6px;
  padding-block-start: 5px;
  border-block-start: 1px solid var(--cap-divider);
}
.tip-foot {
  margin-block-start: 6px;
  padding-block-start: 5px;
  border-block-start: 1px solid var(--cap-divider);
  font-size: 11px;
  color: var(--cap-tip-muted);
  font-variant-numeric: tabular-nums;
}
[hidden] {
  display: none !important;
}
@media (prefers-reduced-motion: reduce) {
  .capsule-btn,
  .capsule-tip,
  .tip-bar-fill,
  .gauge-fill {
    transition: none;
    animation: none;
  }
}
@media (forced-colors: active) {
  .capsule-btn {
    forced-color-adjust: auto;
    background: ButtonFace;
    color: ButtonText;
    border-color: ButtonBorder;
  }
  .capsule-btn:focus-visible {
    outline: 2px solid Highlight;
    outline-offset: 2px;
  }
  .capsule-tip {
    forced-color-adjust: auto;
    background: Canvas;
    color: CanvasText;
    border: 1px solid ButtonBorder;
    box-shadow: none;
  }
  .gauge-track {
    fill: Canvas;
    stroke: ButtonBorder;
  }
  .tip-bar-track {
    background: Canvas;
    border: 1px solid ButtonBorder;
  }
  .gauge-fill {
    fill: Highlight;
  }
  .tip-bar-fill {
    background: Highlight;
  }
  .bolt-svg {
    color: CanvasText;
  }
  .tip-used-badge {
    color: Highlight;
  }
}
`;

  function formatCapsuleTokens(raw) {
    const n = Math.max(0, Number(raw) || 0);
    if (n >= 1000000) {
      return `${(n / 1000000).toFixed(1).replace(/\.0$/, '')}M`;
    }
    if (n >= 1000) {
      return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`;
    }
    return String(Math.round(n));
  }

  function formatCapsuleResetCountdown(resetTimeMs) {
    const ms = Number(resetTimeMs);
    if (!Number.isFinite(ms) || ms <= 0) return '';
    const diffMs = ms - Date.now();
    if (diffMs <= 60000) {
      return t('quotaResetsSoon', {}, 'Resets soon');
    }
    const totalMins = Math.ceil(diffMs / 60000);
    const hrs = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    const timeStr = hrs > 0 ? (mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`) : `${mins}m`;
    return t('quotaResetsIn', { time: timeStr }, `Resets in ${timeStr}`);
  }

  function createSvgEl(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      el.setAttribute(k, String(v));
    }
    return el;
  }

  function clearCapsuleHideTimer(state) {
    if (state.hideTimer !== null) {
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    }
  }

  function positionCapsuleTooltip(state) {
    try {
      const rect = state.btn.getBoundingClientRect();
      if (rect.top < 240) {
        state.tip.setAttribute('data-place', 'below');
      } else {
        state.tip.removeAttribute('data-place');
      }
      if (rect.right < 290) {
        state.tip.setAttribute('data-align', 'left');
      } else {
        state.tip.removeAttribute('data-align');
      }
    } catch {}
  }

  function syncCapsuleTipVisibility(state) {
    clearCapsuleHideTimer(state);
    const shouldOpen = !state.dismissedByEsc && (state.hoverBtn || state.hoverTip || state.focused);
    state.isOpen = shouldOpen;
    if (shouldOpen) {
      positionCapsuleTooltip(state);
      state.tip.setAttribute('data-open', 'true');
      openCapsuleStates.add(state);
    } else {
      state.tip.removeAttribute('data-open');
      openCapsuleStates.delete(state);
    }
  }

  function scheduleCapsuleTipHide(state) {
    clearCapsuleHideTimer(state);
    state.hideTimer = setTimeout(() => {
      state.hideTimer = null;
      syncCapsuleTipVisibility(state);
    }, 120);
  }

  function createCapsuleRow(keyText = '') {
    const row = document.createElement('div');
    row.className = 'tip-row';
    const keyEl = document.createElement('span');
    keyEl.className = 'tip-key';
    keyEl.textContent = keyText;
    const valEl = document.createElement('span');
    valEl.className = 'tip-val';
    row.appendChild(keyEl);
    row.appendChild(valEl);
    return { row, keyEl, valEl };
  }

  function ensureCapsuleEscListener() {
    if (capsuleEscBound) return;
    capsuleEscBound = true;
    document.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Escape' || openCapsuleStates.size === 0) return;
      for (const st of Array.from(openCapsuleStates)) {
        st.dismissedByEsc = true;
        syncCapsuleTipVisibility(st);
      }
    });
  }

  function buildCapsuleInstance(host) {
    ensureCapsuleEscListener();
    const shadow = host.shadowRoot || host.attachShadow({ mode: 'open' });
    while (shadow.firstChild) {
      shadow.removeChild(shadow.firstChild);
    }

    const styleEl = document.createElement('style');
    styleEl.textContent = CAPSULE_CSS;

    const wrap = document.createElement('div');
    wrap.className = 'capsule-wrap is-healthy';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'capsule-btn';
    btn.setAttribute('aria-describedby', 'agy-cap-tip');

    const boltSvg = createSvgEl('svg', {
      class: 'bolt-svg',
      width: '11',
      height: '11',
      viewBox: '0 0 16 16',
      'aria-hidden': 'true'
    });
    boltSvg.appendChild(
      createSvgEl('path', {
        fill: 'currentColor',
        d: 'M9.5 1.5L3.5 9h4l-1 5.5L12.5 7h-4l1-5.5Z'
      })
    );

    const speedSpan = document.createElement('span');
    speedSpan.className = 'cap-speed';
    speedSpan.textContent = '-- tok/s';

    const sepSpan = document.createElement('span');
    sepSpan.className = 'cap-sep';
    sepSpan.setAttribute('aria-hidden', 'true');
    sepSpan.textContent = '·';

    const gaugeSvg = createSvgEl('svg', {
      class: 'gauge-svg',
      width: '18',
      height: '9',
      viewBox: '0 0 18 9',
      'aria-hidden': 'true'
    });
    const gaugeTrack = createSvgEl('rect', {
      class: 'gauge-track',
      x: '0.5',
      y: '0.5',
      width: '17',
      height: '8',
      rx: '4'
    });
    const gaugeFill = createSvgEl('rect', {
      class: 'gauge-fill',
      x: '2',
      y: '2',
      width: '0',
      height: '5',
      rx: '2.5'
    });
    gaugeSvg.appendChild(gaugeTrack);
    gaugeSvg.appendChild(gaugeFill);

    const ctxSpan = document.createElement('span');
    ctxSpan.className = 'cap-ctx';
    ctxSpan.textContent = '~0/256k, 0%';

    btn.appendChild(boltSvg);
    btn.appendChild(speedSpan);
    btn.appendChild(sepSpan);
    btn.appendChild(gaugeSvg);
    btn.appendChild(ctxSpan);

    const tip = document.createElement('div');
    tip.id = 'agy-cap-tip';
    tip.setAttribute('role', 'tooltip');
    tip.className = 'capsule-tip';

    const tipHead = document.createElement('div');
    tipHead.className = 'tip-head';
    const modelEl = document.createElement('span');
    modelEl.className = 'tip-model';
    const usedBadgeEl = document.createElement('span');
    usedBadgeEl.className = 'tip-used-badge';
    tipHead.appendChild(modelEl);
    tipHead.appendChild(usedBadgeEl);

    const barTrack = document.createElement('div');
    barTrack.className = 'tip-bar-track';
    const barFill = document.createElement('div');
    barFill.className = 'tip-bar-fill';
    barTrack.appendChild(barFill);

    const ctxRow = createCapsuleRow();
    const remainRow = createCapsuleRow();
    const speedRow = createCapsuleRow();

    const exactWrap = document.createElement('div');
    exactWrap.className = 'tip-exact-wrap';
    const cacheRow = createCapsuleRow();
    const breakdownEl = document.createElement('div');
    breakdownEl.className = 'tip-breakdown';
    exactWrap.appendChild(cacheRow.row);
    exactWrap.appendChild(breakdownEl);

    const estNoticeEl = document.createElement('div');
    estNoticeEl.className = 'tip-est-notice';

    const compressedEl = document.createElement('div');
    compressedEl.className = 'tip-compressed';
    compressedEl.hidden = true;

    const warnEl = document.createElement('div');
    warnEl.className = 'tip-warn';
    warnEl.hidden = true;

    const quotaWrap = document.createElement('div');
    quotaWrap.className = 'tip-quota-wrap';
    const quotaRow = createCapsuleRow();
    quotaWrap.appendChild(quotaRow.row);
    quotaWrap.hidden = true;

    const footEl = document.createElement('div');
    footEl.className = 'tip-foot';

    tip.appendChild(tipHead);
    tip.appendChild(barTrack);
    tip.appendChild(ctxRow.row);
    tip.appendChild(remainRow.row);
    tip.appendChild(speedRow.row);
    tip.appendChild(exactWrap);
    tip.appendChild(estNoticeEl);
    tip.appendChild(compressedEl);
    tip.appendChild(warnEl);
    tip.appendChild(quotaWrap);
    tip.appendChild(footEl);

    wrap.appendChild(btn);
    wrap.appendChild(tip);

    shadow.appendChild(styleEl);
    shadow.appendChild(wrap);

    const state = {
      host,
      shadow,
      wrap,
      btn,
      tip,
      speedSpan,
      gaugeFill,
      ctxSpan,
      modelEl,
      usedBadgeEl,
      barFill,
      ctxKeyEl: ctxRow.keyEl,
      ctxValEl: ctxRow.valEl,
      remainKeyEl: remainRow.keyEl,
      remainValEl: remainRow.valEl,
      speedKeyEl: speedRow.keyEl,
      speedValEl: speedRow.valEl,
      exactWrap,
      cacheKeyEl: cacheRow.keyEl,
      cacheValEl: cacheRow.valEl,
      breakdownEl,
      estNoticeEl,
      compressedEl,
      warnEl,
      quotaWrap,
      quotaKeyEl: quotaRow.keyEl,
      quotaValEl: quotaRow.valEl,
      footEl,
      hoverBtn: false,
      hoverTip: false,
      focused: false,
      dismissedByEsc: false,
      isOpen: false,
      hideTimer: null,
      lastDigest: ''
    };

    btn.addEventListener('mouseenter', () => {
      state.hoverBtn = true;
      state.dismissedByEsc = false;
      syncCapsuleTipVisibility(state);
    });
    btn.addEventListener('mouseleave', () => {
      state.hoverBtn = false;
      scheduleCapsuleTipHide(state);
    });
    btn.addEventListener('focus', () => {
      state.focused = true;
      state.dismissedByEsc = false;
      syncCapsuleTipVisibility(state);
    });
    btn.addEventListener('blur', () => {
      state.focused = false;
      state.dismissedByEsc = false;
      syncCapsuleTipVisibility(state);
    });
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      state.dismissedByEsc = false;
      syncCapsuleTipVisibility(state);
    });
    btn.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && state.isOpen) {
        ev.stopPropagation();
        state.dismissedByEsc = true;
        syncCapsuleTipVisibility(state);
      }
    });
    tip.addEventListener('mouseenter', () => {
      state.hoverTip = true;
      clearCapsuleHideTimer(state);
      syncCapsuleTipVisibility(state);
    });
    tip.addEventListener('mouseleave', () => {
      state.hoverTip = false;
      scheduleCapsuleTipHide(state);
    });

    capsuleStateMap.set(host, state);
    return state;
  }

  function updateCapsuleState(state, convData, compEntry, telemetry) {
    const precision = convData?.precision === 'exact' ? 'exact' : 'estimated';
    const contextUsed = Math.max(0, Number(convData?.contextUsed) || 0);
    const contextLimit = Math.max(1, Number(convData?.contextLimit) || 256000);
    const usagePercent = Number.isFinite(convData?.usagePercent)
      ? Math.min(100, Math.max(0, Math.round(convData.usagePercent)))
      : Math.min(100, Math.max(0, Math.round((contextUsed / contextLimit) * 100)));
    const remainPercent = Number.isFinite(convData?.remainPercent)
      ? Math.min(100, Math.max(0, Math.round(convData.remainPercent)))
      : Math.max(0, 100 - usagePercent);
    const remainTokens = Math.max(0, contextLimit - contextUsed);

    const usedStr = formatCapsuleTokens(contextUsed);
    const limitStr = formatCapsuleTokens(contextLimit);
    const usedPrefix = precision === 'estimated' ? '~' : '';
    const usedDisplay = `${usedPrefix}${usedStr}`;

    const speedNum = Math.max(0, Number(convData?.tokPerSec) || 0);
    const avgNum = Math.max(0, Number(convData?.avgTokPerSec) || speedNum);
    const roundedSpeed = Math.round(speedNum);
    const roundedAvg = Math.round(avgNum);

    const modelLabel =
      convData?.modelLabel ||
      compEntry?.modelLabel ||
      t('capsuleDefaultModel', {}, 'Default Model');

    const remFrac =
      typeof convData?.remainingFraction === 'number'
        ? convData.remainingFraction
        : typeof compEntry?.remainingFraction === 'number'
          ? compEntry.remainingFraction
          : null;
    const resetMs = convData?.resetTimeMs || compEntry?.resetTimeMs || null;
    const countdown = remFrac !== null ? formatCapsuleResetCountdown(resetMs) : '';

    const cacheHit = Math.min(100, Math.max(0, Math.round(Number(convData?.cacheHitRate) || 0)));
    const cacheReadStr = formatCapsuleTokens(convData?.cacheReadTokens || 0);
    const inputStr = formatCapsuleTokens(convData?.inputTokens || 0);
    const outputStr = formatCapsuleTokens(convData?.outputTokens || 0);

    const compDetected = Boolean(
      convData?.compressionDetected && (Number(convData?.compressionDrop) || 0) > 0
    );
    const compBefore = formatCapsuleTokens(convData?.compressionBefore || 0);
    const compAfter = formatCapsuleTokens(convData?.compressionAfter || 0);
    const compDrop = Math.min(99, Math.max(0, Math.round(Number(convData?.compressionDrop) || 0)));
    const stepCount = Math.max(0, Math.round(Number(convData?.stepCount) || 0));

    const digest = JSON.stringify([
      precision,
      usedDisplay,
      limitStr,
      usagePercent,
      remainPercent,
      roundedSpeed,
      roundedAvg,
      modelLabel,
      remFrac,
      countdown,
      cacheHit,
      cacheReadStr,
      inputStr,
      outputStr,
      compDetected,
      compBefore,
      compAfter,
      compDrop,
      stepCount,
      telemetry?.fetchedAt || 0
    ]);
    if (digest === state.lastDigest) return;
    state.lastDigest = digest;

    const healthCls =
      usagePercent >= 80 ? 'is-danger' : usagePercent >= 50 ? 'is-warn' : 'is-healthy';
    state.wrap.className = `capsule-wrap ${healthCls}`;

    const speedBtnText = roundedSpeed > 0 ? `${roundedSpeed} tok/s` : '-- tok/s';
    state.speedSpan.textContent = speedBtnText;
    state.ctxSpan.textContent = `${usedDisplay}/${limitStr}, ${usagePercent}%`;
    state.btn.setAttribute(
      'aria-label',
      t(
        'capsuleAriaLabel',
        { used: usedDisplay, limit: limitStr, pct: usagePercent },
        `Context usage ${usedDisplay} of ${limitStr} (${usagePercent}%)`
      )
    );

    const gaugeW = usagePercent > 0 ? Math.max(2, Math.round((14 * usagePercent) / 100)) : 0;
    state.gaugeFill.setAttribute('width', String(gaugeW));
    state.barFill.style.width = `${usagePercent}%`;

    state.modelEl.textContent = modelLabel;
    state.usedBadgeEl.textContent = t('capsuleUsedPct', { pct: usagePercent }, `${usagePercent}% used`);

    state.ctxKeyEl.textContent = t('capsuleContextUsed', {}, 'Context Used');
    state.ctxValEl.textContent = `${usedDisplay} / ${limitStr}`;

    state.remainKeyEl.textContent = t('capsuleRemainCap', {}, 'Remaining Capacity');
    state.remainValEl.textContent = `${formatCapsuleTokens(remainTokens)} (${remainPercent}%)`;

    state.speedKeyEl.textContent = t('capsuleGenSpeedLabel', {}, 'Generation Speed');
    state.speedValEl.textContent =
      roundedSpeed > 0 || roundedAvg > 0
        ? t(
            'capsuleGenSpeed',
            { speed: roundedSpeed, avg: roundedAvg },
            `${roundedSpeed} tok/s (avg ${roundedAvg} tok/s)`
          )
        : '-- tok/s';

    if (precision === 'exact') {
      state.exactWrap.hidden = false;
      state.estNoticeEl.hidden = true;
      state.cacheKeyEl.textContent = t('capsuleCacheHitLabel', {}, 'Prompt Cache Hit');
      state.cacheValEl.textContent = `${cacheHit}%`;
      state.breakdownEl.textContent = t(
        'capsuleBreakdownLine',
        { cache: cacheReadStr, input: inputStr, output: outputStr },
        `Cache: ${cacheReadStr} · In: ${inputStr} · Out: ${outputStr}`
      );
    } else {
      state.exactWrap.hidden = true;
      state.estNoticeEl.hidden = false;
      state.estNoticeEl.textContent = t(
        'capsuleEstNotice',
        {},
        'Estimated from visible steps'
      );
    }

    if (compDetected) {
      state.compressedEl.hidden = false;
      state.compressedEl.textContent = t(
        'capsuleAutoCompressed',
        { before: compBefore, after: compAfter, drop: compDrop },
        `Auto-compressed: ${compBefore} → ${compAfter} (-${compDrop}%)`
      );
    } else {
      state.compressedEl.hidden = true;
    }

    if (usagePercent >= 80) {
      state.warnEl.hidden = false;
      state.warnEl.textContent = t(
        'capsuleCompactionWarn',
        {},
        'Approaching auto-compaction threshold'
      );
    } else {
      state.warnEl.hidden = true;
    }

    if (remFrac !== null) {
      const remQuotaPct = Math.min(100, Math.max(0, Math.round(remFrac * 100)));
      state.quotaWrap.hidden = false;
      state.quotaKeyEl.textContent = t('capsuleQuotaRowLabel', {}, '5h Remaining Quota');
      state.quotaValEl.textContent = countdown ? `${remQuotaPct}% · ${countdown}` : `${remQuotaPct}%`;
    } else {
      state.quotaWrap.hidden = true;
    }

    state.footEl.textContent = t('capsuleStepsCount', { count: stepCount }, `Steps: ${stepCount}`);
  }

  function removeAllCapsules() {
    openCapsuleStates.clear();
    for (const host of document.querySelectorAll(`[${CAPSULE_HOST_ATTR}="1"]`)) {
      const st = capsuleStateMap.get(host);
      if (st) {
        clearCapsuleHideTimer(st);
        capsuleStateMap.delete(host);
      }
      host.remove();
    }
  }

  function syncInPageCapsules(enabled, telemetry) {
    if (!enabled || (isLocalContext && !isLocalAntigravityConfirmed()) || !document.body) {
      removeAllCapsules();
      return;
    }

    const footers = Array.from(document.querySelectorAll('.agy-composer-footer'));
    const validHosts = new Set();
    const composers = Array.isArray(telemetry?.composers) ? telemetry.composers : [];
    const convs =
      telemetry?.conversations && typeof telemetry.conversations === 'object'
        ? telemetry.conversations
        : {};

    for (let idx = 0; idx < footers.length; idx++) {
      const footer = footers[idx];
      let host = footer.querySelector(`[${CAPSULE_HOST_ATTR}="1"]`);
      if (!host) {
        host = document.createElement('span');
        host.setAttribute(CAPSULE_HOST_ATTR, '1');
        const permBtn = footer.querySelector('button[data-testid="permissions-selector-trigger"]');
        const rightControls = footer.querySelector('.shrink-0.flex.items-center');
        if (permBtn && permBtn.parentElement) {
          permBtn.parentElement.insertBefore(host, permBtn);
        } else if (rightControls) {
          rightControls.insertBefore(host, rightControls.firstChild);
        } else {
          footer.insertBefore(host, footer.firstChild);
        }
      }
      validHosts.add(host);

      const state = capsuleStateMap.get(host) || buildCapsuleInstance(host);
      const compEntry = composers[idx] || null;
      const rawCompConvId = compEntry?.convId || '';
      const isSyntheticCompId = rawCompConvId.startsWith('composer-panel-');
      const convId =
        (!isSyntheticCompId && rawCompConvId) ||
        telemetry?.activeConvId ||
        rawCompConvId ||
        '';
      const convData =
        (convId && convs[convId]) ||
        (telemetry?.activeConvId && convs[telemetry.activeConvId]) ||
        null;
      updateCapsuleState(state, convData, compEntry, telemetry || null);
    }

    for (const host of document.querySelectorAll(`[${CAPSULE_HOST_ATTR}="1"]`)) {
      if (!validHosts.has(host)) {
        const st = capsuleStateMap.get(host);
        if (st) {
          clearCapsuleHideTimer(st);
          openCapsuleStates.delete(st);
          capsuleStateMap.delete(host);
        }
        host.remove();
      }
    }
  }

  window.__AGY_SCANNER__ = {
    scanWorkspace,
    focusTaskById,
    probeCollapsedProjects,
    onProbeComplete,
    scanDiagnostics,
    isLocalAntigravityConfirmed,
    syncInPageCapsules
  };
})();

