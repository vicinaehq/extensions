/**
 * Creates stable ids for persisted user data.
 */
export function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}
