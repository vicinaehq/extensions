export function generateUniqueId(prefix: string = 'id'): string {
  // example output: id_1701300000000_5g7h8j9k
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}