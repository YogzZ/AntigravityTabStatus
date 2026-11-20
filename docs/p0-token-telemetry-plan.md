# P0 Technical Specification — Dual-Track Session Token Telemetry & 5h Quota Pace / ETA

> **Status:** Implementation-Ready Specification (P0 Scope Only)
> **References:** [AGENTS.md](../AGENTS.md) · [docs/magpie-token-telemetry-research.md](magpie-token-telemetry-research.md)
> **Target Runtime:** Chromium 120+ (Manifest V3)

---

## 1. Scope Boundaries & Non-Goals

### 1.1 In-Scope (P0 Deliverables)
1. **Dual-Track Session Token Telemetry (`page-bridge.js`)**
   - Extend `extractStepModelUsage(step)` to parse `reasoningTokens` (with disjoint vs. nested-detail deduplication) and tiered `cacheWrite5mTokens` / `cacheWrite1hTokens` (seamlessly rolling up / falling back to `cacheCreationTokens`).
   - Extend `summarizeStep(step)` and passive stream observation (`fetch` / `XHR` / `WebSocket`) to capture step `durationMs` and optional observed `ttftMs` (strictly observed or metadata-backed; **never** fabricated).
   - Extend `analyzeConversationSteps()` (and `MAX_STEPS_PER_CONV = 240` eviction accounting) to preserve **100%** of existing context-window snapshot + tail-delta metrics while adding cumulative main-model session counters (`session*`), `lastStepTs`, step latency (`lastStepDurationMs`, `lastStepTtftMs`), and isolated `subagentTotalTokens` for `SHADOW_MODEL_RE` steps.
2. **5h Quota Pool `Pace`, Exhaustion `ETA`, & Pre-Reset Unused Quota Hint (`page-bridge.js`, `content.js`, `scanner.js`, `popup.js`, `popup.css`)**
   - Compute `timeLeftMs`, `timeLeftRatio`, `paceRatio`, `paceStatus` (`comfortable` / `balanced` / `fast`), ring-buffer slope-based depletion `etaMs` (only when projected to exhaust before `resetTimeMs`, with strict division-by-zero, `NaN`/`Infinity`, window-reset, quantization-noise, and stale-idle guards), and `unusedPreResetHint` (`0 < resetTimeMs - now <= 30m` and `remainingFraction >= 0.4`).
3. **Cross-Frame Relay, Progressive Disclosure UI, & 10-Locale i18n (`scanner.js`, `content.js`, `popup.js`, `popup.css`, `i18n.js`, `scripts/verify.mjs`)**
   - Preserve all new conversation and quota fields across child-frame sync, `content.js` `mergeTelemetry()`, and `popup.js` `aggregateTelemetry()` / `_resolvedTel`.
   - Upgrade `#quotaStrip` in `popup.js` + `popup.css` (preserving strict 1-line `.quota-head` + 1 `<progress class="quota-progress">` bar height, Morandi 3A tokens, `light-dark()`, `forced-colors: active`, and narrow container safety).
   - Enrich per-chat hover `title` in `popup.js` and the opt-in Shadow DOM composer capsule tooltip (`syncInPageCapsules` in `scanner.js`, `WeakMap`-backed, zero `innerHTML`, WCAG 1.4.13) while keeping primary inline chips high-signal.
   - Add **21** canonical i18n keys across all 10 locales (`165 -> 186` keys) with static literal `t('...')` call sites and update `scripts/verify.mjs`.

### 1.2 Explicit Non-Goals (Deferred to P1 / P2)
- **No `manifest.json` changes:** Keep `permissions: ["storage", "sidePanel", "scripting"]`, `host_permissions`, and `optional_host_permissions` untouched.
- **No P1 features:** No `chrome.storage.local` persistent `agyUsageLedgerV1` ledger, no offline USD/CNY pricing catalog, no `<details class="card usage-drawer">` analytics drawer, no JSON/CSV export, and no changes to `chrome.storage.sync` schema.
- **No P2 features:** No `notifications` optional permission, no 5-minute prompt-cache `coldAfter` countdown timer, and no localhost Magpie `/v1/magpie/*` API polling.

---

## 2. File-by-File Architecture & Data Flow Map

| File | World / Surface | P0 Changes Required |
| :--- | :--- | :--- |
| `page-bridge.js` | `MAIN` (`all_frames: true`) | 1) Extend `extractStepModelUsage(step)` for `reasoningTokens`, `reasoningInOutput`, `cacheWrite5mTokens`, `cacheWrite1hTokens`.<br>2) Add `parseDurationMs()` + live stream step-timing tracker (`liveStepTimings` on conv telemetry entry + non-poll streaming `fetch` metadata) and extend `summarizeStep(step)` with `durationMs` and `ttftMs`.<br>3) Maintain `evictedSessionAcc` on `convTelemetryById` entries so `MAX_STEPS_PER_CONV = 240` splice never drops cumulative tokens, and align initial `refreshLsSteps` catchup offset to `MAX_STEPS_PER_CONV`.<br>4) Extend `analyzeConversationSteps()` with dual-track `session*`, `subagentTotalTokens`, `lastStepTs`, `lastStepDurationMs`, `lastStepTtftMs`.<br>5) Add bounded per-pool ring buffer (`quotaHistoryByPool`) + `computeQuotaPoolPaceAndEta()` inside `buildTelemetryPayload()`. |
| `scanner.js` | `ISOLATED` (Top & Child) | Enrich `buildCapsuleInstance()` and `updateCapsuleState()` in `syncInPageCapsules()` to render cumulative session total, reasoning/cache-write/subagent breakdown, observed step latency (`TTFT` / duration), and 5h quota `Pace` / `ETA` / `Spare` suffix inside the Shadow DOM tooltip (`#agy-cap-tip`). (`queryMainWorldBridge` and `resolveTaskTelemetry` already forward full `telemetry` objects without stripping keys.) |
| `frame-detector.js` | `ISOLATED` (Child) | **No code changes required** — `dispatchSnapshot()` already forwards `res.telemetry` and `res.projects` wholesale via origin-verified `window.top.postMessage` and `CHILD_FRAME_SYNC`. Verify pass-through in tests. |
| `background.js` | Service Worker | **No code changes required** — `CHILD_FRAME_SYNC` -> `RELAYED_CHILD_SYNC` already relays `message.telemetry` untouched. |
| `content.js` | `ISOLATED` (Top) | 1) Update `mergeTelemetry(sources)` so `quotaPools` prefers sources with valid `remainingFraction` while backfilling non-null `etaMs` / `burnRatePerHour` from fresh sibling frames sharing the same `resetTimeMs`, and `conversations` tie-breaks `exact` records by higher `sessionStepPricedCount` before `fetchedAt`.<br>2) Include compact quota/session telemetry digest in `notifyExtensionPanels()` so `AGY_STATE_PUSH` fires promptly on token/quota updates. |
| `popup.js` | Extension Popup & Side Panel | 1) Update `aggregateTelemetry(instances)` conversation tie-breaking (`precision === 'exact'`, then `sessionStepPricedCount`, then `fetchedAt`) and pool `etaMs` preservation.<br>2) Add `evaluatePoolDisplayMetrics(pool, nowMs)` (recomputing live `timeLeftRatio`, `paceRatio`, `paceStatus`, `unusedPreResetHint`, and clamping live `etaMs` against `nowMs`) and upgrade `renderQuotaStrip(telemetry)` with `.quota-title-group`, `.quota-pace-badge`, Morandi health escalation, accessible `aria-label`, and multi-line `itemEl.title`.<br>3) Expand `_resolvedTel` whitelist in `renderProjectsTree()` to preserve all new P0 fields and enrich `rowBtn.title` + `telRow.title` with cumulative session summary, reasoning/cache-write/subagent breakdown, and observed latency. |
| `popup.css` | Extension Popup & Side Panel | Style `.quota-title-group` and `.quota-pace-badge` (`.is-comfortable`, `.is-balanced`, `.is-warn`, `.is-fast`, `.is-spare`) inside `@layer components` using `light-dark()`, `color-mix(in oklab, ...)`, Morandi 3A tokens, `@media (forced-colors: active)`, and single-line overflow guards (`min-inline-size: 0`, `minmax(13.25rem, 1fr)`). Keep `progress.quota-progress` vendor pseudo-elements strictly in separate rules. |
| `popup.html` / `sidepanel.html` | Extension HTML | **No markup changes required** (zero new controls or drawers in P0; `#quotaStrip` and `#projectsList` are populated dynamically by `popup.js`). |
| `i18n.js` | `ISOLATED` & Extension Pages | Add **21** new keys across all 10 locales (`en`, `zh_CN`, `zh_TW`, `ja`, `ko`, `es`, `fr`, `de`, `pt_BR`, `ru`), bringing total keys per locale from `165` to `186` with 100% `{placeholder}` parity. |
| `scripts/verify.mjs` | Node Verification Suite | Update expected i18n key count from `165` to `186` in comments, `assert(referencedKeys.size === 186, ...)`, and `checks.push(...)` summary output. |

---

## 3. Specification A — Dual-Track Session Telemetry (`page-bridge.js`)

### 3.1 `extractStepModelUsage(step)` Extensions

#### 3.1.1 Return Shape (Uniform Across Exact & Fallback Branches)
When `rawMu` is absent/non-object and `resolvedFallback` is non-empty, return zero-initialized fields so callers always see a consistent shape:
```js
{
  model: resolvedFallback,
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
  cacheWrite5mTokens: 0,
  cacheWrite1hTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  reasoningInOutput: false
}
```

#### 3.1.2 Tiered Cache Creation (`cacheWrite5mTokens` / `cacheWrite1hTokens` / `cacheCreationTokens`)
1. Inspect optional nested cache-creation sub-objects:
   ```js
   const rawCacheObj =
     (rawMu.cache_creation && typeof rawMu.cache_creation === 'object'
       ? rawMu.cache_creation
       : null) ||
     (rawMu.cacheCreation && typeof rawMu.cacheCreation === 'object'
       ? rawMu.cacheCreation
       : null);
   ```
2. Parse flat and tiered counts via `toNonNegInt(...)`:
   ```js
   const flatCacheCreationTokens = toNonNegInt(
     rawMu.cacheCreationTokens ??
       rawMu.cache_creation_tokens ??
       rawMu.cacheCreationInputTokens ??
       rawMu.cache_creation_input_tokens ??
       rawMu.cacheWriteTokens ??
       rawMu.cache_write_tokens
   );
   const cacheWrite5mTokens = toNonNegInt(
     rawMu.cacheWrite5mTokens ??
       rawMu.cache_write_5m_tokens ??
       rawMu.ephemeral5mInputTokens ??
       rawMu.ephemeral_5m_input_tokens ??
       rawCacheObj?.ephemeral5mInputTokens ??
       rawCacheObj?.ephemeral_5m_input_tokens ??
       rawCacheObj?.cacheWrite5mTokens ??
       rawCacheObj?.cache_write_5m_tokens
   );
   const cacheWrite1hTokens = toNonNegInt(
     rawMu.cacheWrite1hTokens ??
       rawMu.cache_write_1h_tokens ??
       rawMu.ephemeral1hInputTokens ??
       rawMu.ephemeral_1h_input_tokens ??
       rawCacheObj?.ephemeral1hInputTokens ??
       rawCacheObj?.ephemeral_1h_input_tokens ??
       rawCacheObj?.cacheWrite1hTokens ??
       rawCacheObj?.cache_write_1h_tokens
   );
   const cacheCreationTokens = Math.max(
     flatCacheCreationTokens,
     cacheWrite5mTokens + cacheWrite1hTokens
   );
   ```
   - **Roll-up & Fallback Invariant:**
     - If upstream emits only tiered `cache_creation.ephemeral_5m_input_tokens` / `ephemeral_1h_input_tokens` (with flat `cache_creation_input_tokens` omitted or `0`), `cacheCreationTokens` automatically equals `cacheWrite5mTokens + cacheWrite1hTokens`.
     - If upstream emits only flat `cacheCreationTokens` (untiered), `cacheWrite5mTokens === 0`, `cacheWrite1hTokens === 0`, and `cacheCreationTokens` holds the full amount so UI and session totals seamlessly fall back to `cacheCreationTokens` / `sessionCacheCreationTokens`.
     - `cacheWrite5mTokens` and `cacheWrite1hTokens` are sub-buckets of `cacheCreationTokens` and MUST NEVER be added on top of `cacheCreationTokens` when computing `contextUsed` or `sessionTotalTokens`.

#### 3.1.3 Reasoning / Thinking Tokens (`reasoningTokens` & `reasoningInOutput` Deduplication)
1. Distinguish disjoint top-level thinking fields (Antigravity `ModelUsage`, Gemini `usageMetadata.thoughtsTokenCount`, Anthropic) from OpenAI nested breakdown fields (`completion_tokens_details.reasoning_tokens` / `output_tokens_details.reasoning_tokens`, where `completion_tokens` / `output_tokens` **already includes** `reasoning_tokens`):
   ```js
   const directReasoningRaw =
     rawMu.reasoningTokens ??
     rawMu.reasoning_tokens ??
     rawMu.thoughtsTokenCount ??
     rawMu.thoughts_token_count ??
     rawMu.thinkingTokens ??
     rawMu.thinking_tokens;
   const nestedReasoningRaw =
     rawMu.completionTokensDetails?.reasoningTokens ??
     rawMu.completion_tokens_details?.reasoning_tokens ??
     rawMu.outputTokensDetails?.reasoningTokens ??
     rawMu.output_tokens_details?.reasoning_tokens;
   const reasoningTokens = toNonNegInt(directReasoningRaw ?? nestedReasoningRaw);
   const reasoningInOutput =
     directReasoningRaw === undefined &&
     nestedReasoningRaw !== undefined &&
     reasoningTokens > 0 &&
     outputTokens >= reasoningTokens;
   ```
2. Non-empty usage guard:
   ```js
   if (
     !model &&
     inputTokens + cacheReadTokens + cacheCreationTokens + outputTokens + reasoningTokens === 0
   ) {
     return null;
   }
   ```

---

### 3.2 Step `durationMs` and Observed `ttftMs` (`summarizeStep` + Passive Stream Observation)

#### 3.2.1 Strict Honesty Rule
`durationMs` and `ttftMs` MUST be `number` (positive integer milliseconds) when backed by valid step timestamps/metadata or live stream observation, and `null` otherwise. **Never** fabricate, estimate from token counts, or use read-only polling RPC latency (`GetCascadeTrajectorySteps`, `GetAllCascadeTrajectories`, `GetUserStatus`) as `ttftMs`.

#### 3.2.2 Duration & Timestamp Parsing (`summarizeStep(step)`)
1. Add helper `parseDurationMs(raw, maxMs = 3_600_000)`:
   - `number`: if `Number.isFinite(raw) && raw > 0 && raw <= maxMs`, return `Math.round(raw)`.
   - `string`: trim; if `/^\d+(?:\.\d+)?ms$/i`, parse float in ms; if `/^\d+(?:\.\d+)?s$/i`, parse `float * 1000` in ms; if plain numeric `/^\d+(?:\.\d+)?$/`, parse float in ms; validate `> 0 && <= maxMs`.
   - `object` (Protobuf `Duration` `{ seconds, nanos }`): compute `Number(raw.seconds ?? raw.sec ?? 0) * 1000 + Number(raw.nanos ?? raw.nano ?? 0) / 1e6`; validate `Number.isFinite(ms) && ms > 0 && ms <= maxMs`.
   - Otherwise return `null`.
2. In `summarizeStep(step)`:
   - Parse `createdAt` from `step.metadata?.createdAt ?? step.createdAt ?? step.timestamp`.
   - Parse `finishedGeneratingAt` from `step.metadata?.finishedGeneratingAt ?? step.finishedGeneratingAt ?? step.metadata?.completedAt ?? step.completedAt`.
   - Compute `durationMs`:
     1) Explicit metadata: `parseDurationMs(step.metadata?.durationMs ?? step.metadata?.duration_ms ?? step.metadata?.latencyMs ?? step.durationMs ?? step.duration_ms ?? step.latencyMs ?? step.metadata?.duration)`
     2) Timestamp delta fallback: if `createdAt !== null && finishedGeneratingAt !== null && finishedGeneratingAt > createdAt && finishedGeneratingAt - createdAt <= 3_600_000`, `finishedGeneratingAt - createdAt`. (Strictly `>` rather than `>=` so instant `0ms` user/system steps stay `null`.)
     3) Otherwise `null`.
   - Compute `ttftMs` from step metadata (when present):
     1) Explicit metadata: `parseDurationMs(step.metadata?.ttftMs ?? step.metadata?.ttft_ms ?? step.metadata?.firstTokenMs ?? step.metadata?.first_token_ms ?? step.metadata?.timeToFirstTokenMs ?? step.ttftMs ?? step.firstTextMs ?? step.first_text_ms, 600_000)`
     2) First-token timestamp delta: let `firstTokenAt = parseResetTimeMs(step.metadata?.firstTokenAt ?? step.metadata?.firstGeneratingAt ?? step.metadata?.startedGeneratingAt ?? step.firstTokenAt)`. If `firstTokenAt !== null && createdAt !== null && firstTokenAt > createdAt && firstTokenAt - createdAt <= 600_000`, `firstTokenAt - createdAt`.
     3) Clamp sanity: if `durationMs !== null && ttftMs !== null && ttftMs > durationMs`, set `ttftMs = null`.
   - Also record a boolean `hasOutputContent` on the summarized step (`Boolean((modelUsage && (modelUsage.outputTokens > 0 || modelUsage.reasoningTokens > 0)) || sEstOutputCheck)` — specifically: whether `step` already contains assistant response/thinking text or output tokens, i.e., `estTokens > 0` on a non-`USER` step or `outputTokens + reasoningTokens > 0`) for live stream transition tracking below.

#### 3.2.3 Passive Live Stream Observation (`fetch` / `XHR` / `WebSocket` -> `upsertConvSteps`)
To capture `ttftMs` and `durationMs` during live streaming when Antigravity omits `firstTokenAt` / `finishedGeneratingAt` in Protobuf steps:
1. **Non-Polling Streaming Request Metadata (`inspectFetchArgs` & `observeStreamingResponse`):**
   - Define `READ_ONLY_POLL_ENDPOINT_RE = /(?:GetUserStatus|GetAllCascadeTrajectories|GetCascadeTrajectorySteps|GetCascadeTrajectory)\b/i`.
   - In `inspectFetchArgs(input, init)`: record `reqStartedAt: Date.now()`, `isReadPoll: READ_ONLY_POLL_ENDPOINT_RE.test(urlStr)`, and `firstChunkAt: null`.
   - In `observeStreamingResponse(resp, meta, ct)`: on the first non-empty decoded frame/chunk (`if (meta && !meta.isReadPoll && meta.firstChunkAt === null) meta.firstChunkAt = Date.now()`).
   - For non-poll streaming `fetch` requests where `meta.firstChunkAt > meta.reqStartedAt` and `meta.firstChunkAt - meta.reqStartedAt <= 600_000`, pass `streamTtftMs = meta.firstChunkAt - meta.reqStartedAt` in `meta`.
2. **Per-Step Live Transition Tracker on `entry.liveStepTimings` (`Map<absStepIndex, { startAt, firstOutputAt, finishedAt }>`):**
   - Bounded to max `32` entries per conversation (prune oldest key when `size > 32`).
   - Inside `upsertConvSteps(convId, rawSteps, opts)` (which receives updates from passive `fetch`, `XHR`, `WebSocket`, Connect-RPC, and Fiber) at `now = Date.now()`:
     - For each incoming step `i` with `absIdx = effOffset + i`, raw step `rawStep = rawSteps[i]`, summarized `next = summarized[i]`, and existing `prev = entry.steps[targetIdx]`:
       - Determine if this step is a user-input step (`USER_INPUT` or role `USER`); skip timing tracking for user steps.
       - Determine `isRunningStep = isStepStatusRunning(rawStep)`.
       - Determine `hasOutput = Boolean((next.modelUsage && (next.modelUsage.outputTokens > 0 || next.modelUsage.reasoningTokens > 0)) || (!isUserStep && next.estTokens > 0))`.
       - **Start anchor (`timing.startAt`):**
         - Only initialize a live timing record when `source !== 'fiber'` or `isRunningStep` AND we observe the step **active/starting** (either `isRunningStep && !hasOutput`, or `next.createdAt !== null && now - next.createdAt <= 15_000 && isRunningStep`):
           `startAt = next.createdAt ?? metaStreamReqStartedAt ?? now`.
         - **Critical anti-fabrication rule:** If a step is seen for the first time already completed or already carrying output on historical load (`!prev && !isRunningStep && hasOutput`), do **NOT** create a synthetic `liveStepTimings` entry — rely strictly on step metadata (`next.durationMs`, `next.ttftMs`).
       - **First-output observation (`timing.firstOutputAt`):**
         - If `timing` exists for `absIdx` with `timing.firstOutputAt === null` and `hasOutput` becomes `true` at `now > timing.startAt` (`now - timing.startAt <= 600_000`):
           `timing.firstOutputAt = now`.
         - Alternatively, if `opts.streamTtftMs` is present on the currently running tail step (`i === summarized.length - 1 && isRunningStep && next.ttftMs === null`), use `opts.streamTtftMs`.
       - **Completion observation (`timing.finishedAt`):**
         - If `timing` exists for `absIdx` with `timing.finishedAt === null` and `!isRunningStep && hasOutput` (step transitioned from running to terminal) at `now > timing.startAt` (`now - timing.startAt <= 3_600_000`):
           `timing.finishedAt = next.finishedGeneratingAt ?? now`.
       - **Merge & Preserve on `next`:**
         - `next.ttftMs = next.ttftMs ?? prev?.ttftMs ?? (timing?.firstOutputAt ? timing.firstOutputAt - timing.startAt : null) ?? (isCurrentStreamingTail ? opts.streamTtftMs ?? null : null)`
         - `next.durationMs = next.durationMs ?? prev?.durationMs ?? (timing?.finishedAt ? timing.finishedAt - timing.startAt : null)`
         - Enforce `if (next.durationMs !== null && next.ttftMs !== null && next.ttftMs > next.durationMs) next.ttftMs = next.durationMs;` (or `null` if invalid `<= 0`).
     - Also ensure the existing `source === 'fiber'` preservation branches (when Fiber re-renders a step without `modelUsage`) preserve `prev.durationMs` and `prev.ttftMs` alongside `prev.modelUsage`.

---

### 3.3 Dual-Track `analyzeConversationSteps()` & Eviction Preservation

#### 3.3.1 Eviction Accumulator (`entry.evictedSessionAcc`)
In `getOrCreateConvTelemetry(convId)`, initialize `evictedSessionAcc: createEmptyStepAccumulator()`, where:
```js
function createEmptyStepAccumulator() {
  return {
    hasExactSnapshot: false,
    baseTokens: 0,
    inputTokens: 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheWrite5mTokens: 0,
    cacheWrite1hTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    estimatedDelta: 0,
    latestStepModelId: '',
    prevCacheInclusiveInput: 0,
    prevContextUsed: 0,
    prevSnapshotModel: '',
    compressionDetected: false,
    compressionBefore: 0,
    compressionAfter: 0,
    compressionDrop: 0,
    sessionInputTokens: 0,
    sessionCacheReadTokens: 0,
    sessionCacheCreationTokens: 0,
    sessionCacheWrite5mTokens: 0,
    sessionCacheWrite1hTokens: 0,
    sessionOutputTokens: 0,
    sessionReasoningTokens: 0,
    sessionStepPricedCount: 0,
    subagentTotalTokens: 0,
    lastStepTs: null,
    lastStepDurationMs: null,
    lastStepTtftMs: null
  };
}
```
- **Eviction & Reset Rules in `upsertConvSteps`:**
  1. When replacing from offset `0` (`entry.steps.length === 0 || (!isIncremental && effOffset === 0)`) or when `effOffset < entry.stepOffsetBase`: reset `entry.evictedSessionAcc = createEmptyStepAccumulator()`.
  2. When `entry.steps.length > MAX_STEPS_PER_CONV` (`240`):
     ```js
     const drop = entry.steps.length - MAX_STEPS_PER_CONV;
     const evicted = entry.steps.splice(0, drop);
     for (let i = 0; i < evicted.length; i++) {
       foldStepIntoAccumulator(entry.evictedSessionAcc, evicted[i]);
     }
     entry.stepOffsetBase += drop;
     ```
  3. In `refreshLsSteps`, update initial catchup `stepOffset` from `totalSteps > 80 ? totalSteps - 80 : 0` to `totalSteps > MAX_STEPS_PER_CONV ? totalSteps - MAX_STEPS_PER_CONV : 0` so conversations up to `240` steps load full step history from step `0` on initial catchup.

#### 3.3.2 Exact Per-Step Folding Logic (`foldStepIntoAccumulator(acc, s)`)
For each summarized step `s`:
1. Guard `if (!s || typeof s !== 'object') return;`.
2. Extract `mu = s.modelUsage` and `sModel = String(mu?.model || '').trim()`.
3. **Shadow / Subagent Model Isolation (`sModel && isShadowModel(sModel)`):**
   - Matches `SHADOW_MODEL_RE` (`M50`, `M21`, `FLASH_LITE`, `IMAGE`, `BANANA`).
   - If `mu` is present:
     ```js
     const shIn = toNonNegInt(mu.inputTokens);
     const shCr = toNonNegInt(mu.cacheReadTokens);
     const shCw = toNonNegInt(mu.cacheCreationTokens);
     const shOut = toNonNegInt(mu.outputTokens);
     const shReason = toNonNegInt(mu.reasoningTokens);
     const shEffOut = mu.reasoningInOutput ? Math.max(0, shOut - shReason) : shOut;
     acc.subagentTotalTokens += shIn + shCr + shCw + shEffOut + shReason;
     ```
   - **Immediately `return`!** Never modify `acc.baseTokens`, `acc.estimatedDelta`, `acc.latestStepModelId`, `acc.compression*`, or any `acc.session*` field.
4. **Main-Model Step (`!isShadowModel(sModel)`):**
   - Track step latency when `s.durationMs` or `s.ttftMs` is present on a model/assistant step:
     ```js
     if (
       (typeof s.durationMs === 'number' && s.durationMs > 0) ||
       (typeof s.ttftMs === 'number' && s.ttftMs > 0)
     ) {
       acc.lastStepDurationMs =
         typeof s.durationMs === 'number' && s.durationMs > 0 ? Math.round(s.durationMs) : null;
       acc.lastStepTtftMs =
         typeof s.ttftMs === 'number' && s.ttftMs > 0 ? Math.round(s.ttftMs) : null;
     }
     ```
   - Parse token components:
     ```js
     const inTok = toNonNegInt(mu?.inputTokens);
     const cacheRead = toNonNegInt(mu?.cacheReadTokens);
     const cacheCreate = toNonNegInt(mu?.cacheCreationTokens);
     const cacheW5m = toNonNegInt(mu?.cacheWrite5mTokens);
     const cacheW1h = toNonNegInt(mu?.cacheWrite1hTokens);
     const outTok = toNonNegInt(mu?.outputTokens);
     const reasonTok = toNonNegInt(mu?.reasoningTokens);
     const effOutTok = mu?.reasoningInOutput ? Math.max(0, outTok - reasonTok) : outTok;
     const totalMu = inTok + cacheRead + cacheCreate + outTok; // Snapshot context window formula (100% preserved)
     const sessionStepTotal = inTok + cacheRead + cacheCreate + effOutTok + reasonTok;
     ```
   - **Cumulative Session Track (`if (mu && sessionStepTotal > 0)`):**
     ```js
     acc.sessionInputTokens += inTok;
     acc.sessionCacheReadTokens += cacheRead;
     acc.sessionCacheCreationTokens += cacheCreate;
     acc.sessionCacheWrite5mTokens += cacheW5m;
     acc.sessionCacheWrite1hTokens += cacheW1h;
     acc.sessionOutputTokens += effOutTok;
     acc.sessionReasoningTokens += reasonTok;
     acc.sessionStepPricedCount += 1;
     const stepTs = s.finishedGeneratingAt ?? s.createdAt ?? null;
     if (typeof stepTs === 'number' && Number.isFinite(stepTs) && stepTs > (acc.lastStepTs || 0)) {
       acc.lastStepTs = stepTs;
     }
     ```
   - **Snapshot + Auto-Compaction Track (`if (mu && totalMu > 0)` — 100% Identical to v2.9.0):**
     - Run existing `cacheInclusiveInput = inTok + cacheRead + cacheCreate`, `hitInputDrop`, `hitSameModelDrop` (`> 5000` drop threshold), `compressionDetected`, `compressionBefore`, `compressionAfter`, `compressionDrop`.
     - Overwrite snapshot state:
       ```js
       acc.hasExactSnapshot = true;
       acc.baseTokens = totalMu;
       acc.inputTokens = inTok;
       acc.cacheReadTokens = cacheRead;
       acc.cacheCreationTokens = cacheCreate;
       acc.cacheWrite5mTokens = cacheW5m;
       acc.cacheWrite1hTokens = cacheW1h;
       acc.outputTokens = outTok;
       acc.reasoningTokens = reasonTok;
       acc.estimatedDelta = 0;
       if (sModel) acc.latestStepModelId = sModel;
       ```
   - **Tail-Delta Estimation Track (`else`, i.e., `!mu || totalMu === 0`):**
     - `if (sModel && !acc.latestStepModelId) acc.latestStepModelId = sModel;`
     - `if (!mu || sessionStepTotal === 0) acc.estimatedDelta += toNonNegInt(s.estTokens);`

#### 3.3.3 Final `analyzeConversationSteps()` Output Schema
Clone `convEntry?.evictedSessionAcc` (or create an empty accumulator), fold each step in `convEntry.steps`, then compute:
- `sessionTotalTokens = acc.sessionInputTokens + acc.sessionCacheReadTokens + acc.sessionCacheCreationTokens + acc.sessionOutputTokens + acc.sessionReasoningTokens`
- `sessionInputSide = acc.sessionInputTokens + acc.sessionCacheReadTokens + acc.sessionCacheCreationTokens`
- `sessionCacheHitRate = sessionInputSide > 0 ? Math.round((acc.sessionCacheReadTokens / sessionInputSide) * 100) : 0`
- When `precision !== 'exact'` (`!acc.hasExactSnapshot`): reset snapshot-only breakdown fields (`inputTokens`, `cacheReadTokens`, `cacheCreationTokens`, `cacheWrite5mTokens`, `cacheWrite1hTokens`, `outputTokens`, `reasoningTokens`, `cacheHitRate`) to `0` (preserving strict v2.9.0 honesty — never faking cache/input splits on estimated conversations!).
- Return object:
  ```js
  {
    // --- Existing v2.9.0 Snapshot & Stream Fields (100% Preserved) ---
    convId,
    modelId: primaryModelId,
    modelLabel,
    contextUsed,
    contextLimit,
    usagePercent,
    remainPercent,
    inputTokens,
    cacheReadTokens,
    cacheCreationTokens,
    outputTokens,
    estimatedDelta,
    cacheHitRate,
    tokPerSec,
    avgTokPerSec,
    compressionDetected,
    compressionBefore,
    compressionAfter,
    compressionDrop,
    precision,
    remainingFraction,
    resetTimeMs,
    stepCount,

    // --- New P0 Snapshot Sub-Fields ---
    cacheWrite5mTokens,
    cacheWrite1hTokens,
    reasoningTokens,

    // --- New P0 Cumulative Session & Latency Fields ---
    sessionInputTokens: acc.sessionInputTokens,
    sessionCacheReadTokens: acc.sessionCacheReadTokens,
    sessionCacheCreationTokens: acc.sessionCacheCreationTokens,
    sessionCacheWrite5mTokens: acc.sessionCacheWrite5mTokens,
    sessionCacheWrite1hTokens: acc.sessionCacheWrite1hTokens,
    sessionOutputTokens: acc.sessionOutputTokens,
    sessionReasoningTokens: acc.sessionReasoningTokens,
    sessionTotalTokens,
    sessionCacheHitRate,
    sessionStepPricedCount: acc.sessionStepPricedCount,
    lastStepTs: acc.lastStepTs,
    subagentTotalTokens: acc.subagentTotalTokens,
    lastStepDurationMs: acc.lastStepDurationMs,
    lastStepTtftMs: acc.lastStepTtftMs
  }
  ```

---

## 4. Specification B — 5h Quota Pool `Pace`, Exhaustion `ETA`, & Pre-Reset Hint

### 4.1 Constants
```js
const QUOTA_WINDOW_MS = 5 * 60 * 60 * 1000;          // 18,000,000 ms (5h)
const QUOTA_PRE_RESET_WINDOW_MS = 30 * 60 * 1000;    // 1,800,000 ms (30m)
const QUOTA_PRE_RESET_MIN_FRAC = 0.4;                // 40% remaining
const QUOTA_HISTORY_MAX_AGE_MS = 30 * 60 * 1000;     // 30m sliding lookback
const QUOTA_HISTORY_MAX_SAMPLES = 36;                // Bounded ring buffer per pool
const QUOTA_MIN_SLOPE_SPAN_MS = 60 * 1000;           // >= 60s observation span required for ETA
const QUOTA_MIN_SLOPE_DROP_FRAC = 0.01;              // >= 1% net drop required to reject float jitter
const QUOTA_STALE_IDLE_MS = 15 * 60 * 1000;          // Pause ETA if pool flat for > 15m
```

### 4.2 Ring-Buffer Recording & Reset/Noise Guards (`page-bridge.js`)
Maintain `const quotaHistoryByPool = { gemini: [], premium: [] };` inside `initBridge()` (also clear on remote host switch alongside `netConvsById.clear()`):

1. **`recordQuotaPoolSample(poolKey, remainingFraction, resetTimeMs, nowMs)`:**
   - Guard: if `typeof remainingFraction !== 'number' || !Number.isFinite(remainingFraction)` return; clamp `frac = Math.max(0, Math.min(1, remainingFraction))`.
   - Guard: `normReset = typeof resetTimeMs === 'number' && Number.isFinite(resetTimeMs) && resetTimeMs > SENTINEL_CUTOFF_MS ? Math.round(resetTimeMs) : null`.
   - Fetch `buf = quotaHistoryByPool[poolKey]`.
   - **Window-Reset / Replenishment Guard:** If `buf.length > 0`:
     - Let `last = buf[buf.length - 1]`.
     - If `frac > last.frac + 0.03` (quota replenished upward) OR `(normReset !== null && last.resetTimeMs !== null && Math.abs(normReset - last.resetTimeMs) > 10 * 60 * 1000)` (new 5h reset cycle):
       `buf.length = 0;`
     - Else if `Math.abs(frac - last.frac) < 1e-4 && nowMs - last.ts < 30_000`:
       return (skip redundant sub-30s identical sample so 500ms reads do not evict 30m history).
   - Push `{ ts: nowMs, frac, resetTimeMs: normReset }`.
   - Prune samples with `nowMs - item.ts > QUOTA_HISTORY_MAX_AGE_MS`, and `while (buf.length > QUOTA_HISTORY_MAX_SAMPLES) buf.shift()`.

2. **Slope-Based Depletion Rate & `ETA` (`computePoolSlopeEta(buf, frac, timeLeftMs, nowMs)`):**
   - Return `{ burnRatePerHour: null, etaMs: null }` immediately if ANY of the following holds:
     - `!Array.isArray(buf) || buf.length < 2`
     - `frac <= 0` (already at `0%` — do not project a future countdown)
     - `typeof timeLeftMs !== 'number' || !Number.isFinite(timeLeftMs) || timeLeftMs <= 0` (reset time missing or already passed)
   - **Stale Idle Tail Guard:** Find the latest index `k` (`0 <= k < buf.length - 1`) where `buf[k].frac > frac + 0.002`. If no such sample exists, or if `nowMs - buf[k + 1].ts > QUOTA_STALE_IDLE_MS` (`15m` of zero consumption), return `{ burnRatePerHour: null, etaMs: null }`.
   - **Anchor & Span Guard:** Let `anchor = buf[0]`, `dtMs = nowMs - anchor.ts`, `dropFrac = anchor.frac - frac`.
     - Require `dtMs >= QUOTA_MIN_SLOPE_SPAN_MS` (`60_000` ms) and `dropFrac >= QUOTA_MIN_SLOPE_DROP_FRAC` (`0.01`). If not met, return `{ burnRatePerHour: null, etaMs: null }`.
   - **Slope & Projection Math:**
     ```js
     const burnPerMs = dropFrac / dtMs;
     if (!Number.isFinite(burnPerMs) || burnPerMs <= 0) {
       return { burnRatePerHour: null, etaMs: null };
     }
     const burnRatePerHour = Math.round(burnPerMs * 3_600_000 * 1000) / 1000;
     const rawEtaMs = frac / burnPerMs;
     if (!Number.isFinite(rawEtaMs) || rawEtaMs <= 0 || rawEtaMs >= timeLeftMs) {
       // Will survive until 5h window resetTimeMs -> no premature exhaustion ETA
       return { burnRatePerHour, etaMs: null };
     }
     return {
       burnRatePerHour,
       etaMs: Math.max(60_000, Math.round(rawEtaMs))
     };
     ```

### 4.3 Pure `Pace` & Pre-Reset Formula (Shared Contract Across `page-bridge.js`, `popup.js`, `scanner.js`)

Given `{ remainingFraction, resetTimeMs, burnRatePerHour, etaMs, sampleFetchedAt }` and `nowMs = Date.now()`:
1. **Fraction & Reset Validation:**
   - If `typeof remainingFraction !== 'number' || !Number.isFinite(remainingFraction)`:
     `timeLeftMs = null`, `timeLeftRatio = null`, `paceRatio = null`, `paceStatus = null`, `etaMs = null`, `unusedPreResetHint = false`.
   - Clamp `frac = Math.max(0, Math.min(1, remainingFraction))`.
   - If `typeof resetTimeMs !== 'number' || !Number.isFinite(resetTimeMs) || resetTimeMs <= SENTINEL_CUTOFF_MS || resetTimeMs <= nowMs`:
     - Window has no future reset (or `resetTimeMs <= nowMs`):
     - `timeLeftMs = typeof resetTimeMs === 'number' && Number.isFinite(resetTimeMs) && resetTimeMs > SENTINEL_CUTOFF_MS ? 0 : null`
     - `timeLeftRatio = null`, `paceRatio = null`, `paceStatus = null`, `etaMs = null`, `unusedPreResetHint = false`.
2. **When `resetTimeMs > nowMs` (`timeLeftMs = resetTimeMs - nowMs > 0`):**
   - `timeLeftRatio = Math.min(1, Math.max(0, timeLeftMs / QUOTA_WINDOW_MS))`
   - **Division-by-Zero & Tail Boundary Guard (`timeLeftRatio`):**
     ```js
     let rawPace;
     if (frac <= 0) {
       rawPace = 0;
     } else if (timeLeftRatio > 0.02) {
       rawPace = frac / timeLeftRatio;
     } else {
       // Last <= 6m of 5h window with remaining quota > 0
       rawPace = Math.max(1, frac / 0.02);
     }
     const paceRatio = Number.isFinite(rawPace)
       ? Math.round(Math.min(9.9, Math.max(0, rawPace)) * 100) / 100
       : null;
     ```
   - **Semantic Classification (`paceStatus`):**
     - If `paceRatio === null`: `null`
     - Else if `paceRatio >= 1.1`: `'comfortable'`
     - Else if `paceRatio < 0.7 && frac < 0.8`: `'fast'`
     - Else (`0.7 <= paceRatio < 1.1` or `frac >= 0.8`): `'balanced'`
   - **Pre-Reset Unused Quota Hint (`unusedPreResetHint`):**
     ```js
     const unusedPreResetHint = Boolean(
       timeLeftMs > 0 &&
       timeLeftMs <= QUOTA_PRE_RESET_WINDOW_MS &&
       frac >= QUOTA_PRE_RESET_MIN_FRAC
     );
     ```
   - **Live `etaMs` Validation in Consumers (`popup.js` / `scanner.js`):**
     - If `pool.etaMs` is a finite number `> 0` and `frac > 0`:
       - Adjust for elapsed time since `telemetry.fetchedAt` (`adjEtaMs = pool.etaMs - Math.max(0, nowMs - (telemetry.fetchedAt || nowMs))`), clamped to `>= 60_000` only if `adjEtaMs > 0 && adjEtaMs < timeLeftMs`; otherwise `null`.

### 4.4 Enriched `telemetry.quotaPools[poolKey]` Payload Shape
```js
{
  remainingFraction: 0.68,
  resetTimeMs: 1795108040000,
  sampleLabel: 'Claude Sonnet 4.5',
  timeLeftMs: 8040000,
  timeLeftRatio: 0.4467,
  paceRatio: 1.52,
  paceStatus: 'comfortable', // 'comfortable' | 'balanced' | 'fast' | null
  burnRatePerHour: 0.14,     // number | null
  etaMs: null,               // number | null (only non-null when exhausting before resetTimeMs)
  unusedPreResetHint: false  // boolean
}
```

---

## 5. Specification C — Cross-Frame Relay, Progressive Disclosure UI, & 10-Locale i18n

### 5.1 Cross-Frame & Multi-Instance Telemetry Merging (`content.js` & `popup.js`)

1. **`content.js` `mergeTelemetry(sources)`:**
   - **`quotaPools` merge:** For each `poolKey` (`'gemini'`, `'premium'`):
     - Select primary `poolVal` from `byNewest` preferring the newest source where `typeof poolVal.remainingFraction === 'number' && Number.isFinite(poolVal.remainingFraction)` (falling back to newest non-null object).
     - If primary `poolVal` has `etaMs == null` or `burnRatePerHour == null`, scan remaining `byNewest` sources within `15_000ms` of `maxFetchedAt` whose `resetTimeMs === poolVal.resetTimeMs`; if a sibling frame has observed `etaMs !== null` / `burnRatePerHour !== null`, copy `{ etaMs, burnRatePerHour }` onto a shallow clone `{ ...poolVal, etaMs, burnRatePerHour }`.
   - **`conversations` merge:**
     - Rank each `conv` by:
       1) `precisionScore = conv.precision === 'exact' ? 2 : 1`
       2) `pricedSteps = Number(conv.sessionStepPricedCount) || 0`
       3) `fetchedAt = src.fetchedAt`
     - Take `conv` if `!prev || precisionScore > prev.precisionScore || (precisionScore === prev.precisionScore && pricedSteps > prev.pricedSteps) || (precisionScore === prev.precisionScore && pricedSteps === prev.pricedSteps && src.fetchedAt >= prev.fetchedAt)`.
     - This prevents a shell frame that only saw a 1-step `trajectorySummary` from overwriting a child workspace iframe that holds all `N` priced RPC steps.
   - **`notifyExtensionPanels()` digest:** Include `latestTelemetry?.quotaPools?.gemini?.remainingFraction ?? ''`, `latestTelemetry?.quotaPools?.premium?.remainingFraction ?? ''`, and active conversation `sessionTotalTokens` / `contextUsed` in `nextDigest` so open Side Panels and Popups receive `AGY_STATE_PUSH` on telemetry changes.

2. **`popup.js` `aggregateTelemetry(instances)`:**
   - Apply the exact same 3-key conversation ranking (`isExact`, then `sessionStepPricedCount`, then `fetchedAt`) and sibling `etaMs` / `burnRatePerHour` preservation when `resetTimeMs` matches.

---

### 5.2 `#quotaStrip` Single-Line Progressive Disclosure (`popup.js` + `popup.css`)

#### 5.2.1 DOM Structure & Inline Priority (`renderQuotaStrip` in `popup.js`)
Preserve the exact 2-row `.quota-item` vertical footprint (`.quota-head` + `<progress class="quota-progress">`):
```html
<div class="quota-item" title="Claude / GPT (Claude Sonnet 4.5) — 32% · Resets in 3h 10m&#10;Pace 0.5x · Burning faster than reset window&#10;Projected to exhaust in ~38m (before reset)">
  <div class="quota-head">
    <span class="quota-title-group">
      <span class="quota-label">Claude / GPT</span>
      <span class="quota-pace-badge is-fast">ETA ~38m</span>
    </span>
    <span class="quota-meta is-warn">32% · Resets in 3h 10m</span>
  </div>
  <progress class="quota-progress is-warn" max="100" value="32" aria-label="Claude / GPT: 32% · Resets in 3h 10m · ETA ~38m"></progress>
</div>
```

- **Inline `.quota-pace-badge` Priority (at most ONE compact pill per pool so `.quota-head` never wraps):**
  1. **`etaMs !== null && remainPct > 0`**: text = `t('quotaEtaShort', { time: formatCompactDuration(etaMs) })` (e.g., `ETA ~38m`), class = `quota-pace-badge is-fast`.
  2. **Else if `unusedPreResetHint === true`**: text = `t('quotaPreResetBadge')` (e.g., `Spare` / `余量充裕`), class = `quota-pace-badge is-spare`.
  3. **Else if `paceRatio !== null`**:
     - Format `paceStr = paceRatio >= 10 ? String(Math.round(paceRatio)) : paceRatio.toFixed(1).replace(/\.0$/, '')` (Wait: keep `paceRatio.toFixed(1)` for `1.0`..`9.9` or `1.2` -> e.g. `paceRatio.toFixed(1)` gives consistent `1.0x`, `1.2x`, `0.5x` with `tabular-nums`!). Specifically: `const paceStr = paceRatio.toFixed(1);`.
     - Text = `t('quotaPaceShort', { pace: paceStr })` (e.g., `Pace 1.2x`).
     - Class = `paceStatus === 'fast' ? 'quota-pace-badge is-warn' : paceStatus === 'comfortable' ? 'quota-pace-badge is-comfortable' : 'quota-pace-badge is-balanced'`.
  4. **Else** (`resetTimeMs` absent or expired): omit `.quota-pace-badge`.

- **Health Class Escalation (`healthClass` on `.quota-meta` & `progress.quota-progress`):**
  - `'is-danger'` when `remainPct <= 20 || (etaMs !== null && etaMs <= 30 * 60 * 1000)`
  - `'is-warn'` when `!isDanger && (remainPct <= 50 || paceStatus === 'fast' || etaMs !== null)`
  - `''` otherwise (healthy Morandi `#5E9E8E`).

- **Multi-Line Accessible `itemEl.title`:**
  Join non-empty lines with `\n`:
  1. Header: `${item.sampleLabel ? `${item.label} (${item.sampleLabel})` : item.label} — ${item.metaText}`
  2. Pace status (when `paceRatio !== null`):
     - `paceStatus === 'comfortable'` -> `t('quotaPaceTipComfortable', { pace: paceStr })`
     - `paceStatus === 'fast'` -> `t('quotaPaceTipFast', { pace: paceStr })`
     - else -> `t('quotaPaceTipBalanced', { pace: paceStr })`
  3. Depletion ETA (when `etaMs !== null && remainPct > 0`):
     - `t('quotaEtaTooltip', { time: formatCompactDuration(etaMs) })`
  4. Pre-reset opportunity (when `unusedPreResetHint === true`):
     - `t('quotaPreResetTooltip', { pct: remainPct })`

- **Duration Formatter `formatCompactDuration(ms)` (`popup.js` & `scanner.js`):**
  - `totalMins = Math.max(1, Math.round(ms / 60000))`
  - `hours = Math.floor(totalMins / 60)`, `mins = totalMins % 60`
  - Return `hours > 0 ? (mins > 0 ? `${hours}h ${mins}m` : `${hours}h`) : `${totalMins}m``.

#### 5.2.2 CSS Rules (`popup.css` inside `@layer components`)
- Update `.quota-strip` column minimum from `minmax(11.5rem, 1fr)` to `minmax(13.25rem, 1fr)` so 2-column Side Panel layout only activates when each column has `>= 212px` inline space.
- Update `.quota-head` to `flex-wrap: nowrap; align-items: center; gap: 0.3125rem;`.
- Add `.quota-title-group`:
  ```css
  .quota-title-group {
    display: inline-flex;
    align-items: center;
    gap: 0.28125rem;
    min-inline-size: 0;
    flex: 1 1 auto;
    overflow: hidden;
  }
  ```
- Update `.quota-meta` with `min-inline-size: 0; overflow: hidden; text-overflow: ellipsis; flex: 0 1 auto;` so even in narrow containers or verbose locales it truncates gracefully rather than wrapping.
- Add `.quota-pace-badge` & state modifiers using Morandi 3A tokens (`--health-ok`, `--health-ok-text`, `--health-warn`, `--health-warn-text`, `--health-danger`, `--health-danger-text`), `color-mix(in oklab, ...)`, and `@media (forced-colors: active)` (`Canvas`, `CanvasText`, `Highlight`):
  - `.quota-pace-badge`: `flex: none; display: inline-flex; align-items: center; font-size: 0.59375rem; font-weight: 600; line-height: 1.2; padding: 0.0625rem 0.3125rem; border-radius: var(--radius-pill); border: 1px solid var(--card-border); background: var(--card-sub); color: var(--text-muted); font-variant-numeric: tabular-nums; white-space: nowrap;`
  - `.quota-pace-badge.is-comfortable`, `.quota-pace-badge.is-spare`: sage tint (`color-mix(in oklab, var(--health-ok) 15%, transparent)` / `border-color: color-mix(in oklab, var(--health-ok) 38%, transparent)` / `color: var(--health-ok-text)`).
  - `.quota-pace-badge.is-warn`: amber tint (`--health-warn` / `--health-warn-text`).
  - `.quota-pace-badge.is-fast`: coral-rose tint (`--health-danger` / `--health-danger-text`).
  - Under `@media (forced-colors: active)`: `forced-color-adjust: none; background: Canvas; color: CanvasText; border-color: CanvasText;`, with `.is-fast, .is-warn, .is-spare` using `border-color: Highlight; color: Highlight;`.
- Keep `progress.quota-progress`, `progress.quota-progress::-webkit-progress-bar`, `progress.quota-progress::-webkit-progress-value`, and `progress.quota-progress::-moz-progress-bar` as separate rules with `appearance: none; border: 0 solid; overflow: clip;`.

---

### 5.3 Per-Chat Hover `title` Enrichment (`popup.js`)

1. **`_resolvedTel` Whitelist Expansion (`renderProjectsTree`):**
   - Populate `_resolvedTel` whenever `convTel && (Number(convTel.contextUsed) > 0 || Number(convTel.sessionTotalTokens) > 0 || Number(convTel.subagentTotalTokens) > 0)`.
   - Copy all existing fields plus `cacheCreationTokens`, `cacheWrite5mTokens`, `cacheWrite1hTokens`, `reasoningTokens`, `sessionInputTokens`, `sessionCacheReadTokens`, `sessionCacheCreationTokens`, `sessionCacheWrite5mTokens`, `sessionCacheWrite1hTokens`, `sessionOutputTokens`, `sessionReasoningTokens`, `sessionTotalTokens`, `sessionCacheHitRate`, `sessionStepPricedCount`, `subagentTotalTokens`, `lastStepDurationMs`, `lastStepTtftMs`, `lastStepTs`.
   - Render `.task-telemetry-row` inline chips (`ctx-chip`, `speed-chip`, `compact-chip`) when `convTel && convTel.contextUsed > 0` — keeping inline badges identical and clutter-free.
2. **Latency Formatter `formatStepLatency(ms)`:**
   - `< 1000`: `${Math.round(ms)}ms`
   - `< 60000`: `${(ms / 1000).toFixed(1).replace(/\.0$/, '')}s`
   - `>= 60000`: `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`
3. **Tooltip Lines Assembly (`buildTaskHoverTitle(proj, task, convTel)`):**
   - Line 1: `${proj.projectName} › ${task.title}`
   - Line 2 (if `task.reason`): `${task.reason}`
   - Line 3 (if `convTel?.precision === 'exact' && convTel.contextUsed > 0`): existing `t('ctxExactBreakdown', { cache, input, output, hit })`
   - Line 4 (if `convTel?.sessionTotalTokens > 0 && convTel.sessionStepPricedCount > 0`):
     `t('ctxSessionSummary', { total: formatTokenCount(convTel.sessionTotalTokens), steps: convTel.sessionStepPricedCount, hit: Math.round(convTel.sessionCacheHitRate) })`
   - Line 5 (optional session detail segments joined by `' · '` when non-empty):
     - If `convTel.sessionReasoningTokens > 0`: `t('ctxReasoningStat', { tokens: formatTokenCount(convTel.sessionReasoningTokens) })`
     - If `convTel.sessionCacheCreationTokens > 0`:
       - If `convTel.sessionCacheWrite5mTokens > 0 || convTel.sessionCacheWrite1hTokens > 0`:
         `t('ctxCacheWriteTiered', { w5m: formatTokenCount(convTel.sessionCacheWrite5mTokens), w1h: formatTokenCount(convTel.sessionCacheWrite1hTokens) })`
       - Else:
         `t('ctxCacheWriteFlat', { tokens: formatTokenCount(convTel.sessionCacheCreationTokens) })`
     - If `convTel.subagentTotalTokens > 0`: `t('ctxSubagentStat', { tokens: formatTokenCount(convTel.subagentTotalTokens) })`
   - Line 6 (when observed step latency exists):
     - Both `lastStepTtftMs` and `lastStepDurationMs`: `t('ctxLatencyFull', { ttft: formatStepLatency(convTel.lastStepTtftMs), duration: formatStepLatency(convTel.lastStepDurationMs) })`
     - Only `lastStepDurationMs`: `t('ctxLatencyDurationOnly', { duration: formatStepLatency(convTel.lastStepDurationMs) })`
     - Only `lastStepTtftMs`: `t('ctxLatencyTtftOnly', { ttft: formatStepLatency(convTel.lastStepTtftMs) })`
   - Apply this assembled tooltip string to `rowBtn.title` AND (when `telRow` is rendered) `telRow.title`.

---

### 5.4 Shadow DOM Composer Capsule Tooltip (`syncInPageCapsules` in `scanner.js`)

1. **Encapsulation & Accessibility Constraints (Strictly Enforced):**
   - Keep `attachShadow({ mode: 'open' })`, `capsuleStateMap` (`WeakMap`), `createElement` / `createElementNS` + `textContent` only (**zero `innerHTML`**, **zero `localStorage`**, **zero DOM expandos**).
   - Preserve WCAG 1.4.13 hover/focus/Escape behavior (`syncCapsuleTipVisibility`, `scheduleCapsuleTipHide`, `ensureCapsuleEscListener`), `prefers-reduced-motion: reduce`, and `forced-colors: active`.
   - Keep inline `.capsule-btn` text (`speedSpan` + `gaugeSvg` + `ctxSpan`) unchanged so composer toolbar width does not grow.
2. **New Tooltip DOM Nodes in `buildCapsuleInstance(host)`:**
   - **`latencyRow`** (`createCapsuleRow()`, inserted immediately after `speedRow.row`, `hidden = true` when neither `lastStepTtftMs` nor `lastStepDurationMs` is present):
     - `keyEl`: `t('capsuleLatencyLabel', {}, 'Step Latency')`
     - `valEl`:
       - Both `ttft` & `duration`: `t('capsuleLatencyBoth', { ttft, duration })`
       - Only `ttft`: `t('capsuleLatencyTtft', { ttft })`
       - Only `duration`: `${duration}`
   - **`sessionWrap`** (`div.tip-session-wrap`, inserted immediately after `estNoticeEl`, `hidden = true` when `sessionTotalTokens <= 0 && subagentTotalTokens <= 0`):
     - Styled in `CAPSULE_CSS` alongside `.tip-quota-wrap` (`margin-block-start: 6px; padding-block-start: 5px; border-block-start: 1px solid var(--cap-divider);`).
     - Contains `sessionRow = createCapsuleRow()` (`hidden` when `sessionTotalTokens <= 0`):
       - `keyEl`: `t('capsuleSessionTotalLabel', {}, 'Session Total')`
       - `valEl`: `t('capsuleSessionTotalVal', { total: formatCapsuleTokens(sessionTotalTokens), steps: sessionStepPricedCount })`
     - Contains `sessionDetailEl` (`div.tip-session-detail`, styled with `margin-block-start: 3px; font-size: 11px; color: var(--cap-tip-muted); font-variant-numeric: tabular-nums;`, `hidden` when empty):
       - Joins non-empty parts with `' · '`: `ctxReasoningStat`, `ctxCacheWriteTiered` / `ctxCacheWriteFlat`, and `ctxSubagentStat`.
   - **5h Quota Row (`quotaWrap`) Pace / ETA / Spare Suffix:**
     - Match active model's pool from `telemetry?.models` (by `convData?.modelId || compEntry?.modelId`) or infer `'premium'` (`/CLAUDE|OPUS|SONNET|GPT|OSS/i`) vs `'gemini'` (`/GEMINI|ARGON|FLASH|HYDROGEN/i`), reading `poolObj = poolKey ? telemetry?.quotaPools?.[poolKey] : null`.
     - Append compact cue to `state.quotaValEl.textContent` when available:
       - `etaMs > 0 && remQuotaPct > 0`: ` · ${t('quotaEtaShort', { time: formatCompactDuration(etaMs) })}`
       - Else if `unusedPreResetHint`: ` · ${t('quotaPreResetBadge', {}, 'Spare')}`
       - Else if `paceRatio !== null`: ` · ${t('quotaPaceShort', { pace: paceRatio.toFixed(1) })}`
   - Include all new values in `state.lastDigest` inside `updateCapsuleState()` so DOM updates run iff values change.

---

### 5.5 Exact 10-Locale i18n Specification (`i18n.js` & `scripts/verify.mjs`)

- **Previous key count:** `165`
- **New P0 keys:** `21`
- **Updated canonical key count:** **`186`** (update all `165` references in `scripts/verify.mjs` lines 9, 174, 196-197, and 357 to `186`).
- **Static Call-Site Rule:** Every key below MUST be invoked via a static string literal `t('<key>', ...)` in `popup.js` and/or `scanner.js` (never dynamic template keys) so `scripts/verify.mjs` regex `/\bt\(\s*['"]([a-zA-Z0-9_]+)['"]/g` matches all `186` keys.

#### 5.5.1 Canonical Key & Placeholder Matrix

| # | Key | Placeholders | Call Sites |
| :--- | :--- | :--- | :--- |
| 1 | `quotaPaceShort` | `{pace}` | `popup.js`, `scanner.js` |
| 2 | `quotaEtaShort` | `{time}` | `popup.js`, `scanner.js` |
| 3 | `quotaPreResetBadge` | *(none)* | `popup.js`, `scanner.js` |
| 4 | `quotaPaceTipComfortable` | `{pace}` | `popup.js` |
| 5 | `quotaPaceTipBalanced` | `{pace}` | `popup.js` |
| 6 | `quotaPaceTipFast` | `{pace}` | `popup.js` |
| 7 | `quotaEtaTooltip` | `{time}` | `popup.js` |
| 8 | `quotaPreResetTooltip` | `{pct}` | `popup.js` |
| 9 | `ctxSessionSummary` | `{hit}`, `{steps}`, `{total}` | `popup.js` |
| 10 | `ctxReasoningStat` | `{tokens}` | `popup.js`, `scanner.js` |
| 11 | `ctxCacheWriteFlat` | `{tokens}` | `popup.js`, `scanner.js` |
| 12 | `ctxCacheWriteTiered` | `{w1h}`, `{w5m}` | `popup.js`, `scanner.js` |
| 13 | `ctxSubagentStat` | `{tokens}` | `popup.js`, `scanner.js` |
| 14 | `ctxLatencyFull` | `{duration}`, `{ttft}` | `popup.js` |
| 15 | `ctxLatencyDurationOnly` | `{duration}` | `popup.js` |
| 16 | `ctxLatencyTtftOnly` | `{ttft}` | `popup.js` |
| 17 | `capsuleSessionTotalLabel` | *(none)* | `scanner.js` |
| 18 | `capsuleSessionTotalVal` | `{steps}`, `{total}` | `scanner.js` |
| 19 | `capsuleLatencyLabel` | *(none)* | `scanner.js` |
| 20 | `capsuleLatencyBoth` | `{duration}`, `{ttft}` | `scanner.js` |
| 21 | `capsuleLatencyTtft` | `{ttft}` | `scanner.js` |

#### 5.5.2 Exact Translations Across All 10 Locales

```js
// 1. en
quotaPaceShort: 'Pace {pace}x',
quotaEtaShort: 'ETA ~{time}',
quotaPreResetBadge: 'Spare',
quotaPaceTipComfortable: 'Pace {pace}x · Comfortable margin',
quotaPaceTipBalanced: 'Pace {pace}x · On track with reset window',
quotaPaceTipFast: 'Pace {pace}x · Burning faster than reset window',
quotaEtaTooltip: 'Projected to exhaust in ~{time} (before reset)',
quotaPreResetTooltip: 'Refreshing soon with {pct}% unused quota available',
ctxSessionSummary: 'Session total: {total} ({steps} steps · {hit}% cache)',
ctxReasoningStat: 'Reasoning {tokens}',
ctxCacheWriteFlat: 'Cache write {tokens}',
ctxCacheWriteTiered: 'Cache write 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'Subagents {tokens}',
ctxLatencyFull: 'Last step: TTFT {ttft} · Total {duration}',
ctxLatencyDurationOnly: 'Last step: {duration}',
ctxLatencyTtftOnly: 'Last step TTFT: {ttft}',
capsuleSessionTotalLabel: 'Session Total',
capsuleSessionTotalVal: '{total} ({steps} steps)',
capsuleLatencyLabel: 'Step Latency',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 2. zh_CN
quotaPaceShort: '配速 {pace}x',
quotaEtaShort: '预计 ~{time}',
quotaPreResetBadge: '余量充裕',
quotaPaceTipComfortable: '配速 {pace}x · 余量充裕',
quotaPaceTipBalanced: '配速 {pace}x · 消耗与重置节奏均衡',
quotaPaceTipFast: '配速 {pace}x · 当前消耗快于重置窗口',
quotaEtaTooltip: '按当前速率预计 ~{time} 耗尽（早于重置）',
quotaPreResetTooltip: '即将刷新，仍有 {pct}% 可用配额余量',
ctxSessionSummary: '本会话累计：{total}（{steps} 步 · 缓存命中 {hit}%）',
ctxReasoningStat: '思考 {tokens}',
ctxCacheWriteFlat: '缓存写入 {tokens}',
ctxCacheWriteTiered: '缓存写入 5m {w5m} / 1h {w1h}',
ctxSubagentStat: '子代理 {tokens}',
ctxLatencyFull: '最近一步：首字 {ttft} · 总耗时 {duration}',
ctxLatencyDurationOnly: '最近一步耗时：{duration}',
ctxLatencyTtftOnly: '最近一步首字：{ttft}',
capsuleSessionTotalLabel: '本会话累计',
capsuleSessionTotalVal: '{total} ({steps} 步)',
capsuleLatencyLabel: '单步延迟',
capsuleLatencyBoth: '首字 {ttft} · {duration}',
capsuleLatencyTtft: '首字 {ttft}',

// 3. zh_TW
quotaPaceShort: '配速 {pace}x',
quotaEtaShort: '預計 ~{time}',
quotaPreResetBadge: '餘量充裕',
quotaPaceTipComfortable: '配速 {pace}x · 餘量充裕',
quotaPaceTipBalanced: '配速 {pace}x · 消耗與重設節奏均衡',
quotaPaceTipFast: '配速 {pace}x · 目前消耗快於重設視窗',
quotaEtaTooltip: '依目前速率預計 ~{time} 耗盡（早於重設）',
quotaPreResetTooltip: '即將重新整理，仍有 {pct}% 可用配額餘量',
ctxSessionSummary: '本會話累計：{total}（{steps} 步 · 快取命中 {hit}%）',
ctxReasoningStat: '思考 {tokens}',
ctxCacheWriteFlat: '快取寫入 {tokens}',
ctxCacheWriteTiered: '快取寫入 5m {w5m} / 1h {w1h}',
ctxSubagentStat: '子代理 {tokens}',
ctxLatencyFull: '最近一步：首字 {ttft} · 總耗時 {duration}',
ctxLatencyDurationOnly: '最近一步耗時：{duration}',
ctxLatencyTtftOnly: '最近一步首字：{ttft}',
capsuleSessionTotalLabel: '本會話累計',
capsuleSessionTotalVal: '{total} ({steps} 步)',
capsuleLatencyLabel: '單步延遲',
capsuleLatencyBoth: '首字 {ttft} · {duration}',
capsuleLatencyTtft: '首字 {ttft}',

// 4. ja
quotaPaceShort: 'ペース {pace}x',
quotaEtaShort: '残り ~{time}',
quotaPreResetBadge: '余裕あり',
quotaPaceTipComfortable: 'ペース {pace}x · 十分な余裕あり',
quotaPaceTipBalanced: 'ペース {pace}x · リセット時間と均衡',
quotaPaceTipFast: 'ペース {pace}x · リセットより速い消費ペース',
quotaEtaTooltip: '現在のペースで約 {time} 後に枯渇予測（リセット前）',
quotaPreResetTooltip: 'まもなく更新（未使用クォータ残り {pct}%）',
ctxSessionSummary: 'セッション累計: {total} ({steps} ステップ · キャッシュ {hit}%)',
ctxReasoningStat: '思考 {tokens}',
ctxCacheWriteFlat: 'キャッシュ書込 {tokens}',
ctxCacheWriteTiered: '書込 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'サブエージェント {tokens}',
ctxLatencyFull: '直近ステップ: 初回応答 {ttft} · 合計 {duration}',
ctxLatencyDurationOnly: '直近ステップ: {duration}',
ctxLatencyTtftOnly: '直近ステップ初回応答: {ttft}',
capsuleSessionTotalLabel: 'セッション累計',
capsuleSessionTotalVal: '{total} ({steps} ステップ)',
capsuleLatencyLabel: 'ステップ遅延',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 5. ko
quotaPaceShort: '페이스 {pace}x',
quotaEtaShort: '예상 ~{time}',
quotaPreResetBadge: '여유분',
quotaPaceTipComfortable: '페이스 {pace}x · 여유 충분',
quotaPaceTipBalanced: '페이스 {pace}x · 초기화 주기와 균형',
quotaPaceTipFast: '페이스 {pace}x · 초기화보다 빠른 소진 속도',
quotaEtaTooltip: '현재 속도로 약 {time} 후 소진 예상 (초기화 전)',
quotaPreResetTooltip: '곧 초기화됨 (미사용 할당량 {pct}% 남음)',
ctxSessionSummary: '세션 누적: {total} ({steps}단계 · 캐시 {hit}%)',
ctxReasoningStat: '추론 {tokens}',
ctxCacheWriteFlat: '캐시 쓰기 {tokens}',
ctxCacheWriteTiered: '캐시 쓰기 5m {w5m} / 1h {w1h}',
ctxSubagentStat: '서브에이전트 {tokens}',
ctxLatencyFull: '최근 단계: 첫 응답 {ttft} · 총 {duration}',
ctxLatencyDurationOnly: '최근 단계: {duration}',
ctxLatencyTtftOnly: '최근 단계 첫 응답: {ttft}',
capsuleSessionTotalLabel: '세션 누적',
capsuleSessionTotalVal: '{total} ({steps}단계)',
capsuleLatencyLabel: '단계 지연 시간',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 6. es
quotaPaceShort: 'Ritmo {pace}x',
quotaEtaShort: 'ETA ~{time}',
quotaPreResetBadge: 'Holgado',
quotaPaceTipComfortable: 'Ritmo {pace}x · Margen holgado',
quotaPaceTipBalanced: 'Ritmo {pace}x · Consumo equilibrado',
quotaPaceTipFast: 'Ritmo {pace}x · Consumo más rápido que el reinicio',
quotaEtaTooltip: 'Se agotará en ~{time} al ritmo actual (antes del reinicio)',
quotaPreResetTooltip: 'Reinicio próximo con {pct}% de cuota disponible',
ctxSessionSummary: 'Total sesión: {total} ({steps} pasos · {hit}% caché)',
ctxReasoningStat: 'Razonamiento {tokens}',
ctxCacheWriteFlat: 'Escr. caché {tokens}',
ctxCacheWriteTiered: 'Escr. caché 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'Subagentes {tokens}',
ctxLatencyFull: 'Último paso: TTFT {ttft} · Total {duration}',
ctxLatencyDurationOnly: 'Último paso: {duration}',
ctxLatencyTtftOnly: 'TTFT último paso: {ttft}',
capsuleSessionTotalLabel: 'Total de sesión',
capsuleSessionTotalVal: '{total} ({steps} pasos)',
capsuleLatencyLabel: 'Latencia de paso',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 7. fr
quotaPaceShort: 'Rythme {pace}x',
quotaEtaShort: 'ETA ~{time}',
quotaPreResetBadge: 'Marge',
quotaPaceTipComfortable: 'Rythme {pace}x · Marge confortable',
quotaPaceTipBalanced: 'Rythme {pace}x · Consommation équilibrée',
quotaPaceTipFast: 'Rythme {pace}x · Consommation plus rapide que la fenêtre',
quotaEtaTooltip: 'Épuisement estimé dans ~{time} (avant réinitialisation)',
quotaPreResetTooltip: 'Réinitialisation proche avec {pct}% de quota disponible',
ctxSessionSummary: 'Total session : {total} ({steps} étapes · {hit}% cache)',
ctxReasoningStat: 'Raisonnement {tokens}',
ctxCacheWriteFlat: 'Écr. cache {tokens}',
ctxCacheWriteTiered: 'Écr. cache 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'Sous-agents {tokens}',
ctxLatencyFull: 'Dernière étape : TTFT {ttft} · Total {duration}',
ctxLatencyDurationOnly: 'Dernière étape : {duration}',
ctxLatencyTtftOnly: 'TTFT dernière étape : {ttft}',
capsuleSessionTotalLabel: 'Total session',
capsuleSessionTotalVal: '{total} ({steps} étapes)',
capsuleLatencyLabel: 'Latence d’étape',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 8. de
quotaPaceShort: 'Tempo {pace}x',
quotaEtaShort: 'ETA ~{time}',
quotaPreResetBadge: 'Reserve',
quotaPaceTipComfortable: 'Tempo {pace}x · Komfortabler Puffer',
quotaPaceTipBalanced: 'Tempo {pace}x · Im Gleichgewicht mit Reset-Fenster',
quotaPaceTipFast: 'Tempo {pace}x · Verbrauch schneller als Reset-Fenster',
quotaEtaTooltip: 'Bei aktuellem Tempo in ~{time} erschöpft (vor Reset)',
quotaPreResetTooltip: 'Baldige Zurücksetzung mit {pct}% freiem Kontingent',
ctxSessionSummary: 'Sitzung gesamt: {total} ({steps} Schritte · {hit}% Cache)',
ctxReasoningStat: 'Denken {tokens}',
ctxCacheWriteFlat: 'Cache-Schr. {tokens}',
ctxCacheWriteTiered: 'Cache-Schr. 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'Subagenten {tokens}',
ctxLatencyFull: 'Letzter Schritt: TTFT {ttft} · Gesamt {duration}',
ctxLatencyDurationOnly: 'Letzter Schritt: {duration}',
ctxLatencyTtftOnly: 'Letzter Schritt TTFT: {ttft}',
capsuleSessionTotalLabel: 'Sitzung gesamt',
capsuleSessionTotalVal: '{total} ({steps} Schritte)',
capsuleLatencyLabel: 'Schritt-Latenz',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 9. pt_BR
quotaPaceShort: 'Ritmo {pace}x',
quotaEtaShort: 'ETA ~{time}',
quotaPreResetBadge: 'Sobra',
quotaPaceTipComfortable: 'Ritmo {pace}x · Margem confortável',
quotaPaceTipBalanced: 'Ritmo {pace}x · Consumo equilibrado',
quotaPaceTipFast: 'Ritmo {pace}x · Consumo mais rápido que o reinício',
quotaEtaTooltip: 'Previsão de esgotar em ~{time} (antes do reinício)',
quotaPreResetTooltip: 'Reinício próximo com {pct}% de cota disponível',
ctxSessionSummary: 'Total da sessão: {total} ({steps} passos · {hit}% cache)',
ctxReasoningStat: 'Raciocínio {tokens}',
ctxCacheWriteFlat: 'Gravação cache {tokens}',
ctxCacheWriteTiered: 'Gravação 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'Subagentes {tokens}',
ctxLatencyFull: 'Último passo: TTFT {ttft} · Total {duration}',
ctxLatencyDurationOnly: 'Último passo: {duration}',
ctxLatencyTtftOnly: 'TTFT do último passo: {ttft}',
capsuleSessionTotalLabel: 'Total da sessão',
capsuleSessionTotalVal: '{total} ({steps} passos)',
capsuleLatencyLabel: 'Latência do passo',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',

// 10. ru
quotaPaceShort: 'Темп {pace}x',
quotaEtaShort: 'ETA ~{time}',
quotaPreResetBadge: 'Запас',
quotaPaceTipComfortable: 'Темп {pace}x · Комфортный запас',
quotaPaceTipBalanced: 'Темп {pace}x · Сбалансированный расход',
quotaPaceTipFast: 'Темп {pace}x · Расход опережает окно сброса',
quotaEtaTooltip: 'Исчерпается через ~{time} при текущем темпе (до сброса)',
quotaPreResetTooltip: 'Скорый сброс при {pct}% неиспользованной квоты',
ctxSessionSummary: 'Всего за сессию: {total} ({steps} шаг. · кэш {hit}%)',
ctxReasoningStat: 'Размышления {tokens}',
ctxCacheWriteFlat: 'Запись кэша {tokens}',
ctxCacheWriteTiered: 'Запись 5m {w5m} / 1h {w1h}',
ctxSubagentStat: 'Субагенты {tokens}',
ctxLatencyFull: 'Посл. шаг: TTFT {ttft} · Всего {duration}',
ctxLatencyDurationOnly: 'Посл. шаг: {duration}',
ctxLatencyTtftOnly: 'TTFT посл. шага: {ttft}',
capsuleSessionTotalLabel: 'Всего за сессию',
capsuleSessionTotalVal: '{total} ({steps} шаг.)',
capsuleLatencyLabel: 'Задержка шага',
capsuleLatencyBoth: 'TTFT {ttft} · {duration}',
capsuleLatencyTtft: 'TTFT {ttft}',
```

---

## 6. Verification & Deterministic Edge-Case Test Matrix

`implementer` and `reviewer` MUST verify all test cases below using temporary out-of-repo Node harnesses (`node -e` or `/tmp/...`, cleaning up any `/tmp` file afterward and **never** leaving test artifacts in the repository) plus `node scripts/verify.mjs` and `bash scripts/package.sh`.

| ID | Category | Deterministic Input | Expected Output / Invariant |
| :--- | :--- | :--- | :--- |
| **T1** | `extractStepModelUsage` — Disjoint `reasoningTokens` | `{ model: 'gemini-2.5-pro', promptTokenCount: 1200, cachedContentTokenCount: 8000, candidatesTokenCount: 400, thoughtsTokenCount: 900 }` | `inputTokens: 1200`, `cacheReadTokens: 8000`, `outputTokens: 400`, `reasoningTokens: 900`, `reasoningInOutput: false`. |
| **T2** | `extractStepModelUsage` — OpenAI nested `reasoning_tokens` | `{ model: 'gpt-5', prompt_tokens: 1000, completion_tokens: 750, completion_tokens_details: { reasoning_tokens: 500 } }` | `outputTokens: 750`, `reasoningTokens: 500`, `reasoningInOutput: true`; in `analyzeConversationSteps`: `sessionOutputTokens === 250`, `sessionReasoningTokens === 500`, `sessionTotalTokens === 1750` (zero double-counting), while `contextUsed === 1750` (100% snapshot parity). |
| **T3** | `extractStepModelUsage` — Tiered `cache_creation` roll-up & fallback | (a) `{ model: 'claude-sonnet-4-5', input_tokens: 500, cache_creation: { ephemeral_5m_input_tokens: 2000, ephemeral_1h_input_tokens: 3000 }, output_tokens: 200 }`<br>(b) `{ model: 'claude-sonnet-4-5', inputTokens: 500, cacheCreationTokens: 4000, outputTokens: 200 }` | (a) `cacheWrite5mTokens === 2000`, `cacheWrite1hTokens === 3000`, `cacheCreationTokens === 5000`, `sessionTotalTokens === 5700` (not `10700`).<br>(b) `cacheWrite5mTokens === 0`, `cacheWrite1hTokens === 0`, `cacheCreationTokens === 4000`, `sessionCacheCreationTokens === 4000`. |
| **T4** | Dual-track multi-step conversation + compaction | 3 main-model steps: Step 1 (`in:10k, cr:40k, cw:5k, out:2k, rs:1k`), Step 2 (`in:8k, cr:55k, cw:0, out:3k, rs:2k`), Step 3 post-compaction (`in:4k, cr:20k, cw:2k, out:1k, rs:500`) + 1 unpriced tail step (`estTokens: 300`) | Snapshot reflects Step 3 + tail: `contextUsed === 27300`, `precision === 'exact'`, `compressionDetected === true`, `compressionDrop > 0`. Cumulative sums all 3 priced steps: `sessionInputTokens === 22000`, `sessionCacheReadTokens === 115000`, `sessionCacheCreationTokens === 7000`, `sessionOutputTokens === 6000`, `sessionReasoningTokens === 3500`, `sessionTotalTokens === 153500`, `sessionStepPricedCount === 3`. |
| **T5** | `SHADOW_MODEL_RE` isolation (`M50`, `M21`, `FLASH_LITE`, `IMAGE`, `BANANA`) | Main step (`gemini-2.5-pro`, `in:5k, out:1k`) + shadow step (`MODEL_PLACEHOLDER_M50`, `in:20k, out:4k`) + image step (`imagen-banana`, `in:2k, out:1k`) | `contextUsed === 6000`, `modelId === 'gemini-2.5-pro'`, `sessionTotalTokens === 6000`, `sessionStepPricedCount === 1`, `subagentTotalTokens === 27000`. Conversation with *only* shadow steps stays `precision === 'estimated'`, `sessionTotalTokens === 0`, `subagentTotalTokens > 0`. |
| **T6** | `MAX_STEPS_PER_CONV = 240` eviction & idempotent re-upsert | Ingest 250 priced steps (each `1000` tokens), then re-upsert tail 5 steps at `stepOffset: 245` | `entry.steps.length === 240`, `entry.stepOffsetBase === 10`, `sessionStepPricedCount === 250`, `sessionTotalTokens === 250000` (no loss on eviction, no double-count on tail re-upsert). Full reset at `stepOffset: 0` resets `evictedSessionAcc` cleanly. |
| **T7** | `durationMs` & `ttftMs` honesty | (a) Historical step with `createdAt` + `finishedGeneratingAt` (`+3200ms`), no `firstTokenAt`<br>(b) Historical step with no timestamps<br>(c) `GetCascadeTrajectorySteps` read-poll HTTP response (`12ms`)<br>(d) Live streaming step observed empty at `t0`, first token at `t0+620ms`, finished at `t0+2800ms` | (a) `durationMs === 3200`, `ttftMs === null`.<br>(b) `durationMs === null`, `ttftMs === null`.<br>(c) Read-poll latency ignored (`ttftMs === null`).<br>(d) `ttftMs === 620`, `durationMs === 2800`, preserved across subsequent Fiber re-renders. |
| **T8** | 5h `Pace` & `unusedPreResetHint` boundaries | At `now = T`:<br>(a) `frac: 0.75, reset: T + 2.5h` (`timeLeftRatio = 0.5`)<br>(b) `frac: 0.45, reset: T + 2.5h` (`pace = 0.9`)<br>(c) `frac: 0.30, reset: T + 4h` (`pace = 0.375`)<br>(d) `frac: 0.50, reset: T + 25m`<br>(e) `frac: 0.50, reset: T - 10s` (expired)<br>(f) `frac: null` or `undefined` or `0` with `reset: T + 2m` | (a) `paceRatio === 1.5`, `paceStatus === 'comfortable'`, `unusedPreResetHint === false`.<br>(b) `paceRatio === 0.9`, `paceStatus === 'balanced'`.<br>(c) `paceRatio === 0.38`, `paceStatus === 'fast'`.<br>(d) `unusedPreResetHint === true`.<br>(e) `paceRatio === null`, `paceStatus === null`, `etaMs === null`, `unusedPreResetHint === false` (never `true` when expired!).<br>(f) Zero `NaN` / `Infinity`; for `frac === 0`, `paceRatio === 0`, `paceStatus === 'fast'`, `etaMs === null`. |
| **T9** | Ring-buffer slope `ETA` guards | (a) 2 samples `10s` apart (`dt < 60s`)<br>(b) 2 samples `5m` apart dropping `0.60 -> 0.40` (`4%/min`), `reset: T + 3h`<br>(c) Drop `0.90 -> 0.85` over `20m` (`0.25%/min`), `reset: T + 1h` (exhausts in `340m > 60m`)<br>(d) Quota reset jump `0.15 -> 1.0`<br>(e) Flat plateau for `20m` (`> 15m` idle) | (a) `etaMs === null` (short-span noise rejected).<br>(b) `etaMs === 600000` (`10m < 3h`).<br>(c) `etaMs === null` (survives past reset).<br>(d) Ring buffer cleared on replenishment; `etaMs === null`.<br>(e) Stale slope paused; `etaMs === null`. |
| **T10** | Cross-frame `mergeTelemetry` & Shadow DOM / Verify Suite | (a) Top frame `conv` (`exact`, 1 priced step, newer `fetchedAt`) vs. child frame `conv` (`exact`, 14 priced steps)<br>(b) `node scripts/verify.mjs` & `bash scripts/package.sh` | (a) Merged `conv` retains 14-step child-frame record; sibling `etaMs` preserved on matching `resetTimeMs`.<br>(b) `verify.mjs` passes all 7 checks (`186` keys across 10 locales, zero CSP/leak issues) and `package.sh` builds clean `.zip`. |
