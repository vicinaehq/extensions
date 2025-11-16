import { Icon } from "@vicinae/api";
import { MenuItem } from "./types";

export const learn: MenuItem = {
  id: "learn",
  name: "Learn",
  icon: Icon.Book,
  items: [
    {
      id: "keybindings",
      name: "Keybindings",
      icon: "",
      command: "omarchy-menu-keybindings",
    },
    {
      id: "omarchy",
      name: "Omarchy",
      icon: "",
      command:
        'omarchy-launch-webapp "https://learn.omacom.io/2/the-omarchy-manual"',
    },
    {
      id: "hyprland",
      name: "Hyprland",
      icon: "",
      command: 'omarchy-launch-webapp "https://wiki.hypr.land/"',
    },
    {
      id: "arch",
      name: "Arch",
      icon: "󰣇",
      command:
        'omarchy-launch-webapp "https://wiki.archlinux.org/title/Main_page"',
    },
    {
      id: "neovim",
      name: "Neovim",
      icon: "",
      command: 'omarchy-launch-webapp "https://www.lazyvim.org/keymaps"',
    },
    {
      id: "bash",
      name: "Bash",
      icon: "󱆃",
      command: 'omarchy-launch-webapp "https://devhints.io/bash"',
    },
  ],
};
