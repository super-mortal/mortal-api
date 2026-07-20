# Popover 裁剪修复 + 渠道健康状态模型与监控 设计

> 日期：2026-07-20
> 范围：四个议题 —— (1) Popover 下拉裁剪统一修复；(2) 渠道冷却/恢复规则优化（区分"额度上限"与"真故障"）；(3) 渠道状态徽标语义优化（合并为单一状态徽标）；(4) 渠道健康监控（定时探测 + 状态条可视化）。

## 背景与现状

### 议题 1：Popover 裁剪
- 密钥管理页列表"模型限制"列的"N 个模型"小浮层用的是 `src/lib/popover.tsx` 的 `Popover`，其浮层用 `absolute` 定位（`popover.tsx:43`），渲染在表格容器内。
- 表格容器有边界/滚动裁剪，点**最底部一行**时浮层向下弹出被切掉。
- `ComboBox`（弹窗内"允许的模型"）上一轮已用 `createPortal` + `position: fixed` 修好。`Popover` 是同一类问题，未修。
- 全站 `Popover` 仅 `keys/page.tsx:509` 一处调用；`ComboBox` 已修，无其它浮层组件。修复 `Popover` 一处即全覆盖。

### 议题 2：冷却规则
- 现状 `route.ts:336-347`：同一渠道重试 3 次都失败 → `updateChannelHealth(id, 'cooling_down')`；`route.ts:347` 又把 429 单独区分为 `cooling_down`、其余为 `unhealthy`。
- `cooling_down` 与 `unhealthy` 恢复逻辑都依赖 `last_health_check` + 固定 6 小时（`getModelsForAuto` 的 `channels.ts:178-181`），死板。
- **不一致 bug**：`auto` 路径走 `getModelsForAuto`（真正排除冷却/异常渠道）；但指定模型路径的 `resolveModel`（`channels.ts:131-153`）只是把 `cooling_down` 降权排序、**并不真正排除**。两条路径行为不一致。
- 用户核心诉求：渠道"不能用"通常是**到达用量上限（429）**，这类不该被当成"坏渠道"关 6 小时才恢复；真故障才需要退避。

### 议题 3：状态徽标语义
- 现状 `channels/page.tsx:283-284` 并排两个徽标：
  - 健康徽标（`health_status`）：`healthy→正常`、`unhealthy→异常`；`cooling_down`、`unknown` **无样式、显示空白**。
  - 活跃徽标（`is_active`）：`1→活跃`、`0→停用` —— 实为管理员手动 Switch，与健康无关。
- 混乱点：两个维度并排难分辨；`cooling_down`/`unknown` 无可见状态。

### 议题 4：健康监控
- 渠道卡片左右 `justify-between` 撑出大片空白。
- 用户想要 UptimeRobot / 服务器监控式面板：每小时探测一次，看健康度/可用率/延迟。

## 决策汇总（用户已确认）

| 议题 | 决策 |
|---|---|
| 1 Popover 修复 | **方案 A：createPortal + fixed**（与 ComboBox 同一套），自动上下翻转 |
| 2 429 识别 | **凡 429 一律判为"额度上限"**，不做关键词细分；非 429 全部为"真故障" |
| 2 429 恢复 | 冷却 **6 小时**自动恢复；期间可手动"连通检测"立即恢复 |
| 2 真故障恢复 | **指数退避** 1→5→15 分钟（封顶 30 分钟）+ 探针成功立即恢复 + 手动恢复 |
| 3 徽标 | **合并为单一状态徽标**；启用与否只看右侧 Switch |
| 4 探测方式 | **真实小请求**（max_tokens=5 的 chat；无模型则退化 /models 拉取） |
| 4 探测频率 | **每小时** |
| 4 触发方式 | **进程内定时器**（`globalThis` 单例防重复） |
| 4 展示 | **状态条 + 可用率% + 平均延迟** |

---

## 设计 · 第 1 节：Popover 裁剪修复

**改动文件**：`src/lib/popover.tsx`（仅组件本体，调用方不动）。

1. 引入 `createPortal`、`useLayoutEffect`。
2. 触发器（trigger）包一层带 `ref` 的元素用于测量。
3. 打开时用 `getBoundingClientRect()` 取触发器视口坐标，算 `top/left`；空间不足时自动翻到上方（`top = triggerTop - min(浮层高, triggerTop - gap) - gap`），防顶部溢出。
4. 浮层 `createPortal(..., document.body)`，`position: fixed`，`z-[9999]`，最大高度 + 内部纵向滚动。
5. 监听 `scroll`（捕获阶段，兼容内部滚动容器）与 `resize` 重新定位。
6. 外部点击关闭：点击目标既不在触发器内、也不在已 portal 的浮层内，才关闭。
7. 保留 `align: 'start' | 'center'` 对齐逻辑。

**验证**：`npm run build` 通过；密钥页最底部一行点"N 个模型"，浮层完整不被裁。

---

## 设计 · 第 2 节：渠道健康状态模型与冷却/恢复规则

### 健康状态取值（`channels.health_status`）
| 状态 | 含义 | 何时标记 | 恢复 |
|---|---|---|---|
| `healthy` | 最近成功 | 请求/探测/手动检测成功 | — |
| `cooling_down` | 额度上限（429） | 请求/探测返回 429 | 6 小时自动恢复，或手动检测立即恢复 |
| `unhealthy` | 真故障（超时/5xx/网络/401·403） | 非 429 失败 | 指数退避 1→5→15→30 分钟，探针成功立即恢复，或手动检测 |
| `unknown` | 未检测 | 渠道刚创建 | 首次探测后转其它状态 |

### 数据库变更（沿用 `_migrations` 幂等模式，新迁移名 `v4_channel_cooldown`）
- `channels` 加列 `cooldown_until TEXT`（冷却截止，北京时间字符串，NULL=不在冷却）。
- `channels` 加列 `fail_count INTEGER NOT NULL DEFAULT 0`（连续失败次数，用于退避档位）。
- 用 `PRAGMA table_info('channels')` 判列存在后 `ALTER TABLE`，并写 `_migrations`。

### proxy 错误分类
- `src/lib/proxy.ts`：`callUpstream` / `callUpstreamStreaming` 抛错处，除 `err.status` 外增加 `err.kind`：
  - `status === 429` → `kind = 'quota'`
  - 其余（含 401/403/5xx/网络异常无 status）→ `kind = 'failure'`
- `healthCheckChannel` 同样按返回 status 归类，供探测/手动检测使用。

### 健康记录函数（集中在 `channels.ts`）
新增：
- `recordChannelSuccess(channelId)`：`health_status='healthy'`、`fail_count=0`、`cooldown_until=NULL`、更新 `last_health_check`。
- `recordChannelFailure(channelId, kind)`：
  - `kind='quota'` → `health_status='cooling_down'`，`cooldown_until = now + 6h`，`fail_count` 不变（额度满不算"故障连败"）。
  - `kind='failure'` → `fail_count += 1`，`health_status='unhealthy'`，`cooldown_until = now + backoff(fail_count)`，`backoff = min(30min, 1min→5min→15min→30min…)` 递增档位。

### 可用性判断（两条路径统一）
抽一个 SQL 片段/常量 `AVAILABLE_CLAUSE`，语义：渠道可用 = `is_active=1` 且（`health_status='healthy'` 或 `health_status='unknown'` 或 `cooldown_until IS NULL` 或 `cooldown_until <= now`）。即"冷却/异常但已过了 `cooldown_until`"重新纳入。
- `getModelsForAuto` 改用该片段（替换现有 `health_status != 'unhealthy'` + 6 小时硬编码）。
- `resolveModel` 改用该片段做**真正排除**（修掉只降权排序的不一致）。

### route.ts 收敛
把 `route.ts` 中散落的 `updateChannelHealth(..., 'cooling_down'|'unhealthy'|'healthy')`（约 9 处）全部替换为 `recordChannelSuccess` / `recordChannelFailure(id, err.kind)`。逻辑集中到 `channels.ts`。

### 手动恢复
管理员"连通检测"成功 → `recordChannelSuccess`，立即回池；失败 → `recordChannelFailure(id, kind)`。

**测试**：
- `recordChannelFailure`：429→`cooling_down`+`cooldown_until≈now+6h`；非429→`unhealthy`+`fail_count` 递增+退避档位正确。
- `recordChannelSuccess`：状态/计数/冷却全复位。
- 可用性片段：冷却未过期排除、过期纳入。

---

## 设计 · 第 3 节：渠道健康监控（探测调度 + 历史）

### 新表 `channel_health_checks`（随 `v4_channel_cooldown` 或独立迁移 `v5_health_checks` 建表）
| 列 | 说明 |
|---|---|
| `id` | TEXT 主键（nanoid） |
| `channel_id` | TEXT，关联渠道 |
| `checked_at` | TEXT，北京时间 |
| `ok` | INTEGER，1 成功 0 失败 |
| `kind` | TEXT，失败分类 `quota`/`failure`，成功为 NULL |
| `latency_ms` | INTEGER，响应耗时 |
| `error` | TEXT，失败摘要（截断 ~300 字符） |

索引 `(channel_id, checked_at)`。保留策略：每渠道仅留最近 ~200 条（或定期删 30 天前），防表膨胀。

### 探测调度器 `src/lib/health-monitor.ts`
- `globalThis.__healthMonitor` 挂单例 `{ started: boolean, timer }`，防热重载/多实例重复启动。
- `startHealthMonitor()`：若已启动则直接返回；否则 `setInterval(1h)` + 启动时立即跑一轮。
- 一轮：取 `is_active=1` 渠道，逐个 `probeChannel(channel)`：
  - 有 active 模型 → 真实小请求（`max_tokens=5` chat，取该渠道第一个 active `channel_models.model_id`）。
  - 无模型 → 退化 `pullModelsFromEndpoint` 拉 /models。
  - 记录耗时与结果：写一条 `channel_health_checks`；并按结果调用 `recordChannelSuccess` / `recordChannelFailure(id, kind)`（探测参与冷却/恢复——探测成功即提前恢复）。
- 每轮串行 + 单渠道 `AbortSignal.timeout(10s)`，避免雪崩。

### 接入点
`instrumentation.ts`（Next 官方启动钩子）的 `register()` 中，仅 Node runtime 下 `await import('@/lib/health-monitor')` 并 `startHealthMonitor()`。兼容 `npm run dev` 与 `npm start`，无需改 `server.js`。

### 与手动检测的关系
`admin/channels` 的"连通检测"（PUT 健康检测入口）复用 `probeChannel`，结果同样写历史 + 更新主状态。

**测试**（注入假探测函数，不打真实上游）：
- 调度器对成功/429/故障三种结果分别写历史 + 调用对应 record 函数。
- 历史清理只删过期行。
- 单例：重复 `startHealthMonitor()` 不创建第二个 timer。

---

## 设计 · 第 4 节：渠道卡片 UI（单一状态徽标 + 监控状态条）

**改动文件**：`src/app/dashboard/channels/page.tsx`；新增 `src/lib/health-badge.tsx`（徽标 + 状态条组件）。

### A. 单一状态徽标（替换 `channels/page.tsx:283-284` 两个徽标）
| 综合状态 | 颜色 | 文案 | 判断优先级 |
|---|---|---|---|
| 已停用 | 灰 | 已停用 | `is_active=0` 最高 |
| 正常 | 绿 | 正常 | `healthy` |
| 额度冷却 | 黄 | 额度冷却 | `cooling_down`（tooltip 显示 `cooldown_until` 恢复倒计时） |
| 异常 | 红 | 异常 | `unhealthy` |
| 未检测 | 灰 | 未检测 | `unknown` |

- 启用与否只看右侧 Switch，不再单独徽标。
- 徽标 `title` tooltip 解释含义；冷却时显示"预计 X 后恢复"。

### B. 监控状态条（填右侧空白）
- 每格 = 最近一次 `channel_health_checks`（取最近 ~30 条，按时间正序）。
- 颜色：绿=成功、黄=quota、红=failure、浅灰=无数据。
- 悬停格 → tooltip：该次探测时间/结果/延迟/错误。
- 状态条下方一行小字：**可用率 %**（近 30 次成功占比）+ **平均延迟 ms**。

### C. 数据接口
- `GET /admin/channels` 返回每渠道附带：`recent_checks: [{ checked_at, ok, kind, latency_ms }]`、`uptime_pct`、`avg_latency_ms`。
- `channels.ts` 新增 `getChannelHealthSummary(channelIds)` 一次性查询（防 N+1），聚合 `recent_checks`/`uptime_pct`/`avg_latency_ms`。

### D. 布局
- 左：渠道信息（含单一状态徽标）。
- 中：状态条 + 可用率（`flex-1`，吃掉原空白）。
- 右：操作按钮组（编辑/检测/Switch/删除/展开）。
- 窄屏状态条 `hidden md:flex`（或换行），不挤爆移动端。

**测试**：
- 徽标组件对 5 种状态渲染正确文案/颜色。
- 状态条对空数据/混合数据渲染正确格数与颜色。
- `uptime_pct`、`avg_latency_ms` 计算正确。

---

## 影响面与兼容性

- **数据库**：新增 2 列（`cooldown_until`、`fail_count`）+ 1 表（`channel_health_checks`），均走幂等迁移，旧库自动升级；`backup/route.ts` 的渠道导入需兼容新列（缺省 NULL/0）。
- **行为变化**：`resolveModel` 现在会真正排除冷却/异常渠道（之前只降权）。这是**有意修复的不一致**，会使指定模型路径在渠道冷却时正确故障转移。
- **429 冷却 6h 与现状一致**，用户无感知退化；真故障恢复从"固定 6h"变"退避 + 探针"，恢复更快。
- **无 CDN / 图标规范**：状态条用纯 `div` 格子，不引入新图标；如需图标走本地 Lucide。

## 非目标（YAGNI）
- 不做按渠道自定义冷却时长。
- 不做 429 关键词细分（一律额度上限）。
- 不做独立监控页面 / 折线图（本期只做状态条）。
- 不做每模型粒度监控（本期每渠道一条状态条）。
