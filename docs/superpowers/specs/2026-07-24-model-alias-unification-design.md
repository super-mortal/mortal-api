# 模型别名统一 & auto 移除设计

**日期**: 2026-07-24
**项目**: Mortal API

## 概述

本文档统一"原始模型 ID"与"别名"在整个项目中的使用规则，并移除 `model="auto"` 随机路由功能。

## 核心规则

- `public_name` = 设了别名 → 别名；没设 → 原 ID
- **客户端**（下游用户）：永远只能看到/使用 `public_name`
- **管理员端 dashboard**：继续显示原 ID，必要时附别名
- **核心路由策略**（健康度、cooldown、429 vs failure、重试 3 次、excluded 渠道列表）：**不变**

## 改动清单（最终确认）

| # | 位置 | 改动 |
|---|---|---|
| ① | 后台 → 渠道管理 → 编辑 → 顶部「拉取」列表 | **不动**（现状显示原 ID） |
| ② | 后台 → 渠道管理 → 编辑 → 模型列表行 | **不动**（已显示原 ID → 别名） |
| ③ | 后台 → Key 管理 → 编辑 → 允许的模型下拉 | **不动**（已显示原 ID (别名)） |
| ④ | 后台 → Key 管理 → 列表 → 模型限制 Popover | **不动** |
| ⑤ | 后台 → 日志 → 模型列 | **改**（底层写入字段改 public_name；UI 代码不动） |
| ⑥ | 客户端 → POST /v1/chat/completions | **改**（必须传 public_name；auto 移除） |
| ⑦ | 客户端 → GET /v1/models | **改**（输出 public_name 去重） |
| ⑧ | 计费 → model_pricing 表 | **改**（主键改 public_name，迁移 v6） |

## ⑤ 后台日志（细节）

**为什么乱**：当前代码写入 `call_log.model` 时存在 3 种来源：
- auto 路径写 `billingName`（alias_name）
- 正常路径写 `modelName`（用户传入）
- 结果：同一个上游模型在日志里出现两种名（codex / gpt-4o）

**改后**：删除 auto 路径（约 170 行），正常路径写入 `publicName`，整个项目只有 1 个写入点。后台日志 UI 列表代码完全不动——它本来就直接展示 `call_log.model` 字段，字段值统一了展示就统一了。

**改的代码**：
- `route.ts:128`（auto 路径）→ 整段删除
- `route.ts:312`（正常路径）→ `model: modelName` 改为 `model: publicName`

## ⑥ 客户端 POST 请求

**改前**：客户端可传 `model="codex"`、`model="gpt-4o"`、`model="auto"`

**改后**：
- 必须传 `public_name`
- `model="auto"` → 返回 400
- 客户端之前用原 ID 调用、现在该模型设了别名 → 必须改用别名

## ⑦ 客户端 GET /v1/models

**改前**：
```json
{
  "data": [
    {"id": "codex"},
    {"id": "gpt-4o"},        // ← 跟 codex 同一个上游
    {"id": "deepseek-v4-pro"}
  ]
}
```

**改后**：
```json
{
  "data": [
    {"id": "codex"},            // public_name
    {"id": "deepseek-v4-pro"}   // public_name
  ]
}
```

每个 upstream model_id 只出现一次。

## ⑧ 计费 model_pricing（数据库迁移 v6）

**改前**：主键是上游 model_id，auto 走 alias 查 pricing、非 auto 走 modelName 查，可能命中不同行。

**改后**：主键改为 public_name，永远命中唯一行。

**迁移 SQL**：
```sql
-- 1. 备份
CREATE TABLE model_pricing_backup AS SELECT * FROM model_pricing;

-- 2. 重建表
DROP TABLE model_pricing;
CREATE TABLE model_pricing (
  model_id TEXT PRIMARY KEY,  -- 语义改为 public_name
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

-- 4. 兜底：未匹配到的原 model_id 保留
INSERT OR IGNORE INTO model_pricing (model_id, prompt_price, completion_price, cached_prompt_price, updated_at)
SELECT model_id, prompt_price, completion_price, cached_prompt_price, updated_at
FROM model_pricing_backup
WHERE model_id NOT IN (SELECT model_id FROM model_pricing);

DROP TABLE model_pricing_backup;

INSERT INTO _migrations (name) VALUES ('v6_pricing_public_name');
```

## 内部实现：路由 SQL 合并

`channels.ts:192-255` 现有 3 个 SQL 分支（allowed 查 alias / 全局查 alias / channel_models 直匹配）合并为 1 个：

```sql
SELECT ma.alias_name AS public_name, cm.model_id AS upstream_model_id, cm.channel_id
FROM model_aliases ma
JOIN channel_models cm ON cm.id = ma.channel_model_id
JOIN channels c ON c.id = cm.channel_id
WHERE ma.alias_name = ? AND ma.is_active = 1 AND <AVAILABLE_CHANNEL_SQL>
  AND (? IS NULL OR cm.channel_id IN (...))
  AND (? IS NULL OR c.id NOT IN (...))
UNION
SELECT cm.model_id AS public_name, cm.model_id AS upstream_model_id, cm.channel_id
FROM channel_models cm
JOIN channels c ON c.id = cm.channel_id
WHERE cm.model_id = ? AND cm.is_active = 1 AND <AVAILABLE_CHANNEL_SQL>
  AND NOT EXISTS (SELECT 1 FROM model_aliases ma WHERE ma.channel_model_id = cm.id AND ma.is_active = 1)
ORDER BY CASE c.health_status WHEN 'healthy' THEN 1 WHEN 'unknown' THEN 2 WHEN 'cooling_down' THEN 3 ELSE 4 END ASC
LIMIT 1
```

返回 `{ publicName, channelId, upstreamModelId }` 给调用方。

`getModelsForAuto()` 删除。

## 改动文件

| 文件 | 改动 |
|---|---|
| `src/lib/channels.ts` | resolveModel 合并 3 SQL → 1 SQL；删除 getModelsForAuto |
| `src/lib/model-pricing.ts` | 主键语义改 public_name；calculateCost(public_name, …) |
| `src/app/v1/chat/completions/route.ts` | 删除 auto 分支（~170 行）；统一写 publicName 到日志 |
| `src/app/v1/models/route.ts` | 输出 public_name 去重 |
| `src/lib/db.ts` | v6 迁移 |

## 兼容性

- 客户端用 `model="auto"` → 400 报错（需更新日志写明）
- 客户端用 `model="别名"`（已设别名）→ 继续可用
- 客户端用 `model="原 ID"`（没设别名）→ 继续可用
- 客户端既用别名又用原 ID 调同一模型 → 改后只能调别名

## 测试

- 单元：`resolveRoute("codex")` 当 model_id="gpt-4o" 已被设别名 "codex" → 返回 `public_name="codex"`
- 单元：`resolveRoute("gpt-4o")` 当未设别名 → 返回 `public_name="gpt-4o"`
- 集成：`POST /v1/chat/completions model="codex"` → 路由到正确渠道，日志 `model="codex"`
- 集成：`POST /v1/chat/completions model="auto"` → 400 错误
- 集成：`GET /v1/models` → 返回 `public_name` 列表，每个 upstream model_id 只一次
- 数据库：迁移后 `SELECT * FROM model_pricing` 主键为 public_name
