# Skill-Based Dynamic Tool Injection 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 34 个常驻工具拆为 6 个无条件常驻 + 11 个 opt-in 极简查询 + 26 个 skill 动态注入工具，大幅减少 token 开销。

**Architecture:** 利用 pi-agent-core 的 tools 数组引用特性，load_skill 执行时 push 新工具到数组，下一轮 LLM 自动可见。每个功能模块 opt-in 暴露极简查询工具，未暴露的需先 load_skill。

**Tech Stack:** TypeScript, @mariozechner/pi-agent-core, @sinclair/typebox, Bun

**Spec:** `docs/superpowers/specs/2026-04-03-skill-dynamic-tool-injection-design.md`

---

## File Structure

| 文件 | 职责 |
|------|------|
| `src/agent/tool-factory.ts` | 新增 createSimpleQueryTool helper |
| `src/agent/skill-tool.ts` | 重写：skill→完整工具映射 + 动态注入 + 目录表 |
| `src/agent/tools.ts` | 重写：createCommonTools + getSkillTools |
| `src/agent/factory.ts` | 修改：传入 tools 数组引用 |
| `src/features/*/tools.ts` × 11 | 各自新增 createXxxSimpleQuery 导出 |
| `src/cron/tools.ts` | 新增 createCronSimpleQuery 导出 |

---

### Task 1: 新增 createSimpleQueryTool helper

**Files:**
- Modify: `src/agent/tool-factory.ts`

- [ ] **Step 1: 在 tool-factory.ts 末尾新增 createSimpleQueryTool**

在现有 `createQueryTool` 函数后面添加：

```typescript
/**
 * 创建极简查询工具（无参数，默认返回最近数据）
 * 用于常驻上下文，token 开销极低
 * 每个功能模块 opt-in 暴露，未暴露的不会出现在常驻上下文中
 */
export const createSimpleQueryTool = (options: {
  name: string;
  description: string;
  queryFn: () => Promise<any[]>;
}): AgentTool => ({
  name: options.name,
  label: options.description,
  description: options.description,
  parameters: Type.Object({}),
  execute: async (_toolCallId, _params, _signal) => {
    const records = await options.queryFn();
    return {
      content: [{ type: 'text', text: JSON.stringify({ records, count: records.length }) }],
      details: {},
    };
  },
});
```

需要在文件顶部确认 `Type` 已从 `@sinclair/typebox` 导入。

- [ ] **Step 2: Commit**

```bash
git add src/agent/tool-factory.ts
git commit -m "feat: add createSimpleQueryTool helper"
```

---

### Task 2: 各功能模块新增 SimpleQuery 导出

**Files:**
- Modify: `src/features/body/tools.ts`
- Modify: `src/features/diet/tools.ts`
- Modify: `src/features/sleep/tools.ts`
- Modify: `src/features/exercise/tools.ts`
- Modify: `src/features/water/tools.ts`
- Modify: `src/features/symptom/tools.ts`
- Modify: `src/features/medication/tools.ts`
- Modify: `src/features/chronic/tools.ts`
- Modify: `src/features/observation/tools.ts`
- Modify: `src/features/heartbeat/tools.ts`
- Modify: `src/cron/tools.ts`

每个文件做同样的改动：在文件末尾新增一个 `createXxxSimpleQuery` 导出函数，使用 `createSimpleQueryTool` 创建无参数查询工具。

以 `src/features/body/tools.ts` 为例（其他文件模式相同）：

- [ ] **Step 1: 在 body/tools.ts 新增导入和导出**

```typescript
// 在文件顶部新增导入
import { createSimpleQueryTool } from '../../agent/tool-factory';

// 在文件末尾新增
/**
 * 极简查询工具（opt-in 常驻）
 * 导出后会被 createCommonTools 收集到常驻上下文中
 */
export const createBodySimpleQuery = (store: BodyStore, userId: string) =>
  createSimpleQueryTool({
    name: 'get_recent_body',
    description: '获取最近7天身体数据',
    queryFn: () => store.query(userId, { limit: 10 }),
  });
```

- [ ] **Step 2: 对其余 10 个模块做同样改动**

每个模块的 name、description、queryFn 不同，但模式一致：

| 模块 | name | description | queryFn |
|------|------|-------------|---------|
| diet | get_recent_diet | 获取最近7天饮食记录 | store.query(userId, { limit: 10 }) |
| sleep | get_recent_sleep | 获取最近7天睡眠记录 | store.query(userId, { limit: 10 }) |
| exercise | get_recent_exercise | 获取最近7天运动记录 | store.query(userId, { limit: 10 }) |
| water | get_recent_water | 获取最近7天饮水记录 | store.query(userId, { limit: 10 }) |
| symptom | get_recent_symptoms | 获取最近7天症状记录 | store.query(userId, { limit: 10 }) |
| medication | get_recent_medications | 获取最近正在使用的用药记录 | store.query(userId, { activeOnly: true, limit: 10 }) |
| chronic | get_recent_chronic | 获取活跃的慢性病追踪 | store.query(userId, { activeOnly: true }) |
| observation | get_recent_observations | 获取最近7天健康观察 | store.query(userId, { limit: 10 }) |
| heartbeat | list_heartbeat_tasks | 获取心跳任务列表 | store.getEnabledTasks(userId) |
| cron | list_cron_jobs | 获取定时任务列表 | cronService.listJobs(userId) |

注意 heartbeat 和 cron 的特殊性：
- heartbeat: store 是 HeartbeatTaskStore，方法是 `getEnabledTasks(userId)`
- cron: 需要 cronService 参数，不是 store

- [ ] **Step 3: Commit**

```bash
git add src/features/*/tools.ts src/cron/tools.ts
git commit -m "feat: add simple query tools to all feature modules"
```

---

### Task 3: 重写 tools.ts — createCommonTools + getSkillTools

**Files:**
- Modify: `src/agent/tools.ts`

- [ ] **Step 1: 重写 tools.ts**

将现有的 `createTools()` 拆为两个函数：

```typescript
import type { Store } from '../store';
import { createBodyTools, createBodySimpleQuery } from '../features/body/tools';
import { createDietTools, createDietSimpleQuery } from '../features/diet/tools';
import { createSleepTools, createSleepSimpleQuery } from '../features/sleep/tools';
import { createExerciseTools, createExerciseSimpleQuery } from '../features/exercise/tools';
import { createWaterTools, createWaterSimpleQuery } from '../features/water/tools';
import { createSymptomTools, createSymptomSimpleQuery } from '../features/symptom/tools';
import { createMedicationTools, createMedicationSimpleQuery } from '../features/medication/tools';
import { createChronicTools, createChronicSimpleQuery } from '../features/chronic/tools';
import { createObservationTools, createObservationSimpleQuery } from '../features/observation/tools';
import { createMemoryTools } from '../features/memory/tools';
import { createProfileTools } from '../features/profile/tools';
import { createHeartbeatTools, createHeartbeatSimpleQuery } from '../features/heartbeat/tools';
import { createCronTools, createCronSimpleQuery } from '../cron/tools';
import type { CronService } from '../cron/service';
import { createSkillTool } from './skill-tool';
import type { AgentTool } from '@mariozechner/pi-agent-core';

/**
 * 创建常驻工具（无条件常驻 + opt-in 极简查询）
 * @param toolsArray 工具数组引用，供 load_skill 动态 push
 */
export const createCommonTools = (
  store: Store,
  userId: string,
  channel: string,
  cronService: CronService | undefined,
  toolsArray: AgentTool[]
): AgentTool[] => {
  const tools: AgentTool[] = [
    // load_skill（需要 toolsArray 引用来动态注入）
    createSkillTool(toolsArray, store, userId, channel, cronService),
    // 跨功能常驻工具
    ...Object.values(createProfileTools(store.profile, userId)),
    ...Object.values(createMemoryTools(store.memory, userId)),
    // 各功能域 opt-in 极简查询工具
    createBodySimpleQuery(store.body, userId),
    createDietSimpleQuery(store.diet, userId),
    createSleepSimpleQuery(store.sleep, userId),
    createExerciseSimpleQuery(store.exercise, userId),
    createWaterSimpleQuery(store.water, userId),
    createSymptomSimpleQuery(store.symptom, userId),
    createMedicationSimpleQuery(store.medication, userId),
    createChronicSimpleQuery(store.chronic, userId),
    createObservationSimpleQuery(store.observation, userId),
    createHeartbeatSimpleQuery(store.heartbeatTask, userId),
    ...(cronService ? [createCronSimpleQuery(cronService, userId)] : []),
  ];
  return tools.filter(Boolean);
};

/**
 * 获取指定 skill 的完整工具集（query + write，带完整参数）
 * 用于 load_skill 动态注入
 */
export const getSkillTools = (
  skillName: string,
  store: Store,
  userId: string,
  channel: string,
  cronService: CronService | undefined
): AgentTool[] | null => {
  switch (skillName) {
    case 'body':
      return Object.values(createBodyTools(store.body, userId));
    case 'diet':
      return Object.values(createDietTools(store.diet, userId));
    case 'sleep':
      return Object.values(createSleepTools(store.sleep, userId));
    case 'exercise':
      return Object.values(createExerciseTools(store.exercise, userId));
    case 'water':
      return Object.values(createWaterTools(store.water, userId));
    case 'symptom':
      return Object.values(createSymptomTools(store.symptom, userId));
    case 'medication':
      return Object.values(createMedicationTools(store.medication, userId));
    case 'chronic':
      return Object.values(createChronicTools(store.chronic, userId));
    case 'observation':
      return Object.values(createObservationTools(store.observation, userId));
    case 'heartbeat':
      return Object.values(createHeartbeatTools(store.heartbeatTask, userId));
    case 'cron':
      return cronService ? Object.values(createCronTools(cronService, userId, channel)) : [];
    // profile 和 memory 工具已常驻，不需要 skill 注入
    case 'profile':
    case 'memory':
      return [];
    default:
      return null;
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/tools.ts
git commit -m "refactor: split tools.ts into createCommonTools + getSkillTools"
```

---

### Task 4: 重写 skill-tool.ts — 动态注入 + 目录表

**Files:**
- Modify: `src/agent/skill-tool.ts`

- [ ] **Step 1: 重写 skill-tool.ts**

```typescript
/**
 * Skill 按需加载工具
 *
 * LLM 通过功能目录表判断需要哪个 skill，调用 load_skill 获取：
 * 1. 对应功能模块的 prompt.md（详细使用说明）
 * 2. 对应功能模块的完整工具集（动态注入到 tools 数组）
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { Store } from '../store';
import type { CronService } from '../cron/service';
import { getSkillTools } from './tools';

const LoadSkillParamsSchema = Type.Object({
  skill: Type.String({ description: '功能名称，如 diet、body、sleep、symptom 等' }),
});

type LoadSkillParams = typeof LoadSkillParamsSchema;

/**
 * 功能目录表，注入到系统提示词中
 * 每个功能一行：名称、触发关键词
 */
const SKILL_CATALOG: Record<string, { keywords: string }> = {
  diet:        { keywords: '吃了、喝了、早餐、午餐、晚餐、加餐、热量' },
  body:        { keywords: '体重、体脂、BMI、胖了、瘦了' },
  sleep:       { keywords: '失眠、早起、晚睡、睡眠质量' },
  symptom:     { keywords: '不舒服、疼痛、过敏' },
  exercise:    { keywords: '跑步、游泳、健身、走路' },
  water:       { keywords: '喝水、几杯水' },
  medication:  { keywords: '吃药、服药' },
  chronic:     { keywords: '慢性病、长期疾病' },
  observation: { keywords: '疲惫、压力大、情绪' },
  heartbeat:   { keywords: '定期提醒、定时检查' },
  cron:        { keywords: '每天提醒、每周报告' },
  profile:     { keywords: '身高、年龄、性别' },
  memory:      { keywords: '记住这个、我的偏好' },
};

/** 功能模块所在目录 */
const FEATURES_DIR = join(dirname(import.meta.dir), 'features');

/** 提示词缓存 */
const promptCache = new Map<string, string>();

/**
 * 生成功能目录表文本，注入到系统提示词中
 */
export function readSkillCatalog(): string {
  const lines = Object.entries(SKILL_CATALOG).map(
    ([name, { keywords }]) => `- ${name}: ${keywords}。load_skill('${name}')`
  );
  return [
    '## 可用功能',
    '',
    '当用户消息涉及以下功能时，先调用 load_skill 加载详细说明，再使用对应工具。',
    '',
    ...lines,
  ].join('\n');
}

/**
 * 创建 load_skill 工具
 * @param toolsArray 常驻工具数组的引用，用于动态 push skill 工具
 */
export const createSkillTool = (
  toolsArray: AgentTool[],
  store: Store,
  userId: string,
  channel: string,
  cronService: CronService | undefined,
): AgentTool<LoadSkillParams> => {
  // 记录已注入的工具名，避免重复 push
  const injectedToolNames = new Set(toolsArray.map(t => t.name));

  return {
    name: 'load_skill',
    label: '加载功能说明',
    description: '加载功能模块的详细使用说明和对应工具。当用户消息涉及某类健康数据时，先加载对应 skill 再操作。',
    parameters: LoadSkillParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const { skill } = params;

      // 1. 读取 prompt.md
      if (!SKILL_CATALOG[skill]) {
        const available = Object.keys(SKILL_CATALOG).join(', ');
        return {
          content: [{ type: 'text', text: `未知功能 "${skill}"。可用功能: ${available}` }],
          details: {},
        };
      }

      // 从缓存或文件读取提示词
      if (!promptCache.has(skill)) {
        // profile 和 memory 的 prompt.md 在 features 目录下
        const filePath = join(FEATURES_DIR, skill, 'prompt.md');
        if (!existsSync(filePath)) {
          return {
            content: [{ type: 'text', text: `功能 "${skill}" 的说明文件不存在。` }],
            details: {},
          };
        }
        promptCache.set(skill, readFileSync(filePath, 'utf-8'));
      }
      const prompt = promptCache.get(skill)!;

      // 2. 动态注入完整工具集
      const skillTools = getSkillTools(skill, store, userId, channel, cronService);
      if (skillTools && skillTools.length > 0) {
        for (const tool of skillTools) {
          if (!injectedToolNames.has(tool.name)) {
            injectedToolNames.add(tool.name);
            toolsArray.push(tool);
          }
        }
      }

      return {
        content: [{ type: 'text', text: prompt }],
        details: {},
      };
    },
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/skill-tool.ts
git commit -m "refactor: rewrite skill-tool with dynamic tool injection"
```

---

### Task 5: 修改 factory.ts — 使用新工具创建方式

**Files:**
- Modify: `src/agent/factory.ts`

- [ ] **Step 1: 修改 createHealthAgent**

修改 `factory.ts` 中的工具创建部分：

```typescript
// 替换原来的:
// const toolList = createTools(store, userId, channel, cronService);
// 改为:

// 创建可变的工具数组，传入引用供 load_skill 动态注入
const tools: AgentTool[] = [];
const commonTools = createCommonTools(store, userId, channel, cronService, tools);
tools.push(...commonTools);
```

同时更新 import：
```typescript
// 替换:
// import { createTools } from './tools';
// 改为:
import { createCommonTools } from './tools';
```

- [ ] **Step 2: Commit**

```bash
git add src/agent/factory.ts
git commit -m "refactor: use createCommonTools with dynamic injection"
```

---

### Task 6: 更新 query-guidance 规则

**Files:**
- Modify: `src/prompts/rules/query-guidance.md`

- [ ] **Step 1: 更新规则提示词**

将规则改为引导 LLM 使用极简查询工具和 load_skill：

```markdown
# 数据查询

## 极简查询工具（始终可用）
以下工具无参数，默认返回最近数据：
- `get_recent_body` — 最近身体数据
- `get_recent_diet` — 最近饮食记录
- `get_recent_sleep` — 最近睡眠记录
- `get_recent_exercise` — 最近运动记录
- `get_recent_water` — 最近饮水记录
- `get_recent_symptoms` — 最近症状记录
- `get_recent_medications` — 最近用药记录
- `get_recent_chronic` — 慢性病追踪
- `get_recent_observations` — 最近健康观察
- `list_heartbeat_tasks` — 心跳任务列表
- `list_cron_jobs` — 定时任务列表

## 精确查询（需要 load_skill）
如果用户需要特定时间范围的数据（如"上周吃了什么"、"上个月的体重变化"）：
1. 先调用 `load_skill` 加载对应功能模块
2. 使用带参数的完整查询工具（支持 startTime/endTime/limit）

## 使用时机
- 用户提到一段时间的健康问题时，先用极简查询工具获取最近数据
- 需要精确时间范围时，再 load_skill 获取完整查询工具
- 如果用户说"最近"，默认查询最近7天的数据
```

- [ ] **Step 2: Commit**

```bash
git add src/prompts/rules/query-guidance.md
git commit -m "docs: update query-guidance rules for skill-based tools"
```

---

### Task 7: 验证

- [ ] **Step 1: 运行类型检查**

```bash
bun run typecheck
```

Expected: 无错误

- [ ] **Step 2: 启动服务**

```bash
bun run dev
```

- [ ] **Step 3: 测试场景**

通过 QQ Bot 或 WebSocket 测试：
1. "你好" → 不调 load_skill，直接回复
2. "我最近怎么样" → 用 get_recent_* 工具直接查询，不调 load_skill
3. "喝了一杯水 200ml" → load_skill('water') → record_water
4. "昨晚12点睡的，今早8点起来" → load_skill('sleep') → query_sleep_records + record_sleep
5. "吃完海鲜过敏了" → load_skill('diet') + load_skill('symptom')

- [ ] **Step 4: 检查 LLM 日志**

确认：
- 初始 tools 只有常驻工具（~17 个）
- load_skill 后下一轮 LLM 调用时 tools 增加了对应的完整工具
- 无重复注入（同一 skill 多次 load_skill 不会重复 push）

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat: complete skill-based dynamic tool injection"
```
