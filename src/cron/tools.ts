/**
 * 定时任务的 Agent 工具集
 * 提供 schedule_cron、list_cron_jobs、remove_cron_job 三个工具
 * 允许 LLM 在对话中为用户创建、查看和删除定时任务
 */
import { Type } from '@sinclair/typebox';
import type { AgentTool } from '@mariozechner/pi-agent-core';
import type { CronService } from './service';
import type { CronSchedule } from './types';

// ==================== 工具参数 Schema ====================

/**
 * 创建定时任务的参数 Schema
 * 支持三种调度模式：everySeconds（间隔）、cronExpr（cron表达式）、at（一次性）
 */
const ScheduleCronParamsSchema = Type.Object({
  message: Type.String({ description: '提醒消息内容或任务描述，发送给 Agent 执行' }),
  everySeconds: Type.Optional(Type.Number({ description: '间隔秒数，用于周期性任务（如 3600 = 每小时）' })),
  cronExpr: Type.Optional(Type.String({ description: 'cron 表达式，如 "0 9 * * *" 表示每天9点' })),
  at: Type.Optional(Type.String({ description: '一次性执行时间，ISO 格式，如 "2026-04-01T09:00:00"' })),
  tz: Type.Optional(Type.String({ description: '时区（如 "Asia/Shanghai"），仅 cron 表达式可用' })),
});

/** 查看定时任务的参数 Schema（无参数） */
const ListCronJobsParamsSchema = Type.Object({});

/**
 * 删除定时任务的参数 Schema
 */
const RemoveCronJobParamsSchema = Type.Object({
  jobId: Type.String({ description: '要删除的定时任务 ID' }),
});

// ==================== 工具类型 ====================

type ScheduleCronParams = typeof ScheduleCronParamsSchema;
type ListCronJobsParams = typeof ListCronJobsParamsSchema;
type RemoveCronJobParams = typeof RemoveCronJobParamsSchema;

// ==================== 辅助函数 ====================

/**
 * 格式化调度配置为可读的中文描述
 * @param schedule 调度配置
 * @returns 可读的调度描述
 */
function formatSchedule(schedule: CronSchedule): string {
  switch (schedule.kind) {
    case 'every': {
      const seconds = Math.round((schedule.everyMs ?? 0) / 1000);
      if (seconds < 60) return `每${seconds}秒`;
      if (seconds < 3600) return `每${Math.round(seconds / 60)}分钟`;
      if (seconds < 86400) return `每${Math.round(seconds / 3600)}小时`;
      return `每${Math.round(seconds / 86400)}天`;
    }
    case 'cron':
      return `cron: ${schedule.expr}`;
    case 'at':
      return `一次性: ${schedule.atMs ? new Date(schedule.atMs).toLocaleString('zh-CN') : '未设置'}`;
    default:
      return '未知';
  }
}

// ==================== 工具创建函数 ====================

/**
 * 创建定时任务相关的 Agent 工具
 * @param cronService CronService 实例
 * @param userId 当前用户 ID
 * @param channel 当前通道名称
 * @returns 包含 scheduleCron、listCronJobs、removeCronJob 的对象
 */
export const createCronTools = (
  cronService: CronService,
  userId: string,
  channel: string
) => {
  /**
   * 创建定时任务工具
   * LLM 可以为用户设置周期性提醒、定时检查或一次性提醒
   * 递归保护：在 cron 执行上下文中不能创建新任务
   */
  const scheduleCron: AgentTool<ScheduleCronParams> = {
    name: 'schedule_cron',
    label: '创建定时任务',
    description: '创建定时提醒或周期性健康检查任务。支持三种模式：\n' +
      '- everySeconds: 周期性（如 3600=每小时, 86400=每天）\n' +
      '- cronExpr: cron表达式（如 "0 9 * * *"=每天9点）\n' +
      '- at: 一次性（ISO时间，如 "2026-04-01T09:00:00"）',
    parameters: ScheduleCronParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      // 递归保护：cron 任务中不能创建新 cron 任务
      if (cronService.isCronContext) {
        return {
          content: [{ type: 'text', text: '错误：不能在定时任务执行中创建新的定时任务' }],
          details: {},
        };
      }

      // 根据 LLM 提供的参数确定调度类型
      let schedule: CronSchedule;
      let name: string;
      let deleteAfterRun = false;

      if (params.everySeconds) {
        // 间隔模式
        schedule = { kind: 'every', everyMs: params.everySeconds * 1000 };
        name = formatSchedule(schedule);
      } else if (params.cronExpr) {
        // cron 表达式模式
        schedule = { kind: 'cron', expr: params.cronExpr, tz: params.tz };
        name = `cron: ${params.cronExpr}`;
      } else if (params.at) {
        // 一次性模式
        const atMs = new Date(params.at).getTime();
        if (isNaN(atMs)) {
          return {
            content: [{ type: 'text', text: `错误：无效的时间格式 "${params.at}"，请使用 ISO 格式如 "2026-04-01T09:00:00"` }],
            details: {},
          };
        }
        schedule = { kind: 'at', atMs };
        name = `一次性: ${params.at}`;
        deleteAfterRun = true;
      } else {
        return {
          content: [{ type: 'text', text: '错误：请指定调度方式（everySeconds、cronExpr 或 at）' }],
          details: {},
        };
      }

      // 创建任务
      const job = cronService.addJob(name, schedule, {
        message: params.message,
        deliver: true,
        channel,
        to: userId,
      }, deleteAfterRun);

      return {
        content: [{ type: 'text', text: `已创建定时任务 "${name}"（ID: ${job.id}），任务内容: ${params.message}` }],
        details: { jobId: job.id },
      };
    },
  };

  /**
   * 查看定时任务工具
   * 列出当前用户的所有活跃定时任务
   */
  const listCronJobs: AgentTool<ListCronJobsParams> = {
    name: 'list_cron_jobs',
    label: '查看定时任务',
    description: '查看当前用户的所有定时任务',
    parameters: ListCronJobsParamsSchema,
    execute: async (_toolCallId, _params, _signal) => {
      const jobs = cronService.listJobsByUser(userId);

      if (jobs.length === 0) {
        return {
          content: [{ type: 'text', text: '当前没有定时任务' }],
          details: {},
        };
      }

      const lines = jobs.map(j => {
        const scheduleDesc = formatSchedule(j.schedule);
        const nextRun = j.state.nextRunAtMs
          ? new Date(j.state.nextRunAtMs).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })
          : '无';
        return `- [${j.id}] ${scheduleDesc}: ${j.payload.message}（下次执行: ${nextRun}）`;
      });

      return {
        content: [{ type: 'text', text: `当前有 ${jobs.length} 个定时任务：\n${lines.join('\n')}` }],
        details: { count: jobs.length },
      };
    },
  };

  /**
   * 删除定时任务工具
   * 删除指定 ID 的定时任务（验证任务属于当前用户）
   */
  const removeCronJob: AgentTool<RemoveCronJobParams> = {
    name: 'remove_cron_job',
    label: '删除定时任务',
    description: '删除一个指定的定时任务',
    parameters: RemoveCronJobParamsSchema,
    execute: async (_toolCallId, params, _signal) => {
      const job = cronService.getJob(params.jobId);
      // 验证任务属于当前用户
      if (!job || job.payload.to !== userId) {
        return {
          content: [{ type: 'text', text: `未找到任务 ID: ${params.jobId}` }],
          details: {},
        };
      }

      const removed = cronService.removeJob(params.jobId);
      return {
        content: [{ type: 'text', text: removed ? `已删除定时任务 "${job.name}"（${params.jobId}）` : `删除失败: ${params.jobId}` }],
        details: { removed, jobId: params.jobId },
      };
    },
  };

  return { scheduleCron, listCronJobs, removeCronJob };
};
