# Changelog

All notable changes to **Antigravity Tab Status** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [2.10.0] — Token Usage Ledger, Offline Pricing & Analytics, Quota Pace/Alerts, Cache Freshness & Local Magpie Integration

### Added
- **Dual-Track Session Token Telemetry & 5h Quota Pace / ETA (`page-bridge.js`, `scanner.js`, `content.js`, `popup.js`, `popup.css`):**
  - Extended `extractStepModelUsage()` and `analyzeConversationSteps()` with `reasoningTokens` (preserving disjoint vs. nested-detail deduplication), tiered `5m`/`1h` prompt-cache write tokens (`cacheWrite5mTokens`, `cacheWrite1hTokens`), observed step `durationMs` / `ttftMs`, eviction-safe cumulative `session*` counters across `MAX_STEPS_PER_CONV` splices, and isolated `subagentTotalTokens` for shadow/subagent steps.
  - Added ring-buffer slope depletion `etaMs`, `paceRatio`, `paceStatus` (`comfortable` / `balanced` / `fast`), and pre-reset unused quota hints (`unusedPreResetHint`) inside `#quotaStrip`, plus richer hover tooltips and Shadow DOM capsule breakdowns.
- **Shared Offline Pricing Engine & Persistent Usage Ledger (`pricing.js`, `background.js`, `popup.html`, `sidepanel.html`, `popup.js`, `popup.css`):**
  - Added `pricing.js` (`globalThis.__AGY_PRICING__`) with 100% offline USD `/ 1M` pricing catalog, model alias normalization, `USD`/`CNY` conversion, per-model custom rate overrides (`chrome.storage.local["agyPricingConfigV1"]`), prompt-cache savings calculation, and session cost/savings tooltips.
  - Added high-watermark deduplicated on-device usage ledger (`chrome.storage.local["agyUsageLedgerV1"]`) capped at `300` LRU conversation watermarks, `90`-day rolling retention, and `< 240 KB` serialized size, serialized via an async write lock in `background.js` and protected against storage quota overflows.
  - Added collapsible `<details id="usageDrawer" class="card usage-drawer">` analytics drawer with `Today | 7d | 30d` range switch, `USD | CNY` currency toggle, 4 KPI cards, SVG trend bar chart + 28-day activity heatmap, Top Models / Top Projects ranked bars, custom pricing overrides, RFC 4180 + CWE-1236 formula-safe CSV / JSON export, and 2-step inline `Clear History` confirmation.
- **Opt-In Desktop 5h Quota Notifications (`manifest.json`, `pricing.js`, `background.js`, `content.js`, `popup.html`, `sidepanel.html`, `popup.js`):**
  - Added `"optional_permissions": ["notifications"]` and `quotaNotifications` (`false` by default) gated by synchronous `chrome.permissions.request({ permissions: ['notifications'] })`.
  - Added sleep-resilient, multi-tab deduplicated allowance-back recovery and pre-reset unused quota reminders persisted in `chrome.storage.local["agyNotifStateV1"]`.
- **Prompt Cache `5m` / `1h` `coldAfter` Freshness Countdown (`page-bridge.js`, `pricing.js`, `scanner.js`, `popup.js`, `popup.css`):**
  - Added `evaluateCacheFreshness()` transitioning through `warm`, `cooling`, and `cold` states in conversation rows (with focus-preserving in-place countdown updates) and inside the opt-in Shadow DOM composer capsule.
- **Optional Read-Only Local `magpie` Gateway Integration (`pricing.js`, `background.js`, `popup.html`, `sidepanel.html`, `popup.js`, `popup.css`):**
  - Added opt-in (`agyMagpieConfigV1.enabled = false` by default) loopback-only `GET` polling (`validateMagpieBaseUrl`, `credentials: 'omit'`, `redirect: 'error'`, `1800ms` timeout, `30s` session cache in `agyMagpieCacheV1`) rendering an isolated `#magpieLiveCard` inside `#usageDrawer` without ever mutating `agyUsageLedgerV1`.
- **282-Key 10-Locale Parity, Privacy Updates & Release Automation (`i18n.js`, `PRIVACY.md`, `scripts/verify.mjs`, `scripts/package.sh`, `.github/workflows/release.yml`):**
  - Expanded `i18n.js` from 161 to 282 canonical keys across all 10 locales with Service Worker `globalThis.__AGY_I18N__` support, updated `PRIVACY.md` and `scripts/verify.mjs` (including `pricing.js` sandbox & Magpie loopback validation), packaged `26` runtime files via `scripts/package.sh`, and added `.github/workflows/release.yml` for tag-triggered GitHub Releases.

---

## [2.9.0] — 5h Model Quota Pools, Context & Speed Telemetry, In-Page Capsule & Localhost Mode

### Added
- **5-Hour Model Quota Pool Overview (`popup.html`, `sidepanel.html`, `popup.css`, `popup.js`):** Added `#quotaStrip` displaying remaining 5h quota percentages and reset countdowns across `Gemini` and `Claude / GPT` (`premium`) pools using native `<progress class="quota-progress">` bars with Morandi 3A health coloring (`#5E9E8E`, `#C6A265`, `#C26C77`) and separate vendor pseudo-element rules.
- **Passive + Gated Read-Only Connect-RPC Telemetry (`page-bridge.js`):**
  - Extended the passive `fetch`/`XHR`/`WebSocket` observer (`ingestNetworkPayload()`) and React Fiber/Query/Store scanner to capture `userStatus`, `clientModelConfigs`, `trajectorySummaries`, step summaries (FIFO capped at 40 conversations), and live streaming `tok/s` speed.
  - Added gated same-origin read-only Connect-RPC (`maybeRefreshLsRpc` for `GetUserStatus`, `GetAllCascadeTrajectories`, and incremental `GetCascadeTrajectorySteps`) active strictly when `document.hidden !== true` and `window.__APP_CONFIG__?.csrfToken` or `/exa.language_server_pb.LanguageServerService/` traffic is observed.
  - Implemented `analyzeConversationSteps()` with shadow/subagent/image model filtering (`M50`, `FLASH_LITE`, `M21`, `IMAGE`, `BANANA`), dynamic context limits, snapshot + tail-delta precision (`'exact'` vs `'estimated'` without fabricating prompt cache hit ratios), and auto-compaction drop detection (`> 5000` tokens).
- **Per-Chat Context, Speed & Compaction Badges (`popup.js`, `popup.css`):** Displays formatted token usage (`~?used/limit (pct%)`), live `tok/s` chips, auto-compaction drop chips (`-drop%`), and exact Cache/In/Out/Hit% breakdown tooltips when `precision === 'exact'`.
- **Optional Isolated Shadow DOM Composer Capsule (`scanner.js`, `content.js`, `frame-detector.js`):** Added an opt-in (`showInPageCapsule: false` by default) capsule mounted inside `.agy-composer-footer` using `attachShadow({ mode: 'open' })`, `WeakMap`-backed state (zero DOM expandos, zero `innerHTML`, zero `localStorage`), `tabular-nums`, `prefers-reduced-motion`, `forced-colors`, and a WCAG 1.4.13 hover/focus/Escape tooltip.
- **Opt-In Localhost Desktop Webview Support (`manifest.json`, `background.js`, `popup.js`, `page-bridge.js`, `scanner.js`, `i18n.js`):** Added `"scripting"` permission and `optional_host_permissions` (`["http://localhost/*", "http://127.0.0.1/*"]`) triggered synchronously via `#localhostAccessBtn`, dynamic script registration/injection (`syncLocalhostContentScripts()`, `SYNC_LOCALHOST_SCRIPTS`), and verified host probing (`isVerifiedLocalAntigravity()` / `data-agy-local-host`) so non-Antigravity local servers remain untouched.
- **New `chrome.storage.sync` Settings:** Added `showQuotaMetrics` (`true`), `showContextMetrics` (`true`), and `showInPageCapsule` (`false`).
- **161-Key 10-Locale Parity (`i18n.js`, `scripts/verify.mjs`):** Expanded `i18n.js` from 129 to 161 canonical keys across all 10 locales, updated `i18n.js` host guard for `http://localhost` / `http://127.0.0.1` and local `ancestorOrigins`, and updated `scripts/verify.mjs` to enforce `"scripting"`, `optional_host_permissions`, `161`-key parity, and localhost host-guard sandbox tests.

---

## [2.8.0] — Cross-Tab Global Panel & Persistent Side Panel

### Added
- **Chrome Side Panel (`sidepanel.html`):** Added a full-height, responsive Chrome Side Panel sharing `popup.css`, `i18n.js`, and `popup.js` with container queries (`container: panel / inline-size`), `100dvh` layout scaling, and zero first-frame layout shift.
- **Launch Side Panel Anytime + Configurable Toolbar Click (`actionClickMode`):** Added a header action button (`#openSidePanelBtn`) that calls `chrome.sidePanel.open()` synchronously on user gesture, plus an `actionClickMode` (`popup` / `sidepanel`) setting synced via `chrome.storage.sync` and `chrome.sidePanel.setPanelBehavior()` + `chrome.action.setPopup()`.
- **Global Cross-Tab Discovery & Multi-Instance Switcher (`popup.js`):** Discovers all open Antigravity tabs across all browser windows even while browsing unrelated websites—using existing Antigravity `host_permissions` with **zero** `"tabs"` or `"<all_urls>"` permission expansion. Supports single-instance connected banner + tab switcher and multi-instance `All (N)` aggregation / per-tab capsule switcher.
- **One-Click Cross-Tab Activation & Workspace Labels (`content.js`, `popup.js`):** Clicking any project or conversation focuses it in Antigravity and activates its browser tab and window (`chrome.tabs.update` + `chrome.windows.update`), closing the popup automatically while keeping the Side Panel docked.
- **Global Session-Backed Toolbar Badge (`background.js`):** Aggregates `waiting + unread` counts across all live Antigravity tabs via in-memory `chrome.storage.session` and clears badges automatically on tab close or `pagehide` (`TOP_FRAME_UNLOAD`).
- **129-Key 10-Locale Parity:** Expanded `i18n.js` from 118 to 129 keys across all 10 locales and refreshed `_locales/*/messages.json` descriptions (all `<= 132` chars).

---

## [2.7.0] — Open-Source & Store Readiness

### Added
- **2 Native Google Light Themes:** Added `antigravity` (workspace rounded-squircle icons matching `antigravity.google.com`) and `gemini` (4-pointed concave sparkle with orbital thinking ring matching `gemini.google.com/app`) across `running`, `unread`, and `waiting` states.
- **2x3 Popup Style Picker:** Expanded the popup theme selector into a symmetric 2-row × 3-column grid featuring live synchronized miniature SVG/Canvas previews for all 6 themes.
- **118-Key 10-Locale Parity:** Added localized theme labels and tooltips for `antigravity` and `gemini` across all 10 supported locales (`en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`).
- **Open-Source Governance & Automation:** Added MIT `LICENSE`, `PRIVACY.md`, `CHROMEWEBSTORE.md`, `scripts/verify.mjs` verification suite, `scripts/package.sh` clean runtime bundler, and GitHub Actions CI workflow (`.github/workflows/ci.yml`).

### Security & Hardening
- Tightened `manifest.json` `content_scripts` injection scope from `"<all_urls>"` to strict Antigravity origins (`https://antigravity.google(.com)/*` and subdomains) plus embedded workspace iframe hosts (`https://*.usercontent.goog/*`, verified via `location.ancestorOrigins` in every `all_frames: true` script), removing broad-host install permission warnings while keeping isolated workspace frames working.
- Added Antigravity origin / `ancestorOrigins` fast-exit guard in `i18n.js` while keeping extension popup and test sandboxes compatible.
- Validated target origins and `event.source` / `event.origin` on cross-frame `postMessage` relays in `content.js` and `frame-detector.js` (eliminating wildcard `'*'` broadcasts).
- Restricted `FETCH_FAVICON_PIXELS` in `background.js` to content-script senders (`sender.tab.id`), validated Antigravity/`gstatic.com`/`data:image/` URLs, and clamped decode dimensions to `[16, 256]`.
- Added FIFO cap (`MAX_NET_CACHE_ENTRIES = 1000`) to passive network maps in `page-bridge.js` and a re-entrancy guard plus `chrome.runtime.lastError` handling in `popup.js`.
- Fixed fallback `taskTracker` state initialization in `markAllTasksAsRead()` (`stickyWaiting`, `stickyWaitingReason`, `wasDomUnread`).

### Fixed
- **Isolated `*.usercontent.goog` Workspace Iframe Support & Popup Tab Query Fallback:** Added `https://*.usercontent.goog/*` child-frame injection (ancestor-origin verified), cross-origin `postMessage` origin & mounted-iframe checks in `content.js` / `frame-detector.js`, background-tab `childFrames` retention + proactive frame sync (`PING_CHILD_FRAMES`), throwing-Proxy/`WindowProxy` Fiber traversal guards in `page-bridge.js`, and `GET_STATUS`-first handling in `popup.js` when `tab.url` is omitted without `"tabs"` permission.
- **Sticky `waiting` Retention Across Background Snapshot Refreshes:** Added `stepsCount` / `messagesCount` progression fingerprinting in `page-bridge.js` and removed background `confirmedRunning` clearing in `content.js` so background tasks stay `waiting` until viewed or completed.

---

## [2.6.0] — Pure Tab Status Lights & 10-Locale i18n

### Added
- **Indicator-Only Tab Presentation:** Removed status text suffixes from `document.title` (and auto-stripped legacy v2.5 suffixes), focusing solely on crisp 64x64 Canvas status lights (`glow`, `claude`, `geek`, `emoji`) and `standalone` / `badge` (`standard` & `large`) mount modes.
- **Multi-World React Memory Bridge (`page-bridge.js`):** Added MV3 `world: "MAIN"` Fiber/QueryCache/Store & passive network stream observer with a 500ms cache for collapsed and expanded workspaces.
- **Automatic 10-Language Localization (`i18n.js` + `_locales/`):** Full translation of popup UI, scan reasons, and extension metadata across 10 languages, plus accessibility support (`prefers-reduced-motion`, `forced-colors`, `prefers-contrast`).
