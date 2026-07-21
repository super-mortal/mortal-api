# Model Pricing 别名智能同步方案

> **设计摘要：** 解决模型价格在多渠道中重复配置的问题，同时修复别名模型计费查不到价格（返回 ¥0）的根本原因——保存价格时使用了底层 model_id 而非别名名称，导致按别名查询计费时找不到价格。

**Keywords:** 模型定价、别名、智能同步、全局写入、渠道管理

---

## 问题分析

### 当前行为

```
用户保存价格时
  └─ channel_models.model_id = "deepseek-chat"
     └─ 写入 model_pricing.model_id = "deepseek-chat"

用户请求模型 "deepseek-v4-pro"（别名）
  └─ calculateCost("deepseek-v4-pro", ...)
     └─ model_pricing 中查找 model_id = "deepseek-v4-pro" → ❌ 找不到
     └─ 返回 ¥0（计费失效、配额检查失效）
```

- 底层 `model_pricing` 表以 `model_id` 为 PK，价格存储时用的渠道模型的底层 ID
- 代理路由计费用的是用户请求的模型名（别名）
- 两者不一致导致别名模型计费返回 ¥0

### 用户的痛点

1. 同一个模型出现多个渠道中，价格要重复设置
2. 别名不同的模型想要走独立定价
3. 当前 UI 在渠道侧面板中设置价格，但不知道这是全局还是渠道级别的

---

## 方案设计

### 核心原则

- **有别名 → 按别名名称作为 pricing key**（用户用别名请求，计费按别名查）
- **无别名 → 按 model_id 作为 pricing key**（保持现有行为）
- **相同 (model_id + 别名) 组合 → 自动同步写入全局**
- **相同 model_id 但别名不同 → 不写入，走独立定价**

### 数据流

```
保存价格 "deepseek-v4-pro"（别名）→ 存到 model_pricing.model_id = "deepseek-v4-pro"
  │
  ├─ 渠道 A: 底层模型 deepseek-chat, 别名 deepseek-v4-pro → ✓ 同步
  ├─ 渠道 B: 底层模型 deepseek-chat, 别名 deepseek-v4-pro → ✓ 同步
  ├─ 渠道 C: 底层模型 deepseek-chat, 别名 deepseek-v5     → ✗ 跳过
  └─ 渠道 D: 底层模型 deepseek-chat, 无别名              → ✗ 跳过

计费时：用户请求 model="deepseek-v4-pro"
       → calculateCost("deepseek-v4-pro", ...)
       → 找到 model_pricing.model_id = "deepseek-v4-pro" → ✅
```

### 无别名场景（保持不变）

```
保存价格 "deepseek-chat"（无别名）→ 存到 model_pricing.model_id = "deepseek-chat"
  │
  ├─ 渠道 A: 底层模型 deepseek-chat, 无别名 → ✓ 同步
  ├─ 渠道 B: 底层模型 deepseek-chat, 无别名 → ✓ 同步
  └─ 渠道 C: 底层模型 deepseek-chat, 别名 deepseek-v4-pro → ✗ 跳过

计费时：用户请求 model="deepseek-chat"
       → calculateCost("deepseek-chat", ...)
       → 找到 model_pricing.model_id = "deepseek-chat" → ✅
```

---

## 改动范围

### 1. 后端 `src/app/admin/pricing/route.ts`

- POST 接口扩展：接受可选 `channel_model_id` 和 `channel_id`
- 根据入参查找：该模型在其他渠道中的 (model_id + alias) 匹配情况
- 收集匹配的渠道数量，返回前端展示

### 2. 后端 `src/lib/channels.ts`

- 新增函数 `findChannelsWithSamePricingKey(modelId: string, aliasName: string | null)`
  - 查找所有渠道中 (model_id, alias_name) 组合一致的数量
  - 返回匹配的渠道列表及数量

### 3. 前端 `src/app/dashboard/channels/page.tsx`

- 价格保存时：传 `channel_model_id` + `channel_id` 上下文
  - 有别名 → 用别名作为 pricing key
  - 无别名 → 用 model_id 作为 pricing key
- 添加提示文字：价格字段旁显示 `"此价格为全局统一设置"`
- 保存后反馈：Toast 提示同步了多少个渠道

---

## 不做的事

- ❌ 不新建独立价格管理页面
- ❌ 不改动代理路由的计费逻辑（`calculateCost(modelName, ...)` 本身正确）
- ❌ 不改动数据库结构（`model_pricing` 表保持现有 schema）
- ❌ 不支持按渠道差异化定价（当前无此需求）
