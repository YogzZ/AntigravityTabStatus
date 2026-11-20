# Chrome Web Store & Edge Add-ons Listing Guide

Ready-to-paste store listing copy, permission justifications, privacy declarations, and submission checklist for **Antigravity Tab Status (`v2.10.0`)**.

---

## 1. Store Listing Copy

### Short Description (Max 132 characters)

- **English (`en`, 125 chars — matches `_locales/en/messages.json`):**
  ```text
  Live Antigravity tab lights & global Side Panel: monitor projects from any page, 6 light styles, instant jump & 10 languages.
  ```

- **简体中文 (`zh_CN`, 61 chars — matches `_locales/zh_CN/messages.json`):**
  ```text
  Antigravity 跨网页全局监控与侧边栏：随时在任意页面查看项目进度、一键跳转对话，支持 6 种状态灯与 10 种语言。
  ```

---

### Detailed Description (English — Plain Text for Chrome Web Store)

> Copy everything inside the code block below directly into the Store Listing **Description** field.

```text
Antigravity Tab Status turns your browser tab icon into a crisp, animated status light for Google Antigravity — keeping tab titles completely clutter-free while you work across multiple tabs and projects.

Key Features
• Pure Tab Status Lights (Zero Title Clutter): Shows real-time agent activity right on your tab icon without appending text to tab titles.
• Clear 4-State Priority:
  - Waiting (Priority 1A): Alerts you immediately when an agent needs approval or input.
  - Unread (Priority 1B): Highlights newly completed responses, even while other tasks continue running.
  - Running (Priority 2): Smooth breathing indicator while an agent is actively working (with smart transition smoothing so step changes don't flicker).
  - Idle: Restores the original Antigravity tab icon and clears the toolbar badge automatically.
• 6 Selectable Light Styles:
  - Antigravity Native: Rounded workspace icons matching Google Antigravity's own design language.
  - Gemini Native: Concave 4-pointed sparkle with orbital thinking ring.
  - Luminous Orb (Default): Glassy pearl glow light with crisp high-contrast rim.
  - Claude Sparkle: Warm terracotta starburst & sage completion sparkle.
  - Geek Terminal: Dark terminal keycap with neon phosphor indicators.
  - Vivid Emoji: Clear lightning, checkmark, and bell icons on a contrast disc.
• 2 Display Modes: Choose a full Standalone Light or overlay a Corner Badge (Standard or Large size) on the original Antigravity icon.
• Cross-Tab Overview, Persistent Side Panel & Quick Jump: Click the toolbar icon from any webpage to monitor all open Antigravity tabs (and global Waiting + Unread badge count), open the persistent Chrome Side Panel anytime, mark everything read, or click any conversation to switch to its tab and jump straight to it.
• 5-Hour Model Quota Pools & Live Context Telemetry: View remaining 5-hour quota, burn-rate Pace badges, depletion ETA, and reset countdowns across Gemini and Claude / GPT pools, plus per-chat context token usage, live tok/s streaming speed, auto-compaction drop indicators, and 5m/1h prompt-cache freshness countdowns.
• On-Device Token Ledger & Offline Pricing Analytics: Inspect Today / 7d / 30d token totals, SVG trend charts, a 28-day activity heatmap, Top Models & Projects, and USD / CNY equivalent API cost & cache-savings estimates computed 100% offline with JSON / CSV export and 1-click history clearing.
• Optional Desktop Quota Alerts & In-Page Composer Capsule (Both Off by Default): Opt in to local desktop notifications when a depleted 5h quota pool recovers or spare quota nears reset, or mount an isolated Shadow DOM usage pill next to Antigravity's composer controls.
• Optional Localhost Desktop & Magpie Support: Grant optional access to localhost / 127.0.0.1 anytime from settings to monitor local Antigravity desktop webviews (leaving unrelated local dev servers untouched) or view read-only summaries from an opt-in local Magpie gateway.
• Configurable Toolbar Click Action: Choose whether clicking the toolbar icon opens the quick Popup (with a header button to launch the Side Panel) or opens the Chrome Side Panel directly.
• Accessibility & Motion Safe: Automatically pauses animations when Reduced Motion is enabled, supports High Contrast mode and light/dark themes, and keeps attention pulses below 3 flashes per second.
• Automatic 10-Language Support: Automatically follows your browser UI language across English, Simplified Chinese, Traditional Chinese, Japanese, Korean, Spanish, French, German, Portuguese (Brazil), and Russian.

Privacy First
All status detection runs locally in your browser. Antigravity Tab Status never collects personal data, never sends analytics, and never uploads conversation content anywhere.
```

### Detailed Description (简体中文 — Chrome / Edge 商店中文描述)

```text
Antigravity Tab Status 让浏览器标签页图标化身为清晰灵动的动态状态灯——无需修改或加长标签页标题文字，同时精准掌控多个项目与多标签页下的任务进度。

核心功能
• 纯净标签页状态灯（零标题干扰）：直接在标签页图标位置呈现 Agent 实时状态，保持标签页标题干净整洁。
• 清晰的四级状态优先级：
  - 待处理（最高优先级 1A）：当任务需要你确认操作或回复输入时立即亮灯提醒。
  - 未读（高优先级 1B）：有新完成的回复尚未查看时优先提醒，即使同一实例下还有其它任务正在运行也不会遗漏。
  - 运行中（次高优先级 2）：Agent 正在执行时柔和呼吸提示，并内置切换防抖避免步骤衔接时闪烁。
  - 空闲：所有任务完成后自动还原原站图标并清空扩展角标计数。
• 6 种可选状态灯风格：
  - Antigravity 原生：贴合 Google Antigravity 原站设计语言的圆角方框状态图标。
  - Gemini 原生：四芒星与渐变思考光环组合。
  - 柔光光球（默认）：通透珠光玻璃灯配高对比细边环。
  - Claude 星芒：暖珊瑚色星芒与翠绿完成星芒。
  - 极客终端：深色键帽搭配高对比荧光符号。
  - 灵动 Emoji：高清闪电、对勾与铃铛图标。
• 2 种展示模式：支持「独立状态灯」或「原图标角标（标准 / 大号）」，满足不同标签页密度习惯。
• 跨网页全局概览、常驻侧边栏与一键直达：无论当前浏览什么网页，点击扩展图标即可查看后台全部 Antigravity 标签页的汇总状态（及工具栏全局角标计数），随时一键打开浏览器常驻侧边栏（Side Panel），支持一键全部标为已读，点击任意对话即可自动激活对应标签页并精准定位。
• 5 小时模型配额池与上下文 / 速率 / 缓存保鲜遥测：在面板顶部展示 Gemini 与 Claude / GPT 的 5 小时剩余配额、消耗速率 Pace 徽标、耗尽 ETA 与重置倒计时，并在对话下展示上下文 Token 占用、实时 tok/s 速率、自动压缩降幅与 5m/1h 缓存保鲜倒计时。
• 本地持久化用量账本与离线计价分析抽屉：在本地查看今日 / 7 天 / 30 天用量 KPI、SVG 趋势图、28 天热力图、热门模型与项目排行，支持 100% 离线 USD / CNY 等效费用与缓存节省估算、JSON / CSV 导出及一键清空历史。
• 可选桌面配额提醒与页内输入框胶囊（均默认关闭）：可按需启用本地桌面配额恢复/重置余量提醒，或在输入框旁挂载隔离的 Shadow DOM 用量胶囊查看详细遥测。
• 可选本地桌面端（localhost）与只读本地 Magpie 网关支持：可在设置中按需授予 localhost / 127.0.0.1 可选权限以监控本地 Antigravity 桌面 WebView（对无关本地开发服务完全静默），或查看受检本地 Magpie 网关的只读摘要。
• 工具栏点击行为可调：支持在高级设置中自由切换工具栏图标默认打开「快捷弹窗」或直接打开「侧边栏」。
• 无障碍与视觉安全：自动遵循系统「减弱动态效果」与高对比度设置，自适应浅色/深色外观，提醒脉冲严格低于每秒 3 次。
• 10 国语言自动适配：自动跟随浏览器语言切换界面与状态说明，支持简体中文、繁体中文、英语、日语、韩语、西班牙语、法语、德语、巴西葡萄牙语与俄语。

隐私承诺
所有状态识别与图形绘制均在本地浏览器完成，不收集任何个人数据，不包含任何统计分析或远程上传行为。
```

---

## 2. Permission & Host Access Justifications (Privacy Tab)

Use these exact explanations when completing Chrome Web Store's **Privacy Practices** justification prompts:

### Single Purpose Description
```text
Displays real-time workspace conversation status lights on Google Antigravity browser tabs and provides a cross-tab popup & persistent Side Panel overview.
```

### `storage` Permission Justification
```text
Used via chrome.storage.sync to remember user display preferences (master enable switch, chosen status light style, mount layout, corner badge size, toolbar click mode, collapsed-project auto-sync toggle, quota/context display toggles, opt-in in-page capsule toggle, opt-in quota notifications toggle, and optional user-defined CSS selectors) across browser restarts; via memory-only chrome.storage.session solely to aggregate temporary Waiting + Unread counts into the toolbar badge and hold a 30-second read-only Magpie response cache while tabs are open; and via device-local chrome.storage.local strictly for aggregated non-text token usage counters (agyUsageLedgerV1, 90-day auto-prune, < 250 KB cap), offline pricing rates (agyPricingConfigV1), quota notification deduplication watermarks (agyNotifStateV1), and opt-in local Magpie loopback settings (agyMagpieConfigV1).
```

### `optional_permissions` (`notifications`) Justification
```text
Requested strictly on explicit user click when enabling Quota desktop alerts (off by default) via chrome.permissions.request({ permissions: ['notifications'] }) to show local desktop notifications when a depleted 5-hour quota pool recovers or when significant unused quota is nearing reset, and revocable anytime via Disable.
```

### `sidePanel` Permission Justification
```text
Used exclusively to provide a persistent Chrome Side Panel view (sidepanel.html) alongside the browser toolbar popup so users can monitor active Google Antigravity workspaces while browsing other pages, launch the Side Panel from the popup header (chrome.sidePanel.open), and honor the user's preferred toolbar click mode (chrome.sidePanel.setPanelBehavior).
```

### `scripting` Permission Justification
```text
Used strictly with optional_host_permissions (http://localhost/* and http://127.0.0.1/*) to dynamically register and inject the extension's bundled scripts (chrome.scripting.registerContentScripts / chrome.scripting.executeScript) into local Antigravity desktop webviews only after the user explicitly clicks Enable to grant localhost access, and to unregister them immediately upon revocation.
```

### Host Permissions & Optional Host Permissions Justification
```text
Mandatory host_permissions are scoped strictly to Antigravity origins (https://antigravity.google.com/*, https://*.antigravity.google.com/*, https://antigravity.google/*, https://*.antigravity.google/*) and Antigravity's embedded remote workspace iframe host (https://*.usercontent.goog/*, where every all_frames script verifies location.ancestorOrigins against Antigravity before running and exits immediately on unrelated sites), plus https://*.gstatic.com/* solely to read Google-hosted site favicons locally when compositing corner badges onto the tab icon. Optional host_permissions (http://localhost/*, http://127.0.0.1/*) are not granted at install time and are requested solely on explicit user action to support local Antigravity desktop webviews; injected scripts verify Antigravity host markers and remain completely inert on unrelated local web servers.
```

### Remote Code Declaration
- **Are you using remote code?** **No.** All executable JavaScript, HTML, CSS, SVG, and image assets are bundled directly inside the extension package. No external scripts, `eval()`, or dynamic remote code are ever loaded. Same-origin read-only Connect-RPC metadata queries read only JSON telemetry from the active Antigravity tab's own origin when already authenticated.

---

## 3. Data Usage Disclosures (Privacy Tab)

Check **No — I am not collecting any user data**, and ensure every data-collection checkbox remains **unchecked**:
- Personally identifiable information: **Not collected**
- Health, financial, authentication, personal communications, location, web history, user activity, website content: **Not collected / Not transmitted off-device**
- **Three Required Certifications (Check all 3):**
  1. I do not sell or transfer user data to third parties, outside of the approved use cases.
  2. I do not use or transfer user data for purposes unrelated to my item's single purpose.
  3. I do not use or transfer user data to determine creditworthiness or for lending purposes.

---

## 4. Store Submission Checklist & Asset Inventory

| Field / Requirement | Value / Status |
| :--- | :--- |
| **Extension Name** | `Antigravity Tab Status` (localized via `_locales/*/messages.json`) |
| **Version** | `2.10.0` |
| **Primary Category** | `Developer Tools` (alternative: `Productivity`) |
| **Default Language** | `English` (`default_locale: "en"`, with 9 additional localized store locales available via `_locales/`) |
| **Developer Contact Email** | `[YOUR_STORE_CONTACT_EMAIL]` *(fill in manually in Developer Dashboard before submitting)* |
| **Privacy Policy URL** | `https://github.com/YogzZ/AntigravityTabStatus/blob/main/PRIVACY.md` |
| **Homepage URL** | `https://github.com/YogzZ/AntigravityTabStatus` |
| **Support URL** | `https://github.com/YogzZ/AntigravityTabStatus/issues` |
| **Store Icon (128×128 PNG)** | Ready: [`icons/icon128.png`](./icons/icon128.png) (non-alpha transparency issues should be verified if uploading to store icon slot) |
| **Screenshots (1280×800 or 640×400 PNG/JPG)** | **TODO before upload:** Capture at least 1 (recommended 3–5) `1280x800` screenshots showcasing: (1) tab lights across Running/Unread/Waiting, (2) popup 2x3 theme picker & project jump list, (3) dark/light adaptive UI & badge layout |
| **Small Promo Tile (440×280 PNG/JPG)** | Optional (recommended for featuring) |
| **Upload Package (`.zip`)** | Generate clean release archive with `bash scripts/package.sh` -> `dist/antigravity-tab-status-v2.10.0.zip` |
