# `yetone/magpie` Token 统计与配额功能调研及插件演进设计

> **调研目标：** 分析开源项目 [`yetone/magpie`](https://github.com/yetone/magpie) 在 **Token 用量统计、等价成本估算、多窗口配额与消耗配速（Pace）、Prompt Cache 监控、会话级账本与可视化仪表盘** 等方面的核心能力与设计思路，结合 **Antigravity Tab Status (`v2.9.0`)** 现有 MV3 架构评估差距，并沉淀为后续可直接落地的技术方案与分阶段路线图。

---

## 1. 调研背景与项目定位对比

### 1.1 `yetone/magpie` 项目定位

[`yetone/magpie`](https://github.com/yetone/magpie) 是一个面向多 AI 编程代理（Claude Code、Codex、Gemini CLI、OpenCode、Google Antigravity 等）的开源本地统一网关与桌面管理工具（MIT 协议，基于 Go 构建核心服务与 CLI/TUI/Web UI，并提供桌面菜单栏/系统托盘应用）。其核心价值不仅在于「多模型代理配置统一与账号池自动故障转移（Failover）」，还围绕**消费透明度与配额利用率最大化**建立了一整套完整的本地遥测、账本与配额调度体系。

### 1.2 运行边界与架构对比（Magpie vs. Antigravity Tab Status `v2.9.0`）

| 对比维度 | `yetone/magpie`（本地网关 + 桌面端 + CLI） | **Antigravity Tab Status (`v2.9.0`)**（Chromium MV3 扩展） |
| :--- | :--- | :--- |
| **运行位置与形态** | 常驻本地后台进程 + HTTP 代理网关（默认 `127.0.0.1:3425`）+ 菜单栏面板（Menu Bar / Tray）+ 桌面窗体 / TUI / Web UI | 浏览器扩展（Chromium 120+）：`MAIN` 世界内存桥（[page-bridge.js](../page-bridge.js)）+ `ISOLATED` 扫描与渲染（[scanner.js](../scanner.js)、[content.js](../content.js)）+ Service Worker（[background.js](../background.js)）+ Popup / Side Panel |
| **核心数据源** | 1. 本地代理网关全量流式请求/响应拦截<br>2. `~/.config/magpie/usage.jsonl` 持久化请求账本<br>3. 解析本地代理会话库（如 Antigravity `~/.gemini/antigravity/conversations/<uuid>.db` SQLite 元数据）<br>4. 上游厂商 Quota API | 1. React 18/19 Fiber 内存树、TanStack `QueryClient`、Zustand/Redux Store<br>2. 被动只读克隆同页 `fetch` / `XHR` / `WebSocket` 负载<br>3. 受控同源 Connect-RPC（`GetUserStatus`、`GetAllCascadeTrajectories`、`GetCascadeTrajectorySteps`） |
| **持久化与内存边界** | 本地磁盘文件（JSONL / SQLite），支持长期历史回溯、导出与备份合并 | 状态全在当前标签页内存（`convTelemetryById` 上限 `40` 个对话、单对话步数上限 `240`）；`chrome.storage.sync` 仅存用户偏好，`chrome.storage.session` 仅存角标计数 |
| **模型与成本目录** | 联动 `models.dev` 元数据目录 + 内置价格表 + 用户自定义模型单价覆盖（USD / CNY） | 仅基于会话内模型 ID/Label（如 `getDynamicContextLimit()`）与 `quotaPools`（`gemini` / `premium`）展示占比，无单价与成本计算 |
| **隐私与权限边界** | 运行在本地机器，主动承诺仅提取 SQLite 元数据而不读取对话正文，支持 Prompt 脱敏 | 遵循极简权限（`["storage", "sidePanel", "scripting"]`，无 `tabs`、无 `<all_urls>`、无外网请求、无 `localStorage`），严格遵守页面 CSP 与 [PRIVACY.md](../PRIVACY.md) |

> **关键启示：** 我们是纯浏览器 MV3 扩展，不应也不需要重做 HTTP 代理网关或读取用户本地磁盘文件；但 Magpie 在**「全口径 Token 维度拆解」**、**「会话累计消耗 vs. 当前上下文占用分离」**、**「等价 API 成本与缓存节省量化」**、**「配额配速（Pace）与双时机提醒」**以及**「本地历史账本 + 多维消费面板」**上的产品设计，完全可以经过轻量化与 MV3 合规改造后融入我们的扩展。

---

## 2. Magpie Token 统计与配额相关核心功能拆解

通过对 `yetone/magpie` 公开文档、接口设计、CLI 命令及演进记录的调研，其 Token 与配额体系可拆解为以下 5 个核心模块：

### 2.1 请求级本地账本与细粒度 Token 维度（`usage.jsonl` & `UsageRecord`）

Magpie 将每一次代理请求与外部上报（`POST /v1/magpie/usage/requests`）抽象为结构化的 `UsageRecord`，按行追加写入本地 `~/.config/magpie/usage.jsonl`，并通过 `GET /v1/magpie/usage?period=today|7d|30d|all` 与 CLI（`internal/cli/usage_cli.go`）对外提供汇总查询。

1. **5+1 类 Token 精确计量：**
   - `input_tokens`：未命中缓存的常规输入 Token；
   - `output_tokens`：标准生成输出 Token；
   - `cache_read`：命中 Prompt Cache 读取的上下文 Token；
   - `cache_write` / `cache_creation`：**按缓存有效期分层计量 `cache_write_5m`（5 分钟短效缓存写入）与 `cache_write_1h`（1 小时缓存写入）**，精准适配 Anthropic/Claude 等分层写入倍率；
   - `reasoning_tokens`：单独拆分推理/思考链（Thinking / Reasoning）Token，既计入真实生成输出成本，也参与生成吞吐率核算。
2. **流式性能与延迟指标：**
   - `first_text_ms`（**TTFT**, Time to First Text）：记录从发起请求到收到首个流式输出文本块的毫秒延迟；
   - `duration_ms` 与 `tokens_per_sec`：综合输出与推理 Token 计算平均吐字速度（`tok/s`）；
   - 记录实际执行的上游模型 ID（识别上游安全策略触发的静默模型降级/回退，按实际模型计费）、路由来源、HTTP 状态码及所属 Agent / 会话 ID。

### 2.2 动态模型目录与「等价 API 成本 + 缓存节省额」估算引擎

Magpie 借助 `models.dev` 模型目录与本地费率配置，为每个模型补全展示名称、上下文上限（`context_limit`）、推理能力标记以及分维度百万 Token 单价（支持 **USD** 与 **CNY** 切换，并允许用户在 UI 中覆盖任意模型的单价）：

- **订阅制下的「等价账单价值（List-Price Cost）」：** 即使开发者使用的是包月订阅（如 Google Antigravity Pro/Ultra、Claude Pro/Max、ChatGPT Plus/Pro），Magpie 依然按官方 API 挂牌单价实时折算每次请求、每个会话以及每日的**等价消费金额**，让用户直观感知「订阅是否回本」以及「哪类任务最烧额度」。
- **缓存节省金额（Cache Savings）：** 利用 `(全量 input 单价 - cache_read 折扣单价) * cache_read_tokens`，把抽象的「缓存命中率 %」直接翻译成真金白银的**节省金额**，强化用户保持长前缀缓存的意识。

### 2.3 多维可视化面板与桌面菜单栏极简卡片（Usage Dashboard & Tray）

1. **时间窗口与热力图可视化：**
   - 支持 **`Today`（今日）/ `7d`（近 7 天）/ `30d`（近 30 天）/ `All`（全部）** 四档时间粒度切换；
   - 提供按日/按小时的 **Token 与成本趋势图**，以及类似 GitHub 贡献格的 **使用活跃度热力图（Activity Heatmap）**。
2. **多维度交叉下钻（Breakdowns & Sessions）：**
   - **按模型（By Model）：** 对比不同模型（如 Gemini Pro vs. Claude Opus/Sonnet vs. DeepSeek）的调用次数、输入/输出/缓存/推理结构占比及等价花费；
   - **按代理 / 工作区（By Agent / Project）：** 区分各编程工具或项目目录的资源占用；
   - **按会话（Sessions）：** 为每个历史对话关联标题与**会话累计总花费**，支持按成本排序与一键重开会话。
3. **缓存命中率与冷启动衰减感知（`coldAfter`）：**
   - 计算全局与单模型 `Cache Hit Rate`；
   - 结合厂商缓存过期时间窗口（如 Anthropic 5 分钟未续聊即冷失效的 `coldAfter` 窗口），在调度与状态展示中反映上下文缓存是「热命中」还是「已变冷将触发全量重算」。
4. **菜单栏（Menu Bar / Tray）轻量速览：**
   - 无需打开完整仪表盘，点击顶部托盘即可一眼看到 **Today（今日 Token / 成本）**、**This Week（本周 Token / 成本）** 与各账号池 **Allowance Cards**，点击对应条目直接跳转至详单视图。

### 2.4 多窗口配额卡片、消耗配速（`Pace`）与双时机提醒（`QuotaCard` / `Allowance`）

这是 Magpie 在配额管理上极具实用价值的设计：

1. **多窗口与积分建模（`magpie quota [--json]`、`GET /v1/magpie/quotas/cards`、`POST /v1/magpie/quotas/refresh` 30s 节流）：**
   - 统一建模短期滚动窗口（如 **5 小时限流窗口**）、长周期窗口（如 **7 天周限额**）与按量/赠送积分（`Allowance.OnCredits`）。
2. **核心指标——配额消耗配速（`Allowance.Pace`）：**
   - 单纯显示「剩余 40%」容易误判：如果离重置还有 4 小时，40% 很充裕；如果离重置还有 4 小时但刚过去 20 分钟就烧掉 60%，则会很快撞墙。
   - Magpie 计算「剩余配额比例」与「距离窗口重置剩余时间比例」之间的平衡度（`Pace`）以及消耗斜率：
     - 当消耗过快时提醒用户当前节奏将在重置前提前耗尽；
     - 在多账号路由（`routing=pace` / `routing=expiring`）中，优先消耗配速最充裕或即将过期（即将刷新）的配额池，避免额度浪费。
3. **双时机主动提醒：**
   - **重置前闲置余量提醒（Unused Quota Reminder）：** 当某个窗口即将重置且仍有大量未用额度时触发提醒（提示用户可在刷新前跑一轮深度代码审查、测试或重构任务，充分利用即将清零的配额）；
   - **配额恢复可用提醒（Allowance Back Notification）：** 当此前耗尽（`0%`）的窗口到达刷新时间、额度重新恢复时立即通知用户。
4. **预算阈值告警（`gateway-key limit`）：**
   - 支持按日/周/月设置 Token 数量上限（如 `2m`）或等价 USD 上限（如 `$5`），达到阈值时提示或阻断。

### 2.5 Antigravity 会话解析与去重经验（Session Attribution & Fork Deduplication）

Magpie 社区在对接 Antigravity 本地会话存储（`~/.gemini/antigravity/conversations/<uuid>.db` 中的 `steps.metadata` 与 `gen_metadata.data`）时，沉淀了三条非常值得借鉴的工程经验：

1. **「元数据提取、零正文接触」：** 统计功能仅需读取 `modelUsage`、模型名、时间戳与步数状态等元数据，完全不解析也不落盘用户 Prompt 与模型回复正文；
2. **严格区分「当前上下文占用」与「会话累计总消耗」：** 一次包含 30 步工具调用（Tool Calls）的长对话，第 30 步的 `input + cacheRead + cacheCreation + output` 代表此刻上下文窗口有多满（例如 `120K / 200K`），但**前 29 步每轮调用都会重新计费一遍前缀缓存读取与新生成输出**，整个会话真实消耗掉的累计 Token 往往高达数百万（`Sum of all steps`）；
3. **分支/克隆会话与子代理（Fork / `btw` / Subagent）去重：** 当用户克隆分支对话或模型触发子代理时，避免把父会话历史步骤或影子调用重复记入累计账本。

---

## 3. 与 Antigravity Tab Status (`v2.9.0`) 现状能力对比矩阵

对照当前仓库代码（[page-bridge.js](../page-bridge.js)、[scanner.js](../scanner.js)、[popup.js](../popup.js)、[background.js](../background.js)），将双方能力逐项盘点如下：

| 能力域 | Antigravity Tab Status (`v2.9.0`) 现状 | Magpie 相关能力 | 差距评估与借鉴价值 |
| :--- | :--- | :--- | :--- |
| **实时单步上下文占用** | **已具备（非常完善）**：`analyzeConversationSteps()` 精确区分 `precision: 'exact' \| 'estimated'`，支持快照 + 尾部增量、`-drop%` 自动压缩检测，并通过 `SHADOW_MODEL_RE` 过滤 `M50`/`M21`/`FLASH_LITE`/`IMAGE`/`BANANA` 防止污染主模型上限 | 依赖本地日志/模型上下文配置对比 | **我方领先**：内存直读 + 尾部步数增量与影子模型过滤已非常精准，应继续保持 |
| **单会话累计总 Token** | **缺失**：`analyzeConversationSteps()` 循环遇到新的 `mu && totalMu > 0` 时直接覆写 `baseTokens`、`inputTokens`、`cacheReadTokens`、`outputTokens`，只保留了最后一步快照 | **已具备**：按每次请求/步骤累加，完整呈现会话全生命周期总消耗 | **高价值（P0）**：长会话中「当前上下文 80K」与「累计已消耗 2.4M」信息完全不同，用户极需两者并存 |
| **`reasoningTokens` / 分层 `cacheWrite` / `TTFT`** | **部分缺失**：`extractStepModelUsage()` 目前提取了 `inputTokens`、`cacheReadTokens`、`cacheCreationTokens`、`outputTokens`，尚未解析 `thoughtsTokenCount` / `reasoningTokens`、5m/1h 分层或步骤首字耗时 `TTFT` | **已具备**：独立拆分 `reasoning_tokens`、`cache_write_5m/1h` 与 `first_text_ms` | **高价值（P0）**：Gemini 2.5/3 Thinking 与 Claude Extended Thinking 下推理 Token 占比极大 |
| **跨刷新持久化历史账本** | **缺失**：`convTelemetryById` 仅驻留页面内存且 `MAX_TELEMETRY_CONVS = 40`，刷新或关闭 Antigravity 标签页后全部清零 | **已具备**：`usage.jsonl` 跨重启持久化，`Today / 7d / 30d / All` 历史聚合 | **高价值（P1）**：扩展本身常驻浏览器，利用 `chrome.storage.local` 即可实现零磁盘工具依赖的跨天统计 |
| **等价 API 成本与缓存节省额** | **缺失**：仅展示原始 Token 数量与 `cacheHitRate` 百分比 | **已具备**：内置/联动 `models.dev` 挂牌单价，换算等价 USD/CNY 成本与缓存节省金额 | **高价值（P1）**：对订阅用户直观评估使用强度与缓存效率极有帮助 |
| **5h 配额池与消耗配速（Pace / ETA）** | **基础具备**：`#quotaStrip` 展示 `Gemini` / `Claude / GPT` 5h 剩余 `%` 与重置倒计时（`formatQuotaReset()`），按 `<= 20%` / `<= 50%` 莫兰迪三色高亮 | **进阶具备**：`Pace` 配速健康度、预计耗尽倒计时、7d 周窗口感知及双时机通知 | **高价值（P0/P2）**：无需额外权限即可基于已有 `remainingFraction` + `resetTimeMs` 计算 `Pace` 与预计耗尽时间 |
| **多维图表 / 排行 / 热力图** | **缺失**：仅按「浏览器标签页 -> 项目 -> 对话」树形列出当前活跃任务 | **已具备**：趋势图、活跃度热力图、按模型/Agent/会话排行、数据导出 | **中-高价值（P1）**：以默认折叠的抽屉形式放进 Side Panel / Popup 底部，兼顾极简与专业度 |
| **Prompt Cache 5m 保鲜提示** | **仅静态展示**：在弹窗气泡与胶囊 tooltip 展示最近一步缓存命中率 | **动态感知**：结合 `coldAfter`（如 5 分钟 TTL）判断缓存是否即将变冷 | **中价值（P2）**：可在可选页内胶囊（`showInPageCapsule`）或会话悬停提示中显示温和保鲜倒计时 |

---

## 4. 面向我们插件的 MV3 架构落地方案设计

为确保所有新功能严格遵循 [AGENTS.md](../AGENTS.md) 中的 **Chromium 120+、MV3、严格 CSP、极简权限与零隐私泄露** 原则，以下给出可直接指导后续迭代的落地方案：

### 4.1 权限、安全与隐私合规红线

1. **绝不扩展外网或核心主机权限：**
   - 保持 `manifest.json` 现有 `permissions: ["storage", "sidePanel", "scripting"]` 与现有 `host_permissions` / `optional_host_permissions` 不变；
   - **禁止向 `models.dev` 或任何第三方接口发请求**：模型价格表与上下文默认规则全部内置为纯静态只读常量表（允许用户在本地修改/覆盖单价），确保 100% 离线、零外连。
2. **可选通知权限策略（若在 P2 引入桌面提醒）：**
   - 必须通过 `optional_permissions: ["notifications"]` 声明，仅当用户主动点击开启「配额恢复 / 重置前余量提醒」开关时，在同步点击事件中调用 `chrome.permissions.request({ permissions: ["notifications"] })`，并支持随时撤销。
3. **零正文落盘与 [PRIVACY.md](../PRIVACY.md) 同步：**
   - `chrome.storage.local` 中的历史用量账本**严格只存聚合后的数值与非敏感元数据**（日期键 `YYYY-MM-DD`、小时桶 `0-23`、模型 ID、Token 分项计数、去重步数游标、项目名与会话 ID 哈希/短标识），**绝不存储**用户输入文本、模型输出文本、代码片段或文件路径内容；
   - 未来上线 `chrome.storage.local` 持久化账本与可选导出/清空功能时，需同步更新 [PRIVACY.md](../PRIVACY.md) 的数据说明，并在设置面板提供一键「清空用量历史」。
4. **CSP 与 XSS 防护：**
   - 遵循现有零 `innerHTML`、零 `eval()`、零 `localStorage` 规范；所有图表（趋势柱状图、热力格）均使用纯 DOM + CSS Grid / SVG `createElementNS` 构建。

### 4.2 核心机制一：单会话「快照 + 累计」双轨遥测（[page-bridge.js](../page-bridge.js)）

在 `page-bridge.js` 中对现有 `extractStepModelUsage()`、`summarizeStep()` 与 `analyzeConversationSteps()` 做无破坏性扩展：

1. **补充提取 `reasoningTokens`、分层 `cacheWrite` 与步骤延迟：**
   - 在 `extractStepModelUsage(step)` 中新增兼容读取：
     - `reasoningTokens`：`rawMu.reasoningTokens ?? rawMu.reasoning_tokens ?? rawMu.thoughtsTokenCount ?? rawMu.thoughts_token_count ?? rawMu.thinkingTokens ?? rawMu.completion_tokens_details?.reasoning_tokens ?? rawMu.output_tokens_details?.reasoning_tokens`
     - `cacheWrite5mTokens` / `cacheWrite1hTokens`：兼容 Anthropic 样式 `rawMu.cache_creation?.ephemeral_5m_input_tokens` 与 `ephemeral_1h_input_tokens`（若未分层则归入通用 `cacheCreationTokens`）
   - 在 `summarizeStep(step)` 中基于已有 `createdAt` 与 `finishedGeneratingAt`（若流式首字时间不可直接观测，则在被动流式监听 `fetch`/`XHR`/`WS` 首帧响应到达时记录观测型 `firstChunkAt`）计算单步 `durationMs` 与可选 `ttftMs`。
2. **`analyzeConversationSteps()` 保持「快照态」同时新增「累计态」输出：**
   - **现状保留（上下文窗口水位）：** `contextUsed`、`contextLimit`、`usagePercent`、`remainPercent`、`precision`、`compressionDetected`、`compressionDrop` 完全沿用现有快照+尾部增量逻辑，确保已有 UI 与页内胶囊行为稳定。
   - **新增累计字段（整段会话生命周期总消耗）：** 在遍历 `steps` 时同步累加所有含有效 `modelUsage` 的主模型步骤（`!isShadowModel(sModel)`）：
     - `sessionInputTokens`、`sessionCacheReadTokens`、`sessionCacheCreationTokens`、`sessionOutputTokens`、`sessionReasoningTokens`
     - `sessionTotalTokens = sessionInputTokens + sessionCacheReadTokens + sessionCacheCreationTokens + sessionOutputTokens + sessionReasoningTokens`
     - `sessionStepPricedCount`（含真实 `modelUsage` 的计费步数）与 `lastStepTs`（最后一次生成完成时间戳，供缓存保鲜倒计时使用）
     - **可选影子模型统计：** 单独记录 `subagentTotalTokens`（由 `SHADOW_MODEL_RE` 命中步骤产生，**不计入**当前对话上下文窗口占用，但可单独计入整日总消耗或展示为「子代理/后台调用消耗」）。

### 4.3 核心机制二：防重复记账的「高水位步数账本」（[background.js](../background.js) + `chrome.storage.local`）

浏览器插件会高频扫描页面（500ms 缓存 + 多标签页并发 + 页面刷新恢复），若直接把每次上报的会话累计值相加会导致严重的重复统计。借鉴数据库高水位游标（High-Watermark）与 Magpie 去重思路，设计如下轻量账本 `agyUsageLedgerV1`：

1. **为什么必须在 `background.js` + `chrome.storage.local` 聚合：**
   - MV3 Service Worker 约 30s 空闲即休眠，不能依赖 SW 全局变量保存状态；
   - `chrome.storage.sync` 单项 8 KB / 总容量 100 KB 极易写满且会触发频繁同步限流；
   - `chrome.storage.local` 提供 10 MB 本地容量，完全不占内存且跨浏览器重启持久化。
2. **高水位去重增量记账（Step-Level Delta Ingestion）：**
   - `page-bridge.js` 为每个含真实 `modelUsage` 的步骤生成稳定索引 `absIndex = (entry.stepOffsetBase || 0) + i` 与轻量步级增量指纹；
   - 当 `content.js` / `frame-detector.js` 同步快照至 `background.js`（可按每 10s 或步骤数变化防抖合并发送，避免高频写盘），`background.js` 读取 `agyUsageLedgerV1.watermarks[convId]`：
     - 仅当某个 `convId` 出现 **`absIndex > watermark.maxStepIndex`**（或同索引下最终完成后的 Token 数净增长且此前未封账）时，才计算增量 `deltaTokens`（按各模型与分项拆分）并累加进当日 `daily["YYYY-MM-DD"]`；
     - **防刷新/分支重复归因：** Antigravity 刷新页面或重新打开历史对话时，`absIndex <= watermark.maxStepIndex` 且特征一致的步骤会被自动跳过，实现**幂等去重（Idempotent Upsert）**；若检测到分支会话继承相同前缀步数，可通过步骤签名比对跳过已记账前缀。
3. **数据结构与容量预算（`< 250 KB`，90 天自动滚动裁剪）：**
   ```jsonc
   // 存储在 chrome.storage.local["agyUsageLedgerV1"]
   {
     "version": 1,
     "watermarks": {
       "<convId>": {
         "maxStepIndex": 42,
         "lastTotals": { "in": 12000, "cr": 480000, "cw": 15000, "out": 8400, "rs": 6200 },
         "updatedAt": 1795100000000
       }
     },
     "daily": {
       "2026-11-20": {
         "totals": { "in": 45000, "cr": 1820000, "cw": 64000, "out": 31000, "rs": 18500, "calls": 64 },
         "hourlyTokens": [0, 0, "...24个整数桶..."],
         "byModel": {
           "claude-sonnet-4-5": { "in": 20000, "cr": 1200000, "cw": 40000, "out": 15000, "rs": 8000, "calls": 32 },
           "gemini-2.5-pro": { "in": 25000, "cr": 620000, "cw": 24000, "out": 16000, "rs": 10500, "calls": 32 }
         },
         "byProject": {
           "AntigravityTabStatus": { "total": 1480000, "equivUsd": 1.24, "calls": 48 }
         }
       }
     }
   }
   ```
   - `watermarks` 保留最近活跃的 `300` 个 `convId`（按 `updatedAt` LRU 裁剪）；`daily` 自动清理超过 `90` 天的历史桶，整体存储长期稳定在几十 KB 到两百 KB 之间。

### 4.4 核心机制三：离线等价成本与缓存节省估算引擎

借鉴 Magpie 的挂牌单价折算与自定义覆写思路，在扩展内部构建静态费率映射表（按标准 `/ 1M tokens` 美元单价，支持在设置中切换 `USD` / `CNY` 与覆盖单价）：

```js
// 示例计算模型（单位：USD / 1,000,000 tokens）
// actualCost = (in * rate.in + cr * rate.cacheRead + cw * rate.cacheWrite + (out + rs) * rate.out) / 1e6
// cacheSaved = Math.max(0, cr * (rate.in - rate.cacheRead) / 1e6)
```

- **模型别名归一化：** 将 Antigravity 内部占位/枚举 ID（如 `MODEL_PLACEHOLDER_M18`、`MODEL_PLACEHOLDER_M36`、`MODEL_PLACEHOLDER_M26`、`MODEL_PLACEHOLDER_M35` 等）与常见展示名（`Gemini 2.5 Pro`、`Gemini 2.5 Flash`、`Claude Sonnet`、`Claude Opus`、`GPT` 系列）映射到统一的费率档位；对于未命中已知费率的实验性模型，清晰标注 `--`（不估算费用，避免给出误导性数字）。
- **诚实度原则延续：** 仅当步骤具备真实 `modelUsage`（`precision === 'exact'`）时才计入账本与成本；无快照估算步骤（`~`）不记入金额账本。

### 4.5 核心机制四：5h 配额配速（`Pace`）、耗尽 `ETA` 与缓存保鲜算法

无需新增任何后台接口请求，直接复用 `quotaPools.gemini` 与 `quotaPools.premium` 已有的 `remainingFraction` 与 `resetTimeMs`：

1. **配速健康度（`Pace`）计算：**
   - 设 5 小时窗口总时长 `WINDOW_MS = 5 * 60 * 60 * 1000`；
   - 若 `resetTimeMs > now`，则距离重置剩余时间比例 `timeLeftRatio = Math.min(1, (resetTimeMs - now) / WINDOW_MS)`；
   - 剩余配额时间比：`paceRatio = timeLeftRatio > 0.02 ? remainingFraction / timeLeftRatio : 1`；
   - **语义分级（复用莫兰迪三色语义 tokens）：**
     - `paceRatio >= 1.1`：**充裕**（剩余配额比例明显高于剩余时间比例，可安心并发）；
     - `0.7 <= paceRatio < 1.1`：**均衡**（当前消耗节奏与重置倒计时基本匹配）；
     - `paceRatio < 0.7`（且 `remainingFraction < 0.8`）：**消耗偏快**，结合过去 15~30 分钟的 `quotaPools` 环形样本斜率，推算「按当前速率预计 `~XX 分钟` 耗尽（早于重置时间）」。
2. **重置前余量机会提示：**
   - 当 `resetTimeMs - now <= 30 * 60 * 1000`（最后 30 分钟）且 `remainingFraction >= 0.4`（仍剩余 >= 40% 配额）时，在 `#quotaStrip` 旁温和标记「即将刷新 · 余量充足」，方便用户顺手安排收尾或大任务。
3. **Prompt Cache 5 分钟保鲜感知：**
   - 对使用 Claude 等具有短效前缀缓存的模型对话，记录最后一次完成生成的步骤时间戳 `lastStepFinishedAt`；
   - 当暂停思考接近 `4m~5m`（`240s~300s`）时，在可选页内胶囊（`syncInPageCapsules`）的 tooltip 或面板会话详情中提示「缓存剩余约 XXs 保鲜」，超过 5 分钟提示「缓存可能已冷（下次续聊将重建前缀缓存）」。

### 4.6 核心机制五：不破坏弹窗极简度的 UI 渐进式披露方案

参考 `popup.html` / `sidepanel.html` / `popup.css` 现有设计语言（`@layer components`、`light-dark()`、`details::details-content`、`forced-colors`、`container: panel / inline-size`）：

1. **`#quotaStrip` 轻量升级：**
   - 保持每条配额池 1 行进度条的克制布局，在右侧元信息或 `title` 悬停中追加配速标记（如 `68% · 2h 14m 后重置 · Pace 1.2x` 或 `预计 38m 耗尽`）。
2. **对话行徽标升级（[popup.js](../popup.js)）：**
   - 行内主徽标依然保持高信噪比的当前上下文窗口占比（如 `84K/200K · 42%`）与实时 `tok/s`；
   - 悬停 `title`（及展开后的详情/胶囊 tooltip）新增展示：**本会话累计消耗**（如 `累计 1.42M tok · ~$0.68`）、**推理 Token 占比**与 **缓存命中节省**。
3. **默认折叠的「用量统计与成本抽屉」（`<details class="card usage-drawer">`）：**
   - 与现有的 `<details class="card advanced-panel">` 一致，**默认折叠不增加首屏视觉负担**，在 Popup 与 Side Panel（宽屏容器下支持两列网格自适应）均可顺滑展开：
     - **顶部周期切换器：** `今日 | 7天 | 30天`；
     - **4 格关键指标卡（KPI Grid）：**
       1. 总消耗 Token（拆分输入 / 缓存读 / 缓存写 / 输出 / 推理）；
       2. 等价 API 成本（USD / CNY）与总调用次数；
       3. 缓存命中率 & 缓存已节省金额；
       4. 平均流式速度 `avgTokPerSec` & TTFT（若已采集）；
     - **近 7 日 / 24 小时迷你柱状趋势条 & 活跃热力格：** 纯 SVG / CSS Grid 渲染，支持键盘无障碍 `aria-label` 读数；
     - **Top 模型与 Top 项目占比条：** 一目了然看到哪几个项目/模型占用了最多额度；
     - **底部操作栏：** `导出 JSON / CSV`（本地 Blob 下载或剪贴板复制）与 `清空本地统计`。
4. **10 语言国际化同步规范：**
   - 所有新增 UI 文案键必须在 [i18n.js](../i18n.js) 的全部 10 个语言字典（`en`、`zh_CN`、`zh_TW`、`ja`、`ko`、`es`、`fr`、`de`、`pt_BR`、`ru`）中 100% 对齐，并同步更新 [scripts/verify.mjs](../scripts/verify.mjs) 中的预期键数校验断言。

---

## 5. 分阶段演进路线图与优先级建议（P0 -> P1 -> P2）

| 阶段 | 建议纳入版本 | 核心交付功能 | 涉及主要文件 | 预估复杂度与风险 | 预期用户价值 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **P0** | `v2.10.0` | 1. **单会话累计消耗 Token 统计**（区分上下文水位与历史累计）<br>2. **提取 `reasoningTokens`（思考链）、分层 `cacheWrite` 与步级时长**<br>3. **5h 配额池 `Pace` 配速健康度、耗尽 `ETA` 与重置前余量提示** | [page-bridge.js](../page-bridge.js)、[scanner.js](../scanner.js)、[popup.js](../popup.js)、[i18n.js](../i18n.js) | **低-中**：全在已有架构内增补字段与计算，无新增存储架构，无需权限变更 | **极高**：立刻解决「不知道一个长任务总共烧了多少 Token」与「当前配额还能撑多久」两大痛点 |
| **P1** | `v2.11.0` | 1. **`chrome.storage.local` 高水位去重账本**（90 天滚动、防刷新/分支重复统计）<br>2. **离线模型单价表 + 等价 API 成本与缓存节省估算**（USD/CNY）<br>3. **默认折叠「用量与成本抽屉」**（`今日 / 7天 / 30天`、趋势/热力图、按模型/项目排行、JSON/CSV 导出与一键清空）<br>4. 同步更新 [PRIVACY.md](../PRIVACY.md) | [background.js](../background.js)、[page-bridge.js](../page-bridge.js)、[content.js](../content.js)、[popup.html](../popup.html)、[sidepanel.html](../sidepanel.html)、[popup.css](../popup.css)、[popup.js](../popup.js)、[i18n.js](../i18n.js)、[PRIVACY.md](../PRIVACY.md) | **中-高**：需重点验证高水位步数游标在标签页刷新、多窗口并发及分支会话下的幂等性 | **极高**：补全跨日/跨周复盘与订阅价值量化，同时保持 Popup 极简、Side Panel 专业 |
| **P2** | `v2.12.0+` | 1. **可选桌面配额通知**（`optional_permissions: ["notifications"]`：额度耗尽后恢复可用提醒 / 重置前闲置余量提醒）<br>2. **Prompt Cache 5 分钟保鲜倒计时提示**（集成至可选页内胶囊与会话悬停）<br>3. **（探索项）可选本地 `magpie` 网关联动**：仅在用户手动授权 `localhost` 且检测到本地 Magpie `/v1/magpie/usage` 或 `/v1/magpie/quotas` 存在时，以只读方式聚合 CLI Agent（Claude Code / Codex）消费到侧边栏统一视图 | [manifest.json](../manifest.json)、[background.js](../background.js)、[scanner.js](../scanner.js)、[popup.js](../popup.js)、[i18n.js](../i18n.js) | **中-高**：需处理 `notifications` 可选权限授权流及跨本地端端口兼容 | **高**：打通主动省额度提醒与「网页端 + 桌面/CLI 代理」统一观测视角 |

---

## 6. 参考资料

- GitHub 仓库与文档：[`yetone/magpie`](https://github.com/yetone/magpie)（本地 AI 编程代理统一网关、`usage.jsonl` 账本、`models.dev` 费率引擎、`magpie quota`、`QuotaCard` / `Allowance.Pace` 与 Antigravity 会话元数据解析设计）
- 现有项目架构与约束：[AGENTS.md](../AGENTS.md)、[PLAN.md](../PLAN.md)、[PRIVACY.md](../PRIVACY.md)、[page-bridge.js](../page-bridge.js)
