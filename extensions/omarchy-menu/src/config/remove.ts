import { Icon } from "@vicinae/api";
import { terminal, present_terminal } from "~/helpers/actions";
import { MenuItem } from "./types";

export const remove: MenuItem = {
  id: "remove",
  name: "Remove",
  icon: Icon.Undo,
  items: [
    {
      id: "package",
      name: "Package",
      icon: "󰣇",
      command: terminal("omarchy-pkg-remove"),
    },
    {
      id: "web",
      name: "Web",
      icon: "󰣇",
      command: present_terminal("omarchy-webapp-remove"),
    },
    {
      id: "tui",
      name: "TUI",
      icon: "󰣇",
      command: present_terminal("omarchy-tui-remove"),
    },
    {
      id: "theme",
      name: "Theme",
      icon: "󰣇",
      command: present_terminal("omarchy-theme-remove"),
    },
    {
      id: "windows",
      name: "Windows",
      icon: "󰣇",
      command: present_terminal("omarchy-windows-vm remove"),
    },
    {
      id: "fingerprint",
      name: "Fingerprint",
      icon: "󰣇",
      command: present_terminal("omarchy-setup-fingerprint --remove"),
    },
    {
      id: "fido2",
      name: "Fido2",
      icon: "󰣇",
      command: present_terminal("omarchy-setup-fido2 --remove"),
    },
  ],
};
