export function getNameFromUuid(uuid: string): string {
  const match = uuid.match(/^([a-zA-Z0-9_-]+)@/);
  return match ? match[1] : uuid.split("@")[0];
}
