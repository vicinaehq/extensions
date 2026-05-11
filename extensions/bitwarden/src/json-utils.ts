export function safeJsonParse<T>(
  raw: string,
  requiredFields: {
    strings?: (keyof T & string)[];
    numbers?: (keyof T & string)[];
  } = {},
): T | null {
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof obj !== 'object' || obj === null) return null;
  const record = obj as Record<string, unknown>;
  for (const field of requiredFields.strings ?? []) {
    if (typeof record[field] !== 'string') return null;
  }
  for (const field of requiredFields.numbers ?? []) {
    if (typeof record[field] !== 'number') return null;
  }
  return record as unknown as T;
}
