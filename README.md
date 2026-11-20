**English** | [简体中文](./README.zh-CN.md)

# Antigravity Tab Status (`v2.10.0`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34a853.svg)](./manifest.json)
[![Chromium 120+](https://img.shields.io/badge/Chromium-120%2B-4285f4.svg)](./AGENTS.md)
[![Locales: 10](https://img.shields.io/badge/Locales-10-8ab4f8.svg)](./_locales)
[![CI](https://github.com/YogzZ/AntigravityTabStatus/actions/workflows/ci.yml/badge.svg)](https://github.com/YogzZ/AntigravityTabStatus/actions/workflows/ci.yml)

A lightweight, privacy-first **Manifest V3** browser extension (Chrome / Edge / Arc / Brave) that monitors every project and conversation in your active [Google Antigravity](https://antigravity.google.com/) instance—including collapsed projects—and surfaces real-time status through **crisp status lights directly on your browser tab favicon**.

---

## Key Features (`v2.10.0`)

- **On-Device Token Ledger, Offline Pricing & Usage Analytics Drawer**
  - **Deduplicated Usage Ledger (`agyUsageLedgerV1`):** Tracks cumulative input, output, reasoning, and tiered `5m`/`1h` prompt-cache tokens locally in `chrome.storage.local` (300-conversation high-watermark deduplication, 90-day retention, `< 250 KB` cap, zero prompt or reply text ever stored).
  - **100% Offline Pricing Engine (`pricing.js`):** Computes equivalent API cost and prompt-cache savings in `USD` or `CNY` with editable per-model `/ 1M` rate overrides (`agyPricingConfigV1`).
  - **Collapsible Analytics Drawer (`#usageDrawer`):** Inspect `Today | 7d | 30d` KPIs, SVG trend charts, a 28-day activity heatmap, Top Models/Projects breakdowns, safe JSON/CSV export, and 2-step `Clear History`.
- **5-Hour Model Quota Pools, Pace/ETA, Context Telemetry & Cache Freshness**
  - **5h Quota Pool Strip & Optional Desktop Alerts:** Displays remaining quota percentages, reset countdowns, burn-rate `Pace` badges, depletion `ETA`, and pre-reset spare-quota hints across `Gemini` and `Claude / GPT` pools. Optionally enable **Quota desktop alerts** (`optional_permissions: ["notifications"]`, off by default) for local allowance-recovery and pre-reset reminders.
  - **Per-Chat Context, Speed & `coldAfter` Countdown:** Surfaces context token usage (`used/limit, pct%`), live streaming `tok/s`, auto-compaction drop chips (`-drop%`), `5m`/`1h` prompt-cache `coldAfter` freshness countdowns (`warm` / `cooling` / `cold`), and exact Cache / In / Out / Hit% + session cost tooltips.
  - **Optional In-Page Composer Capsule (Off by Default):** Enable **Show in-page composer capsule** in settings (`showInPageCapsule`) to mount an isolated Shadow DOM usage pill (`WeakMap`-backed, zero `innerHTML`/`localStorage`, WCAG 1.4.13 hover/keyboard/Escape tooltip) next to Antigravity's composer controls.
- **Opt-In Localhost Desktop Webview & Optional Local Magpie Gateway**
  - Click **Enable** next to **Local Antigravity (localhost)** in settings to grant optional `http://localhost/*` and `http://127.0.0.1/*` access on demand (`optional_host_permissions` + `scripting`), revocable anytime. Even when enabled, scripts verify Antigravity host markers (`isVerifiedLocalAntigravity()`) and stay completely inert on unrelated local dev servers.
  - Optionally enable the read-only **Local Magpie Gateway** card (`agyMagpieConfigV1`, default off) inside the Usage drawer to poll a validated local loopback endpoint (`http://127.0.0.1:<port>` / `http://localhost:<port>`) without mixing data into the Antigravity usage ledger.

- **Cross-Tab Global Panel & Persistent Chrome Side Panel**
  - **Monitor from Any Webpage:** Click the toolbar icon on *any* website to view live Antigravity workspaces, projects, conversations, and global Waiting/Unread badge counts—no need to switch back to check progress.
  - **Persistent Side Panel Anytime (`sidepanel.html`):** Click the Side Panel icon in the popup header to dock the live dashboard on Chrome's right edge while browsing elsewhere, or configure **Toolbar Click Opens -> Side Panel** in settings.
  - **Multi-Instance Aggregation & Instant Tab Jump:** Switch between `All (N)` combined view and individual Antigravity tabs, or click any conversation to activate its tab/window and jump straight to it.
- **Pure Status Lights (Zero Tab Title Clutter)**
  - Keeps your browser tab titles clean—**no status text** (`Waiting`, `Unread`, `Running`, etc.) is ever appended to `document.title`, and any legacy suffixes are automatically stripped.
  - Strictly follows global priority:
    1. **`waiting` (Priority 1A):** Agent needs approval or user input
    2. **`unread` (Priority 1B):** Newly completed / unread response (prioritized even while other tasks are still running)
    3. **`running` (Priority 2):** Agent is actively working (with `1.5s` step-completion debounce)
    4. **`idle` (Default):** Automatically restores the original site favicon and clears the toolbar badge
- **6 Selectable Light Styles & 2 Mount Modes**
  - **6 Themes (`indicatorStyle`):** Choose between two native Google first-party styles (`antigravity`, `gemini`) and four expressive themes (`glow`, `claude`, `geek`, `emoji`):

| Style (`indicatorStyle`) | Visual Language | `running` (Working) | `unread` (Completed) | `waiting` (Needs Input) |
| :--- | :--- | :--- | :--- | :--- |
| **`antigravity`** | Native [`antigravity.google.com`](https://antigravity.google.com/) workspace squircle icons | Blue `progress_activity` arc + centered stop square | `mark_chat_unread` chat bubble + emerald unread dot | Warm amber `notifications_active` ringing bell |
| **`gemini`** | Native [`gemini.google.com/app`](https://gemini.google.com/app) 4-pointed concave sparkle | Google-gradient orbital thinking ring + breathing sparkle | Resting 4-pointed sparkle + green unread dot | Warm amber-coral sparkle + `!` attention badge |
| **`glow`** *(Default)* | Luminous pearl/glass LED orb with high-contrast rim | Sky-cyan breathing orb | Emerald-mint steady orb | Warm coral-amber pulsing orb |
| **`claude`** | Warm terracotta starburst & sage sparkle | Rotating 8-spoke terracotta starburst | Sage-emerald 6-point sparkle | Warm coral/amber pulsing starburst |
| **`geek`** | Obsidian CRT keycap with neon phosphor glyphs | Cyan `>_` / quadrant spinner | Matrix green `[✓]` prompt | Blinking amber/red `[!]` prompt |
| **`emoji`** | High-DPI color emoji over a soft contrast disc | Pulsing `⚡` bolt | Crisp `✅` checkmark | Gently swinging `🔔` bell |

  - **2 Mount Modes (`iconLayout`):**
    - **Standalone Light (`standalone`, Default):** Clean full-canvas status light on the tab icon
    - **Corner Badge (`badge`):** Overlays the status light in the corner of the original Antigravity favicon (`standard` or `large` size)
  - Respects `prefers-reduced-motion: reduce` (renders static frame `0`) and keeps waiting pulses `< 3` flashes/sec.
- **Automatic 10-Language Support**
  - Automatically adapts the popup, status reasons, and extension manifest metadata to your browser UI language across **10 locales**:
    `en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`.
- **Zero-Click React Memory Bridge & Gated Same-Origin Telemetry**
  - `page-bridge.js` runs in MV3 `world: "MAIN"` with a **500ms cache** to read collapsed and expanded projects, quota info, and context usage from React 18/19 Fiber, TanStack QueryCache, Zustand/Redux stores, and passive network streams (`< 0.1ms` on cached bursts, zero sidebar flicker). When the tab is visible and Antigravity's same-origin `LanguageServerService` endpoint or `csrfToken` is observed, read-only same-origin Connect-RPC queries (`GetUserStatus`, `GetAllCascadeTrajectories`, incremental `GetCascadeTrajectorySteps`) supplement live telemetry.
  - Click any conversation inside the popup—even inside a collapsed project—to auto-expand and jump directly to it.
- **Zero CSP Violations & Privacy First**
  - **No Blob Workers**, no `eval()`, no `localStorage`, and no remote developer telemetry or analytics (see [Privacy Policy](./PRIVACY.md)).
  - Background timers and `OffscreenCanvas` favicon decoding run inside the extension Service Worker (`background.js`).
  - Requests only `storage`, `sidePanel`, and `scripting` permissions (never `tabs` or `<all_urls>`), with mandatory `content_scripts` and `host_permissions` scoped strictly to Antigravity origins (`antigravity.google` / `antigravity.google.com`), embedded workspace iframe hosts (`*.usercontent.goog`, verified via `location.ancestorOrigins`), and `gstatic.com` favicons, plus opt-in `optional_host_permissions` for `http://localhost/*` and `http://127.0.0.1/*`.

---

## Installation & Upgrade

### Option A: Download Pre-Built Release Archive (Recommended)

1. Download the latest `antigravity-tab-status-v*.zip` package from [GitHub Releases](https://github.com/YogzZ/AntigravityTabStatus/releases) and extract it to a permanent folder (when upgrading, overwrite that folder).
2. Open `chrome://extensions/` (Chrome / Arc / Brave) or `edge://extensions/` (Microsoft Edge) and enable **Developer mode**.
3. **First-time install:** Click **Load unpacked** and select the extracted folder containing `manifest.json`.
   **Upgrading from an older version:** Click **Reload (↻)** on the **Antigravity Tab Status** card (and clear any stale entries in the **Errors** tab if shown).
4. **Refresh any open `https://antigravity.google.com/` tabs once** so the updated scripts attach cleanly.

### Option B: Load or Package from Source

1. Clone this repository (`git clone https://github.com/YogzZ/AntigravityTabStatus.git`).
2. *(Optional)* Run verification and build a clean runtime-only archive (`dist/antigravity-tab-status-v2.10.0.zip`):
   ```bash
   node scripts/verify.mjs
   bash scripts/package.sh
   ```
3. Load either the cloned repository folder or the unpacked contents of `dist/` via **Load unpacked** in `chrome://extensions/`.

> **Browser Requirement:** Chromium 120+ (required for MV3 `world: "MAIN"`, `OffscreenCanvas`, CSS `light-dark()`, `@layer`, and `details::details-content`).

---

## Architecture Overview

```text
Antigravity Page / Verified Localhost (MAIN world)
  └─ page-bridge.js ──(500ms cache + Fiber/QueryCache/Stream + gated LS RPC)──┐
                                                                               ▼
Antigravity Page & Iframes (ISOLATED world)
  ├─ i18n.js ──► scanner.js ──► frame-detector.js (child iframes + capsule) ───┼──► background.js (SW)
  └─ i18n.js ──► scanner.js ──► content.js (top aggregator + Shadow capsule) ◄─┘    ├─ agy-timer Port + scripting
                                    │                                               ├─ OffscreenCanvas favicon decode
                                    ▼                                               └─ chrome.action badge + relays
                      64x64 Canvas Tab Status Light
                                    ▲
                                    │ (chrome.storage.sync/session + cross-tab runtime messaging)
                      popup.html / sidepanel.html / popup.css / popup.js
                      (5h Quota Strip + Context/tok/s + Localhost Permission Toggle)
```

---

## Project Structure

| File / Directory | Purpose |
| :--- | :--- |
| `manifest.json` | Manifest V3 configuration (`v2.10.0`), `default_locale: "en"`, `storage` + `sidePanel` + `scripting` permissions, opt-in `optional_permissions` (`notifications`) and `optional_host_permissions` (`localhost`/`127.0.0.1`), scoped `host_permissions`, `MAIN` & `ISOLATED` content scripts |
| `background.js` | MV3 Service Worker: `agy-timer` Port timers, `OffscreenCanvas` favicon pixel decoder, session-backed global toolbar badge aggregator, `actionClickMode` sync, serialized usage ledger & notification state persistence, opt-in localhost script registration/injection, read-only local Magpie poller, and frame relays |
| `pricing.js` | Universal offline pricing, currency (`USD`/`CNY`), deduplicated `agyUsageLedgerV1` helpers, prompt-cache `coldAfter` evaluator, quota notification state machine, and loopback Magpie URL validator (`globalThis.__AGY_PRICING__`) |
| `page-bridge.js` | `world: "MAIN"` React 18/19 Fiber, store, passive network observer (500ms cache, 40-conversation step summary cap), gated same-origin Connect-RPC, dual-track token/latency telemetry, and priced-step ledger delta harvester |
| `i18n.js` | Browser-language auto-detector and 282-key 10-locale dictionary (`globalThis.__AGY_I18N__`) supporting content scripts, UI pages, and the Service Worker with Antigravity & opt-in localhost host guard |
| `scanner.js` | Unified sidebar & active-pane scanner merging DOM, memory bridge snapshots/telemetry, collapsed-project caches, ledger delta harvesting, and opt-in isolated Shadow DOM composer capsule |
| `content.js` | Top-frame global priority & telemetry merger, 64x64 Canvas renderer (6 styles × 2 layouts), legacy title suffix cleaner, Shadow DOM capsule sync, and Port animation driver |
| `frame-detector.js` | Child-iframe workspace scanner relaying state, telemetry, ledger deltas, and Shadow DOM capsule updates |
| `popup.html` / `sidepanel.html` / `popup.css` / `popup.js` | Dual-surface light/dark UI (toolbar Popup + `100dvh` responsive Chrome Side Panel) with 5h quota Pace/ETA strip, per-chat context/tok/s/compaction/`coldAfter` chips, collapsible `#usageDrawer` analytics, cross-tab switcher, project/conversation jump list, 2x3 style picker, optional localhost/notification/Magpie controls, preview mode, and diagnostics |
| `_locales/` | Chrome extension localization files (`en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`) |
| `icons/` | Extension icons (`16x16`, `32x32`, `48x48`, `128x128`) |
| `AGENTS.md` | Contributor & AI agent engineering guidelines, Browser Support Policy, CSP rules, and verification commands |
| `PLAN.md` | v2.6.0–v2.9.0 architectural breakdown and open-source roadmap |
| `docs/` | P0/P1/P2 telemetry, ledger, pricing, notification, cache freshness, and Magpie technical specifications |
| `CHANGELOG.md` | Version history following Keep a Changelog format |
| `PRIVACY.md` | Privacy policy & `chrome.storage.sync` / `local` / `session` and permission disclosures |
| `CHROMEWEBSTORE.md` | Chrome Web Store & Edge Add-ons listing copy, permission justifications, and submission checklist |
| `LICENSE` | MIT License |
| `scripts/verify.mjs` | Zero-dependency Node verification suite (syntax, MV3 & optional permission/host scope, `_locales` & 282-key i18n parity, `pricing.js` sandbox & Magpie loopback matrix, CSP/security, PNG integrity, leak scan) |
| `scripts/package.sh` | Runs verification and builds a clean runtime-only `.zip` archive in `dist/` |
| `.github/workflows/ci.yml` | GitHub Actions CI workflow running verification, packaging, and archive artifact upload |
| `.github/workflows/release.yml` | GitHub Actions tag-triggered (`v*.*.*`) workflow verifying manifest version match and publishing GitHub Releases with `.zip` assets |
| `.gitignore` | Git ignore rules for OS metadata, build artifacts (`dist/`, `*.zip`, `*.crx`, `*.pem`), dependencies, and editor files |

---

## Verification & Packaging

Requires **Node.js 20+** (no `npm install` or external packages needed):

```bash
# Run syntax, manifest, 10-locale i18n, CSP/security, PNG, and leak checks
node scripts/verify.mjs

# Run all checks and build dist/antigravity-tab-status-v2.10.0.zip
bash scripts/package.sh
```

---

## Contributing

Contributions are welcome! Before making changes:

1. Read [AGENTS.md](./AGENTS.md) for the **Browser Support Policy**, Manifest V3 / CSP constraints, 10-locale i18n parity rules, and verification commands.
2. Check [PLAN.md](./PLAN.md) to align with upcoming milestones (`M3` store publishing, `M4` community polish).
3. Run `node scripts/verify.mjs` (and `bash scripts/package.sh` for release changes) before opening a pull request.

---

## License & Disclaimer

- Licensed under the [MIT License](./LICENSE).
- Privacy commitment detailed in [PRIVACY.md](./PRIVACY.md).
- **Disclaimer:** **Antigravity Tab Status** is an independent community open-source extension and is **not** affiliated with, endorsed by, or sponsored by Google LLC. "Google", "Antigravity", and "Gemini" are trademarks of Google LLC.
