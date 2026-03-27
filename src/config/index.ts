// src/config/index.ts

import { config as dotenvConfig } from 'dotenv';
import { configSchema, type ValidatedConfig, type ConfigField } from './schema.js';

// 加载环境变量
dotenvConfig();

/**
 * 校验单个配置字段
 */
function validateField(
  name: string,
  field: ConfigField,
  envValue: string | undefined
): { value?: unknown; error?: string } {
  // 1. 检查必填
  if (envValue === undefined || envValue === '') {
    if (field.required) {
      return { error: `${name}: Required but not set (env: ${field.envVar})` };
    }
    return { value: field.default };
  }

  // 2. 类型转换
  let converted: unknown;
  switch (field.type) {
    case 'number': {
      converted = parseInt(envValue, 10);
      if (isNaN(converted as number)) {
        return { error: `${name}: Must be a number, got "${envValue}"` };
      }
      break;
    }
    case 'boolean':
      converted = envValue === 'true' || envValue === '1';
      break;
    default:
      converted = envValue;
  }

  // 3. 枚举校验
  if (field.enum && !field.enum.includes(converted as string)) {
    return {
      error: `${name}: Must be one of [${field.enum.join(', ')}], got "${converted}"`,
    };
  }

  return { value: converted };
}

/**
 * 加载并校验配置
 */
function loadConfig(): ValidatedConfig {
  const errors: string[] = [];
  const config: Record<string, Record<string, unknown>> = {};

  for (const [section, fields] of Object.entries(configSchema)) {
    config[section] = {};
    for (const [fieldName, field] of Object.entries(fields)) {
      const envValue = process.env[field.envVar];
      const result = validateField(fieldName, field, envValue);

      if (result.error) {
        errors.push(result.error);
      } else {
        config[section][fieldName] = result.value;
      }
    }
  }

  if (errors.length > 0) {
    console.error('\n[config] Validation errors:\n');
    errors.forEach((e) => console.error(`  ❌ ${e}`));
    console.error('\nPlease check your .env file or environment variables.\n');
    process.exit(1);
  }

  return config as unknown as ValidatedConfig;
}

// 导出校验后的配置（单例）
export const config = loadConfig();

// 向后兼容的具名导出
export const SERVER_CONFIG = {
  PORT: config.server.port,
  WORKSPACE_PATH: config.server.workspacePath,
  PUBLIC_PATH: process.cwd() + '/public',
} as const;

export const LLM_CONFIG = {
  PROVIDER: config.llm.provider,
  MODEL: config.llm.model,
} as const;

export const LOG_CONFIG = {
  LEVEL: config.log.level,
  ENV: config.log.env,
} as const;

// MIME 类型映射
export const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
} as const;
