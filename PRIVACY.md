# Privacy Policy — Antigravity Tab Status

**Effective Date:** 2026-11-16
**Extension:** Antigravity Tab Status (`v2.9.0`)
**Repository:** [https://github.com/YogzZ/AntigravityTabStatus](https://github.com/YogzZ/AntigravityTabStatus)

---

## 1. Summary

**Antigravity Tab Status** does **not** collect, transmit, sell, or share any personal data, conversation content, source code, browsing history, telemetry, or analytics. All workspace status detection, rendering, and preference management occur strictly locally in your browser.

---

## 2. Information Processed Locally

To display live status lights on your Antigravity browser tabs and inside the extension popup, the extension reads only the active state of workspace conversations inside pages matching `antigravity.google` and `antigravity.google.com` (and their subdomains), embedded Antigravity workspace iframes (`*.usercontent.goog` verified via `location.ancestorOrigins` to have an Antigravity top-level ancestor), as well as local desktop Antigravity webviews on `http://localhost/*` or `http://127.0.0.1/*` **only if explicitly authorized by you** (and strictly verified via Antigravity host markers so unrelated local servers remain completely untouched):

- Project names, conversation titles, task activity state (`running`, `unread`, `waiting`, `idle`), 5-hour model quota pool metadata, context token counts, streaming `tok/s` speed, auto-compaction indicators, and in-memory step completion timestamps (`lastStepTs`) used locally to compute `5m`/`1h` prompt-cache freshness countdowns (`coldAfter`) held in temporary in-memory structures within active Antigravity browser tabs (bounded to 40 conversation step-summary entries and an in-memory `WeakMap` for the optional Shadow DOM capsule), plus ephemeral per-tab badge counts (`agyTabBadges`: `{ count, hasWaiting, updatedAt }`) kept in memory-only `chrome.storage.session` to compute the global browser toolbar badge across tabs.
- When the tab is active/visible and Antigravity's own same-origin `LanguageServerService` endpoint or `csrfToken` is already present in the page, `page-bridge.js` may perform read-only same-origin Connect-RPC `POST` calls (`credentials: 'same-origin'`) exclusively back to that active tab's own origin (`GetUserStatus`, `GetAllCascadeTrajectories`, `GetCascadeTrajectorySteps`) to retrieve quota and token metadata.
- This runtime state is used exclusively to draw the tab favicon status indicator, update the global toolbar badge count (`waiting + unread`), list tasks and telemetry metrics inside the popup menu and Chrome Side Panel, and render the optional in-page Shadow DOM capsule when enabled by the user.
- Workspace state, conversation prompts, assistant responses, source code, and full local directory paths are **never** persisted to disk (zero `localStorage` usage) and **never** transmitted to any external server. Using the extension's optional **Export JSON / Export CSV** buttons saves an aggregated local report strictly to your own device, and clicking **Copy diagnostics** copies a sanitized JSON snapshot strictly to your local system clipboard.

---

## 3. Local Browser Storage

### 3.1 Synced UI Preferences (`chrome.storage.sync`)

When you change extension settings in the popup, only your non-personal UI preferences are saved using your browser's built-in `chrome.storage.sync` API (synced across your own signed-in browser profile by Google Chrome / Chromium if browser sync is enabled):

- `enabled` (boolean): master enable/disable switch
- `indicatorStyle` (string): selected tab light style (`antigravity`, `gemini`, `glow`, `claude`, `geek`, `emoji`)
- `iconLayout` (string): display layout (`standalone` or `badge`)
- `badgeSize` (string): corner badge size (`standard` or `large`)
- `actionClickMode` (string): toolbar click action (`popup` or `sidepanel`)
- `autoProbeCollapsed` (boolean): optional auto-sync toggle for collapsed projects
- `showQuotaMetrics` (boolean): show 5-hour model quota pools in the popup and Side Panel (default `true`)
- `showContextMetrics` (boolean): show per-chat context token usage, `tok/s`, and auto-compaction indicators in the panel (default `true`)
- `showInPageCapsule` (boolean): opt-in toggle to mount the isolated Shadow DOM composer capsule in the page (default `false`)
- `quotaNotifications` (boolean): opt-in toggle for local desktop 5-hour quota recovery and pre-reset reminders (default `false`; requires optional browser `notifications` permission)
- `customWaitingSelector` / `customRunningSelector` (strings): optional custom CSS selectors entered by you

### 3.2 On-Device Usage Ledger, Pricing, Notification Dedup & Local Magpie Config (`chrome.storage.local` & `chrome.storage.session`)

- **`agyUsageLedgerV1` (`chrome.storage.local` — device-local only, never synced to Chrome Sync or remote servers):**
  - Stores **aggregated numeric counters and non-sensitive metadata only**: local calendar date keys (`YYYY-MM-DD`), 24-hour token arrays (`hourlyTokens`), canonical model IDs/labels, token sub-buckets (`in`, `cr`, `cw`, `cw5m`, `cw1h`, `out`, `rs`, `calls`, and observed step latency sums), sanitized project folder basenames (never full filesystem paths), and high-watermark deduplication cursors (`watermarks`, capped at `300` recent conversation IDs).
  - **Zero prompt/output text:** Never records user prompts, model replies, tool arguments, code snippets, or URLs.
  - **Automatic 90-day retention & `< 250 KB` cap:** Automatically prunes daily buckets older than `90` local calendar days and enforces a `< 250 KB` ceiling.
  - **User export & one-click deletion:** You can export aggregated daily records as JSON or CSV or click **Clear History** inside the **Token Usage & Cost** drawer at any time to immediately wipe `agyUsageLedgerV1`.
- **`agyPricingConfigV1` (`chrome.storage.local`):**
  - Stores display currency (`USD` or `CNY`), offline `usdToCnyRate`, and optional user-entered per-model `/ 1M` token rate overrides. All model pricing is computed 100% offline from a static built-in table with zero external requests.
- **`agyNotifStateV1` (`chrome.storage.local`):**
  - Stores only non-personal 5-hour pool fractions, reset timestamps, and per-cycle notification watermarks (`gemini`, `premium`, `< 2 KB`) so MV3 Service Worker sleep/wake cycles and multiple tabs never emit duplicate desktop notifications.
- **`agyMagpieConfigV1` (`chrome.storage.local`) & `agyMagpieCacheV1` (`chrome.storage.session`):**
  - Stores the opt-in `enabled` flag (default `false`) and validated loopback origin (default `http://127.0.0.1:3425`), plus a memory-only 30-second read-only response cache cleared when the browser closes. Read-only Magpie summaries are never written into `agyUsageLedgerV1` and never leave the device.

---

## 4. Permissions & Network Access

- **`storage` permission:** Used solely to store the local UI preference keys listed above via `chrome.storage.sync`, the temporary in-memory toolbar badge map and 30-second Magpie read-only cache in `chrome.storage.session`, and the on-device 90-day aggregated token usage ledger (`agyUsageLedgerV1`), offline pricing overrides (`agyPricingConfigV1`), notification deduplication state (`agyNotifStateV1`), and opt-in Magpie config (`agyMagpieConfigV1`) in `chrome.storage.local`.
- **Optional permission (`notifications`):** Not granted at install time. Requested strictly on explicit user click when enabling **Quota desktop alerts** (`chrome.permissions.request({ permissions: ['notifications'] })`), used solely to display local system notifications when a depleted 5-hour quota pool recovers or when unused quota is about to reset, and revocable anytime via **Disable** (`chrome.permissions.remove()`).
- **`sidePanel` permission:** Used solely to render the extension's persistent Side Panel view (`sidepanel.html`), open it via the popup header button (`chrome.sidePanel.open()`), and honor the user's `actionClickMode` preference (`chrome.sidePanel.setPanelBehavior()`).
- **`scripting` permission:** Used strictly together with `optional_host_permissions` (`http://localhost/*`, `http://127.0.0.1/*`) to dynamically register and inject the extension's bundled scripts (`chrome.scripting.registerContentScripts` / `chrome.scripting.executeScript`) onto user-authorized local desktop Antigravity webviews when the user explicitly clicks **Enable** (`chrome.permissions.request()`), and to unregister them upon revocation.
- **Host permissions (`https://antigravity.google.com/*`, `https://*.antigravity.google.com/*`, `https://antigravity.google/*`, `https://*.antigravity.google/*`, `https://*.usercontent.goog/*`):** Strictly scoped to Antigravity top-level origins and Antigravity's isolated workspace iframes (`*.usercontent.goog`, where every `all_frames: true` script verifies `location.ancestorOrigins` before running and exits immediately on unrelated sites). Because host permissions already match Antigravity tabs, Chrome exposes URL/title metadata exclusively for Antigravity tabs without requesting the broad `"tabs"` or `"<all_urls>"` permissions.
- **Optional Host Permissions (`http://localhost/*`, `http://127.0.0.1/*`):** Not requested or granted at install time. Requested only on explicit user action for monitoring local Antigravity desktop webviews or polling the user's opt-in local Magpie gateway, and revocable at any time via **Revoke** (`chrome.permissions.remove()`). Even when granted, scripts verify Antigravity host markers (`window.__APP_CONFIG__?.csrfToken` or composer controls) and remain completely inert without patching `fetch`/`XHR`/`WebSocket` on unrelated local dev servers.
- **Host permission (`https://*.gstatic.com/*`):** Used solely by the extension Service Worker to decode Google-hosted site favicons into pixels when compositing corner badges without violating page CSP rules.
- **Zero Remote Calls:** The extension makes zero requests to any developer-controlled server, analytics endpoint, crash reporter, or third-party tracking service. Optional read-only Connect-RPC metadata queries communicate strictly with the open Antigravity tab's own same-origin `LanguageServerService` endpoint (`credentials: 'same-origin'`). When the user explicitly enables the optional **Local Magpie Gateway** view, the Service Worker performs read-only `GET` requests (`credentials: 'omit'`, `redirect: 'error'`, `1.8s` timeout, `30s` throttle) strictly to the validated loopback origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`) on `/v1/magpie/usage` and `/v1/magpie/quotas`. Zero external or non-loopback network calls are ever made.

---

## 5. Third-Party Services & Data Sharing

The extension does **not** transfer data to third parties, does **not** use third-party analytics or advertising SDKs, and does **not** include remote executable code.

---

## 6. Children's Privacy

Because Antigravity Tab Status collects no personal information from anyone, it does not knowingly collect personal information from children under 13 (or the applicable age of digital consent in your jurisdiction).

---

## 7. Changes & Contact

Updates to this Privacy Policy will be published in this file and reflected in repository releases. If you have questions or privacy concerns, please open an issue on GitHub:

- **Support & Privacy Inquiries:** [https://github.com/YogzZ/AntigravityTabStatus/issues](https://github.com/YogzZ/AntigravityTabStatus/issues)
