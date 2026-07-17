# 仪表盘统计修复、时区统一与日志详情增强设计

**日期:** 2026-07-17
**状态:** 已批准设计

## 1. 背景与问题

### 1.1 仪表盘统计 Bug

- **"今日" 默认 7 天**: `activeDate` 初始化 `'7d'`，右上角快速选择默认高亮 7 天，而非今日
- **今日数据不更新**: 前端发送的 `start_date` 只有 `YYYY-MM`（年-月），缺少日部分，实际查的是整个月
- **数据不过午夜重置**: UTC 时区内午夜与北京时间午夜相差 8 小时

### 1.2 时区问题

- `created_at` 使用 SQLite 的 `datetime('now')` 存储 UTC 时间
- 所有 `date(created_at)` 分组查询按 UTC 日期分组，与北京时间（UTC+8）有 8 小时偏差
- `datetime('now')` 获取 UTC 当前时间，与北京时间查询条件不匹配

### 1.3 日志详情不足

- 日志表格仅有扁平列展示，不可展开
- `error_message` 仅放在 `title` 属性中，悬停只能看到部分内容
- 无法查看一次调用的完整信息

## 2. 设计

### 2.1 方案选择：存储北京时间（方案 A）

**决策**: 所有数据库的 `created_at` 字段改为直接存储北京时间字符串。

理由:
- SQL 查询中的 `date(created_at)` 直接返回北京日期，无需任何偏移
- 统计分组精确到北京日期
- 代码最简洁，不入侵每个查询

### 2.2 数据库变更

#### Schema 修改

所有表的 `created_at` 默认值 `DEFAULT (datetime('now'))` 改为 `DEFAULT (datetime('now', '+8 hours'))`：

- `relay_keys` — `created_at`, `updated_at`
- `channels` — `created_at`
- `channel_models` — `created_at`
- `model_aliases` — `created_at`
- `call_logs` — `created_at`

#### 数据迁移

为确保幂等性（不会重复执行），创建 `_migrations` 表追踪：

```sql
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now', '+8 hours'))
);
```

迁移逻辑（在 `db.ts` 中 `initSchema()` 末尾执行）：

```typescript
const applied = db.prepare("SELECT name FROM _migrations WHERE name = 'v2_timezone_beijing'").get();
if (!applied) {
  db.exec(`
    UPDATE relay_keys SET created_at = datetime(created_at, '+8 hours'), updated_at = datetime(updated_at, '+8 hours');
    UPDATE channels SET created_at = datetime(created_at, '+8 hours');
    UPDATE channel_models SET created_at = datetime(created_at, '+8 hours');
    UPDATE model_aliases SET created_at = datetime(created_at, '+8 hours');
    UPDATE call_logs SET created_at = datetime(created_at, '+8 hours');
    INSERT INTO _migrations (name) VALUES ('v2_timezone_beijing');
  `);
}
```

### 2.3 显示函数更新

**文件**: `src/lib/date.ts`

现有的 `toBeijing()` 和 `toBeijingFull()` 函数假定输入是 UTC 字符串。存储北京时间后，需要先补 `+08:00` 后缀再解析，确保 JS `Date` 对象正确解释。

```typescript
export function toBeijing(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  });
}

export function toBeijingFull(beijingDate: string): string {
  const d = new Date(beijingDate.replace(' ', 'T') + '+08:00');
  return d.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}
```

### 2.4 SQL 查询更新

#### 统计路由 (`src/app/admin/stats/route.ts`)

| 旧写法 | 新写法 | 原因 |
|--------|--------|------|
| `datetime('now', ?)` | `datetime('now', '+8 hours', ?)` | 当前时间对齐北京时间 |
| `date(created_at)` | 不变 | 已存北京时间 |
| `strftime('%H', created_at)` | 不变 | 已存北京时间 |

#### 日志查询 (`src/lib/logs.ts`)

`listCallLogs()` 的日期筛选 `WHERE created_at >= ?` 和 `WHERE created_at <= ?` 无需修改，因为传入的参数是北京时间，存储的也是北京时间，直接比较。

### 2.5 仪表盘统计修复

#### 默认改为今日

**文件**: `src/app/dashboard/page.tsx`

初始化 `activeDate` 从 `'7d'` 改为 `'today'`。

#### 今日筛选修复

```typescript
if (activeDate === 'today') {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  params.set('start_date', `${y}-${m}-${d} 00:00:00`);
  params.set('end_date', `${y}-${m}-${d} 23:59:59`);
}
```

#### 自动刷新

今日模式下，每 60 秒自动轮询刷新数据，确保实时性。

### 2.6 日志行内展开

**文件**: `src/app/dashboard/logs/page.tsx`

#### 交互方式

- 点击日志行（`<tr>`）切换展开/收起
- 同时只能展开一行
- 展开行通过带 indent 的 `<tr>` 内嵌 `<td colspan={7}>` 实现

#### 展开内容

| 信息 | 说明 |
|------|------|
| 时间 | 完整时间戳（北京时间） |
| Key 名 | 调用使用的 Key 名称 |
| 渠道 | 使用的上游渠道名称 |
| 模型 | 请求的模型名 |
| Token 详情 | 输入/输出/缓存/未缓存/总数 |
| 费用 | 本次调用费用 |
| IP | 来源 IP |
| 状态 | 成功或失败 |
| 错误信息 | 失败时显示红框错误信息（仅失败态显示） |

#### 样式

- 展开详情区域：白底灰框，`rounded-lg` 圆角
- Token 使用网格布局（2×2 或 2×3）
- 失败错误信息：红底红框，带复制按钮
- 成功时隐藏错误区域

## 3. 涉及的源文件

| 文件 | 改动 |
|------|------|
| `src/lib/db.ts` | 修改 DEFAULT 值 + 添加数据迁移 |
| `src/lib/date.ts` | 更新 `toBeijing()` 和 `toBeijingFull()` |
| `src/app/admin/stats/route.ts` | `datetime('now')` → `datetime('now', '+8 hours', ...)` |
| `src/lib/logs.ts` | `getStats()` 中 `datetime('now')` → `datetime('now', '+8 hours', ...)` |
| `src/app/dashboard/page.tsx` | 默认 today、修正今日日期参数、自动刷新 |
| `src/app/dashboard/logs/page.tsx` | 添加行内展开详情功能 |

## 4. 不涉及的范围

- 不修改 `relay_keys` 表结构
- 不新增数据库字段或列
- 不修改 API 响应格式
- 不修改代理逻辑（`proxy.ts`、chat completions route 等）
- 不修改渠道管理页面
- 不修改 Key 管理页面
