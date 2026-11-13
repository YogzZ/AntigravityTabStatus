# PLAN.md — Architecture & Open-Source Roadmap

## 1. Project Vision

**Antigravity Tab Status** aims to make multi-project, multi-conversation work in [Google Antigravity](https://antigravity.google.com/) effortless across dozens of open browser tabs—without visual title clutter, page flicker, CSP errors, or privacy compromise.

Core design pillars:

1. **At-a-Glance Pure Status Lights:** Communicate task urgency (`waiting > unread > running > idle`) cleanly via tab favicons and toolbar badges, leaving `document.title` completely untouched.
2. **Zero-Click Memory Accuracy:** Read collapsed and expanded projects directly from React 18/19 Fiber trees, TanStack Query caches, Zustand/Redux stores, and passive network streams in `world: "MAIN"` without expanding/collapsing sidebar accordions.
3. **Strict CSP & Privacy Compliance:** Zero Blob Workers, zero `eval()`, zero remote analytics, and minimal MV3 permissions (`storage` + scoped Antigravity host permissions).
4. **Global Accessibility & Localization:** Automatic 10-language UI support, WCAG AA light/dark themes, Windows Forced Colors compatibility, and `prefers-reduced-motion` safety.

---

## 2. v2.6.0–v2.7.0 Architectural Design Breakdown

### 2.1 Pure Status Light System (`content.js`, `background.js`)
- **Zero Tab Title Clutter (v2.6.0+):** `syncTabTitlePresentation()` never appends status text to `document.title`; it only strips legacy v2.5 suffixes (`TITLE_SUFFIX_RE`) so tabs keep their clean original titles.
- **Global Priority Machine:** Evaluates all visible and collapsed projects across the top frame and child workspace iframes:
  - `waiting` (Priority 1A) — Pending approval / user input required
  - `unread` (Priority 1B) — Newly completed or unread conversation (wins over concurrent `running` tasks so completions are never missed)
  - `running` (Priority 2) — Agent actively executing (with `1500ms` completion debounce to avoid false-idle flicker between tool steps)
  - `idle` (Default) — Restores the original site favicon and clears the extension action badge
- **2 Mount Layouts (`iconLayout`):**
  - `standalone` (Default): Dedicated 64x64 pure status light favicon
  - `badge`: Corner indicator punched onto the original site favicon (`standard` or `large` `badgeSize`), with original favicon pixels decoded via `OffscreenCanvas` in `background.js`
- **Service Worker Port Ticker & Reduced Motion:** Animations (`running` at ~140ms, `waiting` at >= 650ms / `< 3` flashes/sec) are driven over `chrome.runtime.connect({ name: 'agy-timer' })` to bypass background-tab throttling and page CSP. When `prefers-reduced-motion: reduce` is enabled, frame `0` is rendered statically.

### 2.2 Six Selectable Visual Themes (`indicatorStyle` — v2.7.0 Expansion)
Building on `v2.6.0`'s four expressive themes, `v2.7.0` introduces two native first-party themes modeled directly after Google's workspace and AI surfaces:

1. **`antigravity` (Antigravity Native — Added in v2.7.0):** Deep slate rounded squircle (`#0F172A` -> `#1E293B`) modeled after `https://antigravity.google.com/` native workspace iconography:
   - `running`: Blue `progress_activity` circular track + sweeping Google-Blue arc + centered stop square
   - `unread`: `mark_chat_unread` slate-white speech bubble with a dark-punched emerald-mint unread dot
   - `waiting`: Warm Google Amber `notifications_active` ringing bell with `>= 650ms` gentle cadence
2. **`gemini` (Gemini Native — Added in v2.7.0):** Dark obsidian circular disc (`#1E1F20` -> `#131314`) featuring `https://gemini.google.com/app`'s concave 4-pointed sparkle:
   - `running`: Google 4-color gradient (`#4285F4` -> `#9B72CB` -> `#D96570` -> `#FBBC04`) orbital thinking ring around a breathing central sparkle
   - `unread`: Resting 4-pointed sparkle paired with a punched-out Google Green unread dot
   - `waiting`: Warm amber-coral pulsing sparkle paired with a punched-out `!` attention badge (`>= 650ms` cadence)
3. **`glow` (Luminous Orb — Default since v2.6.0):** Airy pearl/glass LED orb with ambient radial glow, specular crescent highlight, and crisp high-contrast rim for light and dark browser tab strips.
4. **`claude` (Claude Dynamic Sparkle — v2.6.0):** Warm terracotta/coral 8-spoke starburst (`running`/`waiting`) and sage-emerald 6-point sparkle (`unread`) over a soft contrast halo.
5. **`geek` (Geek Terminal — v2.6.0):** Obsidian CRT keycap with phosphor border (`>_` / quadrant spinner, `[!]`, `[✓]`).
6. **`emoji` (Vivid Emoji — v2.6.0):** High-DPI color emoji (`⚡`, `🔔`, `✅`) over a soft contrast disc.

Each style is mirrored in the popup's 2x3 style picker (`popup.html` / `popup.css`) with `prefers-reduced-motion` animation gating and `forced-colors: active` system-color overrides, synced to the live `#statusDot` indicator.

### 2.3 Automatic 10-Language i18n (`i18n.js`, `_locales/*/messages.json`)
- Detects browser UI language via `chrome.i18n.getUILanguage()` / `navigator.languages` / `navigator.language`.
- Normalizes automatically to 10 supported locales: `en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`.
- `window.__AGY_I18N__` localizes `popup.html` (`[data-i18n*]`), `popup.js`, `content.js`, `scanner.js`, and structured `reasonCode` payloads emitted by `page-bridge.js` across `118` canonical keys with 100% parity, while setting canonical BCP-47 `<html lang="...">`.
- Chrome extension metadata (`extName`, `extDescription`, `actionTitle`) lives in `_locales/<locale>/messages.json` using underscore folder names (`extDescription` kept `<= 132` chars for store compliance).

### 2.4 React Fiber Memory Bridge (`page-bridge.js`, `scanner.js`, `frame-detector.js`)
- `page-bridge.js` runs in `world: "MAIN"` (`document_start`) with a `500ms` cache so high-frequency `MutationObserver` bursts resolve in `< 0.1ms`.
- Traverses `.return` up to `HostRoot`, inspects `Context.Provider` (`tag === 10`) and `dependencies.firstContext`, TanStack `QueryClient`, Redux/Zustand stores, and passively clones `fetch`/`XHR`/`WebSocket` metadata.
- `scanner.js` merges memory snapshots, expanded-state memory caches, and optional collapsed probing (`autoProbeCollapsed` or manual sync), while preserving bilingual English/Chinese DOM scraping regexes.

### 2.5 Open-Source Readiness
- `AGENTS.md`: Contributor & AI agent engineering rules, Browser Support Policy (Chromium 120+), CSP/MV3 constraints, and local verification commands.
- `PLAN.md`: Architecture breakdown and milestone roadmap.
- `README.md` & `README.zh-CN.md`: Bilingual user & developer documentation with mutual language switchers.
- `.gitignore`: Standard ignores for OS files, build archives (`*.zip`, `*.crx`, `*.pem`), `node_modules/`, `.env*`, and IDE folders.

---

## 3. Open-Source Roadmap & Milestones

| Milestone | Target | Scope & Deliverables | Status |
| :--- | :--- | :--- | :--- |
| **M1 — v2.6.0 Core & Docs** | Completed | Pure status lights (`glow`, `claude`, `geek`, `emoji`), `standalone` / `badge` mount modes, 10-language auto-switching (`i18n.js` + `_locales/`, 114 keys), `AGENTS.md`, `PLAN.md`, `README.md`, `README.zh-CN.md`, `.gitignore`. | **Completed** |
| **M1.1 — v2.7.0 Native First-Party Themes** | Current | Adds `antigravity` (`antigravity.google.com` workspace squircle icons) and `gemini` (`gemini.google.com/app` 4-pointed concave sparkle) across Running / Unread / Waiting, 2x3 popup style grid, and 118-key 10-locale parity. | **Current** |
| **M2 — Automated CI & Verification** | Next | Node-based unit & smoke test suite (i18n key parity, `_locales` validation, DOM/Canvas/Chrome API mocks, zero-title-text assertions) + GitHub Actions workflow to build clean release `.zip` artifacts excluding dev/agent docs. | Planned |
| **M3 — Store Publishing Readiness** | Upcoming | Chrome Web Store & Microsoft Edge Add-ons readiness: `CHROMEWEBSTORE.md` (store copy, permission justifications, privacy policy), promotional 1280x800 screenshots, and repository `LICENSE` selection. | Planned |
| **M4 — Community Polish** | Future | Community-contributed light themes, optional opt-in desktop/audio notifications on `waiting` / `unread`, and Firefox MV3 compatibility study. | Exploring |
