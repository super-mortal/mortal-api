# 模型别名统一 & auto 移除设计

**日期**: 2026-07-24
**项目**: Mortal API

## 概述

本文档统一"原始模型 ID"与"别名"在整个项目中的使用规则，并移除 `model="auto"` 随机路由功能。核心路由策略（健康度排序、cooldown、429 vs failure、重试 3 次、excluded 渠道列表）**原样保留**；仅修改"用哪个名字"的字段来源。

## 核心规则

- **设了别名 → 永远用别名**（作为对外名 `public_name`）
- **没设别名 → 永远用原 ID**（`public_name = model_id`）
- 整个项目对外（包括客户端调用、`/v1/models`、日志、计费、Key 限制）只看到 `public_name`
- 只有管理员编辑页面能看到原 ID（作为 hint）

## 范围

| 类别 | 状态 |
|---|---|
| 路由策略（健康度、cooldown、429、retry、excluded） | **不变** |
| `model="auto"` 随机路由功能 | **移除** |
| `model_pricing.model_id` 主键 | 改为 public_name（数据库迁移） |
| 7 个位置的字段使用 | 见下方表格 |

## 改动详情

| # | 位置 | 现在 | 改后 |
|---|---|---|---|
| 1 | 路由查 channel<br>`channels.ts:192-255`<br>`route.ts:55-222` | 3 个独立 SQL 分支（allowed 查 alias / 全局查 alias / channel_models 直匹配），加上 auto 路径另一套 `getModelsForAuto`。重试循环每次重新查 DB，约 170 行 auto 代码独立存在。 | 合并为 1 个 SQL：`SELECT FROM (alias ∪ direct) WHERE public_name = ?`。auto 路径整段删除。`public_name` = 别名（设了）或原 ID（没设）。 |
| 2 | Key 的 allowed_models 检查<br>`route.ts:255` | `if (!includes(modelName) && !includes(upstreamModelId))` 同时比对用户传入名和解析后的 upstream 名。逻辑分散，两个名都能过。 | `if (!includes(publicName))` 一个判断、一个名，永远比对「对外名」。 |
| 3 | `/v1/models` 对外列表<br>`v1/models/route.ts` | 输出不统一。下游拿到的列表里同一个上游模型可能既有别名又有原 ID，容易混淆。 | 输出 `public_name`。设了别名的输出别名，没设的输出原 ID。每个 upstream model_id 只出现一次。 |
| 4 | 渠道"拉取模型"展示<br>`channels/page.tsx` | 显示上游原 model_id（gpt-4o）。即使该模型已经设了别名（codex），列表里还是 gpt-4o。 | 后端注入 aliasMap，前端把 model_id 翻译成 `public_name` 显示（codex）。原 ID 作 tooltip 或小灰字 hint。 |
| 5 | Key 编辑 allowed_models 下拉<br>`keys/page.tsx` ComboBox | 下拉显示 channel_models 全量，按 model_id 列出，没突出哪些已设别名。 | 下拉项显示 `public_name`：主文本 `codex`（已设别名）或 `gpt-4o`（没设），旁边小灰字 `gpt-4o` 作 hint。存的就是 `public_name`。 |
| 6 | 日志 model 字段<br>`route.ts createCallLog` 多处 | auto 路径写 `billingName`（来自 alias），其他路径写 `modelName`（用户传入）。同一个上游模型在日志里可能两种名。 | 删除 auto 路径后只剩一处，统一写 `public_name`。 |
| 7 | 计费 `model_pricing`<br>`model-pricing.ts`<br>`findChannelsWithSamePricingKey` | 主键是 model_id，但 `findChannelsWithSamePricingKey` 用 alias_name 对齐，跨表混用 key。auto 走 alias 查 pricing，非 auto 走 modelName 查，可能命中不同行。 | 主键改为 `public_name`。计费时 `getModelPricing(public_name)`，永远查同一行。需数据库迁移。 |

## 改动文件

### 后端

- `src/lib/channels.ts`：`resolveModel` 合并 3 SQL → 1 SQL；删除 `getModelsForAuto`
- `src/lib/model-pricing.ts`：主键改为 `public_name`
- `src/app/v1/chat/completions/route.ts`：删除 auto 分支（~170 行）；统一使用 `public_name`
- `src/app/v1/models/route.ts`：输出 `public_name` 去重
- `src/app/admin/channels/route.ts`：返回字段加 `public_name`

### 前端

- `src/app/dashboard/channels/page.tsx`：拉取列表展示 `public_name`
- `src/app/dashboard/keys/page.tsx`：ComboBox 显示 `public_name` + 原 ID hint
- `src/app/dashboard/logs/page.tsx`（如有 model 列）：用 `public_name`

### 数据库

- `src/lib/db.ts`：加 v6 迁移（见下方）

## 数据库迁移 v6

目标：将现有 `model_pricing.model_id` 重写为 `public_name`。规则：
- 若该 model_id 已有别名 → 改写为别名
- 若该 model_id 没有别名 → 保留原 ID

迁移逻辑（在 `initSchema` 中加 `v6_pricing_public_name`）：

```sql
-- 1. 备份原表
CREATE TABLE model_pricing_backup AS SELECT * FROM model_pricing;

-- 2. 删除原主键约束，重建
DROP TABLE model_pricing;
CREATE TABLE model_pricing (
  model_id TEXT PRIMARY KEY,  -- 语义变为 public_name
  prompt_price REAL NOT NULL DEFAULT 0,
  completion_price REAL NOT NULL DEFAULT 0,
  cached_prompt_price REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);

-- 3. 重写：找每个 model_id 对应的 public_name 后写入
INSERT INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
SELECT
  COALESCE(ma.alias_name, cm.model_id) AS public_name,
  p.prompt_price, p.completion_price, p.cached_prompt_price, p.updated_at
FROM model_pricing_backup p
JOIN channel_models cm ON cm.model_id = p.model_id
LEFT JOIN model_aliases ma ON ma.channel_model_id = cm.id AND ma.is_active = 1;

-- 4. 兜底：未匹配到的原 model_id 保留（兼容旧数据）
INSERT OR IGNORE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
SELECT model_id, prompt_price, completion_price, cached_prompt_price, updated_at
FROM model_pricing_backup
WHERE model_id NOT IN (SELECT model_id FROM model_pricing);

DROP TABLE model_pricing_backup;

INSERT INTO _migrations (name) VALUES ('v6_pricing_public_name');
```

**注意**：如果同一个 model_id 在多个渠道有不同别名，迁移后会有多个 pricing 行；前端按 `public_name` 查询时会取第一个（SQLite 默认顺序）。建议在迁移前提示管理员手动确认无歧义。

## 兼容性

- **客户端用 `model="auto"`**：改后 400 报错。需在更新日志写明。
- **客户端用 `model="别名"`（已设别名）**：继续可用，无影响。
- **客户端用 `model="原 ID"`（没设别名）**：继续可用，无影响。
- **客户端既用别名又用原 ID 调同一模型**：原本两种都能调，改后只能调别名，告知用户改用别名。

## 测试

- 单元：`resolveRoute("codex")` 当 model_id="gpt-4o" 已被设别名 "codex" → 返回 `public_name="codex"`
- 单元：`resolveRoute("gpt-4o")` 当未设别名 → 返回 `public_name="gpt-4o"`
- 集成：`POST /v1/chat/completions model="codex"` → 路由到正确渠道，日志 `model="codex"`
- 集成：`POST /v1/chat/completions model="auto"` → 400 错误
- 集成：`GET /v1/models` → 返回 `public_name` 列表，每个 upstream model_id 只一次
- 数据库：迁移后 `SELECT * FROM model_pricing` 主键为 public_name
