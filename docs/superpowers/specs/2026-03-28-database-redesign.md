# 数据库重新设计

## 定位

将 Healthclaw 的数据层从通用表拆分为按数据类型独立的表，解决 health_records 太通用、weight 双存、营养数据 JSON 聚合困难、图片 base64 膨胀等问题。新增 symptom_records 表支持症状/不适追踪。

## 核心原则

**每种数据类型独立一张表，字段各自定制。** 废弃旧的 health_records 通用表。

## 表设计

### user_profiles — 用户档案

去掉 weight 字段（体重改为从 body_records 动态获取）：

| 字段 | 类型 | 说明 |
|------|------|------|
| user_id | TEXT PK | 用户 ID |
| height | REAL | 身高 cm |
| age | INTEGER | 年龄 |
| gender | TEXT | 性别 |
| diseases | TEXT | 疾病史 JSON 数组 |
| allergies | TEXT | 过敏史 JSON 数组 |
| diet_preferences | TEXT | 饮食偏好 |
| health_goal | TEXT | 健康目标 |
| created_at | INTEGER | 创建时间 |
| updated_at | INTEGER | 更新时间 |

### body_records — 身体数据

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| weight | REAL | 体重 kg |
| body_fat | REAL | 体脂率 % |
| bmi | REAL | BMI |
| note | TEXT | 备注 |
| timestamp | INTEGER | 记录时间 |

### diet_records — 饮食记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| food | TEXT | 食物描述 |
| calories | REAL | 热量 kcal |
| protein | REAL | 蛋白质 g |
| carbs | REAL | 碳水化合物 g |
| fat | REAL | 脂肪 g |
| meal_type | TEXT | 餐次：breakfast/lunch/dinner/snack |
| note | TEXT | 备注 |
| timestamp | INTEGER | 记录时间 |

### symptom_records — 症状记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| symptom | TEXT | 症状描述 |
| severity | INTEGER | 严重程度 1-5 |
| trigger | TEXT | 可能诱因 |
| related_type | TEXT | 关联类型：diet/exercise/null |
| related_id | INTEGER | 关联记录 ID |
| note | TEXT | 备注 |
| timestamp | INTEGER | 记录时间 |

### exercise_records — 运动记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| exercise_type | TEXT | 运动类型 |
| duration | REAL | 时长 分钟 |
| calories_burned | REAL | 消耗热量 kcal |
| intensity | TEXT | 强度：low/medium/high |
| note | TEXT | 备注 |
| timestamp | INTEGER | 记录时间 |

### sleep_records — 睡眠记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| duration | REAL | 睡眠时长 小时 |
| quality | INTEGER | 睡眠质量 1-5 |
| bed_time | INTEGER | 入睡时间戳 |
| wake_time | INTEGER | 起床时间戳 |
| note | TEXT | 备注 |
| timestamp | INTEGER | 记录时间 |

### water_records — 饮水记录

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| amount | REAL | 饮水量 |
| unit | TEXT | 单位 |
| note | TEXT | 备注 |
| timestamp | INTEGER | 记录时间 |

### messages — 对话历史（不变）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | INTEGER PK | 自增 |
| user_id | TEXT | 用户 ID |
| role | TEXT | user/assistant |
| content | TEXT | 消息文本 |
| metadata | TEXT | JSON，只存图片 URL/格式元信息，不存 base64 |
| timestamp | INTEGER | 消息时间 |

## 改动清单

| 文件 | 改动 |
|------|------|
| `src/store/schema.ts` | 废弃 healthRecords，新增 7 张表的 Drizzle 定义 |
| `src/store/db.ts` | 注册新 schema |
| `src/store/body.ts` | 新建：body_records 存储操作 |
| `src/store/diet.ts` | 新建：diet_records 存储操作 + analyze 聚合 |
| `src/store/symptom.ts` | 新建：symptom_records 存储操作 |
| `src/store/exercise.ts` | 新建：exercise_records 存储操作 |
| `src/store/sleep.ts` | 新建：sleep_records 存储操作 |
| `src/store/water.ts` | 新建：water_records 存储操作 |
| `src/store/health.ts` | 废弃（拆分到上述 6 个文件） |
| `src/store/profile.ts` | 去掉 weight 字段相关逻辑 |
| `src/store/index.ts` | Store 类替换 health 为 6 个独立 store；initTables 全部重建 |
| `src/agent/tools.ts` | 拆分为多个工具：record_diet、record_body、record_symptom 等；新增 record_symptom 工具；analyze_diet 改查 diet_records |
| `src/agent/prompt.ts` | 更新工具说明，增加症状记录引导 |
| `src/agent/factory.ts` | toolList 更新；convertMessages 移除对 healthRecords 的依赖 |
| `src/channels/handler.ts` | metadata 不存 base64 |

## 迁移策略

由于项目早期、用户量小，采用**直接重建**策略：
- 删除旧数据库文件
- initTables 中创建所有新表
- 不做旧表数据迁移

## 不做什么

- 不做旧数据迁移（用户量小，重新开始）
- 不做 diseases/allergies 拆关联表（保持 JSON）
- 不做前端图表
