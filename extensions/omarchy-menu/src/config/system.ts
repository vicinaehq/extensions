import { Icon } from "@vicinae/api";
import { MenuItem } from "./types";

export const system: MenuItem = {
  id: "system",
  name: "System",
  icon: Icon.Power,
  items: [
    { id: "lock", name: "Lock", icon: "", command: "omarchy-lock-screen" },
    {
      id: "screensaver",
      name: "Screensaver",
      icon: "",
      command: "omarchy-launch-screensaver force",
    },
    {
      id: "suspend",
      name: "Suspend",
      icon: "",
      command: "systemctl suspend",
    },
    {
      id: "restart",
      name: "Restart",
      icon: "",
      command: "omarchy-state clear re*-required && systemctl reboot --no-wall",
    },
    {
      id: "shutdown",
      name: "Shutdown",
      icon: "",
      command:
        "omarchy-state clear re*-required && systemctl poweroff --no-wall",
    },
  ],
};
