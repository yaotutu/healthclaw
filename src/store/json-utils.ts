/**
 * 安全解析 JSON 字符串
 * 当输入为 null 或解析失败时返回 fallback 值，避免 JSON.parse 导致的运行时崩溃
 * 用于数据库中 JSON 文本字段（diseases、allergies、tags、triggers）的反序列化
 * @param text 待解析的 JSON 字符串，可能为 null
 * @param fallback 解析失败时的默认返回值
 * @returns 解析结果或 fallback
 */
export function safeJsonParse<T>(text: string | null, fallback: T): T {
  if (text === null || text === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

/**
 * 安全序列化为 JSON 字符串
 * 处理循环引用等边界情况，避免 JSON.stringify 抛出异常
 * @param value 待序列化的值
 * @returns JSON 字符串，序列化失败时返回 "null"
 */
export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return 'null';
  }
}
