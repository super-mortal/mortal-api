# Dashboard 图表优化、密钥刷新按钮、日志快捷筛选

Date: 2026-07-19

## 概述

三个独立的前端优化项，涉及仪表盘、密钥管理、调用日志三个管理后台页面。

---

## 1. 仪表盘 — 图表柱子宽度限制

### 问题

选择「今日」筛选时，`dailyStats` 仅返回一条数据，Recharts 的 `BarChart` 将单根柱子拉伸至填满整个容器宽度，导致柱子过于宽大。

### 方案

在 `src/app/dashboard/page.tsx` 的两个 `BarChart` 组件上添加 `maxBarSize` 属性：

- **每日 Token 消耗** 图表（第 198 行）：`<BarChart data={data.dailyStats} maxBarSize={36}>`
- **Token 构成** 图表（第 256 行）：`<BarChart data={data.dailyStats} maxBarSize={36}>`

单行修改，不涉及样式或状态变更。多数据点时 Recharts 自动压缩柱宽以适应容器，`maxBarSize` 仅作为上限。

### 效果

- 选「今日」：图表左侧显示 36px 宽的柱子，右侧留白
- 选 7 天/30 天/全部：每根柱子 ≤36px，数据多时自动变窄，与现有行为一致

---

## 2. 密钥管理 — 刷新按钮、ConfirmDialog、字号调整

### 2a. 操作列新增刷新按钮

**文件**: `src/app/dashboard/keys/page.tsx`

在操作列的复制按钮和编辑按钮之间插入刷新按钮：

```
[复制] [刷新] [编辑] [Switch开关] [删除]
```

刷新按钮配置：
- 图标: `refreshCw`（Lucide，`public/icons/` 中已有）
- 样式: 与复制/编辑按钮一致（`p-1.5 rounded text-gray-400 hover:text-indigo-600 hover:bg-indigo-50`）
- title: "刷新 Key"

### 2b. 确认弹窗（ConfirmDialog）

新增状态 `refreshConfirm: { id: string; name: string } | null`。

点击刷新按钮 → 设置状态 → 渲染 `ConfirmDialog`：

```tsx
<ConfirmDialog
  open={!!refreshConfirm}
  onClose={() => setRefreshConfirm(null)}
  onConfirm={() => handleRefreshKey(refreshConfirm!.id)}
  title="确认刷新 Key"
  message="刷新 Key「{name}」后旧 Key 将立即失效，确定继续？"
  confirmText="确认刷新"
  variant="info"
/>
```

点击确认 → 调 PATCH `/admin/keys` 接口（`{ id, refresh_key: true }`）→ 成功后页面顶部显示临时横幅（5 秒自动消失），包含新 Key 值和复制按钮：

```
┌──────────────────────────────────────────────────┐
│ ✓ Key 已刷新                                        │
│ 新 Key: sk-mortal-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx  │
│ [复制]                                              │
└──────────────────────────────────────────────────┘
```

### 2c. 移除编辑弹窗内的旧刷新区域

删除编辑 Modal 中的 `API Key` 区域（`className="border-t border-gray-100 pt-3"` 的 `div` 及内部所有内容），包括：
- API Key 展示
- 刷新按钮
- 新 Key 值展示区块
- 对应的 `refreshing`、`newKeyValue` 状态及其逻辑

### 2d. 表格字号微调

| 元素 | 当前值 | 调整后 |
|------|--------|--------|
| 表头 th | `text-xs` | `text-[11px]` |
| 表格 body td | `text-xs sm:text-sm` | `text-[11px] sm:text-xs` |
| cell 横向 padding | `px-3 sm:px-4` | `px-2.5 sm:px-3` |
| cell 纵向 padding | `py-3` | `py-2.5` |
| API Key 显示 | `text-[10px] sm:text-xs` | 保持 `text-[10px]` |
| 状态标签 | `text-[10px] sm:text-xs` | 保持 `text-[10px]` |
| 标题 h1（不变） | `text-lg sm:text-xl` | 不变 |
| 副标题（不变） | `text-xs sm:text-sm` | 不变 |
| 按钮（不变） | `text-sm` | 不变 |

---

## 3. 调用日志 — 快捷筛选按钮

### 文件

`src/app/dashboard/logs/page.tsx`

### 新增状态

```tsx
const [activeDate, setActiveDate] = useState<'today' | '7d' | '30d' | 'custom'>('custom');
```

当前页面已经默认展示日期输入框（无预设筛选）。新按钮组默认选中状态根据行为：

- 当 `activeDate` 为 `'today'`、`'7d'`、`'30d'` 时，自动计算日期并填充到 `startMonth`/`endMonth`
- 当 `activeDate` 为 `'custom'` 时，显示原有的两个 `datetime-local` 输入框（保持实时筛选行为）

### UI 布局

在筛选区域（`<div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 flex-wrap">`）内，现有日期输入框的位置改为：

```
┌─────────────────────────────────────────────────────────────┐
│ [今日] [7天] [30天] [自定义]                                │
│ ┌──────────────────────────────────────────────────────┐    │
│ │  2026-07-19 00:00          —  2026-07-19 23:59       │    │
│ └──────────────────────────────────────────────────────┘    │
│ [全部状态 ▼] [全部 Key ▼] [模型名输入] [清除]             │
└─────────────────────────────────────────────────────────────┘
```

- 日期输入框仅在 `activeDate === 'custom'` 时显示
- 点击「今日」「7天」「30天」时隐藏日期输入框，自动计算填入
- 点击「自定义」显示日期输入框，用户手动设置

### 逻辑

```ts
const handleFilterPreset = (preset: 'today' | '7d' | '30d') => {
  setActiveDate(preset);
  // 自动计算日期范围
  if (preset === 'today') {
    const now = new Date();
    const y = now.getFullYear(), m = String(now.getMonth() + 1).padStart(2, '0'), d = String(now.getDate()).padStart(2, '0');
    setStartMonth(`${y}-${m}-${d}T00:00`);
    setEndMonth(`${y}-${m}-${d}T23:59`);
  } else if (preset === '7d') {
    // 7 天前到今天
  } else if (preset === '30d') {
    // 30 天前到今天
  }
};
```

按钮样式与仪表盘一致：选中时 `bg-gray-900 text-white shadow-sm`，未选中时 `text-gray-600 hover:text-gray-900 hover:bg-gray-50`。

日期输入框的行为保持不变：值变化时立即触发 `fetchLogs`（`onChange` 逻辑不变）。

---

## 副作用与边界情况

- **1.1** `maxBarSize` 仅影响柱状图，面积图（AreaChart）不涉及，无需改动
- **2.1** 刷新成功后需重新 `fetchData()` 以更新密钥列表
- **2.2** 临时横幅通过状态 `refreshResult` 控制，用 `setTimeout` 5s 后清除
- **3.1** 点击预设按钮时需清空 `selected`（已选日志行），避免跨时间段错误操作
- **3.2** 预设筛选和分页页码联动：切换预设时重置 `page = 0`

## 无改动文件

- `src/lib/confirm-dialog.tsx` — 组件已存在，无需修改
- 后端 API — 日志和密钥的接口已支持日期/刷新参数，无需后端改动

## 测试

- 仪表盘：分别选择今日/7天/30天/全部，验证柱子宽度是否合理
- 密钥管理：
  - 点击刷新按钮 → ConfirmDialog 弹出 → 确认 → 刷新成功 → 提示横幅出现 → 5s 后消失
  - 表格整体是否不再显得拥挤
- 调用日志：
  - 点击今日/7天/30天 → 数据正确筛选 → 日期输入框隐藏
  - 点击自定义 → 日期输入框显示 → 手动修改日期 → 实时筛选
  - 切换预设 → 重置到第一页
