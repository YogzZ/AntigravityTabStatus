**English** | [简体中文](./README.zh-CN.md)

# Antigravity Tab Status (`v2.7.0`)

A lightweight, privacy-first **Manifest V3** browser extension (Chrome / Edge / Arc / Brave) that monitors every project and conversation in your active [Google Antigravity](https://antigravity.google.com/) instance—including collapsed projects—and surfaces real-time status through **crisp status lights directly on your browser tab favicon**.

---

## Key Features (`v2.7.0`)

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
- **Zero-Click React Memory Bridge**
  - `page-bridge.js` runs in MV3 `world: "MAIN"` with a **500ms cache** to read collapsed and expanded projects from React 18/19 Fiber, TanStack QueryCache, Zustand/Redux stores, and passive network streams (`< 0.1ms` on cached bursts, zero sidebar flicker).
  - Click any conversation inside the popup—even inside a collapsed project—to auto-expand and jump directly to it.
- **Zero CSP Violations & Privacy First**
  - **No Blob Workers**, no `eval()`, and no remote telemetry or analytics.
  - Background timers and `OffscreenCanvas` favicon decoding run inside the extension Service Worker (`background.js`).
  - Requests only the `storage` permission plus host permissions scoped to Antigravity domains and `gstatic.com` favicons.

---

## Installation & Upgrade (Unpacked Extension)

1. Download or clone this repository (or extract the release archive into a folder; when upgrading, extract over the existing folder).
2. Open `chrome://extensions/` (Chrome / Arc / Brave) or `edge://extensions/` (Microsoft Edge) and enable **Developer mode**.
3. **First-time install:** Click **Load unpacked** and select the project directory containing `manifest.json`.
   **Upgrading from an older version:** Click the **Reload (↻)** button on the **Antigravity Tab Status** card (and clear any old entries in the **Errors** tab if shown).
4. **Refresh any open `https://antigravity.google.com/` tabs once** so the updated scripts attach cleanly.

> **Browser Requirement:** Chromium 120+ (required for MV3 `world: "MAIN"`, `OffscreenCanvas`, CSS `light-dark()`, `@layer`, and `details::details-content`).

---

## Architecture Overview

```text
Antigravity Page (MAIN world)
  └─ page-bridge.js ──(500ms cache + Fiber/QueryCache/Stream read)──┐
                                                                    ▼
Antigravity Page & Iframes (ISOLATED world)
  ├─ i18n.js ──► scanner.js ──► frame-detector.js (child iframes) ──┼──► background.js (SW)
  └─ i18n.js ──► scanner.js ──► content.js (top frame aggregator) ◄─┘    ├─ agy-timer Port
                                    │                                    ├─ OffscreenCanvas favicon decode
                                    ▼                                    └─ chrome.action badge + relays
                      64x64 Canvas Tab Status Light
                                    ▲
                                    │ (chrome.storage.sync + runtime messaging)
                      popup.html / popup.css / popup.js
```

---

## Project Structure

| File / Directory | Purpose |
| :--- | :--- |
| `manifest.json` | Manifest V3 configuration (`v2.7.0`), `default_locale: "en"`, scoped `host_permissions`, `MAIN` & `ISOLATED` content scripts |
| `background.js` | MV3 Service Worker: `agy-timer` Port timers, `OffscreenCanvas` favicon pixel decoder, toolbar badge updates, and frame message relays |
| `page-bridge.js` | `world: "MAIN"` React 18/19 Fiber, store, and passive network observer with 500ms cache |
| `i18n.js` | Browser-language auto-detector and 10-locale dictionary (`window.__AGY_I18N__`) for popup, scanner, and content reasons |
| `scanner.js` | Unified sidebar & active-pane scanner merging DOM, memory bridge snapshots, and collapsed-project caches |
| `content.js` | Top-frame global priority engine, 64x64 Canvas renderer (6 styles × 2 layouts), legacy title suffix cleaner, and Port animation driver |
| `frame-detector.js` | Child-iframe workspace scanner reporting updates to the top frame |
| `popup.html` / `popup.css` / `popup.js` | Accessible light/dark popup UI with live project/conversation list, 2x3 style picker, mount layout toggle, preview mode, and custom selector diagnostics |
| `_locales/` | Chrome extension localization files (`en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`) |
| `icons/` | Extension icons (`16x16`, `32x32`, `48x48`, `128x128`) |
| `AGENTS.md` | Contributor & AI agent engineering guidelines, Browser Support Policy, CSP rules, and verification commands |
| `PLAN.md` | v2.6.0–v2.7.0 architectural breakdown and open-source roadmap |
| `.gitignore` | Git ignore rules for OS metadata, build packages, dependencies, and editor files |

---

## Contributing

Contributions are welcome! Before making changes:

1. Read [AGENTS.md](./AGENTS.md) for the **Browser Support Policy**, Manifest V3 / CSP constraints, 10-locale i18n parity rules, and local verification commands.
2. Check [PLAN.md](./PLAN.md) to align with upcoming milestones (`M2` CI & tests, `M3` Chrome Web Store & Edge Add-ons readiness, `M4` community polish).
3. Run syntax, manifest/locale JSON, and i18n key-parity checks before opening a pull request.
