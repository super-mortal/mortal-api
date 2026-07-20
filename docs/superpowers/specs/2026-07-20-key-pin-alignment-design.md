# 密钥管理优化：刷新按钮、仪表盘对齐、置顶功能

**日期**: 2026-07-20  
**状态**: 设计已确认  
**涉及文件**: 见各节

---

## 1. 修复刷新按钮不可见

### 问题
Key 管理列表的操作列中，复制按钮和编辑按钮之间的「刷新 Key」按钮使用了 `refreshCw` 图标，但该图标未在 `scripts/download-lucide-icons.js` 的 `neededIcons` 列表中注册，导致 SVG 文件未下载到本地 `public/icons/`，按钮渲染为空白。

### 改动

| 文件 | 改动 |
|------|------|
| `scripts/download-lucide-icons.js` | 在 `neededIcons` 数组中添加 `'refresh-cw'` |
| `public/icons/refresh-cw.svg` | 运行脚本后自动生成 |

### 测试验证
- 打开 Key 管理页面，操作列中复制和编辑按钮之间的刷新按钮显示正常
- 点击刷新按钮，ConfirmDialog 弹出，确认后刷新成功并展示新 Key

---

## 2. 仪表盘密钥筛选对齐

### 问题
仪表盘右上角工具栏的密钥筛选 `SelectFilter` 右侧间距不足，紧贴窗口边缘；且筛选框与左侧日期按钮组（今日/7天/30天/全部/自定义）的宽高不一致。

### 当前布局
```tsx
<div className="flex flex-wrap items-center gap-2">
  {/* 日期按钮组 - 有 p-1 外框 */}
  <div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1">
    <button ...>今日</button>
    ...
  </div>
  {/* 密钥筛选 - 无外框 padding */}
  <SelectFilter ... className="max-w-[160px]" />
</div>
```

### 改动

| 文件 | 改动 |
|------|------|
| `src/app/dashboard/page.tsx` | ① 将 `<SelectFilter>` 用与日期组相同的容器包裹：`<div className="flex items-center gap-1 bg-white rounded-lg border border-gray-200 p-1"><SelectFilter ... /></div>`，使二者视觉完全一致；② 移除 `max-w-[160px]` 限制，让筛选框自然宽度；③ 在 toolbar flex 容器上添加 `pr-1` 增加右侧间距 |

### 测试验证
- 仪表盘页面在 1280px+ 宽度下，筛选下拉框不紧贴右侧窗口边缘
- 筛选框与日期按钮组在视觉上等高、同风格（相同 border/rounded/padding）
- 移动端响应式布局不受影响（flex wrap 正常）

---

## 3. 置顶功能

### 概述
在 Key 的编辑和创建弹窗中，名称输入框右侧添加「置顶」开关。置顶的 Key 在列表中优先展示。

### 数据库迁移

**文件**: `src/lib/db.ts`

在 `initSchema` 函数的迁移段（现有迁移之后）新增：

```sql
ALTER TABLE relay_keys ADD COLUMN is_pinned INTEGER NOT NULL DEFAULT 0;
```

并跟踪迁移名称 `'v3_add_is_pinned'` 到 `_migrations` 表。

### 后端改动

**文件**: `src/lib/keys.ts`

| 函数 | 改动 |
|------|------|
| `createRelayKey(name, balance, expiresAt, allowedModels, allowedChannels, isPinned?)` | 新增 `isPinned` 参数，写入 `is_pinned` 字段 |
| `updateRelayKey(id, data)` | `data` 类型增加 `is_pinned?: number`，更新逻辑加入该字段 |
| `listRelayKeys()` | 排序改为 `ORDER BY is_pinned DESC, created_at DESC` |

**文件**: `src/app/admin/keys/route.ts`

| 端点 | 改动 |
|------|------|
| `POST /admin/keys` | 读取 `body.is_pinned` 传入 `createRelayKey` |
| `PATCH /admin/keys` | 读取 `body.is_pinned` 传入 `updateRelayKey` |

### 前端改动

**文件**: `src/app/dashboard/keys/page.tsx`

1. **编辑弹窗**（`showEdit`）：将名称输入行改为 flex 布局
   ```
   ┌──────────────────────────────────────────────┐
   │  名称                                        │
   │  ┌──────────────────────┐  ┌──────────────┐  │
   │  │  输入框 (flex-1)      │  │  置顶  [开关] │  │
   │  └──────────────────────┘  └──────────────┘  │
   └──────────────────────────────────────────────┘
   ```

2. **创建弹窗**（`showCreate`）：同理，名称行右侧放置顶开关

3. 开关使用已有的 `<Switch>` 组件（当前用于启用/禁用切换），`checked` 绑定 `isPinned` 状态

### 状态管理

- 创建弹窗新增 `newIsPinned` 状态（`boolean`，默认 `false`）
- 编辑弹窗在 `setShowEdit` 时读取 `showEdit.is_pinned` 初始化
- 提交时通过 API 的 `body.is_pinned` 传递

### 测试验证
- 创建 Key 时勾选置顶 → 列表中该 Key 排在最前面
- 编辑已有 Key，开启置顶 → 该 Key 立即移到列表顶部
- 关闭置顶 → 回到按创建时间排序的位置
- 不勾选置顶 → 行为与之前完全一致

---

## 文件变更汇总

| 文件 | 变更类型 | 说明 |
|------|----------|------|
| `scripts/download-lucide-icons.js` | 修改 | 添加 `'refresh-cw'` |
| `public/icons/refresh-cw.svg` | 新增 | 下载后自动生成 |
| `src/lib/db.ts` | 修改 | 添加 `v3_add_is_pinned` 迁移 |
| `src/lib/keys.ts` | 修改 | `createRelayKey` / `updateRelayKey` / `listRelayKeys` |
| `src/app/admin/keys/route.ts` | 修改 | POST/PATCH 传递 `is_pinned` |
| `src/app/dashboard/keys/page.tsx` | 修改 | 编辑/创建弹窗增加置顶开关 |
| `src/app/dashboard/page.tsx` | 修改 | 工具栏右侧间距 + SelectFilter 宽度 |
