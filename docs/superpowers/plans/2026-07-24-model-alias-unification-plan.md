# 模型别名统一 & auto 移除实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把整个项目里"原始 model_id vs 别名"的混乱统一为 `public_name` 单一字段（设了别名=别名、没设=原 ID），同时移除 `model="auto"` 随机路由功能。

**Architecture:** 纯重构 + 字段语义变更。不改核心路由策略（健康度、cooldown、429 vs failure、重试、excluded）；只在写入 `call_log.model` 和 `model_pricing` 主键时改用 `public_name`，并把 `/v1/chat/completions` 的 auto 分支整段删除。`resolveModel` 从 3 个 SQL 合并为 1 个 SQL，新增 `resolveRoute` 包装返回 `{ publicName, channelId, upstreamModelId }`。

**Tech Stack:** Next.js 16 App Router, TypeScript, better-sqlite3, Tailwind v4

## Global Constraints

- 所有图标必须使用 Lucide Icons 且下载到 `public/icons/` 本地（项目既有规范）
- 时间戳使用 `datetime('now', '+8 hours')`（北京时间）
- 数据库迁移通过 `_migrations` 表追踪，幂等
- 项目无单测框架（无 jest/vitest），验证手段：`npm run lint`、`npx tsc --noEmit`、`npm run build`，加手动 curl/UI 验证
- 核心路由策略（健康度、cooldown、429 vs failure、重试 3 次、excluded）保留，不动
- 管理员 dashboard 4 处 UI 不动（已正确显示原 ID）

## File Structure

### 修改

| 文件 | 职责 |
|---|---|
| `src/lib/channels.ts` | 合并 `resolveModel` SQL；删除 `getModelsForAuto`；新增 `resolveRoute` |
| `src/lib/model-pricing.ts` | 主键语义改 public_name；`calculateCost` 接受 public_name |
| `src/app/v1/chat/completions/route.ts` | 删除 auto 分支（~170 行）；统一写 `publicName` 到日志/计费 |
| `src/app/v1/models/route.ts` | 输出 public_name 去重（已基本符合，仅需微调 SQL 路径） |
| `src/lib/db.ts` | 加 v6 迁移重写 `model_pricing` 主键 |

### 不修改（已正确）

- `src/app/dashboard/channels/page.tsx`（拉取列表 + 模型行已显示原 ID）
- `src/app/dashboard/keys/page.tsx`（下拉 + Popover 已正确）
- `src/app/dashboard/logs/page.tsx`（直接展示 `call_log.model`，无需改 UI）

---

## Task 1: 数据库 v6 迁移（model_pricing 主键重写为 public_name）

**Files:**
- Modify: `src/lib/db.ts:194-218`（在 `v5_model_pricing` 迁移之后加 v6）

**Interfaces:**
- Consumes: 现有 `model_pricing` 表（model_id 列）；`channel_models` 表；`model_aliases` 表
- Produces: `model_pricing.model_id` 列的语义变为 public_name；记录迁移到 `_migrations` 表

- [ ] **Step 1: 在 `db.ts` `initSchema` 中添加 v6 迁移块**

找到 `v5_model_pricing` 迁移的结束位置（在 `INSERT INTO _migrations (name) VALUES ('v5_model_pricing');` 之后），在其后插入：

```typescript
// Migration v6: rewrite model_pricing.model_id from upstream model_id to public_name
const pricingV6Migrated = db.prepare("SELECT name FROM _migrations WHERE name = 'v6_pricing_public_name'").get();
if (!pricingV6Migrated) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS model_pricing_backup AS SELECT * FROM model_pricing;
    DROP TABLE model_pricing;
    CREATE TABLE model_pricing (
      model_id TEXT PRIMARY KEY,
      prompt_price REAL NOT NULL DEFAULT 0,
      completion_price REAL NOT NULL DEFAULT 0,
      cached_prompt_price REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
    );
    INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
    SELECT
      COALESCE(ma.alias_name, cm.model_id) AS public_name,
      p.prompt_price, p.completion_price, p.cached_prompt_price, p.updated_at
    FROM model_pricing_backup p
    JOIN channel_models cm ON cm.model_id = p.model_id
    LEFT JOIN model_aliases ma ON ma.channel_model_id = cm.id AND ma.is_active = 1;
    INSERT OR IGNORE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
    SELECT model_id, prompt_price, completion_price, cached_prompt_price, updated_at
    FROM model_pricing_backup
    WHERE model_id NOT IN (SELECT model_id FROM model_pricing);
    DROP TABLE model_pricing_backup;
    INSERT INTO _migrations (name) VALUES ('v6_pricing_public_name');
  `);
}
```

- [ ] **Step 2: 运行 `npx tsc --noEmit` 验证编译**

运行：`cd /d/project/mortal-api && npx tsc --noEmit`
预期：无错误

- [ ] **Step 3: 手动验证迁移**

运行：`cd /d/project/mortal-api && rm -f data/relay.db data/relay.db-wal data/relay.db-shm`
（删除旧数据库，重启 dev 时会自动跑迁移）

然后启动 dev：`npm run dev` 并访问任意页面，触发数据库初始化。

然后用 sqlite3 检查：
```bash
sqlite3 data/relay.db "SELECT * FROM _migrations WHERE name = 'v6_pricing_public_name'"
```
预期：返回一行 `v6_pricing_public_name|2026-...`

```bash
sqlite3 data/relay.db "SELECT model_id FROM model_pricing LIMIT 10"
```
预期：返回默认渠道的 model_id（原 ID，因为还没设别名）

- [ ] **Step 4: 提交**

```bash
git add src/lib/db.ts
git commit -m "feat(db): v6 migration rewrite model_pricing key as public_name"
```

---

## Task 2: model-pricing.ts 接受 public_name

**Files:**
- Modify: `src/lib/model-pricing.ts`（所有函数已经是按 `model_id` 查询，函数名不变；只改注释说明 model_id 现在是 public_name）

**Interfaces:**
- Consumes: Task 1 的 `model_pricing` 表（主键语义 = public_name）
- Produces: `getModelPricing(publicName)`、`calculateCost(publicName, ...)`、`upsertModelPricing({model_id: publicName, ...})`

- [ ] **Step 1: 更新函数顶部注释**

修改 `src/lib/model-pricing.ts` 顶部注释：

```typescript
// ============================================================
// Model Pricing — CRUD + Cost Calculation
// NOTE: model_id column's SEMANTIC is now "public_name" (alias if set, else upstream model_id)
// See db.ts v6 migration.
// ============================================================
```

- [ ] **Step 2: 更新 `calculateCost` 的注释**

修改 `src/lib/model-pricing.ts:36-50`：

```typescript
/** Calculate cost for a request. `modelId` must be the public_name (alias if set, else upstream id). */
export function calculateCost(
  modelId: string,  // public_name
  promptTokens: number,
  completionTokens: number,
  cachedInputTokens: number
): number {
  const pricing = getModelPricing(modelId);
  if (!pricing) return 0;
  const uncachedInput = Math.max(0, promptTokens - cachedInputTokens);
  const cost =
    (uncachedInput / 1_000_000) * pricing.prompt_price +
    (cachedInputTokens / 1_000_000) * pricing.cached_prompt_price +
    (completionTokens / 1_000_000) * pricing.completion_price;
  return Math.round(cost * 1_000_000) / 1_000_000;
}
```

- [ ] **Step 3: 编译验证**

运行：`cd /d/project/mortal-api && npx tsc --noEmit`
预期：无错误

- [ ] **Step 4: 提交**

```bash
git add src/lib/model-pricing.ts
git commit -m "docs(pricing): clarify model_id column is public_name"
```

---

## Task 3: channels.ts — 合并 resolveModel SQL + 删除 getModelsForAuto

**Files:**
- Modify: `src/lib/channels.ts:192-265`

**Interfaces:**
- Consumes: 现有 channel_models、model_aliases、channels 表
- Produces: 新函数 `resolveRoute(modelName, allowedChannels?, excludedChannels?): { publicName, channelId, upstreamModelId } | null`，替换 `resolveModel`

- [ ] **Step 1: 在 channels.ts 替换 resolveModel 并删除 getModelsForAuto**

修改 `src/lib/channels.ts:190-265`，**整段替换**为：

```typescript
// ── Routing ──

export interface ResolvedRoute {
  publicName: string;       // 对外名：别名（设了）或原 ID（没设）
  channelId: string;
  upstreamModelId: string;  // 转发给上游用的真实 model_id
}

/**
 * Resolve a model name (as user provided it) to a concrete route.
 * Returns null if no available channel can serve it.
 *
 * - If user input has an alias → public_name = alias, routes to that alias's channel
 * - If user input has no alias but matches a channel_model.model_id → public_name = that id
 * - excludes/excludedChannels applied at channel level
 */
export function resolveRoute(
  modelName: string,
  allowedChannelIds?: string[],
  excludedChannelIds?: string[],
): ResolvedRoute | null {
  const db = getDb();

  // Build exclude clause (applied to both branches)
  let excludeClause = '';
  let excludeParams: string[] = [];
  if (excludedChannelIds && excludedChannelIds.length > 0) {
    const placeholders = excludedChannelIds.map(() => '?').join(',');
    excludeClause = ` AND c.id NOT IN (${placeholders})`;
    excludeParams = excludedChannelIds;
  }

  // Build allowed clause
  let allowedClause = '';
  let allowedParams: string[] = [];
  if (allowedChannelIds && allowedChannelIds.length > 0) {
    const placeholders = allowedChannelIds.map(() => '?').join(',');
    allowedClause = ` AND cm.channel_id IN (${placeholders})`;
    allowedParams = allowedChannelIds;
  }

  // Single SQL: alias match + direct model_id match in one go (UNION)
  // Prioritize: alias matches first (they shadow the raw model_id)
  const sql = `
    SELECT * FROM (
      SELECT
        ma.alias_name AS public_name,
        cm.model_id AS upstream_model_id,
        cm.channel_id AS channel_id,
        c.health_status AS health_status,
        1 AS source_priority
      FROM model_aliases ma
      JOIN channel_models cm ON cm.id = ma.channel_model_id
      JOIN channels c ON c.id = cm.channel_id
      WHERE ma.alias_name = ? AND ma.is_active = 1
        AND cm.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}${allowedClause}${excludeClause}

      UNION ALL

      SELECT
        cm.model_id AS public_name,
        cm.model_id AS upstream_model_id,
        cm.channel_id AS channel_id,
        c.health_status AS health_status,
        2 AS source_priority
      FROM channel_models cm
      JOIN channels c ON c.id = cm.channel_id
      WHERE cm.model_id = ? AND cm.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}${allowedClause}${excludeClause}
        AND NOT EXISTS (
          SELECT 1 FROM model_aliases ma
          WHERE ma.channel_model_id = cm.id AND ma.is_active = 1
        )
    )
    ORDER BY source_priority ASC,
      CASE health_status
        WHEN 'healthy' THEN 1
        WHEN 'unknown' THEN 2
        WHEN 'cooling_down' THEN 3
        ELSE 4
      END ASC
    LIMIT 1
  `;

  const row = db.prepare(sql).get(modelName, ...allowedParams, ...excludeParams, modelName, ...allowedParams, ...excludeParams) as any;
  if (!row) return null;
  return {
    publicName: row.public_name,
    channelId: row.channel_id,
    upstreamModelId: row.upstream_model_id,
  };
}
```

- [ ] **Step 2: 删除 `getModelsForAuto` 函数**

删除 `src/lib/channels.ts:257-265` 整段：

```typescript
export function getModelsForAuto(): { modelId: string; channel: Channel }[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT cm.model_id, c.* FROM channel_models cm
    LEFT JOIN channels c ON c.id = cm.channel_id
    WHERE cm.is_active = 1 AND ${AVAILABLE_CHANNEL_SQL}
  `).all() as any[];
  return rows.map(r => ({ modelId: r.model_id, channel: r as Channel }));
}
```

- [ ] **Step 3: 更新 channels.ts 顶部注释**

修改 `src/lib/channels.ts:1-2`：

```typescript
// ============================================================
// Channel + Model + Alias management (new simplified schema)
// Routing: resolveRoute() returns { publicName, channelId, upstreamModelId }
// ============================================================
```

- [ ] **Step 4: 编译验证（预期会有错误，因为 route.ts 还引用旧 API）**

运行：`cd /d/project/mortal-api && npx tsc --noEmit`
预期：报 `resolveModel is not exported` 和 `getModelsForAuto is not exported` 错误（这是预期的，下一任务修）

- [ ] **Step 5: 提交**

```bash
git add src/lib/channels.ts
git commit -m "refactor(channels): merge resolveModel into resolveRoute, remove getModelsForAuto"
```

---

## Task 4: route.ts — 删除 auto 分支 + 统一使用 publicName

**Files:**
- Modify: `src/app/v1/chat/completions/route.ts`

**Interfaces:**
- Consumes: Task 3 的 `resolveRoute` 函数（替换旧 `resolveModel`）
- Produces: 单一代码路径处理 chat completions；写日志/计费都用 `publicName`；`model="auto"` 返回 400

- [ ] **Step 1: 替换 import**

修改 `src/app/v1/chat/completions/route.ts:6-14`：

```typescript
import {
  resolveRoute,
  resolveChannelApiKey,
  getChannelById,
  recordChannelSuccess,
  recordChannelFailure,
  listChannels,
} from '@/lib/channels';
```

（删除 `getModelsForAuto` 和 `resolveModel`）

- [ ] **Step 2: 替换 `let modelName` 初始化为拒绝 auto**

修改 `src/app/v1/chat/completions/route.ts:49-51`：

```typescript
  const isStream = body.stream === true;
  let modelName = body.model;
  if (!modelName || modelName === 'auto') {
    return NextResponse.json({ error: { message: 'model field is required and must not be "auto" (auto routing removed)', type: 'invalid_request_error' } }, { status: 400 });
  }
  let upstreamModelId = '';
  let publicName = modelName;
```

（删除 `modelName === 'auto'` 的 if 大块，从 line 53 开始）

- [ ] **Step 3: 删除整个 auto 分支（lines 53-222）**

删除 `src/app/v1/chat/completions/route.ts:53-222` 整段（约 170 行）。即从：

```typescript
  // 3. Resolve model → channel

  if (modelName === 'auto') {
    const all = getModelsForAuto();
    ...
  }

  // ── Specific model with retry + failover ──
```

到：

```typescript
  // ── Specific model with retry + failover ──
```

之前的所有 auto 相关代码。

- [ ] **Step 4: 更新 quota 检查使用 modelName（已是 publicName）**

找到修改后的代码中的 quota 检查（原本 line 234-240）：

```typescript
  // Pre-request quota check
  const pinnedEstimatedTokens = estimateTokens(JSON.stringify(body.messages));
  const pinnedEstimatedCost = calculateCost(modelName, pinnedEstimatedTokens, 0, 0);
```

保持不变（`modelName` 现在就是 publicName）。

- [ ] **Step 5: 替换 resolveModel 调用为 resolveRoute**

修改重试循环中调用 `resolveModel` 的地方（line 245-250）：

```typescript
      const resolved = resolveRoute(
        modelName,
        keyAllowedChannels.length > 0 ? keyAllowedChannels : undefined,
        excludedChannelIds.length > 0 ? excludedChannelIds : undefined,
      );
      if (!resolved) break;

      // Check channel restriction (now using resolved.channelId)
      if (hasChannelRestriction && !keyAllowedChannels.includes(resolved.channelId)) break;
      // Check model restriction against publicName only
      if (hasModelRestriction && !keyAllowedModels.includes(resolved.publicName)) break;

      channel = getChannelById(resolved.channelId);
      if (!channel || !channel.is_active) {
        excludedChannelIds.push(resolved.channelId);
        channel = null;
        continue;
      }

      channelApiKey = resolveChannelApiKey(channel);
      if (!channelApiKey) {
        recordChannelFailure(channel.id, 'failure');
        excludedChannelIds.push(channel.id);
        channel = null;
        continue;
      }

      upstreamModelId = resolved.upstreamModelId;
      publicName = resolved.publicName;
      retriesOnCurrentChannel = 0;
```

- [ ] **Step 6: 替换所有 `model: modelName` 为 `model: publicName`**

在 `route.ts` 中找 `createCallLog({...})` 调用（约 3 处），把 `model: modelName` 改为 `model: publicName`。

- [ ] **Step 7: 修复 error message 显示**

修改 `route.ts:402-405` 的错误消息：

```typescript
    errorMsg = `无可用的渠道。共 ${allChannels.length} 个活跃渠道，其中 ${coolingChannels.length} 个处于冷却状态，${healthyCount} 个健康 — 但均未配置模型 "${publicName}"`;
```

将所有引用 `modelName` 显示给用户的错误改为 `publicName`。

- [ ] **Step 8: 编译验证**

运行：`cd /d/project/mortal-api && npx tsc --noEmit`
预期：无错误

- [ ] **Step 9: 提交**

```bash
git add src/app/v1/chat/completions/route.ts
git commit -m "refactor(chat): remove auto routing, unify log/billing on publicName"
```

---

## Task 5: v1/models/route.ts — 输出 public_name（已基本正确，只需清理）

**Files:**
- Modify: `src/app/v1/models/route.ts`

**Interfaces:**
- Consumes: channel_models、model_aliases、channels 表
- Produces: `/v1/models` 返回的 `data[].id` 永远是 public_name，每个 upstream model_id 只出现一次

- [ ] **Step 1: 验证现有逻辑已符合需求**

阅读 `src/app/v1/models/route.ts:60-76`：

```typescript
const aliasedModelIds = new Set(aliases.map((a: any) => a.model_id));
const allModels: { id: string; ... }[] = [];
const seen = new Set<string>();

for (const a of aliases) {
  if (allowedModels.length > 0 && !allowedModels.includes(a.alias_name) && !allowedModels.includes(a.model_id)) continue;
  if (seen.has(a.alias_name)) continue;
  allModels.push({ id: a.alias_name, ... });
  seen.add(a.alias_name);
}

for (const m of channelModels) {
  if (aliasedModelIds.has(m.model_id)) continue;  // ← 跳过已有别名的
  if (allowedModels.length > 0 && !allowedModels.includes(m.model_id)) continue;
  if (seen.has(m.model_id)) continue;
  allModels.push({ id: m.model_id, ... });
}
```

逻辑已正确：优先用别名，跳过有别名的 model_id，seen 去重。

- [ ] **Step 2: 简化 allowed_models 检查**

修改 `src/app/v1/models/route.ts:64`，由于现在 Key 的 allowed_models 字段语义也是 public_name，只需检查一次：

```typescript
for (const a of aliases) {
  if (allowedModels.length > 0 && !allowedModels.includes(a.alias_name)) continue;
  if (seen.has(a.alias_name)) continue;
  allModels.push({ id: a.alias_name, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'mortal' });
  seen.add(a.alias_name);
}
```

修改 `src/app/v1/models/route.ts:71`：

```typescript
for (const m of channelModels) {
  if (aliasedModelIds.has(m.model_id)) continue;
  if (allowedModels.length > 0 && !allowedModels.includes(m.model_id)) continue;
  if (seen.has(m.model_id)) continue;
  allModels.push({ id: m.model_id, object: 'model', created: Math.floor(Date.now() / 1000), owned_by: 'mortal' });
}
```

（这两个循环本来就只检查 `id`，逻辑符合需求。）

- [ ] **Step 3: 添加注释说明**

在 `src/app/v1/models/route.ts` 顶部添加：

```typescript
// ============================================================
// GET /v1/models — OpenAI-compatible models list
// Returns public_name for each model: alias if set, else upstream model_id.
// Each upstream model_id appears at most once.
// Respects key-level channel and model restrictions.
// ============================================================
```

- [ ] **Step 4: 编译验证**

运行：`cd /d/project/mortal-api && npx tsc --noEmit`
预期：无错误

- [ ] **Step 5: 提交**

```bash
git add src/app/v1/models/route.ts
git commit -m "docs(models): clarify /v1/models returns public_name, each upstream once"
```

---

## Task 6: build + lint + 手动端到端验证

**Files:**
- 无代码改动

- [ ] **Step 1: 运行 lint**

运行：`cd /d/project/mortal-api && npm run lint`
预期：无错误

- [ ] **Step 2: 运行 build**

运行：`cd /d/project/mortal-api && npm run build`
预期：build 成功，无 TypeScript 错误

- [ ] **Step 3: 启动 dev server**

运行：`cd /d/project/mortal-api && rm -f data/relay.db data/relay.db-wal data/relay.db-shm && npm run dev`
（在另一个终端保持运行）

- [ ] **Step 4: 验证 auto 被拒**

创建测试 Key 并调用：
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-mortal-..." \
  -H "Content-Type: application/json" \
  -d '{"model": "auto", "messages": [{"role": "user", "content": "hi"}]}'
```
预期：400 错误，message 包含 "auto"

- [ ] **Step 5: 验证 /v1/models 输出 public_name**

在后台管理界面：
1. 进入「渠道管理」→ 编辑某个渠道 → 「拉取」模型
2. 选择其中一两个模型「添加」到渠道
3. 在某个渠道的某个 model 上设别名（如 `gpt-4o` → `codex`）
4. 调 `curl http://localhost:3000/v1/models -H "Authorization: Bearer ..."`

预期：
- 输出包含 `codex`（别名）
- 不包含 `gpt-4o`（因为它已有别名）
- 每个上游模型只出现一次

- [ ] **Step 6: 验证日志写入 public_name**

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Authorization: Bearer sk-mortal-..." \
  -H "Content-Type: application/json" \
  -d '{"model": "codex", "messages": [{"role": "user", "content": "hi"}], "max_tokens": 5}'
```

然后进入 dashboard → 日志：
预期：模型列显示 `codex`

- [ ] **Step 7: 验证 model_pricing 主键语义**

```bash
sqlite3 data/relay.db "SELECT model_id FROM model_pricing"
```
预期：返回的 model_id 是 public_name（设了别名的模型返回别名）

- [ ] **Step 8: 最终提交（如果前几步有遗漏修改）**

```bash
git status
# 如果有未提交的修改：
git add -A && git commit -m "chore: final verification fixes"
```

---

## Self-Review

**Spec coverage:**
- ① 拉取列表不动 ✓ Task 6 Step 5（确认不动）
- ② 模型行不动 ✓ Task 6 Step 5（确认不动）
- ③ Key 下拉不动 ✓ Task 6 Step 5（确认不动）
- ④ Popover 不动 ✓ Task 6 Step 5（确认不动）
- ⑤ 日志写 publicName ✓ Task 4 Step 6
- ⑥ POST 必传 public_name、auto 移除 ✓ Task 4 Steps 1-3
- ⑦ GET /v1/models 输出 public_name ✓ Task 5
- ⑧ 计费迁移 ✓ Task 1
- 路由 SQL 合并 ✓ Task 3
- 兼容性 + 更新日志说明：在 Task 6 Step 4 验证 + commit message 中说明

**Placeholder scan:** 无 TODO/TBD，所有代码完整

**Type consistency:** `resolveRoute` 在 Task 3 定义，Task 4 使用；`ResolvedRoute` 接口名字一致；`publicName`、`upstreamModelId`、`channelId` 字段名一致

---

## 完成后

- [ ] 提交最终 plan 文档到 git
- [ ] 在 README 或 CHANGELOG 写明 `model="auto"` 已移除
- [ ] 通知用户已可部署
