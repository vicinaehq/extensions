import { Icon } from "@vicinae/api";
import { MenuItem } from "./types";

export const system: MenuItem = {
  id: "system",
  name: "System",
  icon: Icon.Power,
  items: [
    {
      id: "screensaver",
      name: "Screensaver",
      icon: "󱄄",
      command: "omarchy-launch-screensaver force",
    },
    { 
			id: "lock",
			name: "Lock",
			icon: "",
			command: "omarchy-system-lock"
		},
    {
      id: "suspend",
      name: "Suspend",
      icon: "󰒲",
      command: "systemctl suspend",
    },
    {
      id: "restart",
      name: "Restart",
      icon: "󰜉",
      command: "omarchy-system-reboot",
    },
    {
      id: "shutdown",
      name: "Shutdown",
      icon: "󰐥",
      command:
        "omarchy-system-shutdown",
    },
    {
      id: "hibernate",
      name: "Hibernate",
      icon: "󰤁",
      command:
        "systemctl hibernate",
    },
    {
      id: "logout",
      name: "Logout",
      icon: "󰜉",
      command:
        "omarchy-system-logout",
    }
  ],
};
