# AGENTS.md — Contributor & AI Agent Guide

Repository guidance for AI coding agents and open-source contributors working on **Antigravity Tab Status** (`v2.8.0`).

---

## 1. Mandatory Pre-Edit Skills & Standards

Before modifying any project file, consult the relevant local guidance:

1. **Web UI, HTML, CSS, and Client-Side JS (`popup.html`, `sidepanel.html`, `popup.css`, `popup.js`, `content.js` Canvas/DOM)**
   - Consult **`modern-web-guidance`** (`SKILL.md` + relevant topic guides under `guides/html/`, `guides/css/`, `guides/accessibility/`, `guides/visual-design/`, `guides/ui-behaviors/`, `guides/performance/`, `guides/security/`).
   - Never rely on legacy CSS/DOM habits when modern Baseline features are specified by the project's Browser Support Policy.
2. **Browser Extension Architecture (`manifest.json`, `background.js`, content scripts, messaging, permissions)**
   - Consult **`chrome-extensions`** (`SKILL.md` and `references/extensions/*` / `references/webstore/*`).
   - Strictly target **Manifest V3** — never introduce Manifest V2 APIs (`background.scripts`, `chrome.browserAction`, `chrome.tabs.executeScript`).

---

## 2. Browser Support Policy

**Target Runtime:** **Chromium 120+** (Google Chrome, Microsoft Edge, Arc, Brave, and other Chromium-based browsers supporting Manifest V3 `world: "MAIN"` content scripts and `OffscreenCanvas`).

- **Baseline & Modern Web Features Used:**
  - MV3 `content_scripts` with `world: "MAIN"` (`page-bridge.js`) and `world: "ISOLATED"` (`i18n.js`, `scanner.js`, `content.js`, `frame-detector.js`)
  - Chrome `Side Panel` API (`sidepanel.html`) + CSS container queries (`container: panel / inline-size`), `100dvh`, and `container-type: scroll-state` where supported
  - `OffscreenCanvas` + `createImageBitmap` in the Service Worker (`background.js`)
  - CSS `@layer` cascade ordering (`reset, tokens, base, components, utilities`)
  - `color-scheme: light dark`, `light-dark()`, `color-mix(in oklab, ...)`
  - Native `details::details-content` styling, `:has()`, logical CSS properties (`inline-size`, `block-size`, `margin-block`, `padding-inline`), and `container-type: scroll-state` where supported
- **Progressive Enhancement & Accessibility Fallbacks:**
  - Wrap cutting-edge CSS properties or selectors in `@supports` where needed so the popup degrades gracefully.
  - Honor `@media (prefers-reduced-motion: reduce)` in both `popup.css` and `content.js` (render static frame `0` and do not start the animation ticker).
  - Honor `@media (forced-colors: active)` and `@media (prefers-contrast: more)` with system colors (`CanvasText`, `Highlight`, `ButtonText`) and >= 4.5:1 text / >= 3:1 non-text contrast (WCAG AA).
  - Maintain full keyboard focus visibility (`:focus-visible`) and semantic landmarks (`<header>`, `<main>`, `<section>`, `<ul>`, `<button type="button">`, `aria-pressed`, `role="status"`).

---

## 3. Security, CSP & MV3 Engineering Constraints

Google Antigravity enforces strict Content Security Policy rules (`script-src 'self'`, `worker-src 'self'`, `img-src 'self'`), and Chrome Extension pages enforce strict MV3 CSP:

- **Zero Inline Code:** No inline `<script>`, no inline `<style>`, and no inline HTML event handlers (`onclick=`, `onload=`, etc.) in `popup.html` or `sidepanel.html`. Always bind events with `addEventListener`.
- **Zero Dynamic Code Execution:** Never use `eval()`, `new Function()`, or string-based `setTimeout`/`setInterval`.
- **Zero Blob Workers:** Never create `new Worker(URL.createObjectURL(...))` inside content scripts or pages. Background timers and animation ticks MUST run through the `chrome.runtime.connect({ name: 'agy-timer' })` Port managed by `background.js`.
- **Async/Await Convention:** Prefer `async`/`await` over `.then()` chains across extension scripts.
  - Any `chrome.runtime.onMessage` listener that sends an asynchronous response MUST `return true` to keep the message channel open.
  - Always handle or consume `chrome.runtime.lastError` in callback-based Chrome APIs and guard against invalidated extension contexts (`chrome.runtime?.id`) after extension reloads.
- **Ephemeral Service Worker:** `background.js` can be terminated after ~30s of inactivity. Never persist user settings or durable app state in Service Worker globals; use `chrome.storage.sync` (settings) or `chrome.storage.local` / `chrome.storage.session` when needed.
- **Minimal Permissions:**
  - `permissions`: `["storage", "sidePanel"]` only (do NOT add `tabs`, `<all_urls>` permissions, or analytics).
  - `host_permissions`: Scoped strictly to Antigravity origins (`https://antigravity.google.com/*`, `https://*.antigravity.google.com/*`, `https://antigravity.google/*`, `https://*.antigravity.google/*`), isolated Antigravity workspace iframe hosts (`https://*.usercontent.goog/*`, guarded by `location.ancestorOrigins` verification in every `all_frames: true` script), and `https://*.gstatic.com/*` (for favicon decoding in `background.js`).
- **Read-Only Memory/Network Observation:** `page-bridge.js` must passively observe and clone data only — never mutate or intercept/block host `fetch`, `XHR`, or `WebSocket` payloads.

---

## 4. Architecture Overview

### 4.1 Multi-World Execution Model

| Context / World | Files | Load Timing | Responsibilities |
| :--- | :--- | :--- | :--- |
| **MAIN World** | `page-bridge.js` | `document_start`, `all_frames: true` (`antigravity.google(.com)` + `*.usercontent.goog` workspace iframes with `ancestorOrigins` guard + `match_about_blank`/`match_origin_as_fallback`) | Traverses React 18/19 Fiber (`HostRoot`, `Context.Provider`, `dependencies.firstContext`), TanStack `QueryClient`, Redux/Zustand stores, and passively observes `fetch`/`XHR`/`WebSocket` streams with a `500ms` result cache (and FIFO cap at `1000` entries). Outputs structured `{ reasonCode, reasonVars, reason }` without depending on `window.__AGY_I18N__`. |
| **ISOLATED World (Top Frame)** | `i18n.js` -> `scanner.js` -> `content.js` | `document_idle`, `all_frames: false` (`antigravity.google(.com)` origins) | Aggregates top-frame + child-iframe workspace states, resolves global priority, runs completion debounce (`1500ms`), translates `reasonCode` via `window.__AGY_I18N__`, renders the 64x64 Canvas status light favicon, updates `chrome.action` badge count, strips any legacy title suffixes, and validates origins on child-frame `postMessage` traffic (permitting only `antigravity.google(.com)` and mounted `*.usercontent.goog` workspace iframes). |
| **ISOLATED World (Child Frames)** | `i18n.js` -> `scanner.js` -> `frame-detector.js` | `document_idle`, `all_frames: true` (`antigravity.google(.com)` + `*.usercontent.goog` workspace iframes with `ancestorOrigins` guard + `match_about_blank`/`match_origin_as_fallback`) | Scans workspace iframes (`window.top !== window.self`) and relays snapshots to the top frame via origin-verified `window.top.postMessage` and `CHILD_FRAME_SYNC` through `background.js`. |
| **Extension Service Worker** | `background.js` | Event-driven | Hosts `agy-timer` Port (`START_INTERVAL`, `STOP_INTERVAL`, `SET_TIMEOUT`, `CLEAR_TIMEOUT`), decodes favicons into 64x64 RGBA pixels via `OffscreenCanvas` (`FETCH_FAVICON_PIXELS`), aggregates global toolbar badges via `chrome.storage.session`, synchronizes `actionClickMode` (`setPanelBehavior` + `setPopup`), and relays child-frame sync & task focus broadcasts (`FOCUS_TASK_BROADCAST`, `PROBE_COLLAPSED_BROADCAST`). |
| **Extension Popup & Side Panel** | `popup.html`, `sidepanel.html`, `popup.css`, `i18n.js`, `popup.js` | On action click / Side Panel open | Discovers live Antigravity tabs across all browser windows (even when browsing unrelated websites), aggregates single or multi-instance project/conversation trees with one-click cross-tab activation, provides Side Panel launch & `actionClickMode` controls, mark-all-read, light style picker, mount layout, preview mode, and custom selectors. |

> **Script Ordering Rule:** In both `ISOLATED` `content_scripts` entries in `manifest.json` AND in `popup.html` / `sidepanel.html`, `i18n.js` MUST load **before** `scanner.js`, `content.js`, `frame-detector.js`, and `popup.js`.

### 4.2 Global Status Priority & v2.7 Indicator-Only Tab Light Philosophy

Global tab state strictly follows:

`waiting` (1A: approval / input needed) **>** `unread` (1B: newly completed / unread) **>** `running` (2: agent executing) **>** `idle` (default)

- **Zero Tab Title Text (v2.6+):** Never append status words (`Waiting`, `Unread`, `Running`, `待处理`, `未读`, `运行中`, etc.) to `document.title`. `syncTabTitlePresentation()` in `content.js` exists solely to strip legacy v2.5 suffixes via `TITLE_SUFFIX_RE` and preserve the page's clean title.
- **6 Selectable Light Styles (`indicatorStyle`):**
  1. `antigravity` — Antigravity Native: deep slate rounded squircle matching `https://antigravity.google.com/` workspace icons (blue `progress_activity` arc + stop square for `running`, `mark_chat_unread` chat bubble + emerald dot for `unread`, warm amber `notifications_active` bell for `waiting`).
  2. `gemini` — Gemini Native: dark obsidian disc with `https://gemini.google.com/app` 4-pointed concave sparkle (Google-gradient orbital thinking ring for `running`, resting sparkle + green unread dot for `unread`, warm amber-coral sparkle + `!` badge for `waiting`).
  3. `glow` (Default) — Luminous Orb: pearl/glass LED orb with ambient glow, specular highlight, and high-contrast hairline rim.
  4. `claude` — Claude Dynamic Sparkle: warm terracotta/coral 8-spoke starburst (`running`/`waiting`) and sage-emerald sparkle (`unread`) on a soft contrast halo.
  5. `geek` — Geek Terminal: obsidian CRT keycap with neon phosphor borders (`>_` / spinner, `[!]`, `[✓]`).
  6. `emoji` — Vivid Emoji: high-DPI color emoji (`⚡`, `🔔`, `✅`) over a soft contrast disc.
- **2 Mount Layouts (`iconLayout`) & Corner Size (`badgeSize`):**
  - `standalone` (Default): full 64x64 indicator favicon.
  - `badge`: corner overlay punched onto the original site favicon (`standard` or `large`).
- **Motion & Flash Safety:** Waiting pulse intervals MUST stay `>= 650ms` (`< 3` flashes/sec). When `prefers-reduced-motion: reduce` is active, render static frame `0` without starting the animation ticker.
- **Canonical `chrome.storage.sync` Schema:**
  ```js
  {
    enabled: true,
    indicatorStyle: 'glow',   // 'antigravity' | 'gemini' | 'glow' | 'claude' | 'geek' | 'emoji'
    iconLayout: 'standalone', // 'standalone' | 'badge'
    badgeSize: 'standard',    // 'standard' | 'large'
    actionClickMode: 'popup', // 'popup' | 'sidepanel'
    autoProbeCollapsed: false,
    customWaitingSelector: '',
    customRunningSelector: ''
  }
  ```

---

## 5. 10-Locale i18n Synchronization Rules

Supported locales (`10`): `en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`.

1. **Underscore Folder Names:** Chrome extension `_locales/` directories MUST use underscores (`zh_CN`, `zh_TW`, `pt_BR`) — **never** hyphens (`zh-CN`).
2. **Manifest Locale Strings:** Every `_locales/<locale>/messages.json` MUST define `extName`, `extDescription`, and `actionTitle` matching `manifest.json` (`__MSG_extName__`, `__MSG_extDescription__`, `__MSG_actionTitle__`), with `default_locale: "en"`.
3. **100% Key Parity in `i18n.js`:**
   - Every locale dictionary inside `window.__AGY_I18N__` (`i18n.js`) MUST contain the exact same non-empty key set.
   - Every `[data-i18n]`, `[data-i18n-title]`, `[data-i18n-placeholder]`, and `[data-i18n-aria-label]` attribute in `popup.html` and `sidepanel.html`, every `t('...')` call in `popup.js`, `content.js`, and `scanner.js`, and every `reasonCode` emitted by `page-bridge.js` MUST exist in all 10 locales.
   - Placeholder tokens (`{count}`, `{name}`, `{sample}`, `{projects}`, `{tasks}`, `{frames}`, `{time}`, `{text}`, `{project}`, `{state}`) must match across all translations of a key.
4. **Preserve Bilingual DOM Scraping Regexes:** Do **not** localize or remove English/Chinese UI-scraping patterns in `scanner.js` (e.g., `RELATIVE_TIME_RE`, `NAV_CHROME_TEXT_RE`, `EMPTY_PLACEHOLDER_RE`, `DESTRUCTIVE_BTN_RE`). Host Antigravity DOM detection must keep working regardless of browser UI language.

---

## 6. Local Verification & Packaging Commands

Run these checks from the repository root before submitting any pull request or release build (requires Node.js 20+):

```bash
# 1. Full automated verification suite (syntax, MV3 & permission scope, 10-locale parity, CSP/security, PNG icons, leak checks)
node scripts/verify.mjs

# 2. Verify + build clean Chrome Web Store / GitHub Release archive into dist/
bash scripts/package.sh
```

> **Note:** GitHub Actions (`.github/workflows/ci.yml`) automatically runs `node scripts/verify.mjs` and `bash scripts/package.sh` on every push and pull request.

