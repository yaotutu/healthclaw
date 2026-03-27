# 饮食管理功能设计

## 定位

Healthclaw 作为私人健康助手，首个核心功能是**饮食管理与个性化建议**。用户记录饮食（文字或图片），AI 基于个人档案和历史数据给出个性化的营养分析和替代建议。

## 核心原则

**工具只提供数据，AI 做所有决策。** 不写死阈值、规则、建议模板。所有分析逻辑由 AI 根据上下文数据自行判断。

## 功能范围

### Part 1: 个人档案

所有分析的基础。用户首次使用时由 AI 主动引导建立档案。

**存储字段：**

| 字段 | 类型 | 说明 |
|------|------|------|
| height | number | 身高 cm |
| weight | number | 体重 kg |
| age | number | 年龄 |
| gender | string | 性别 |
| diseases | string[] | 疾病史 |
| allergies | string[] | 过敏史 |
| diet_preferences | string | 饮食偏好（自由文本） |
| health_goal | string | 健康目标（自由文本） |

**实现：**

- 新增 `user_profiles` 表
- 新增 `get_profile` / `update_profile` Agent 工具
- 档案数据作为上下文注入 Agent，AI 每次回复都能参考
- 首次对话时 AI 自行判断是否需要引导用户建立档案（不写死流程）

### Part 2: 饮食记录与分析

用户发送食物信息（文字或图片），AI 识别食物、估算营养、记录并给出即时建议。

**数据存储：**

`health_records` 表新增 `detail` JSON 字段，diet 类型记录存储结构化营养数据：

```json
{
  "food": "牛肉面",
  "calories": 550,
  "protein": 25,
  "carbs": 65,
  "fat": 18,
  "input_type": "text"
}
```

**多模态支持：**

- 文字描述：AI 直接从文本估算
- 图片：利用 Claude 多模态能力识别食物并估算

**实现：**

- `health_records` 表新增 `detail` text 字段（JSON 序列化）
- 扩展 `record_health_data` 工具的 diet 类型，支持 detail 参数
- AI 自行完成：识别食物 → 估算营养 → 调用工具记录 → 给出建议

### Part 3: 模式分析与智能建议

基于历史饮食数据发现模式，提供个性化建议和替代食物推荐。

**AI 分析能力（不写死逻辑）：**

- 即时反馈：用户记录饮食时，AI 根据当日已摄入数据自行判断是否需要提醒
- 每日总结：用户主动询问时，AI 自行分析当日/近期饮食情况
- 趋势发现：AI 从历史数据中自行识别饮食模式（偏好的食物、营养倾向、时间规律等）
- 替代建议：AI 根据用户口味偏好和历史记录，推荐同口味/同类型但更健康的选项

**实现：**

- 新增 `analyze_diet` 工具，返回饮食统计聚合数据（原始数据，不做判断）：
  - 指定天数内每日热量/蛋白质/碳水/脂肪汇总
  - 食物频次统计
  - 时间分布统计
- Agent prompt 注入用户档案 + 饮食历史摘要，引导 AI 做个性化分析
- 所有建议逻辑由 AI 自行生成，不预设规则

## 改动清单

| 改动 | 内容 |
|------|------|
| `src/store/schema.ts` | 新增 `user_profiles` 表；`health_records` 表新增 `detail` 字段 |
| `src/store/profile.ts` | 新增档案读写操作 |
| `src/store/health.ts` | `record` 方法支持 detail 参数；新增 `analyze` 聚合查询方法 |
| `src/store/index.ts` | 导出 profile store |
| `src/agent/tools.ts` | 新增 `get_profile`、`update_profile`、`analyze_diet` 工具 |
| `src/agent/prompt.ts` | 注入用户档案信息，引导 AI 做个性化饮食建议 |
| `src/agent/factory.ts` | 创建 Agent 时注入档案上下文 |
| `src/channels/handler.ts` | 处理图片消息（QQ 图片消息） |

## 不做什么

- 不做食物营养数据库 API 对接（AI 估算足够）
- 不做定时提醒推送（后续 P1 提醒系统）
- 不做前端图表（先通过文字/表格呈现）
- 不写死任何营养阈值或健康规则
