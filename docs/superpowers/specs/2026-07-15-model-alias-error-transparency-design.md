# 模型别名强制映射 & 错误透明透传 设计文档

## 概述

对 Mortal API 进行两项改进：

1. **模型别名强制映射**（Alias-Only）：一旦模型添加了别名，别名成为该模型的唯一对外身份，原始 model_id 在 API 和 UI 中隐藏，仅模型广场小字显示。
2. **错误透明透传**：上游提供商返回的错误原样透传给下游客户端，不做任何包装或修改。

## 设计目标

- 用户不会在 API 列表、Key 管理、渠道管理中看到被别名覆盖的原始 model_id
- 使用原始 model_id 请求已别名的模型 → 返回 404 "Model not found"
- 上游错误（429、400、500 等）的结构体和状态码原样透传
- 改动最小，每个文件 1-5 行核心逻辑变化

## 改动清单

| # | 文件 | 改动内容 | 类型 |
|---|------|----------|------|
| 1 | `src/lib/channels.ts` — `resolveModel()` | SQL 加别名过滤，有别名时原始名无法路由 | 路由层 |
| 2 | `src/lib/proxy.ts` — `callUpstream()` / `callUpstreamStreaming()` | 抛出结构化错误（保留 status + body） | 代理层 |
| 3 | `src/app/api/v1/chat/completions/route.ts` — catch 块 | 原样透传上游 error body + status code | API 层 |
| 4 | `src/app/dashboard/keys/page.tsx` — `getModelsForChannels()` | 过滤掉有别名的原始 model_id | UI 层 |
| 5 | `src/app/dashboard/channels/page.tsx` — 模型卡片 | alias_name 为主显示，model_id 灰字小号 | UI 层 |

## 详细设计

### 1. 路由层：`resolveModel()` （channels.ts）

**当前逻辑**（伪代码）：
```
1. 匹配别名 → 有则返回 { channelId, upstreamModelId }
2. 匹配原始 model_id → 有则返回 { channelId, model_id }
3. 无匹配 → 返回 null
```

**改动后逻辑**：
```
1. 匹配别名 → 有则返回 { channelId, upstreamModelId }
2. 匹配原始 model_id → 且该 model_id 无活跃别名 → 返回 { channelId, model_id }
3. 无匹配 → 返回 null
```

**SQL 改动**：

```typescript
// 改动前
const model = db.prepare(`
  SELECT cm.*, c.is_active as ch_active FROM channel_models cm
  LEFT JOIN channels c ON c.id = cm.channel_id
  WHERE cm.model_id = ? AND cm.is_active = 1 AND c.is_active = 1
`).get(modelName) as any;

// 改动后
const model = db.prepare(`
  SELECT cm.*, c.is_active as ch_active FROM channel_models cm
  LEFT JOIN channels c ON c.id = cm.channel_id
  LEFT JOIN model_aliases ma ON ma.channel_model_id = cm.id AND ma.is_active = 1
  WHERE cm.model_id = ? AND cm.is_active = 1 AND c.is_active = 1
    AND ma.id IS NULL
`).get(modelName) as any;
```

`getModelsForAuto()` 不做改动——自动路由是内部逻辑，直接使用原始 model_id。

### 2. 代理层：`callUpstream()` / `callUpstreamStreaming()` （proxy.ts）

**改动前**：
```typescript
if (!res.ok) throw new Error(`Upstream error ${res.status}: ${await res.text()}`);
```

**改动后**：
```typescript
if (!res.ok) {
  const text = await res.text();
  const err: any = new Error(text);
  err.status = res.status;
  err.body = text;
  throw err;
}
```

`callUpstreamStreaming()` 做相同改动。

### 3. API 层：错误透传（completions/route.ts）

**catch 块改动**：

```typescript
// 改动前
return NextResponse.json({
  error: { message: `Upstream error: ${err instanceof Error ? err.message : ''}`, type: 'server_error' }
}, { status: 502 });

// 改动后
catch (err: any) {
  let status = err.status || 502;
  let errorBody: any;

  try {
    errorBody = JSON.parse(err.body || '{}');
  } catch {
    errorBody = { error: { message: err.body || 'Upstream error', type: 'server_error' } };
  }

  return NextResponse.json(errorBody, { status });
}
```

流式和非流式两个 catch 块（第 165-175 行和第 133-142 行）都做同样改动。流式场景中上游 error 在 `callUpstreamStreaming()` 内部抛异常，由外层 catch 捕获。

### 4. UI 层：Key 管理模型选择器（keys/page.tsx）

**`getModelsForChannels()` 改动**：

```typescript
// 改动前
const models = chModels.map((m: any) => m.model_id);
const cmIds = new Set(chModels.map((m: any) => m.id));
const aliases = (d.aliases || []).filter((a: any) => cmIds.has(a.channel_model_id)).map((a: any) => a.alias_name);
return [...new Set([...models, ...aliases])].sort();

// 改动后
const chModelIds = new Set(chModels.map((m: any) => m.id));
const aliasedModelIds = new Set(
  (d.aliases || [])
    .filter((a: any) => a.is_active && chModelIds.has(a.channel_model_id))
    .map((a: any) => a.channel_model_id)
);
const aliasOptions = (d.aliases || [])
  .filter((a: any) => a.is_active && chModelIds.has(a.channel_model_id))
  .map((a: any) => a.alias_name);
const nativeOptions = chModels
  .filter((m: any) => !aliasedModelIds.has(m.id))
  .map((m: any) => m.model_id);
return [...aliasOptions, ...nativeOptions].sort();
```

这样 ComboBox 中不会有重复的原始 model_id 和别名同时出现。

### 5. UI 层：渠道管理模型卡片（channels/page.tsx）

当前布局（第 326-344 行）：

```
[ deepseek-v4-pro ] → [ my-model ]  ×
```

改动后布局：

```
[ my-model ]                        ×
 ↳ model: deepseek-v4-pro

（无别名模型保持不变）
[ deepseek-v4-flash ]      + 别名
```

核心是交换 `m.model_id` 和 `alias.alias_name` 的展示位置，别名为主、原名为辅。

### 6. 不变的区域

- **模型广场**（models/page.tsx）：当前代码已正确区分别名和原生模型，别名模型大标题 + `实际请求: xxx` 小字。不做改动。
- **`/v1/models`** API 端点：当前代码已通过 `aliasedModelIds` 过滤掉原始 model_id。不做改动。
- **`getModelsForAuto()`**：自动路由是内部逻辑，不走别名映射。不做改动。
- **调用日志**：记录的是 `modelName`（用户请求时传入的名称），传入别名则记录别名，行为不变。

## 边界情况

| 场景 | 预期行为 |
|------|----------|
| 用户用 alias_name 请求 | ✅ 正常路由到上游，response.model = alias_name |
| 用户用原始 model_id 请求，该模型无别名 | ✅ 正常路由 |
| 用户用原始 model_id 请求，该模型有别名 | ❌ 返回 404 "Model not found" |
| `model: "auto"` | ✅ 内部随机选模型，不受别名影响 |
| 删除别名后 | ✅ 原始 model_id 重新可用，路由和 UI 自动恢复 |
| 上游返回 400/429/500 含结构化 JSON 错误 | ✅ 原样透传 |
| 上游返回非 JSON 错误文本 | ✅ 包装为 `{ error: { message: "..." } }` 返回 |

## 回滚方案

每个改动点都是独立的一处逻辑变化，回滚只需 `git checkout -- <file>` 逐个恢复。

## 验证要点

1. 创建一个渠道 → 拉取模型 → 添加别名 → 确认 Key 管理模型选择器中不显示原始 model_id
2. 用 curl 以原始 model_id 请求 → 确认 404
3. 用 curl 以 alias_name 请求 → 确认正常返回
4. 渠道管理中别名卡片展示正确
5. 模拟上游返回 429 JSON 错误 → 确认客户端收到相同 status + body
