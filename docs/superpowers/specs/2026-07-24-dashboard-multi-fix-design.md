# Dashboard 多处修复 — 设计文档

**日期**：2026-07-24
**范围**：仪表盘、密钥管理、渠道管理、调用日志、账单导出
**目标**：修复 8 个独立但相关的体验/正确性问题，统一状态命名

---

## 改动汇总

| # | 范围 | 问题 | 类型 |
|---|---|---|---|
| ① | 仪表盘底部 | "按模型消费排行"条形图全空（后端没返回 total_cost） | bug |
| ② | 仪表盘"今日消费"卡 | 筛选密钥后今日/7天数字一致（卡片只有一个概念） | bug + UX |
| ③ | 密钥金额上限 | 创建/编辑时 `0` 无法直接删 | UX |
| ④ | 渠道卡片 + dashboard/models | HealthBar 位置不直观；`/models` 页"正常/异常"命名不一致 | 布局 + 命名 |
| ⑤ | 渠道编辑 API key | 眼睛 toggle 后仍看不到明文（占位符"•••"） | bug + 后端 |
| ⑥ | 模型与别名行 | 展开箭头图标改成删除图标，点击即删 | UI |
| ⑦ | 渠道优先级 | 默认值行为 + 文档化"列表排序 ≠ 路由排序" | 文档 |
| ⑧ | 调用日志 + 账单导出 | 没有延迟字段 | 新功能 |

---

## ① 仪表盘"模型平均成本排行"（替代"消费排行"）

### 问题
`/admin/stats` 的 `modelStats` SQL (`src/app/admin/stats/route.ts:77-88`) 没 SELECT `total_cost`。前端 `dashboard/page.tsx:360` 用 `dataKey="total_cost"`，运行时拿到 `undefined` → 条形图无数据。

### 改法
- 后端 `modelStats` SQL 增加 `COALESCE(SUM(cost), 0) AS total_cost` 和 `COALESCE(SUM(cost) * 1.0 / NULLIF(COUNT(*), 0), 0) AS avg_cost`
- 前端 chart `dataKey` 改为 `avg_cost`，标题"模型平均调用成本排行（元/次）"
- Y 轴 = 模型名，X 轴 = 元/次
- 保留 `ORDER BY calls DESC` 不变（图表显示仍按调用次数筛 top 10，X 轴才是新指标）

### 验证
- 调用 `/admin/stats` 返回的 `modelStats[0].avg_cost` 是有效数字
- 条形图 X 轴标签格式化为 `¥0.0023/次`

---

## ② 仪表盘"今日 vs 区间"双卡片

### 问题
当前 `dashboard/page.tsx:99-101` "今日消费"卡片永远取 `dailyStats[last].cost`：
- `activeDate='today'` 时 last 是今天 → 正确
- `activeDate='7d'` 时 last 是 7 天前最后一天 = 仍可能是今天（如果数据库有今天数据）→ 看起来"一样"
- 用户感知"今日和 7 天永远一模一样"是因为**界面上只有一个消费卡片，没有"区间总消费"做对比**

### 改法
- 后端 `stats` 返回字段不变（已是 `total_cost` = 当前筛选区间总和）
- 前端 statCards 数组改为动态：
  - `activeDate === 'today'` → 卡片 label "今日消费"，value = `dailyStats[last]?.cost || 0`，sub "今日"
  - 其他情况 → 卡片 label "区间消费"，value = `data.stats.total_cost`，sub 显示"今日 + 7 天"等（动态：今日/7 天/30 天/全部）
- 在 statCards 网格（line 159-169）**保留 8 张卡** 不变；只是"今日消费"卡片变为根据 activeDate 切标签/值的智能卡

### 验证
- 切"今日"看到 ¥X.XXXX，"7 天"看到不同值（如果 7 天内其他天有消费）
- 筛选某 Key 后两个数字都收窄

---

## ③ 密钥金额上限输入框

### 问题
- `type="number"` + 默认值 0
- 无 `onFocus select()` —— 0 时无法直接删
- 无 `min` —— 可能输负数

### 改法
- line 275（创建）和 line 372（编辑）输入框各加：
  ```tsx
  onFocus={(e) => e.target.select()}
  onWheel={(e) => e.currentTarget.blur()}
  min={0}
  ```
- 保留 `type="number"`
- 保留 `Number(e.target.value)` —— `Number('')` 是 0，符合 "0 = 无限制"

### 验证
- 编辑现有密钥，点中金额上限 → 整段 0 被选中 → 输入"100" 直接覆盖为 100
- 滚轮不再触发数值变化
- 负数被浏览器拒绝

---

## ④ 渠道卡片布局 + 跨页命名统一

### 问题
- `HealthBar` 点图在卡片中央（line 474-476）
- 用户要求状态徽章移到 HealthBar **左边**
- `dashboard/models/page.tsx:165` 独立一套 "正常/异常" 字符串，命名跟渠道页 `health_status`（healthy/unhealthy）不一致

### 改法

#### 4.1 渠道卡片布局调整
`channels/page.tsx:462-489` 改为：

```
┌─────────────────────────────────────────────────────┐
│ 渠道名  [徽章]                                      │
│ base_url · 优先 N · 模型 M 个    [HealthBar点图]   │
│                                  [编辑][检测][删除] │
└─────────────────────────────────────────────────────┘
```

具体：
- 第一行：`name` + `HealthBadge`（保持现状，line 463-466）
- 第二行：base_url/优先/模型数（保持现状）
- 第三行：`HealthBar` 占据卡片右侧（与第三行同行的最右），编辑按钮组在最右
- 用 `flex justify-between items-end` 实现

把 line 474-476 的 `<div className="mt-2 md:mt-0 md:mx-3 md:flex-1 hidden md:block">` 删除，把 `<HealthBar>` 移到 line 477 那个 `<div className="flex items-center gap-0.5 shrink-0">` 左边。

#### 4.2 dashboard/models 状态筛选统一
- 改 `dashboard/models/page.tsx:123-126` 的 `filterStatus === '正常'/'异常'` 为 `filterStatus === 'healthy'/'unhealthy'`
- 把筛选选项（line 165-166）改为 `healthy / unhealthy / unknown / cooling_down` 四个
- 标签中文："正常 / 异常 / 未检测 / 额度冷却"
- 配套用 `HealthBadge` 组件渲染 model 行（如果该 model 有 channel_health_checks 数据）

### 验证
- 渠道卡片桌面端：状态徽章 + HealthBar 点图都在右半边，操作按钮在最右
- `/dashboard/models` 状态筛选选项文案跟渠道页一致

---

## ⑤ 渠道编辑 API key 明文查看

### 问题
- `panelForm.api_key` 在编辑时被设为占位符 `'••••••••••••••••••'`（line 490）
- 眼睛按钮只切 `type=password ↔ text`，value 不变
- `chModal`（小模态 line 807-841）根本没有眼睛按钮

### 改法

#### 5.1 后端新增临时解密接口
`src/app/admin/channels/route.ts`：

```ts
// GET /admin/channels?scope=api-key&id=xxx → 返回该渠道的真实 api_key（明文一次）
```

只接受 `admin_token` Bearer 鉴权（已实现 `requireAdmin`），返回：
```json
{ "api_key": "sk-real-..." }
```

不在 session/cookie 持久化；前端每次点眼睛都重新 fetch 一次。

#### 5.2 前端 `sidePanel` 眼睛
- 替换 line 562-567 眼睛按钮的 `onClick`：
  ```tsx
  onClick={async () => {
    if (showApiKey) {
      setShowApiKey(false);
      setPanelForm(f => ({ ...f, api_key: '••••••••••••••••••' }));
      return;
    }
    const res = await apiFetch(`/admin/channels?scope=api-key&id=${panelEditId}`);
    if (res.ok) {
      const d = await res.json();
      setPanelForm(f => ({ ...f, api_key: d.api_key }));
      setShowApiKey(true);
    }
  }}
  ```

#### 5.3 前端 `chModal`（小模态）补眼睛
- 在 line 107 加 `const [modalShowApiKey, setModalShowApiKey] = useState(false);`
- 在 line 828 的 `<input>` 后加眼睛按钮（同 sidePanel 的样式），按 modalEditId 是否存在判断显示

### 验证
- 编辑现有渠道 → 眼睛 → 拉取到真实明文 → input 切 text → 看到 `sk-...`
- 关闭弹窗后再次打开 → 显示"•••"占位符（前端清空）
- 切回 password 后 input value 还原为占位符
- 在 `chModal`（小模态）也能看到眼睛

---

## ⑥ 模型与别名行 — 右侧图标改删除按钮

### 问题
line 642 `<InlineIcon name={isExpanded ? 'chevronUp' : 'chevronDown'}>`，点击整行展开/收起

### 改法
- line 642 改为 `<InlineIcon name="trash2" className="w-3.5 h-3.5 text-red-400 hover:text-red-600 cursor-pointer" />`
- 整个 header 的 `onClick` (line 624-627) 拆开：
  - 删除图标 `onClick={(e) => { e.stopPropagation(); handleModelDelete(m.model_id); }}` —— 不展开，直接调删除
  - header 其他区域 `onClick={() => setExpandedModelId(isExpanded ? null : m.id)}` —— 切换展开/收起
- `handleModelDelete` 已经在 line 727 实现（line 727-729 是按钮位置），直接复用即可；不弹 ConfirmDialog

### 验证
- model 行默认收起
- 点空白区域（除删除图标）→ 展开/收起
- 点删除图标 → 该 model 立刻从 list 中消失（不弹确认）
- 删除图标的 hover 颜色变成红色

---

## ⑦ 渠道优先级文档化

### 真相
- DB schema `priority INTEGER NOT NULL DEFAULT 0`
- 创建时 `data.priority || 0` —— 多个未设置渠道同 0，按 created_at ASC 排队
- 列表 `listChannels()` 排序：`ORDER BY priority ASC, created_at ASC`
- **运行时请求路由 `resolveRoute` 不读 priority**，只看 `health_status`
- 拖拽后 `handleDragEnd` 重写为新索引 0-based

### 改法
- 在 `dashboard/channels/page.tsx` 顶部标题（line 411-413 附近）加一个 `?` 帮助图标，hover 显示 tooltip：
  > **优先级说明**：渠道卡片的显示顺序由优先级数字决定（数字小=靠前；同优先级按创建时间）。`0` 表示未设置（自动）。拖拽会重写优先级。
  > 注意：实际请求路由只看渠道健康度，不看优先级数字。
- 在每个 channel 卡片上，如果 `ch.priority === 0` 且该 channel 没有被手动改过（在拖拽事件之外），显示灰色小字 "自动" 而不是 "优先 0"

### 不改的
- 不改 SQL
- 不改 `data.priority || 0`
- 不改拖拽逻辑

### 验证
- 渠道卡片帮助图标 hover 弹出 tooltip
- 未手动设置 priority 的卡片显示 "自动"

---

## ⑧ 调用日志延迟字段 + 账单导出

### 问题
- `call_logs` 表没有 `latency_ms` 列
- `createCallLog` 没接 latency 参数
- `v1/chat/completions/route.ts` 4 个调用点都没算耗时
- 详情页和账单导出没显示

### 改法

#### 8.1 DB migration v8
`src/lib/db.ts` 加 v8 migration：
```sql
ALTER TABLE call_logs ADD COLUMN latency_ms INTEGER NOT NULL DEFAULT 0;
```
记录 `_migrations` 表 `(v8_latency_ms)`。

#### 8.2 写入延迟
- `src/lib/logs.ts` `createCallLog` 函数签名加 `latency_ms?: number`，INSERT SQL 加列
- `src/app/v1/chat/completions/route.ts`：
  - 在主 handler 函数顶部 `const t0 = Date.now();`
  - 所有 `createCallLog({...})` 调用点（4 处：非流式成功、流式成功、流式失败、非流式失败）传 `latency_ms: Date.now() - t0`
  - 用 try/finally 确保失败路径也写入 latency

#### 8.3 详情页展示
`src/app/dashboard/logs/page.tsx` line 446-453（6 个 TokenBadge）后加第 7 个：
```tsx
<TokenBadge label="延迟" value={`${log.latency_ms} ms`} color="bg-cyan-50 text-cyan-700 border-cyan-200" />
```
`TokenBadge` 组件接受 `color` props（如果当前是硬编码，去掉硬编码并加 props）。

#### 8.4 列表表格加列
line 460-470 表格新增 `<th>` "延迟 (ms)" 列，渲染 `{log.latency_ms}`。

#### 8.5 账单导出
找到导出按钮（CSV/XLSX）的实现位置（应该在 `logs/page.tsx` 内某处），加 `latency_ms` 列：
- CSV 列名 "延迟 (ms)"
- XLSX 列名 "延迟 (ms)"
- 数据 `{log.latency_ms}`

### 验证
- 发起一次 chat completion → 日志行 `latency_ms > 0`
- 详情面板：6 个 TokenBadge 后多一个青色"延迟"框
- 列表表格多一列
- 导出账单：表格包含延迟列

---

## 文件清单

### 修改
- `src/app/admin/stats/route.ts` —— ① modelStats 加 total_cost + avg_cost
- `src/app/dashboard/page.tsx` —— ① chart dataKey 改 avg_cost + 标题；② statCards 智能切换
- `src/app/dashboard/keys/page.tsx` —— ③ input 加 onFocus/onWheel/min
- `src/app/dashboard/channels/page.tsx` —— ④ 卡片布局；⑤ sidePanel 眼睛 + chModal 眼睛；⑥ 删除图标；⑦ 帮助图标
- `src/app/dashboard/models/page.tsx` —— ④ 状态筛选统一
- `src/app/dashboard/logs/page.tsx` —— ⑧ 详情 TokenBadge + 列表列 + 导出列
- `src/app/admin/channels/route.ts` —— ⑤ 新增 scope=api-key GET 接口
- `src/app/v1/chat/completions/route.ts` —— ⑧ 4 处 createCallLog 加 latency_ms
- `src/lib/logs.ts` —— ⑧ createCallLog 加 latency_ms 入参
- `src/lib/db.ts` —— ⑧ v8 migration

### 新增
- 无（所有改动都在现有文件）

---

## 测试策略

### 后端
- `npx tsc --noEmit` —— 必须干净
- `npm run build` —— 必须成功

### 数据库
- 清空 db（`rm data/relay.db*`）→ 启动 → 验证 v8 migration 写入 `_migrations`
- 检查 `call_logs.latency_ms` 列存在

### 浏览器手动验证清单
1. 仪表盘：① 图表显示平均成本 ② 切今日/7天数字不同
2. 密钥：③ 编辑金额上限，点中自动选中 0
3. 渠道：④ 卡片布局新位置 ⑤ 眼睛 toggle 显示真实 key
4. 渠道：⑥ 点删除图标立即删除
5. 渠道：⑦ 帮助图标 tooltip 显示说明
6. dashboard/models：④ 状态筛选命名一致
7. 调用日志：⑧ 详情有延迟、列表有列、导出有列

### 兼容性
- 现有用户 `call_logs.latency_ms` 默认 0（migration v8 设了 default），无需数据回填
- `panelForm.api_key` 占位符逻辑保留，眼睛 toggle 后才临时拉真实 key

---

## 不做的事（YAGNI）

- 不重构 `health-badge.tsx`
- 不动 `resolveRoute` 的 SQL（运行时路由只看 health_status 是合理设计）
- 不动 `data.priority || 0` 逻辑
- 不加 latency 排序（按 ID/时间即可）
- 不加"区间消费"卡片（② 是把现有"今日消费"卡变智能卡，不增卡）
- 不动 channels.ts 路由逻辑
- 不动 `chModal` 的其他字段
- 不动导出账单的其他列