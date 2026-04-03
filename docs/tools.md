# Agent 工具清单

工具分两层：**常驻工具**始终可用，**技能工具**通过 `load_skill` 按需加载。

## 常驻工具（始终可用）

### 元工具
- `load_skill` - 按需加载功能技能（prompt.md + 详细工具），LLM 根据用户需求调用

### 档案工具
- `get_profile` - 获取用户档案
- `update_profile` - 更新用户档案

### 记忆工具
- `save_memory` - 保存长期记忆
- `query_memories` - 查询长期记忆
- `delete_memory` - 删除长期记忆

### 简单查询工具（零参数，返回最近5条）
- `get_recent_body` - 最近身体数据
- `get_recent_diet` - 最近饮食记录
- `get_recent_sleep` - 最近睡眠记录
- `get_recent_exercise` - 最近运动记录
- `get_recent_water` - 最近饮水记录
- `get_recent_symptoms` - 最近症状记录
- `get_recent_medications` - 最近用药记录
- `get_recent_chronic` - 最近慢性病记录
- `get_recent_observations` - 最近健康观察

## 技能工具（通过 load_skill 按需加载）

### 记录工具
- `record_body` - 记录身体数据
- `record_diet` - 记录饮食
- `record_symptom` - 记录症状/不适
- `record_exercise` - 记录运动
- `record_sleep` - 记录睡眠
- `record_water` - 记录饮水
- `record_medication` - 记录用药
- `record_observation` - 记录健康观察
- `record_chronic_condition` - 记录慢性病

### 查询工具（支持日期范围等参数）
- `query_body_records` - 查询身体数据历史
- `query_diet_records` - 查询饮食记录
- `query_symptom_records` - 查询症状记录
- `query_exercise_records` - 查询运动记录
- `query_sleep_records` - 查询睡眠记录
- `query_water_records` - 查询饮水记录
- `query_medication_records` - 查询用药记录
- `query_observations` - 查询健康观察
- `query_chronic_conditions` - 查询慢性病

### 管理工具
- `resolve_symptom` - 标记症状已解决
- `stop_medication` - 标记停药
- `update_chronic_condition` - 更新慢性病
- `deactivate_chronic_condition` - 停用慢性病追踪

### 心跳任务工具
- `add_heartbeat_task` - 添加心跳检查任务
- `list_heartbeat_tasks` - 查看心跳任务
- `remove_heartbeat_task` - 删除心跳任务

### 定时任务工具
- `schedule_cron` - 创建定时任务
- `list_cron_jobs` - 查看定时任务
- `remove_cron_job` - 删除定时任务

## 设计原则

工具只提供数据存储功能，所有分析和决策由 AI 完成。
