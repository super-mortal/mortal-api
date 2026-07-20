# Mortal API 四项修复与优化 设计文档

> 日期：2026-07-20
> 状态：待用户审阅

## 背景

四个彼此独立的修复/优化项，互不影响，可分开实现与提交：

1. `/v1/models` 模型列表在多渠道同名模型下出现重复条目
2. 日志页全选批量删除速度慢（串行 HTTP 请求）
3. 渠道管理"测试模型"失败时不返回上游真实报错
4. Dashboard 各页面存在重复 UI 模式，需提取全局共享组件以减负

**Global Constraints**

- 所有图标使用 Lucide，本地 `public/icons/` 加载（`<InlineIcon>` / `<Icon>`），禁止 CDN
- 浅色主题，主色 indigo-500
- 遵循 `src/lib/` 现有模块划分与代码风格
- better-sqlite3 同步 API，批量写操作包在 `db.transaction()` 中
- 无测试框架，验证方式为手动验证 + `npm run build` 编译通过

---

## Task 1：`/v1/models` 模型列表按模型 ID 去重

**Files**
- Modify: `src/app/v1/models/route.ts`

**问题**

当前别名查询与直模型查询都返回 `owned_by = c.name`（渠道名）。同一 `model_id` 挂在 N 个渠道下时，`SELECT DISTINCT cm.model_id, c.name as owned_by` 会产生 N 行（每渠道一行），导致客户端看到重复模型。

**设计**

- 客户端不应感知渠道存在。模型列表按**模型 ID** 去重，`owned_by` 统一为 `'mortal'`。
- 别名部分：遍历 `aliases` 时，同一 `alias_name` 只加入一次（用 `seen` Set 跟踪）。
- 直模型部分：遍历 `channelModels` 时，已加入过的 `model_id` 跳过（复用 `seen` Set）。
- 直模型查询不再需要 `owned_by` 列（或忽略之），别名查询同理；`owned_by` 字段在响应中统一硬编码 `'mortal'`。
- **明确不改** `resolveModel` 的多渠道路由/健康度排序逻辑（保持现状，留待后续单独立项）。

**接口**

- Consumes: `channel_models`、`model_aliases`、`channels` 表（只读）
- Produces: `GET /v1/models` 响应 `data` 数组中每个 `id` 唯一

**数据流 / 错误处理**

- 现有 key 校验、渠道限制、模型限制（`allowed_channels` / `allowed_models`）逻辑全部保留，仅在最终拼装 `allModels` 时增加去重。
- 无新增错误路径。

---

## Task 2：日志批量删除提速（按 ID 列表批量删）

**Files**
- Modify: `src/lib/logs.ts`
- Modify: `src/app/admin/logs/route.ts`
- Modify: `src/app/dashboard/logs/page.tsx`

**问题**

前端 `handleConfirmDelete` 批量分支串行 `await` 循环，每条日志一次完整 HTTP 往返。删除 100 条约 10 秒。

**设计**

- 新增 `deleteCallLogsByIds(ids: string[]): number`（`logs.ts`）：
  - 用动态占位符构造 `DELETE FROM call_logs WHERE id IN (?, ?, ...)`，包在 `db.transaction()` 中执行，单次同步调用返回 `changes`。
  - 空数组直接返回 0。
- 后端 `DELETE /admin/logs` 支持按 ID 列表删除：
  - 因 ID 列表可能较长（100 × 16 字符 ≈ 1700），采用 **请求体**传参而非 query。Next.js `DELETE` handler 可通过 `await request.json()` 读取 body。
  - 优先级：body 含 `ids` 数组 → 按 ID 批量删；否则保留现有 `?start_date=`（日期范围）与 `?id=`（单条）逻辑不变。
- 前端 `handleConfirmDelete` 批量分支：
  - 改为一次 `apiFetch('/admin/logs', { method: 'DELETE', body: JSON.stringify({ ids: [...selected] }) })`。
  - 保留现有 ConfirmDialog、删除中 loading 态、结果消息提示（成功/失败文案按返回 `deleted` 数量）。

**接口**

- `deleteCallLogsByIds(ids: string[]): number` — 返回删除行数
- `DELETE /admin/logs`，body `{ ids: string[] }` → `{ success: true, deleted: number }`

**数据流 / 错误处理**

- 事务保证批量删要么全删要么全不删；异常时 better-sqlite3 自动回滚，路由 catch 返回 500。
- 前端网络错误捕获后提示失败，保留原有 `deleteMsg` 提示机制。

---

## Task 3：渠道测试模型透传上游真实报错

**Files**
- Modify: `src/app/admin/channels/route.ts`
- Modify: `src/app/dashboard/channels/page.tsx`

**问题**

`check-model`（`route.ts:105-127`）失败时只返回 `{ healthy, status, latency }`，从不读取上游响应 body；`catch` 分支只返回"超时"。管理员看不到上游真实错误（如 `model not found`、`invalid api key`、`insufficient balance`）。

**设计**

- 后端 `check-model`：
  - `res.ok` 为 false 时 `await res.text()` 读取 body，尝试 `JSON.parse` 并按 OpenAI 标准取 `error.message`（兼容 `error` 为字符串的情况）；解析失败则用原始文本（截断到合理长度，如 500 字符）。
  - 响应增加 `error?: string` 字段：`{ healthy, status, latency, error? }`。
  - `catch (e)` 分支返回具体 `e instanceof Error ? e.message : String(e)`（区分超时 / 连接拒绝 / DNS 等），而非笼统"超时"。
- 前端 `channels/page.tsx`：
  - 在现有 `checkDone === 'fail'` 的展示位置，把后端返回的 `error` 显示出来（只读展示，便于排查）。
  - 沿用现有 `checkLatency` / `checkDone` 状态，新增一个状态存放错误文本。

**接口**

- Consumes: 上游 `POST {base_url}/chat/completions` 的错误响应 body
- Produces: `PUT /admin/channels` (`_action: 'check-model'`) 响应新增 `error?: string`

**数据流 / 错误处理**

- 不改变健康状态更新逻辑（`res.ok` 时仍置 `healthy`）。
- 上游返回非 JSON body（如 HTML 错误页）时降级为原文展示。

---

## Task 4：提取 Dashboard 共享 UI 组件（聚焦去重）

**Files**
- Create: `src/lib/ui.tsx`（或按组件拆分多个文件，实现阶段定）
- Modify: `src/app/dashboard/page.tsx`、`keys/page.tsx`、`channels/page.tsx`、`logs/page.tsx`、`models/page.tsx`、`backup/page.tsx`、`layout.tsx`

**问题**

Dashboard 各页面存在大量复制粘贴的 UI 片段，维护时需多点同步修改。

**设计（聚焦去重，不拆大文件、不动逻辑）**

扫描后确认的重复模式（实现阶段逐一核对，只抽重复 ≥3 处且形态稳定的）：

1. **加载 Spinner** — `<InlineIcon name="loaderCircle" className="... animate-spin text-indigo-600" />` 出现 10+ 处，抽为 `<Spinner size />` 或带容器居中变体。
2. **空状态** — "暂无数据 / 暂无 Key / 暂无渠道 / 暂无调用记录" 等图标+文案组合，抽为 `<EmptyState icon text />`。
3. **状态徽章 pill** — 成功/失败、健康/异常等 `rounded-full text-[10px]` 徽章（logs、channels 页均有），抽为 `<StatusBadge variant />`。
4. **表格加载/空行** — `<tr><td colSpan={N}>` 包裹的加载态与空态（keys、logs 页），抽为 `<TableEmpty colSpan loading text />`。

**原则**

- 每个组件独立、单一职责、可独立理解；props 简单（icon 名、文案、variant）。
- 仅替换重复片段为组件引用，不改变任何页面的布局、样式值、交互逻辑。
- 不引入新依赖。

**接口**

- Consumes: 现有 `<InlineIcon>`、Tailwind 类
- Produces: `src/lib/` 下可被各 dashboard 页面 import 的共享组件

**数据流 / 错误处理**

- 纯展示组件，无数据流与错误路径。验证方式为 `npm run build` 通过 + 各页面视觉回归一致。

---

## 实施顺序与提交

四个 Task 独立，可任意顺序。建议顺序：Task 2（提速，收益最直接）→ Task 1（去重）→ Task 3（报错透传）→ Task 4（组件提取，纯前端）。每个 Task 独立提交。

完成后 `npm run build` 确认无编译错误。
