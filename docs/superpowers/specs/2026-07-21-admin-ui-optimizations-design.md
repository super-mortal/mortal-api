# 管理后台 UI 优化集合 设计文档

> **For:** 实现计划（writing-plans）
> **Status:** Draft

## 1. 渠道 HealthBar 优化（渠道管理页面）

**位置：** `src/lib/health-badge.tsx` → `HealthBar` 组件

**改动：**

- 截断 `recent_checks` 数组为最多 24 条记录
- 改为两行布局：每行最多 12 个点
  - 第一行右侧显示 `uptime_pct%`
  - 第二行右侧显示 `avg_latency_ms`
- 原有逻辑（颜色、tooltip、空状态）保持不变

**实现要点：**
- `recent_checks.slice(0, 24)` 截断
- 用数组切分 `chunk(recent_checks, 12)` 生成两行
- CSS `gap-0.5` 保持点间距一致

## 2. Key 管理 — 模型限制 Popover（Key 管理页面）

**位置：** `src/app/dashboard/keys/page.tsx` 中 `<Popover>` 组件

**改动：**
- 去掉 Popover 最小宽度限制（当前 `min-w-[140px]`）
- 超过 10 个模型时自动切换为双列网格布局（`grid grid-cols-2`）
- 高度限制在可显示约 10 个模型的高度，超出滚动
- 模型名完整显示，无截断

**实现要点：**
- `modelsList.length > 10` → 双列，否则单列
- `max-height` + `overflow-y-auto`

## 3. 编辑 Key 过期时间（Key 管理页面）

**位置：** `src/app/dashboard/keys/page.tsx` 编辑 Modal 中的过期时间字段

**改动：**
- 将 `<input type="datetime-local">` 替换为 `DateTimePicker` 组件（来自 `src/lib/date-picker.tsx`）
- 保持 `editExpiry` 状态格式（`YYYY-MM-DDTHH:mm`）不变

**实现要点：**
- `DateTimePicker` 的 value/onChange 接口直接兼容
- 当前 `editExpiry` 格式已是 `YYYY-MM-DDTHH:mm`，无需额外转换
- 已有的 "当前: ..." 提示文本保留

## 4. 渠道编辑侧边栏（渠道管理页面）

**位置：** `src/app/dashboard/channels/page.tsx` 中的侧边 Panel

**改动清单：**

### 4.1 宽度调整
- `min-w-[480px]` → `min-w-[500px]`
- `max-w-[640px]` → `max-w-[660px]`

### 4.2 滚动条隐藏
- 内容区域添加 CSS：`scrollbar-width: none` + `-ms-overflow-style: none` + `&::-webkit-scrollbar { display: none }`

### 4.3 API Key 字段显示
- **编辑模式：** placeholder 从「留空保持不变」改为显示 `sk-••••••••••••••••` 并添加眼睛切换按钮（`type="password"` ↔ `type="text"`）
- **新建模式：** placeholder 保持 `sk-...`
- 编辑提交时如果 API Key 字段不变（仍是屏蔽后的 ***），则不发送 `api_key` 字段（与当前逻辑一致）

### 4.4 价格输入框
- **位置：** 模型展开后的三个价格输入（标准输入 / 输出 / 缓存输入）
- `type="number"` → `type="text"`
- 移除右侧 spinner 箭头（`appearance: none` 配合 `[type="number"]::-webkit-inner-spin-button { display: none }` 或直接改用 text）
- **校验逻辑：** 保存时检查值是否包含小数点（`.`）
  - 合法：`28.0`、`0.5`、`100.00`
  - 非法：`28`、`0`、`abc` → 提示「价格必须包含小数点，如 28.0」
- step 属性不再需要

## 5. 模型广场去重（模型广场页面）

**位置：** `src/app/dashboard/models/page.tsx`

**改动：** 相同模型名跨渠道只显示一张卡片

**逻辑：**
- 按 `displayName` 分组，同名的 `displayItems` 合并
- 卡片内渠道信息显示规则：
  - 主要渠道：取 `uptime_pct` 最高（调用成功率最高）的渠道显示在主位置（健康圆点 + 渠道名 + 可用率）
  - 右侧箭头悬浮（或点击）弹出 Popover：列出所有拥有此模型的渠道（带健康状态）
- 复制按钮保持不变，仍复制模型名
- 别名逻辑：如果有别名则显示别名信息，实际请求指向底层模型
- 卡片移除原有的单渠道显示，改为多渠道分组后的聚合信息

**渠道筛选兼容：**
- 筛选某个渠道时，显示该渠道有提供的模型卡片
- 没有该渠道的模型卡片不显示
- 不额外标记高亮

## 6. 调用日志表格字体（日志页面）

**位置：** `src/app/dashboard/logs/page.tsx`

**改动：** 表格区域整体字号缩小 1px

**具体：**
- 表头：`text-[10px] sm:text-xs` → `text-[9px] sm:text-[11px]`
- 数据行：`text-[10px] sm:text-xs` → `text-[9px] sm:text-[11px]`
- 其他标签（状态、模型名、渠道名等同步缩小）
- 注意保留足够可读性

## 7. 文件列表

| 文件 | 改动 |
|------|------|
| `src/lib/health-badge.tsx` | HealthBar 24点双行布局 |
| `src/app/dashboard/keys/page.tsx` | 模型限制 Popover 自适应 + 双列；编辑过期时间 DateTimePicker；价格输入 text+校验；API Key 显示 |
| `src/app/dashboard/channels/page.tsx` | 侧边栏宽度+20px、滚动条隐藏、API Key ***+眼睛、价格 spinner 移除+小数校验 |
| `src/app/dashboard/models/page.tsx` | 模型去重分组、箭头悬浮渠道列表、渠道筛选兼容 |
| `src/app/dashboard/logs/page.tsx` | 表格字号缩小 1px |

## 8. 实现顺序建议

1. 调用日志表格字体（最小改动，无副作用）
2. HealthBar 优化（独立组件改动）
3. 模型限制 Popover（独立改动）
4. 编辑 Key 过期时间 DateTimePicker（替换输入控件）
5. 渠道侧边栏宽度 + 滚动条 + API Key 显示（同一文件关联改动）
6. 价格输入框 spinners + 校验（侧边栏内改动）
7. 模型广场去重（最大改动，需要处理分组逻辑和筛选兼容）
