# 数据类型与数据表

## 数据表

使用 SQLite + Drizzle ORM，表结构定义在 `src/store/schema.ts`（17个表）。

| 表名 | 说明 |
|------|------|
| `user_profiles` | 用户档案（不含体重） |
| `body_records` | 身体数据（体重、体脂、BMI） |
| `diet_records` | 饮食记录（含营养成分） |
| `symptom_records` | 症状记录（可关联其他记录） |
| `exercise_records` | 运动记录 |
| `sleep_records` | 睡眠记录 |
| `water_records` | 饮水记录 |
| `medication_records` | 用药记录 |
| `chronic_conditions` | 慢性病追踪 |
| `health_observations` | 健康观察 |
| `messages` | 会话消息历史 |
| `memories` | 长期记忆（用户偏好、反馈、重要事实） |
| `conversation_summaries` | 对话摘要（短期记忆） |
| `logs` | 应用日志 |
| `heartbeat_tasks` | 用户心跳任务 |
| `channel_bindings` | 用户通道绑定（存储 QQ 等通道凭证） |
| `cron_jobs` | 定时任务（支持 at/every/cron 三种调度） |

## 数据类型字段

### 身体数据 (body)
- `weight` (kg) - 体重
- `bodyFat` (%) - 体脂率
- `bmi` - BMI指数
- `note` - 备注

### 饮食记录 (diet)
- `food` - 食物名称
- `calories` (kcal) - 热量
- `protein` (g) - 蛋白质
- `carbs` (g) - 碳水化合物
- `fat` (g) - 脂肪
- `sodium` (mg) - 钠
- `mealType` - 餐次（早餐/午餐/晚餐/加餐）

### 症状记录 (symptom)
- `description` - 症状描述
- `severity` (1-10) - 严重程度
- `bodyPart` - 身体部位
- `relatedType` - 关联记录类型
- `relatedId` - 关联记录ID
- `resolvedAt` - 解决时间

### 运动记录 (exercise)
- `type` - 运动类型
- `duration` (分钟) - 时长
- `calories` (kcal) - 消耗热量
- `heartRateAvg` (bpm) - 平均心率
- `heartRateMax` (bpm) - 最大心率
- `distance` (km) - 距离

### 睡眠记录 (sleep)
- `duration` (分钟) - 睡眠时长
- `quality` (1-5) - 睡眠质量
- `bedTime` - 入睡时间
- `wakeTime` - 醒来时间
- `deepSleep` (分钟) - 深睡时长

### 饮水记录 (water)
- `amount` (ml) - 饮水量

### 用户档案 (profile)
- `height` (cm) - 身高
- `age` - 年龄
- `gender` - 性别
- `diseases` - 疾病史（JSON数组）
- `allergies` - 过敏史（JSON数组）
- `dietPreferences` - 饮食偏好
- `healthGoal` - 健康目标

**注意**: 体重不再存储在档案中，而是通过 `body_records` 记录历史体重。
