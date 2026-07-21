# 账单导出功能设计

## 概述

为 Mortal API 管理后台增加账单导出功能，支持按密钥筛选导出使用明细和汇总账单，输出 CSV / Excel / PDF 三种格式。

## 动机

管理员需要将特定密钥（或全部密钥）在指定时间段内的使用数据导出，用于对账、审计和成本核算。

## 筛选条件

- **密钥筛选**：复用 SelectFilter 组件，支持 "全部 Key" 或指定单个密钥（value 为 `relay_key_id`）
- **时间范围**：今日 / 7 天 / 30 天 / 自定义（DateTimePicker），沿用现有日志和仪表盘的模式
- **导出格式**：CSV / Excel / PDF，单选

不需要额外的模型筛选或状态筛选。导出始终包含失败调用的数据。

## 数据内容

每个导出包含三个视图：

### 1. 明细（Detail）

每条调用记录一行，按 `created_at` 升序排列。

| 字段 | 来源 | 说明 |
|------|------|------|
| 时间 | `created_at` | 北京时间 |
| 密钥名称 | `relay_key_name` | 调用时记录的名称 |
| 模型 | `model` | 请求时的模型名 |
| 渠道 | `channel_name` | 路由到的渠道 |
| 输入 Token | `prompt_tokens` | |
| 缓存输入 Token | `cached_input_tokens` | |
| 输出 Token | `completion_tokens` | |
| 总 Token | `total_tokens` | |
| 费用(元) | `cost` | |
| 状态 | `status` | success / fail |
| IP | `ip` | |
| 日志 ID | `id` | 唯一标识 |

### 2. 按天汇总（Daily Summary）

每天一行，聚合结果。

| 字段 | 计算方式 |
|------|---------|
| 日期 | `substr(created_at, 1, 10)` |
| 调用次数 | `COUNT(*)` |
| 成功 | `COUNT(CASE WHEN status='success' THEN 1 END)` |
| 失败 | `COUNT(CASE WHEN status='fail' THEN 1 END)` |
| 总 Token | `SUM(total_tokens)` |
| 总费用(元) | `SUM(cost)` |

### 3. 按模型汇总（Model Summary）

每个模型一行，聚合结果，并附单价信息。

| 字段 | 计算/来源 |
|------|----------|
| 模型 ID | `model`（原始 model_id） |
| 模型别名 | 从 `model_aliases` 表查询，如果有别名则展示别名 |
| 输入单价(元/1K) | `model_pricing.prompt_price` |
| 输出单价(元/1K) | `model_pricing.completion_price` |
| 缓存单价(元/1K) | `model_pricing.cached_prompt_price` |
| 调用次数 | `COUNT(*)` |
| 总 Token | `SUM(total_tokens)` |
| 总费用(元) | `SUM(cost)` |
| 费用占比 | `总费用 / 总合计` |

## 页面设计

### 新增页面：`/dashboard/billing`

左侧导航新增菜单项，图标使用 `receipt`，位置在"调用日志"下方。

页面布局：

```
┌─────────────────────────────────────────────────────┐
│  账单导出                                             │
│  按密钥和时间范围导出使用明细与汇总账单                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  [全部 Key ▼]     今日 / 7天 / 30天 / [自定义日期]     │
│                                                      │
│  导出格式:                                           │
│  ○ CSV  ○ Excel  ○ PDF                              │
│                                                      │
│  [📥 导出账单]                                       │
│                                                      │
│  ─── 最近导出记录 ───                                │
│  2026-07-21 15:30  密钥A  CSV  已下载                │
│  2026-07-20 10:15  全部   Excel  已下载              │
│  ...                                                │
└─────────────────────────────────────────────────────┘
```

### 交互细节

1. 选择筛选条件 → 点击"导出账单" → 后端生成文件 → 浏览器直接下载
2. 导出期间按钮显示加载状态（spinner + 禁用）
3. 使用 `localStorage` 保存最近 5 次导出记录（纯前端展示，含时间、密钥名、格式）

## API 设计

```
POST /admin/billing
Authorization: Bearer <admin_token>
Content-Type: application/json
```

### 请求体

```json
{
  "relay_key_id": "",
  "start_date": "2026-07-01 00:00:00",
  "end_date": "2026-07-21 23:59:59",
  "format": "csv"
}
```

- `relay_key_id`: 空字符串 = 全部密钥，非空 = 指定密钥
- `start_date` / `end_date`: "YYYY-MM-DD HH:mm:ss" 格式，北京时间
- `format`: `"csv"` | `"xlsx"` | `"pdf"`

### 响应

成功时直接返回文件下载：

- CSV: `Content-Type: application/zip`（三个 CSV 文件打包）
- Excel: `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- PDF: `Content-Type: application/pdf`

所有响应带 `Content-Disposition: attachment; filename="billing-xxx.<ext>"`。

### 错误响应

```json
{ "error": "日期范围不能超过 1 年" }
{ "error": "未找到数据" }
```

## 文件格式实现细节

### CSV

- 三个文件打包为 zip：`detail.csv` + `daily_summary.csv` + `model_summary.csv`
- UTF-8 BOM 前缀（兼容 Excel 中文乱码）
- 使用 `archiver` 打包，stream 直接输出 Response
- 零额外依赖（Node.js 原生拼 CSV）

### Excel（exceljs）

- 一个 `.xlsx` 文件，三个 Sheet：
  - Sheet 1「明细」— 全字段，自动列宽，表头加粗
  - Sheet 2「按天汇总」— 聚合数据，数字格式化
  - Sheet 3「按模型汇总」— 含单价，带百分比列
- 表头样式：`font: { bold: true }`，浅灰背景
- 数字格化约定：金额保留 6 位小数，百分比 2 位

### PDF（pdfkit）

- **不包含明细**（行数过多不适合 PDF）
- 包含内容：
  - 标题："账单导出报告"
  - 导出信息：密钥名称、时间范围、生成时间
  - 按天汇总表（表格）
  - 按模型汇总表（表格，含单价信息）
  - 页脚：页码 / 总页数
- 字体：pdfkit 内置字体（Helvetica）不支持中文，需要使用中文字体文件。推荐方案：
  - 使用 `public/fonts/NotoSansSC-Regular.ttf`（思源黑体，约 6MB），通过 `doc.registerFont()` 注册
  - 下载方式：在 `scripts/` 中添加下载脚本，或手动放置
  - 英文/数字仍用 Helvetica，中文部分用 Noto Sans SC

## 后端实现

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/app/admin/billing/route.ts` | 导出 API（POST 方法） |
| `src/lib/billing.ts` | 查询逻辑 + 三种格式生成 |
| `src/app/dashboard/billing/page.tsx` | 前端页面 |

### 查询逻辑

复用 `db.ts` 和 `logs.ts` 现有的查询模式，保证与日志列表和统计的数据一致性。

```sql
-- 明细
SELECT * FROM call_logs WHERE relay_key_id = ? AND created_at BETWEEN ? AND ? ORDER BY created_at;

-- 按天汇总
SELECT substr(created_at, 1, 10) as date,
       COUNT(*) as calls,
       SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as success,
       SUM(CASE WHEN status='fail' THEN 1 ELSE 0 END) as fail,
       SUM(total_tokens) as tokens,
       SUM(cost) as total_cost
FROM call_logs WHERE relay_key_id = ? AND created_at BETWEEN ? AND ?
GROUP BY substr(created_at, 1, 10) ORDER BY date;

-- 按模型汇总
SELECT model,
       COUNT(*) as calls,
       SUM(total_tokens) as tokens,
       SUM(cost) as total_cost
FROM call_logs WHERE relay_key_id = ? AND created_at BETWEEN ? AND ?
GROUP BY model ORDER BY total_cost DESC;
```

单价信息和别名在生成汇总时查询 `model_pricing` 和 `model_aliases` 表补充。

### 日期范围限制

为避免一次性导出数据量过大，限制最长时间范围为 **1 年**。

## 安全

- 全程复用现有的 admin token 认证机制
- 不做额外的访问控制——与现有的后台权限一致

## 技术选型

| 类型 | 选型 | 理由 |
|------|------|------|
| CSV | 原生拼接 + archiver 打包 | 零额外依赖 |
| Excel | exceljs | 轻量、API 清晰、多 Sheet 原生支持 |
| PDF | pdfkit | 纯 Node.js 零系统依赖，成熟的 PDF 库 |
| 部署 | 同步直出 stream | 当前数据量级无需异步 |

## 未来扩展

- 计划任务（定时自动导出账单并发送到邮箱）

---

*设计版本: v1*
*日期: 2026-07-21*
