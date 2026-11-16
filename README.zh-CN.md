[English](./README.md) | **简体中文**

# Antigravity Tab Status (`v2.9.0`)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Manifest V3](https://img.shields.io/badge/Manifest-V3-34a853.svg)](./manifest.json)
[![Chromium 120+](https://img.shields.io/badge/Chromium-120%2B-4285f4.svg)](./AGENTS.md)
[![Locales: 10](https://img.shields.io/badge/Locales-10-8ab4f8.svg)](./_locales)
[![CI](https://github.com/YogzZ/AntigravityTabStatus/actions/workflows/ci.yml/badge.svg)](https://github.com/YogzZ/AntigravityTabStatus/actions/workflows/ci.yml)

一款轻量、隐私优先的 **Manifest V3** 浏览器扩展（支持 Chrome / Edge / Arc / Brave），实时同步 [Google Antigravity](https://antigravity.google.com/) 当前实例下所有项目（包括已折叠项目）及对话状态，并以**纯净的标签页图标状态灯**直观提醒，不再向标签页标题追加任何文字。

---

## 核心特性 (`v2.9.0`)

- **5 小时模型配额池、上下文占用与实时 `tok/s` 速率遥测**
  - **5h 配额池概览条：** 在弹窗与侧边栏顶部通过原生 `<progress>` 状态条展示 `Gemini` 与 `Claude / GPT` 配额池的剩余百分比与重置倒计时。
  - **单对话上下文与速率徽标：** 在对话行内展示上下文 Token 用量（`used/limit, pct%`）、实时 `tok/s` 生成速率、自动压缩降幅提示（`-drop%`），并在存在真实 `modelUsage` 快照时提供缓存 / 输入 / 输出 / 命中率明细（无快照时诚实标注 `~` 估算，绝不伪造缓存命中率）。
  - **可选页内输入框用量胶囊（默认关闭）：** 在设置中开启 **「页面输入框显示用量胶囊」**（`showInPageCapsule`）后，可在输入工具栏旁挂载完全隔离的 Shadow DOM 胶囊（`WeakMap` 驱动、零 `innerHTML`/`localStorage`、符合 WCAG 1.4.13 悬停/键盘/`Escape` 提示交互）。
- **按需授权本地桌面端（localhost）支持**
  - 在设置中点击 **「本地 Antigravity (localhost) -> 授权启用」** 即可按需授予 `http://localhost/*` 与 `http://127.0.0.1/*` 可选主机权限（`optional_host_permissions` + `scripting`），并支持随时撤销。即使已授权，脚本也会校验 Antigravity 宿主标识（`isVerifiedLocalAntigravity()`），对无关本地开发服务完全静默无侵入。

- **跨网页全局面板 & 常驻 Chrome Side Panel**
  - **任意网页随时看：** 浏览任何网页时，浏览器工具栏都会实时显示汇总的 `待处理 + 未读` 全局角标；点击扩展图标即可直接查看后台 Antigravity 实例、项目与对话进度，无需再切换标签页反复确认。
  - **随时打开常驻侧边栏（`sidepanel.html`）：** 点击弹窗顶栏右侧按钮即可一键将状态面板固定在浏览器右侧边栏；也支持在设置中将工具栏点击默认行为切换为 **「侧边栏」**。
  - **多实例聚合 & 一键直达：** 同时开启多个 Antigravity 标签页时支持在 `全部 (N)` 聚合视图与单实例间自由切换；点击任意项目或对话即可自动激活对应浏览器标签页与窗口并定位过去。
- **纯净标签页状态灯（零标题文字干扰）**
  - 彻底告别冗长的标题后缀——不再向 `document.title` 追加「待处理 / 未读 / 运行中」等文字，并自动清理旧版本遗留的标题后缀，保持标签页标题干净整洁。
  - 严格遵循全局状态优先级：
    1. **`waiting`（最高优先级 1A）：** 需要用户确认或输入
    2. **`unread`（高优先级 1B）：** 新完成 / 未读对话（即使其它对话仍在运行，也会优先亮起未读提醒）
    3. **`running`（次高优先级 2）：** Agent 正在执行中（内置 `1.5s` 步骤完成防抖，避免频繁闪烁）
    4. **`idle`（默认空闲）：** 自动还原网站原始图标并清空扩展工具栏数字角标
- **6 种可选状态灯风格 & 2 种展示模式**
  - **6 种视觉风格（`indicatorStyle`）：** 涵盖 2 套 Google 原站第一方图标风格（`antigravity`、`gemini`）与 4 套精选主题风格（`glow`、`claude`、`geek`、`emoji`）：

| 风格（`indicatorStyle`） | 设计语言 | `running`（进行中） | `unread`（完成未读） | `waiting`（待处理） |
| :--- | :--- | :--- | :--- | :--- |
| **`antigravity`** | 复刻 [`antigravity.google.com`](https://antigravity.google.com/) 原站工作区圆角方框图标 | 蓝色 `progress_activity` 旋转弧 + 居中停止方块 | `mark_chat_unread` 气泡 + 翠绿未读圆点 | 暖琥珀色 `notifications_active` 摇铃 |
| **`gemini`** | 复刻 [`gemini.google.com/app`](https://gemini.google.com/app) 原生凹弧四芒星图标 | Google 四色渐变轨道环绕呼吸四芒星 | 静态四芒星 + 绿色未读圆点 | 暖琥珀珊瑚四芒星 + `!` 提示角标 |
| **`glow`** *（默认）* | 柔光玻璃/珠光呼吸灯配高对比细边环 | 晴空蓝呼吸光球 | 翠绿常亮光球 | 暖珊瑚琥珀脉冲光球 |
| **`claude`** | 暖珊瑚色星芒与翠绿星芒风格 | 旋转 8 芒暖珊瑚星芒 | 翠绿六芒星芒 | 暖珊瑚/琥珀脉冲星芒 |
| **`geek`** | 深邃 CRT 终端键帽配高对比荧光字符 | 青色 `>_` / 四象限旋转符 | 矩阵绿 `[✓]` 提示符 | 闪烁琥珀/红 `[!]` 提示符 |
| **`emoji`** | 高清彩色 Emoji 搭配柔和对比底盘 | 脉冲 `⚡` 闪电 | 清晰 `✅` 对勾 | 轻摆 `🔔` 铃铛 |

  - **2 种挂载模式（`iconLayout`）：**
    - **独立状态灯（`standalone`，默认）：** 直接在标签页图标位置渲染纯状态灯
    - **原图标角标（`badge`）：** 保留原站图标并在右下角叠加状态灯（支持 `standard` 标准 / `large` 大号尺寸）
  - 完整遵循 `prefers-reduced-motion: reduce`（自动切换静态第 0 帧）且待处理脉冲频率 `< 3` 次/秒。
- **10 种语言自动适配**
  - 自动跟随浏览器界面语言切换弹窗界面、状态原因文案与扩展元数据，完整支持 **10 种语言**：
    `en`、`zh_CN`、`zh_TW`、`ja`、`ko`、`es`、`fr`、`de`、`pt_BR`、`ru`。
- **零点击 React 内存直读引擎与受控同源遥测**
  - [`page-bridge.js`](./page-bridge.js) 运行于 MV3 原生 `world: "MAIN"`，内置 **500ms 短时缓存**，直接读取 React 18/19 Fiber、TanStack QueryCache、Zustand/Redux Store 与只读网络流中的项目状态、模型配额与上下文用量（缓存命中耗时 `< 0.1ms`，零侧边栏闪烁）。仅在标签页可见且确认存在同源 `LanguageServerService` 接口或 `csrfToken` 时，才按需发起只读同源 Connect-RPC 查询（`GetUserStatus`、`GetAllCascadeTrajectories`、增量 `GetCascadeTrajectorySteps`）补充实时遥测。
  - 在弹窗点击任意对话（包括已折叠项目下的对话），自动展开对应项目并精准跳转。
- **零 CSP 报错 · 隐私优先**
  - **无 Blob Worker**、无 `eval()`、无 `localStorage`、无任何远程开发者统计或数据上传（详见 [隐私政策](./PRIVACY.md)）。
  - 后台计时器与 `OffscreenCanvas` 图标解码全部在扩展 Service Worker（[`background.js`](./background.js)）中安全执行。
  - 仅申请 `storage`、`sidePanel` 与 `scripting` 权限（不请求 `tabs` 或 `<all_urls>`），强制 `content_scripts` 与 `host_permissions` 均严格限定在 Antigravity 域名（`antigravity.google` / `antigravity.google.com`）、内嵌 Antigravity 工作区 iframe 域名（`*.usercontent.goog`，通过 `location.ancestorOrigins` 严格校验顶层来源）与 `gstatic.com` 图标范围内，外加按需授权的 `optional_host_permissions`（`http://localhost/*`、`http://127.0.0.1/*`）。

---

## 安装 / 升级步骤

### 方式一：下载 Release 预构建压缩包（推荐）

1. 前往 [GitHub Releases](https://github.com/YogzZ/AntigravityTabStatus/releases) 下载最新 `antigravity-tab-status-v*.zip` 并解压到固定目录（升级时直接解压覆盖原文件夹即可）。
2. 打开 `chrome://extensions/`（Chrome / Arc / Brave）或 `edge://extensions/`（Microsoft Edge），确保开启右上角 **「开发者模式」**。
3. **首次安装：** 点击 **「加载已解压的扩展程序」**，选择包含 `manifest.json` 的解压目录。
   **版本升级：** 点击 **Antigravity Tab Status** 卡片上的 **「刷新 ↻」** 按钮（如有旧版本历史提示，建议进入「错误」页签点击「全部清除」）。
4. **刷新一次已打开的 `https://antigravity.google.com/` 标签页** 即可立即生效。

### 方式二：从源码校验并本地打包

1. 克隆本仓库（`git clone https://github.com/YogzZ/AntigravityTabStatus.git`）。
2. *（可选）* 运行一键校验并生成纯净发布包（输出到 `dist/antigravity-tab-status-v2.9.0.zip`）：
   ```bash
   node scripts/verify.mjs
   bash scripts/package.sh
   ```
3. 在 `chrome://extensions/` 中加载仓库目录或解压后的 `dist/` 包目录即可。

> **浏览器要求：** Chromium 120+（需支持 MV3 `world: "MAIN"`、`OffscreenCanvas`、CSS `light-dark()`、`@layer` 与 `details::details-content`）。

---

## 架构概览

```text
Antigravity 页面 / 已校验本地端 (MAIN 世界)
  └─ page-bridge.js ──(500ms 缓存 + Fiber/QueryCache/流只读采集 + 受控 LS RPC)──┐
                                                                                  ▼
Antigravity 页面与子框架 (ISOLATED 世界)
  ├─ i18n.js ──► scanner.js ──► frame-detector.js (子 iframe + Shadow 胶囊) ──────┼──► background.js (SW)
  └─ i18n.js ──► scanner.js ──► content.js (顶层聚合与渲染 + Shadow 胶囊) ◄───────┘    ├─ agy-timer 端口 + scripting
                                    │                                                  ├─ OffscreenCanvas 图标解码
                                    ▼                                                  └─ 扩展角标与跨框架消息转发
                        64x64 Canvas 标签页状态灯
                                    ▲
                                    │ (chrome.storage.sync/session + 跨标签页运行时消息)
                      popup.html / sidepanel.html / popup.css / popup.js
                      (5h 配额概览 + 上下文/tok/s 遥测 + localhost 按需授权)
```

---

## 项目结构

| 文件 / 目录 | 说明 |
| :--- | :--- |
| `manifest.json` | Manifest V3 配置（`v2.9.0`）、`default_locale: "en"`、`storage` + `sidePanel` + `scripting` 权限、受限 `host_permissions`、按需 `optional_host_permissions`（`localhost`/`127.0.0.1`）、`MAIN` 与 `ISOLATED` 脚本声明 |
| `background.js` | MV3 Service Worker：`agy-timer` Port 计时器、`OffscreenCanvas` 图标像素解码、`storage.session` 全局数字角标汇总、`actionClickMode` 同步、按需 localhost 动态脚本注册/注入及跨框架消息转发 |
| `page-bridge.js` | `world: "MAIN"` React 18/19 Fiber、状态存储、被动只读网络流桥接器（500ms 缓存、40 对话步数摘要上限）、受控同源 Connect-RPC 及 v2.9.0 配额/上下文/tok/s 遥测引擎 |
| `i18n.js` | 浏览器语言自动识别与 161 键 10 语言词典（`window.__AGY_I18N__`），含 Antigravity 与按需 localhost 宿主校验守卫 |
| `scanner.js` | 统一工作区扫描器，融合 DOM、内存桥接快照与遥测、已折叠项目缓存及可选隔离 Shadow DOM 用量胶囊 |
| `content.js` | 顶层全局状态与遥测合并引擎、64x64 Canvas 渲染器（6 种风格 × 2 种挂载模式）、旧标题后缀清理、Shadow DOM 胶囊同步与 Port 动画驱动 |
| `frame-detector.js` | 子工作区 iframe 扫描、遥测转发与子框架 Shadow DOM 胶囊同步脚本 |
| `popup.html` / `sidepanel.html` / `popup.css` / `popup.js` | 适配浅色/深色与无障碍的双形态面板 UI（快捷弹窗 + `100dvh` 响应式侧边栏），提供 5h 配额池概览、单对话上下文/速率/压缩徽标、跨网页实例切换、项目对话一键直达、2×3 风格选择器、可选 localhost 授权控制、预览与诊断 |
| `_locales/` | Chrome 扩展多语言元数据目录（`en`、`zh_CN`、`zh_TW`、`ja`、`ko`、`es`、`fr`、`de`、`pt_BR`、`ru`） |
| `icons/` | 扩展图标资源（`16x16`、`32x32`、`48x48`、`128x128`） |
| `AGENTS.md` | 开发者与 AI Agent 协作规范、浏览器支持策略、CSP/MV3 约束及校验打包命令 |
| `PLAN.md` | v2.6.0–v2.9.0 架构拆解与开源演进路线图 |
| `CHANGELOG.md` | 遵循 Keep a Changelog 规范的版本更新日志 |
| `PRIVACY.md` | 隐私政策及本地存储 / 权限使用说明 |
| `CHROMEWEBSTORE.md` | Chrome / Edge 扩展商店上架文案、权限说明及提审清单 |
| `LICENSE` | MIT 开源许可证 |
| `scripts/verify.mjs` | 零第三方依赖 Node 校验脚本（语法、MV3 与可选权限范围、10 语言 161 键、CSP/安全、PNG 完整性与敏感信息扫描） |
| `scripts/package.sh` | 自动运行校验并在 `dist/` 生成仅含运行时文件的纯净发布 `.zip` 包 |
| `.github/workflows/ci.yml` | GitHub Actions 自动校验与构建工作流 |
| `.gitignore` | Git 忽略规则（系统缓存、构建目录 `dist/`、`*.zip` / `*.crx` / `*.pem`、依赖及编辑器配置） |

---

## 校验与构建发布包

仅需 **Node.js 20+**，无需安装任何 `npm` 依赖：

```bash
# 运行脚本语法、manifest 权限范围、10 语言 i18n、CSP/安全、PNG 图标及敏感信息扫描
node scripts/verify.mjs

# 执行全量校验并构建纯净发布包 dist/antigravity-tab-status-v2.9.0.zip
bash scripts/package.sh
```

---

## 参与贡献

欢迎提交 Issue 与 Pull Request！在改动代码前请先了解：

1. 阅读 [AGENTS.md](./AGENTS.md)，遵循 **浏览器支持策略（Chromium 120+）**、MV3 / CSP 安全规范、10 语言键名一致性要求及校验打包命令。
2. 查看 [PLAN.md](./PLAN.md) 了解后续里程碑规划（`M3` Chrome / Edge 商店上架准备、`M4` 社区体验增强）。
3. 提交修改前，请务必运行 `node scripts/verify.mjs` 确认所有检查通过。

---

## 开源许可与免责声明

- 本项目基于 [MIT License](./LICENSE) 开源。
- 隐私与权限承诺详见 [PRIVACY.md](./PRIVACY.md)。
- **免责声明：** **Antigravity Tab Status** 为独立的社区开源扩展项目，与 Google LLC 无任何官方关联、授权或赞助关系。"Google"、"Antigravity" 与 "Gemini" 为 Google LLC 的注册商标。
