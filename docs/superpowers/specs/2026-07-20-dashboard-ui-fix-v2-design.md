# Dashboard UI Optimization V2 — Design

## 1. Dashboard — 移除重复 Token 构成图

### 问题

当前底部 Row 4 和 Row 5 各有一个完全相同的 "Token 构成" 堆叠柱状图，重复了。

### 方案

去掉 Row 5 的 Token 构成图，调整底部 4 个图表的分布：

| Row | 列数 | 左列 | 右列 |
|-----|------|------|------|
| Row 4 | `grid sm:grid-cols-2` | 模型调用分布（饼图） | Token 构成（堆叠柱状图） |
| Row 5 | `grid sm:grid-cols-2` | 成功率（环形图） | 按模型消费排行（水平柱状图） |

**文件：**
- 修改: `src/app/dashboard/page.tsx` — 删掉 Row 5 的 Token 构成图，保留一个

---

## 2. DatePicker 修复

### 核心 Bug

`src/lib/date-picker.tsx` 中的日历弹窗使用 `createPortal` 渲染到 `document.body`，但点击外部关闭的 mousedown 监听只挂载在按钮所在的 div 上。Portal 内容不属于该 div 的 DOM 子树，因此**点击日历上的任意按钮（包括月份切换箭头）都会触发 `setOpen(false)`**，导致月份切换箭头失效、一点就关闭。

### 修复内容

#### 2.1 去掉 createPortal，改用 position: absolute

将 DayPicker 从 portal 改为直接在当前 DOM 树中通过 `position: absolute` 定位在按钮下方：

```tsx
// 去掉 createPortal
// 改为：
{open && (
  <div className="absolute z-50 mt-1" style={{ left: 0 }}>
    <DayPicker ... />
  </div>
)}
```

这样点击日历内的元素不会被判定为 "点击外部"，click-outside 逻辑自然正确。

#### 2.2 Nav 组件：单箭头切换月份，双箭头切换年份

DayPicker v10 的 Nav 通过 `components` 属性自定义：

```tsx
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
// 或使用 InlineIcon

components={{
  Chevron: () => null, // 不渲染默认箭头
  // 或者自定义 Nav 组件
}}
```

DayPicker v10 实际上提供了 `onMonthChange` 和 `captionLayout` 等控制方式。最简单的方案是在自定义 Nav 组件中渲染：

| 按钮 | 行为 |
|------|------|
| `◀◀` (chevronsLeft) | 减一年 |
| `◀` (chevronLeft) | 减一月 |
| `▶` (chevronRight) | 加一月 |
| `▶▶` (chevronsRight) | 加一年 |

使用 `useDayPicker` hook 或 `props` 中的 `goToMonth` 等方法。

#### 2.3 隐藏星期几

DayPicker v10 中通过 `classNames` 给 `weekday` 行添加 `hidden`：

```tsx
weekday: 'hidden',  // 完全隐藏星期行列
day_button: 'w-9 h-9 text-sm rounded-lg hover:bg-indigo-50 ...',
```

用户的说法："只需要筛选几月几号就行，不用说星期几"。

#### 2.4 仪表盘"自定义"日期按钮：直接内联显示日历

当前仪表盘点击"自定义"的流程是：
1. 点击"自定义"按钮 → `showCustom = true`
2. 条件渲染 `<DateRangePicker>` 组件
3. `<DateRangePicker>` 渲染一个"自定义"按钮 → 点击后展开 Popover → Popover 内含两个 DatePicker

用户说"直接点自定义然后点了之后就直接展开日历的那个选择的组件就行了"——太繁琐了。

改为：点击"自定义"按钮后，直接内联显示**两个并排的 DatePicker**（不用 DateRangePicker 那层额外弹窗）。

```tsx
{activeDate === 'custom' && (
  <div className="flex flex-wrap items-center gap-2">
    <DatePicker value={startMonth} onChange={setStartMonth} />
    <span className="text-gray-400">→</span>
    <DatePicker value={endMonth} onChange={setEndMonth} />
    <button onClick={() => { setActiveDate('today'); fetchStats(); }}
      className="text-xs text-gray-400 hover:text-gray-600 underline">清除</button>
  </div>
)}
```

#### 2.5 日志页面同步修复

日志页面的 `DateTimePicker` 包裹了 `DatePicker`。上述修复（去掉 portal、箭头修复、隐藏星期几）会自动传递到 DateTimePicker。

**文件：**
- 修改: `src/lib/date-picker.tsx` — 修复核心组件
- 修改: `src/app/dashboard/page.tsx` — 自定义日期区改造

---

## 3. 渠道管理改造

### 目标

恢复 Modal 编辑能力，侧面板作为补充编辑入口，两者各自独立保存。

### 3.1 卡片按钮布局

| 按钮 | 图标 | 功能 | 保持 |
|------|------|------|------|
| 编辑 | `pencil` / `pencilLine` | 打开**编辑弹窗**（Modal） | 新增 |
| 连通检测 | `activity` | 打开健康检测 Modal | 不变 |
| 侧面板 | `chevronDown` / `chevronLeft` | 从右侧滑入**侧面板** | 改为常驻 |
| 开关 | Switch | 启用/禁用 | 不变 |
| 删除 | `trash2` | 删除确认 | 不变 |

布局顺序（从左到右）：`[✏️ 编辑] [连通检测] [▼ 侧面板] [Switch] [删除]`

### 3.2 新建渠道 → Modal

"新建渠道"按钮改为打开一个创建 Modal（不是侧面板）。

Modal 内容：名称、Base URL、API Key、优先级、备注 → 保存 → POST 创建。

### 3.3 编辑按钮 → 编辑弹窗

点击每个渠道卡片的 ✏️ 按钮，打开编辑弹窗。
弹窗内容同新建 Modal（预填现有数据），保存 → PATCH 更新。

### 3.4 右侧下拉按钮 → 侧面板

新增加一个常驻显示的 `chevronDown` 按钮，点击后从右侧滑入侧面板。

**侧面板特性：**
- 宽度: `w-1/2 min-w-[480px] max-w-[640px]`
- 从右侧滑入，半透明遮罩
- **顶部：基础信息编辑区**（同 Modal 的字段：名称、URL、API Key、优先级、备注）
- **中部：模型与别名管理**（当前侧面板中的完整模型卡片 + alias 编辑 + 价格编辑 + 添加上游模型）
- 底部：保存 / 取消

**侧面板与 Modal 的关系：**
- 两者是**独立**的编辑入口，`chForm` 状态各自独立
- 侧面板保存侧面板的数据，Modal 保存 Modal 的数据
- 侧面板侧载当前渠道的数据作为初始值，修改后保存
- Modal 编辑也是独立的，两者不会相互影响

### 3.5 状态管理

```
// Modal 状态
const [chModal, setChModal] = useState(false);      // 新建+编辑共用一个 Modal
const [modalForm, setModalForm] = useState({...});  // Modal 表单数据
const [modalEditId, setModalEditId] = useState<string | null>(null);

// Side panel 状态
const [sidePanelOpen, setSidePanelOpen] = useState(false);
const [panelForm, setPanelForm] = useState({...});  // 侧面板表单数据
const [panelEditId, setPanelEditId] = useState<string | null>(null);
```

### 3.6 Modal 复用

新建和编辑共用同一个 Modal 组件，通过 `modalEditId` 是否为 null 区分：

```tsx
<Modal open={chModal} onClose={() => setChModal(false)} title={modalEditId ? '编辑渠道' : '新建渠道'}>
  <div className="space-y-4">
    {/* 名称、Base URL、API Key、优先级、备注 */}
    {/* 保存按钮 */}
  </div>
</Modal>
```

**文件：**
- 修改: `src/app/dashboard/channels/page.tsx`

---

## 4. "Upstream error" 错误分析

### 问题

日志中部分失败记录显示 `error_message: "Upstream error"`。

### 根因

错误传递链如下：

1. `src/lib/proxy.ts` (`callUpstream` / `callUpstreamStreaming`):
   - 上游返回非 2xx: `err.body = 响应文本`, `err.status = 状态码` → 路由 catch 到具体错误
   - fetch 网络异常: 抛出 `TypeError: fetch failed` (有 `.message`) → 路由 catch 到具体错误
   
2. `src/app/v1/chat/completions/route.ts` catch 块:
   ```ts
   error_message: err.body || (err instanceof Error ? err.message : 'Upstream error'),
   ```
   
3. "Upstream error" 出现的条件：**`err` 既没有 `.body` 属性，也不是 `Error` 实例**。

实际场景排查：
- **最常见情况**：日志记录的所有错误中，绝大多数会显示上游的具体错误（如 `401 Unauthorized`、`429 Too Many Requests`、`{"error":{"message":"..."}}` 等），"Upstream error" 出现的频率应该很低
- 如果大量出现 "Upstream error"，说明上游链路超时/中断时抛出的异常对象结构不符合预期（例如某些环境下的 `AbortError` 或网络层抛出的裸字符串/对象）

### 改进建议（可选）

将 fallback 文案改为更具体的描述，帮助区分不同失败场景：

```ts
error_message: err.body || (err instanceof Error ? err.message : 
  typeof err === 'string' ? err : '上游连接异常')
```

