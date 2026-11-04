import { Icon, List } from "@vicinae/api";
import { unsupportedPlatformReason } from "../lib/platform";

/** Shown in place of the vault gate where `Keysmith.conf` cannot exist. */
export function UnsupportedPlatform() {
  return (
    <List>
      <List.EmptyView
        icon={Icon.Warning}
        title="Unsupported platform"
        description={
          unsupportedPlatformReason() ?? "Keysmith only runs on Linux with KDE Keysmith installed."
        }
      />
    </List>
  );
}
