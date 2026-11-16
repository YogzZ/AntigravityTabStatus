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

- Project names, conversation titles, task activity state (`running`, `unread`, `waiting`, `idle`), 5-hour model quota pool metadata, context token counts, streaming `tok/s` speed, and auto-compaction indicators held in temporary in-memory structures within active Antigravity browser tabs (bounded to 40 conversation step-summary entries and an in-memory `WeakMap` for the optional Shadow DOM capsule), plus ephemeral per-tab badge counts (`agyTabBadges`: `{ count, hasWaiting, updatedAt }`) kept in memory-only `chrome.storage.session` to compute the global browser toolbar badge across tabs.
- When the tab is active/visible and Antigravity's own same-origin `LanguageServerService` endpoint or `csrfToken` is already present in the page, `page-bridge.js` may perform read-only same-origin Connect-RPC `POST` calls (`credentials: 'same-origin'`) exclusively back to that active tab's own origin (`GetUserStatus`, `GetAllCascadeTrajectories`, `GetCascadeTrajectorySteps`) to retrieve quota and token metadata.
- This runtime state is used exclusively to draw the tab favicon status indicator, update the global toolbar badge count (`waiting + unread`), list tasks and telemetry metrics inside the popup menu and Chrome Side Panel, and render the optional in-page Shadow DOM capsule when enabled by the user.
- Workspace state, telemetry metrics, and conversation content are **never** persisted to disk (zero `localStorage` usage) and **never** transmitted to any external server. Using the extension's optional "Copy diagnostics" button writes a sanitized JSON snapshot only to your local system clipboard upon your explicit click.

---

## 3. Stored Preferences (`chrome.storage.sync`)

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
- `customWaitingSelector` / `customRunningSelector` (strings): optional custom CSS selectors entered by you

---

## 4. Permissions & Network Access

- **`storage` permission:** Used solely to store the local preference keys listed above via `chrome.storage.sync`, plus the temporary in-memory toolbar badge map in `chrome.storage.session`.
- **`sidePanel` permission:** Used solely to render the extension's persistent Side Panel view (`sidepanel.html`), open it via the popup header button (`chrome.sidePanel.open()`), and honor the user's `actionClickMode` preference (`chrome.sidePanel.setPanelBehavior()`).
- **`scripting` permission:** Used strictly together with `optional_host_permissions` (`http://localhost/*`, `http://127.0.0.1/*`) to dynamically register and inject the extension's bundled scripts (`chrome.scripting.registerContentScripts` / `chrome.scripting.executeScript`) onto user-authorized local desktop Antigravity webviews when the user explicitly clicks **Enable** (`chrome.permissions.request()`), and to unregister them upon revocation.
- **Host permissions (`https://antigravity.google.com/*`, `https://*.antigravity.google.com/*`, `https://antigravity.google/*`, `https://*.antigravity.google/*`, `https://*.usercontent.goog/*`):** Strictly scoped to Antigravity top-level origins and Antigravity's isolated workspace iframes (`*.usercontent.goog`, where every `all_frames: true` script verifies `location.ancestorOrigins` before running and exits immediately on unrelated sites). Because host permissions already match Antigravity tabs, Chrome exposes URL/title metadata exclusively for Antigravity tabs without requesting the broad `"tabs"` or `"<all_urls>"` permissions.
- **Optional Host Permissions (`http://localhost/*`, `http://127.0.0.1/*`):** Not requested or granted at install time. Requested only on explicit user action for monitoring local Antigravity desktop webviews, and revocable at any time via **Revoke** (`chrome.permissions.remove()`). Even when granted, scripts verify Antigravity host markers (`window.__APP_CONFIG__?.csrfToken` or composer controls) and remain completely inert without patching `fetch`/`XHR`/`WebSocket` on unrelated local dev servers.
- **Host permission (`https://*.gstatic.com/*`):** Used solely by the extension Service Worker to decode Google-hosted site favicons into pixels when compositing corner badges without violating page CSP rules.
- **Zero Remote Calls:** The extension makes zero requests to any developer-controlled server, analytics endpoint, crash reporter, or third-party tracking service. Optional read-only Connect-RPC metadata queries communicate strictly with the open Antigravity tab's own same-origin `LanguageServerService` endpoint (`credentials: 'same-origin'`).

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
