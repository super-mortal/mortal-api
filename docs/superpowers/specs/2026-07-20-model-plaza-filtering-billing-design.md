# 模型计费 + 模型广场筛选 + 密钥金额限制 设计文档

> **For:** 实现计划（writing-plans）
> **Status:** Draft

## 1. 模型广场筛选

**位置：** 模型广场页面顶部统计条右侧空位
**实现方式：** 三个下拉筛选器，行内排列

```
[活跃渠道 3 | 原生模型 12 | 别名映射 5]   [渠道: 全部 ▼] [状态: 全部 ▼] [类型: 全部 ▼]
```

**筛选选项：**

| 筛选 | 数据来源 | 选项 |
|------|----------|------|
| 渠道 | `channels` 表 `is_active=1` | 全部 + 每个渠道名 |
| 状态 | 固定 | 全部 / 正常 / 异常 / 停用 |
| 类型 | 固定 | 全部 / 原生模型 / 别名映射 |

**实现要点：**
- 三个筛选独立工作，同时应用（AND 逻辑）
- 筛选仅在前端做，不修改 API
- 选项使用现有的 `ComboBox` 或 `Popover` 组件
- 仅桌面端显示（`md:flex`），移动端隐藏（模型数据较少无需筛选）

## 2. 模型计费系统

### 2.1 数据模型

新建 `model_pricing` 表（独立表，与渠道解耦）：

```sql
CREATE TABLE IF NOT EXISTS model_pricing (
  model_id TEXT PRIMARY KEY,        -- 模型 ID（如 deepseek-v4-pro，与 channel_models.model_id 一致）
  prompt_price REAL NOT NULL DEFAULT 0,     -- 标准输入（元/1M tokens）
  completion_price REAL NOT NULL DEFAULT 0, -- 输出（元/1M tokens）
  cached_prompt_price REAL NOT NULL DEFAULT 0, -- 缓存命中输入（元/1M tokens）
  updated_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);
```

### 2.2 价格设置入口

- **渠道管理 → 模型列表**：每个模型旁加一个"设置价格"按钮，弹窗编辑三项价格
- 新增模型时默认价格为 0（即不计费，可后续编辑）

### 2.3 费用计算

**发生位置：** `src/app/v1/chat/completions/route.ts`，在代理请求完成、拿到上游返回的 usage 数据后，与 `createCallLog` 同步执行。

**计算逻辑：**

```
cost = (prompt_tokens / 1000000) × prompt_price
     + (completion_tokens / 1000000) × completion_price
     + (cached_input_tokens / 1000000) × cached_prompt_price
```

**单位精度：** 存储为浮点数，保留 6 位小数（元）。

**如果 model_pricing 中找不到该模型：** `cost = 0`（不阻断请求）。

### 2.4 对调用日志的影响

`call_logs` 表已有 `cost` 字段。修改点：
- 在 `createCallLog` 调用处传入实际计算的 `cost`
- 日志列表页"总 token"右侧新增"费用（元）"列

## 3. 密钥金额限制

### 3.1 字段变更

| 当前字段 | 改为 | 类型 | 说明 |
|---------|------|------|------|
| `balance` | `spend_limit` | REAL | 金额上限（元），0 表示无限制 |
| `used_tokens` | `total_spent` | REAL | 累计消费金额（元） |

**数据库迁移：** 列重命名（SQLite 不支持直接重命名，策略：建新列 + 迁移数据 + 后续废弃旧列）。实际采用：
- 新增 `spend_limit` 列，从 `balance` 复制值（`balance` 原为 token 配额，迁移后用户需自行输入新金额限额）
- 新增 `total_spent` 列，从 `used_tokens` 复制值（`used_tokens` 原为 token 计数，迁移后清零或手动调整）
- 旧列保留暂时不删，避免破坏现有备份恢复脚本

更稳妥的做法：**新增两列，旧列保留但不再使用**。

### 3.2 配额校验

`checkRelayKeyQuota()` 逻辑更新：

```typescript
// 金额限制：total_spent + 预估费用 > spend_limit → 拒绝
if (spend_limit > 0 && total_spent + estimatedCost > spend_limit) {
  return { valid: false, reason: 'Insufficient quota' };
}
```

`estimatedCost` 由调用方传入（基于模型定价 + 估算 token 数预先计算）。

### 3.3 自动禁用

每次请求完成后，累加 `total_spent`，并检查：

```typescript
db.transaction(() => {
  db.prepare("UPDATE relay_keys SET total_spent = total_spent + ?, updated_at = datetime('now', '+8 hours') WHERE id = ?")
    .run(cost, keyId);
  
  // 超限自动禁用
  db.prepare(`
    UPDATE relay_keys SET is_active = 0, updated_at = datetime('now', '+8 hours')
    WHERE id = ? AND spend_limit > 0 AND total_spent >= spend_limit AND is_active = 1
  `).run(keyId);
})();
```

### 3.4 到期自动禁用

当前 `checkRelayKeyQuota` 只在校验时拒绝，不自动禁用。改为在请求完成后检查：

```typescript
// 到期自动禁用
db.prepare(`
  UPDATE relay_keys SET is_active = 0, updated_at = datetime('now', '+8 hours')
  WHERE id = ? AND expires_at IS NOT NULL AND expires_at <= datetime('now', '+8 hours') AND is_active = 1
`).run(keyId);
```

**两个条件独立触发：** 金额超限 OR 日期到期，任一满足即设 `is_active=0`。

## 4. 仪表盘 & 日志 UI

### 4.1 仪表盘新增金额图表

在 `src/app/dashboard/page.tsx` 中新增：

- **今日消费总额** — 放在现有统计块中，使用 `Recharts` 面积图或简单数字卡片
- **近 7/30 天消费趋势** — 折线图，使用已有的 `getStats` 接口（已有 `total_cost`）
- **按模型消费排行** — 柱状图或饼图，从 `modelStats` 加上 cost 聚合

API 已有 `total_cost` 和 `cost` 字段（`getStats` 返回），前端直接使用。

### 4.2 调用日志增加费用列

`src/app/dashboard/logs/page.tsx`：

- 在"总 token"列右侧插入"费用（元）"列
- 显示 `log.cost`，格式化为 `¥0.000000`
- 如果 `cost` 为 0 或空，显示 `-`

## 5. 实现顺序

1. 数据库迁移：`model_pricing` 表 + `relay_keys` 新列
2. 模型计费：定价设置 UI + 费用计算逻辑
3. 密钥金额限制：字段改名 + 配额校验 + 自动禁用
4. 模型广场筛选：前端筛选控件
5. 仪表盘 & 日志 UI：金额图表 + 费用列
