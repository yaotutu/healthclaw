# Skill-Based Dynamic Tool Injection 设计文档

## 背景

当前所有 34 个工具常驻注册，系统提示词约 800 行。其中：
- 17 个 write 工具没有对应提示词（已改为按需加载），是垃圾 token
- 13 个 query 工具有完整参数（startTime/endTime/limit），但 90% 的场景只需要"最近几条"
- 参数描述（timestamp 毫秒格式等）需要额外 token 让 LLM 理解

## 设计目标

1. 常驻工具极简化，每个功能域提供一个无参数查询工具
2. write 工具和完整 query 工具通过 load_skill 动态注入
3. 建立开发约定，确保未来新功能遵循同样的模式

## 核心机制

利用 `pi-agent-core` 特性：Agent 运行循环持有 tools 数组的**引用**（非拷贝），load_skill 执行时 push 新工具，下一轮 LLM 调用自动可见。

```
Agent 启动，tools = [17 个常驻极简工具]
  ↓
用户: "昨晚12点睡的，今早8点起来"
  ↓
LLM 调用 load_skill('sleep')
  ↓
load_skill execute:
  1. 返回 sleep/prompt.md 内容（提示词）
  2. getSkillTools('sleep') → [query_sleep_records, record_sleep]
  3. push 到 tools 数组（去重：按工具名检查是否已存在）
  ↓
Agent 继续循环，下一轮 LLM 看到 tools 已包含 sleep 工具
  ↓
LLM 调用 query_sleep_records → record_sleep → 回复用户
```

## 工具分层

### 常驻工具

**无条件常驻（6 个）—— 跨功能使用，始终注册：**

| 工具名 | 描述 | 参数 |
|--------|------|------|
| load_skill | 加载功能模块的详细说明和工具 | skill: string |
| get_profile | 获取用户档案 | 无 |
| update_profile | 更新用户档案 | （现有参数） |
| save_memory | 保存长期记忆 | （现有参数） |
| query_memories | 查询长期记忆 | （现有参数） |
| delete_memory | 删除长期记忆 | id: number |

**功能域 opt-in 极简查询工具（按需常驻）：**

以下工具只在对应功能模块**显式导出**了 SimpleQuery 时才注册。模块不导出 → 不出现在常驻上下文中 → LLM 需先 load_skill 才能使用。

| 工具名 | 描述 | 参数 | 暴露方 |
|--------|------|------|--------|
| get_recent_body | 最近7天身体数据 | 无 | body/tools.ts |
| get_recent_diet | 最近7天饮食记录 | 无 | diet/tools.ts |
| get_recent_sleep | 最近7天睡眠记录 | 无 | sleep/tools.ts |
| get_recent_exercise | 最近7天运动记录 | 无 | exercise/tools.ts |
| get_recent_water | 最近7天饮水记录 | 无 | water/tools.ts |
| get_recent_symptoms | 最近7天症状记录 | 无 | symptom/tools.ts |
| get_recent_medications | 最近正在使用的药物 | 无 | medication/tools.ts |
| get_recent_chronic | 活跃的慢性病追踪 | 无 | chronic/tools.ts |
| get_recent_observations | 最近7天健康观察 | 无 | observation/tools.ts |
| list_heartbeat_tasks | 心跳任务列表 | 无 | heartbeat/tools.ts |
| list_cron_jobs | 定时任务列表（条件：需 cronService） | 无 | cron/tools.ts |

**极简查询工具特点：**
- 无参数（不需要 startTime/endTime/limit）
- 默认返回最近 7 天数据或合理的默认值
- 描述一句话，LLM 秒懂
- 复杂查询（"上周吃了什么"）→ load_skill 后用完整版 query 工具
- 心跳/cron 用 `list_*` 命名（非时间性查询，列出当前所有项目）

### Skill 完整工具（11 个 skill，26 个工具）

每个 skill 包含该功能域的**全部**工具（完整参数的 query + write）：

| Skill | 完整工具 | 数量 |
|-------|---------|------|
| body | query_body_records, record_body | 2 |
| diet | query_diet_records, record_diet | 2 |
| sleep | query_sleep_records, record_sleep | 2 |
| exercise | query_exercise_records, record_exercise | 2 |
| water | query_water_records, record_water | 2 |
| symptom | query_symptom_records, record_symptom, resolve_symptom | 3 |
| medication | query_medication_records, record_medication, stop_medication | 3 |
| chronic | query_chronic_conditions, record_chronic_condition, update_chronic_condition, deactivate_chronic_condition | 4 |
| observation | query_observations, record_observation | 2 |
| heartbeat | add_heartbeat_task, remove_heartbeat_task | 2 |
| cron | schedule_cron, remove_cron_job（条件：需 cronService） | 2 |
| **合计** | | **26** |

**profile 和 memory 的 load_skill 行为：**
- `load_skill('profile')` 和 `load_skill('memory')` 仍然有效
- 返回对应 prompt.md 内容（提示词）
- 不注入任何工具（因为工具已常驻）
- LLM 获取使用说明后直接使用常驻工具

## 开发约定

每个功能模块必须/可选提供：

### 必须提供
1. **完整工具集** — 包含完整参数的 query + write 工具，跟 skill 走
2. **prompt.md** — 功能详细使用说明，load_skill 时返回

### 可选提供（opt-in）
3. **极简查询工具** — 无参数，默认返回最近数据。**只有显式导出，才会常驻在上下文中**

### opt-in 机制

每个 feature 的 tools.ts 可以导出一个 `createXxxSimpleQuery` 函数。`createCommonTools()` 扫描所有 features，收集导出了 SimpleQuery 的模块。没有导出的模块不会出现在常驻上下文中——LLM 需要先 load_skill 才能使用该功能。

```typescript
// src/features/diet/tools.ts

// 必须：完整工具集（跟 skill）
export const createDietTools = (store, userId) => ({ ... });

// 可选：极简查询工具（常驻 opt-in）
// 导出这个函数 → get_recent_diet 出现在常驻工具中
// 不导出 → LLM 需要 load_skill('diet') 才能查询饮食数据
export const createDietSimpleQuery = (store, userId) =>
  createSimpleQueryTool({
    name: 'get_recent_diet',
    description: '获取最近7天饮食记录',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
```

### createSimpleQueryTool helper

`src/agent/tool-factory.ts` 新增统一的极简查询工具工厂：

```typescript
export const createSimpleQueryTool = (options: {
  name: string;
  description: string;
  queryFn: () => Promise<any[]>;
}): AgentTool => ({
  name: options.name,
  description: options.description,
  parameters: Type.Object({}),  // 无参数
  execute: async (_, __, ___) => {
    const records = await options.queryFn();
    return {
      content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
      details: {},
    };
  },
});
```

### createCommonTools 收集逻辑

```typescript
// 扫描所有 features，收集导出了 SimpleQuery 的模块
// 没有导出的 → 不加载到常驻上下文
import { createBodySimpleQuery } from '../features/body/tools';
import { createDietSimpleQuery } from '../features/diet/tools';
// ... 谁有导出就 import 谁
```

## 场景分析

### 纯聊天（"你好"）
- 不调 load_skill，直接回复
- 常驻 17 个工具，token 极低

### 综合分析（"我最近怎么样"）
- 直接调用 get_recent_sleep + get_recent_diet + get_recent_exercise + ...
- 无需 load_skill，零额外开销

### 简单记录（"喝了一杯水"）
- load_skill('water') → 返回提示词 + 注入 record_water + query_water_records
- LLM 调用 record_water

### 复杂记录（"昨晚12点睡的"）
- load_skill('sleep') → 返回 66 行提示词 + 注入 query_sleep_records + record_sleep
- LLM 按提示词规则：先 query 去重 → 再 record_sleep（正确填写 bedTime 格式）

### 跨功能（"吃完海鲜过敏了"）
- load_skill('diet') + load_skill('symptom')
- 两个 skill 的工具都注入
- LLM 分别记录饮食和症状

### 精确查询（"上周吃了什么"）
- load_skill('diet') → 注入 query_diet_records（带 startTime/endTime 参数）
- LLM 计算时间范围，精确查询

### 去重场景
- 用户连续提到"喝水"多次，每次都 load_skill('water')
- 第二次 load_skill('water') 检测到已注入，跳过工具 push，只返回提示词

### 工具数上限
- 最坏情况：用户触发所有 skill → tools 从 17 增长到 17+26=43
- 实际场景中通常触发 1-3 个 skill → tools 在 19-23 个范围

## 涉及文件

| 文件 | 改动 | 说明 |
|------|------|------|
| `src/agent/tool-factory.ts` | 修改 | 新增 createSimpleQueryTool helper |
| `src/agent/skill-tool.ts` | 重写 | skill→完整工具映射 + 动态注入 + 目录表 |
| `src/agent/tools.ts` | 重写 | 拆为 createCommonTools + getSkillTools |
| `src/agent/factory.ts` | 修改 | 使用新工具创建方式，传入 tools 数组引用 |
| `src/features/body/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/diet/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/sleep/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/exercise/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/water/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/symptom/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/medication/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/chronic/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/observation/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/features/heartbeat/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/cron/tools.ts` | 修改 | 新增极简查询工具导出 |
| `src/prompts/rules/query-guidance.md` | 修改 | 引导使用极简工具或 load_skill |
| `src/prompts/assembler.ts` | 不改 | 已在上一轮完成（目录表替代全量提示词） |
| `src/bot/user-bot.ts` | 不改 | 通过 factory 间接适配 |
| `src/channels/handler.ts` | 不改 | 通过 factory 间接适配 |

## Token 预期对比

| 指标 | 改前 | 改后 |
|------|------|------|
| 常驻工具数 | 34 | 17 |
| 常驻工具 tokens | ~4000 | ~1200 |
| 功能提示词 | 343 行全加载 | ~20 行目录表 |
| 系统提示词静态部分 | ~497 行 | ~174 行 |
| 按需加载 | 无 | skill 提示词 + 完整工具 |
