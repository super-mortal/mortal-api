# 渠道管理 & Key 管理 UI 优化设计

**日期**: 2026-07-22
**项目**: Mortal API

## 概述

本文档涵盖渠道管理和 Key 管理页面的四项 UI 优化，均为现有功能的前端改进，不涉及后端架构变更。

---

## 1. 拉取模型错误弹窗优化

### 问题

渠道编辑侧栏 → 「拉取」按钮，`doPullModels()` 中使用浏览器原生 `alert()` 显示错误信息，与项目全局 Modal 风格不一致。

### 方案

替换为 `ConfirmDialog` 组件（`@/lib/confirm-dialog`），根据错误类型使用不同风格：

| 场景 | 标题 | 消息 | 风格 |
|------|------|------|------|
| 上游返回空模型列表 | 提示 | 上游返回了空模型列表，请检查 API Key 和 URL | `info` |
| HTTP 请求失败 | 拉取失败 | (HTTP 状态码 + 响应内容前 300 字符) | `danger` |
| JS 异常 | 请求异常 | (错误信息截取) | `danger` |

### 状态变量

新增三个独立状态变量控制各自弹窗开关，而非用一个变量复用——避免连续触发时弹窗相互覆盖。

### 改动文件

- `src/app/dashboard/channels/page.tsx`

---

## 2. 渠道监测格子（HealthBar）空状态优化

### 问题

新添加的渠道尚无健康检查记录时，`HealthBar` 组件渲染 10 个灰色空格子 + 文字 "暂无数据"，视觉效果单薄且未对齐数据格式。

### 方案

- **空格子**: 10 → **20** 个灰色空格子（与有数据时的最大展示数 24 接近）
- **右侧信息**: 从单行 "暂无数据" 改为双行布局，对齐有数据时的格式：
  - 第一行右侧: **`0%`**（成功率）
  - 第二行右侧: **`—`**（延迟，表示暂无数据）

### 改动文件

- `src/lib/health-badge.tsx`（`HealthBar` 组件的空状态分支）

---

## 3. 渠道卡片拖拽排序

### 问题

渠道卡片目前按 `priority` 字段排序，但缺少可视化排序操作；需前往侧栏编辑优先级数字，体验差。

### 方案

- **库**: 安装 `@dnd-kit/core` + `@dnd-kit/sortable` + `@dnd-kit/utilities`
- **拖拽手柄**: 使用 Lucide 图标 `grip-vertical`（需添加到 `neededIcons` 并下载）
- **交互**:
  1. 每个渠道卡片左侧显示 ≡ 手柄图标（网格六点样式）
  2. 仅手柄区域可触发拖拽，卡片内容区域不触发
  3. 拖拽中显示半透明幽灵 + 占位空白
  4. 松手后自动重排本地 `channels` 数组
  5. 调用 API 持久化新顺序

### 持久化策略

- 拖拽结束后计算每个渠道新的 `priority` 值（从 0 递增）
- 调用 `PATCH /admin/channels` 逐个或批量更新
- 如 `PATCH` 支持批量则一次性提交，否则逐个提交

### 改动文件

- `package.json`（新增依赖）
- `src/app/dashboard/channels/page.tsx`（拖拽上下文、卡片改造）
- `public/icons/grip-vertical.svg`（新增图标）

---

## 4. Key 编辑渠道选择器宽度

### 问题

编辑 Key 弹窗中的渠道选择器（Channel Picker Modal）使用默认弹窗宽度 `max-w-lg`(512px) + `grid-cols-3`，每个格子太窄，渠道名称显示不完整。

### 方案

- 给 `Modal` 组件新增 `size` prop：`size="md"` | `size="lg"`
- `size="lg"` 时弹窗宽度使用 `max-w-2xl`(672px)
- Channel Picker 使用 `size="lg"`
- 保持 `grid-cols-3` 布局

### 改动文件

- `src/lib/modal.tsx`（新增 `size` prop）
- `src/app/dashboard/keys/page.tsx`（Channel Picker 传 `size="lg"`）

---

## 改动清单汇总

| # | 描述 | 主要文件 |
|---|------|---------|
| 1 | alert → ConfirmDialog | `channels/page.tsx` |
| 2 | HealthBar 空状态 10→20 格 | `health-badge.tsx` |
| 3 | @dnd-kit 拖拽排序 | `channels/page.tsx`, `package.json`, 图标文件 |
| 4 | Modal size prop + 加宽 | `modal.tsx`, `keys/page.tsx` |
| — | 新增图标下载 | `scripts/download-lucide-icons.js`（加 `grip-vertical`） |
