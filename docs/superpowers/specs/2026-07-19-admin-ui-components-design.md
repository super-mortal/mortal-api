# 管理后台 UI 组件统一与优化设计

## 概述

对 Mortal API 管理后台各页面中重复的 UI 交互模式进行组件化提取和样式美化，涵盖日期范围选择、下拉筛选器、开关组件、确认弹窗、弹出层等通用组件，并在各页面中统一替换使用。

## 新增组件

所有组件置于 `src/lib/` 下，遵循项目现有风格（Tailwind CSS v4、Lucide Icons、浅色主题）。

### 1. Switch 组件 (`src/lib/switch.tsx`)

纯 CSS 开关组件，替换密钥管理中 toggleLeft/toggleRight 图标的启用/禁用操作。

**Props:**
- `checked: boolean` — 当前开关状态
- `onChange: (checked: boolean) => void`
- `disabled?: boolean`
- `size?: 'sm' | 'md'` — 支持小号（表格内）和中号（表单内）

**样式规则:**
- 开启时绿色背景 (`bg-emerald-500`)，滑块在右
- 关闭时灰色背景 (`bg-gray-300`)，滑块在左
- 滑块带过渡动画 (`transition-transform`)
- hover 时轻微阴影加深

**使用: keys/page.tsx、channels/page.tsx 的启用/停用按钮**

### 2. Popover 组件 (`src/lib/popover.tsx`)

点击触发的弹出层，用于密钥页面模型限制列的完整列表展示。

**Props:**
- `trigger: React.ReactNode` — 点击触发的元素
- `children: React.ReactNode` — 弹出内容
- `open?: boolean` / `onOpenChange?: (open: boolean) => void`
- `align?: 'start' | 'center'`

**行为规则:**
- 点击 trigger 展开/切换
- 点击外部（或按 Escape）关闭
- 弹出层定位在 trigger 下方（CSS absolute + margin）

**使用: keys/page.tsx 的"模型限制"列**

### 3. DateRangePicker 组件 (`src/lib/date-range-picker.tsx`)

下拉面板式日期范围选择器，替换仪表盘当前的自定义日期内联输入框。

**Props:**
- `startDate: string` — 当前开始日期 (YYYY-MM-DD)
- `endDate: string` — 当前结束日期 (YYYY-MM-DD)
- `onStartChange: (date: string) => void`
- `onEndChange: (date: string) => void`
- `onConfirm: () => void` — 确认后触发请求
- `onCancel: () => void` — 重置并关闭

**行为规则:**
- 触发按钮显示为"自定义"（与今日/7天/30天/全部按钮平级）
- 点击展开下拉面板，包含两个 date 输入和一个确认/取消按钮组
- 点击面板外部或取消按钮关闭
- 确认按钮触发查询，面板关闭
- 使用 `type="date"` 而非 `datetime-local`（仪表盘按天统计）

**使用: dashboard/page.tsx**

### 4. SelectFilter 组件 (`src/lib/select-filter.tsx`)

美化版通用下拉筛选器，替换原生 `<select>`。

**Props:**
- `options: SelectOption[]` — 选项数组，`{ label: string; value: string; color?: 'green' | 'red' | 'gray' }`
- `value: string` — 当前选中值
- `onChange: (value: string) => void`
- `placeholder?: string` — 默认占位文本（如"全部 Key"）
- `className?: string`

**样式规则:**
- 外观类似带 `chevronDown` 图标的按钮
- 选项列表为圆角弹出层 (`rounded-xl shadow-lg`)
- 选中项高亮显示
- 选项可带颜色指示（状?指示：成功=绿色点、失败=红色点）

**使用:**
- dashboard/page.tsx — Key 筛选器
- logs/page.tsx — 状态筛选器 + Key 筛选器

### 5. ConfirmDialog 组件 (`src/lib/confirm-dialog.tsx`)

基于 Modal 的确认弹窗，替换所有浏览器原生 `confirm()` / `alert()`。

**Props:**
- `open: boolean`
- `onClose: () => void`
- `onConfirm: () => void`
- `title?: string` — 默认为"确认操作"
- `message: string` — 提示文本
- `confirmText?: string` — 确认按钮文字，默认"确认"
- `variant?: 'danger' | 'info'` — danger 按钮为红色背景，info 为 indigo 背景
- `loading?: boolean` — 异步操作时显示 loading 状态

**使用:**
- keys/page.tsx — 删除 Key 确认
- channels/page.tsx — 删除渠道确认、模型已存在提示
- logs/page.tsx — 单条删除确认（当前已用 Modal，考虑是否统一迁移）

## 各页面改造明细

### 密钥管理页 `src/app/dashboard/keys/page.tsx`

| 改动 | 说明 |
|------|------|
| 操作区启用/禁用 | 替换 `toggleLeft` / `toggleRight` 图标为 Switch 组件 |
| 新增刷新密钥按钮 | 编辑弹窗中新增按钮，调用 PATCH 时传 `refresh_key: true` |
| 新增到期时间列 | 在"创建时间"列右侧，"操作"列左侧，显示日期格式 `YYYY-MM-DD` |
| 模型限制列改造 | 当前截断显示改为 Popover 触发按钮，点击展示全部模型列表 |
| 删除确认弹窗 | 替换 `confirm()` 为 ConfirmDialog |

### 后端支持：密钥刷新

**API 修改**: `PATCH /admin/keys` 增加 `refresh_key` 字段
- 当 `refresh_key: true` 时，后端重新生成 `sk-mortal-xxx` 格式的新密钥
- 其他字段（name, balance, allowed_models 等）保持不变
- 响应中返回新的 `key` 值
- 旧 Key 立即失效，数据库中直接覆盖

### 仪表盘 `src/app/dashboard/page.tsx`

| 改动 | 说明 |
|------|------|
| 自定义日期范围 | 内联 datetime-local 输入改为 DateRangePicker 下拉面板 |
| Key 筛选器 | 原生 `<select>` 改为 SelectFilter 组件 |

### 调用日志页 `src/app/dashboard/logs/page.tsx`

| 改动 | 说明 |
|------|------|
| 状态筛选器 | 原生 `<select>` 改为 SelectFilter 组件（选项颜色：成功=绿、失败=红） |
| Key 筛选器 | 原生 `<select>` 改为 SelectFilter 组件 |
| 日期范围 | 保留当前内联样式（日志需精确到时分的筛选，与仪表盘按天不同） |

### 渠道管理页 `src/app/dashboard/channels/page.tsx`

| 改动 | 说明 |
|------|------|
| 删除渠道确认 | `confirm()` 替换为 ConfirmDialog（danger 风格） |
| 模型已存在提示 | `alert()` 替换为 ConfirmDialog（info 风格） |
| 启用/停用按钮 | 同步迁移到 Switch 组件（与密钥页面一致） |

## 非功能性要求

- 所有组件为客户端组件 (`'use client'`)
- 所有图标使用 Lucide Icons（本地 SVG 加载）
- 保持浅色主题、白底灰字、indigo-500 主色
- 圆角: lg/2xl，阴影: 轻微柔和
- 无新增依赖包

## 不在此次范围内

- 表格分页组件（已有内联实现，未重复出现）
- 导航/布局组件（已有 layout.tsx）
- 后端 API 逻辑改造（除密钥刷新外）
