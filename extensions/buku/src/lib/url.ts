export function isHttpUrl(text: string): boolean {
  if (!/^https?:\/\//i.test(text)) return false;

  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}
