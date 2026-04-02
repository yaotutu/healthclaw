# Skill-Based Prompt Loading 设计文档

## 背景

当前系统提示词在每次消息时全量加载 13 个功能模块的提示词（343 行），加上核心角色（14 行）、规则（140 行）和动态数据，总计约 800 行。用户说"我吃了一碗面"时，LLM 也要处理 cron 定时任务、心跳机制、慢性病追踪等完全无关的提示词，影响判断质量。

## 方案

借鉴 OpenClaw 的 skill 机制，将功能提示词从"全量注入"改为"按需加载"。

核心思路：系统提示词只保留一个功能目录表（每个功能一行），LLM 判断需要哪个功能后，通过 `load_skill` 工具拉取详细说明。

### 不变的部分

- 核心角色提示词（`prompts/core/`）
- 行为规则提示词（`prompts/rules/`）
- 动态数据（用户档案、最近记录、活跃症状、慢性病、记忆、摘要）
- 所有工具注册（30+ 个工具全部常驻）
- 功能提示词文件内容（`features/*/prompt.md` 不改）
- 目录结构不变

### 变化的部分

1. **assembler.ts**：删掉 `readFeaturePrompts()`，换成生成功能目录表
2. **新增 skill-tool.ts**：实现 `load_skill` 工具

## 系统提示词结构

### 改前

```
core/identity.md              (14行)
features/*/prompt.md          (343行, 13个全加载)
rules/*.md                    (140行)
当前时间
用户档案
最近记录
活跃症状
慢性病
长期记忆
对话摘要
```

### 改后

```
core/identity.md              (14行)     不变
功能目录表                     (~20行)    新增，替代 343 行
rules/*.md                    (140行)    不变
当前时间
用户档案
最近记录
活跃症状
慢性病
长期记忆
对话摘要
```

静态部分从 ~497 行降到 ~174 行。

## 功能目录表

注入到系统提示词中，格式如下：

```markdown
## 可用功能

当用户消息涉及以下功能时，先调用 load_skill 加载详细说明，再使用对应工具。

- diet: 记录饮食（吃了、喝了、早餐、午餐、晚餐、加餐、热量）。load_skill('diet')
- body: 记录身体数据（体重、体脂、BMI、胖了、瘦了）。load_skill('body')
- sleep: 记录睡眠（失眠、早起、晚睡、睡眠质量）。load_skill('sleep')
- symptom: 记录症状（不舒服、疼痛、过敏）。load_skill('symptom')
- exercise: 记录运动（跑步、游泳、健身、走路）。load_skill('exercise')
- water: 记录饮水（喝水、几杯水）。load_skill('water')
- medication: 记录用药（吃药、服药）。load_skill('medication')
- chronic: 慢性病追踪（慢性病、长期疾病）。load_skill('chronic')
- observation: 健康观察（疲惫、压力大、情绪）。load_skill('observation')
- heartbeat: 心跳任务（定期提醒、定时检查）。load_skill('heartbeat')
- cron: 定时任务（每天提醒、每周报告）。load_skill('cron')
- profile: 用户档案（身高、年龄、性别）。load_skill('profile')
- memory: 长期记忆（记住这个、我的偏好）。load_skill('memory')
```

## load_skill 工具

### 定义

- 工具名：`load_skill`
- 参数：`{ skill: string }` — 功能名称
- 返回：对应 `features/{skill}/prompt.md` 的内容
- 缓存：内存缓存，避免重复读文件

### 行为

- LLM 可在一个对话中多次调用，加载多个 skill
- 已加载的 skill 内容留在 LLM 上下文中
- 重复加载同一 skill 直接返回缓存

### 使用流程

```
用户: "我吃了一碗牛肉面"
LLM: → load_skill('diet')      ← 返回 diet/prompt.md (28行)
     → record_diet(...)         ← 知道怎么填参数了
     → 回复用户
```

```
用户: "吃完海鲜过敏了"（跨功能）
LLM: → load_skill('diet')      ← 记录海鲜
     → load_skill('symptom')   ← 记录过敏症状
     → record_diet(...)
     → record_symptom(...)
     → 回复用户
```

```
用户: "你好"（纯聊天）
LLM: → 直接回复，不需要 load_skill
```

## 工具分类

| 类别 | 工具 | 加载方式 |
|------|------|---------|
| 常驻 | get_profile, update_profile | 始终可用 |
| 常驻 | save_memory, query_memories, delete_memory | 始终可用 |
| 常驻 | query_body_records, query_diet_records, query_symptom_records 等所有 query 工具 | 始终可用 |
| 常驻 | load_skill | 始终可用 |
| 跟 skill | record_body, record_diet, record_sleep, record_exercise, record_water | 工具常驻，详细用法在 skill 中 |
| 跟 skill | record_symptom, resolve_symptom | 工具常驻，详细用法在 skill 中 |
| 跟 skill | record_medication, stop_medication, query_medication_records | 工具常驻，详细用法在 skill 中 |
| 跟 skill | chronic 的 CRUD 工具 | 工具常驻，详细用法在 skill 中 |
| 跟 skill | observation 的 CRUD 工具 | 工具常驻，详细用法在 skill 中 |
| 跟 skill | heartbeat 的 CRUD 工具 | 工具常驻，详细用法在 skill 中 |
| 跟 skill | cron 的 CRUD 工具 | 工具常驻，详细用法在 skill 中 |

注意：所有工具始终注册给 Agent，只是详细用法说明在 skill 中按需加载。LLM 可以不加载 skill 直接使用工具（依赖 JSON schema），但加载 skill 后能更准确地填写参数。

## 代码改动清单

### 修改文件

1. **`src/prompts/assembler.ts`**
   - 删除 `readFeaturePrompts()` 函数
   - 新增 `readSkillCatalog()` 函数：生成功能目录表文本
   - `assembleSystemPrompt()` 中用 `readSkillCatalog()` 替代 `readFeaturePrompts()`

2. **`src/agent/tools.ts`**
   - 导入并注册 `load_skill` 工具

### 新增文件

3. **`src/agent/skill-tool.ts`**
   - 实现 `createSkillTool()` 工厂函数
   - 返回 `load_skill` AgentTool
   - 读取 `features/{name}/prompt.md` 文件
   - 内存缓存

### 不变的文件

- `features/*/prompt.md` — 内容不变
- `prompts/core/` — 不变
- `prompts/rules/` — 不变
- `agent/factory.ts` — 不变
- `store/` — 不变
- 所有 feature 的 `store.ts`、`tools.ts` — 不变

## 效果预期

| 指标 | 改前 | 改后 |
|------|------|------|
| 系统提示词静态部分 | ~497 行 | ~174 行 |
| 每次加载的功能说明 | 13 个全加载 | 按需 0-3 个 |
| 工具数量 | 30+ | 30+（不变）+ 1（load_skill） |
| 新增代码 | - | ~50 行 |
| 文件改动 | - | 改 2 个 + 新增 1 个 |
