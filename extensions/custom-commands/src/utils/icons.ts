import { Icon } from "@vicinae/api";

function isCustomIcon(value: string): boolean {
  return (
    value.includes("://") ||
    value.startsWith("/") ||
    value.startsWith("~/") ||
    value.startsWith("./") ||
    value.startsWith("~") ||
    /\.(png|jpe?g|svg|webp|ico|gif|bmp)$/i.test(value) ||
    value.includes("/")
  );
}

export function getIcon(value?: string): Icon | string {
  if (!value) return Icon.Terminal;
  if (isCustomIcon(value)) return value;
  const anyIcon = (Icon as unknown as Record<string, Icon>)[value];
  if (anyIcon) return anyIcon;
  return Icon.Terminal;
}
