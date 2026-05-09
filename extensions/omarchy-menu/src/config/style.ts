import { Icon } from "@vicinae/api";
import { MenuItem } from "./types";
import { open_in_editor } from "../helpers/actions";
import { themes_list, fonts_list } from "../helpers/menu-generators";

export const theme: MenuItem = {
  id: "theme",
  name: "Theme",
  icon: "󰸌",
  items: themes_list(),
};

export const unlock: MenuItem = {
  id: "unlock",
  name: "Unlock",
  icon: "󰟵",
  items: themes_list(true),
};

export const style: MenuItem = {
  id: "style",
  name: "Style",
  icon: Icon.Wand,
  items: [
    theme,
    unlock,
    { id: "font", name: "Font", icon: "", items: fonts_list() },
    {
      id: "background",
      name: "Background",
      icon: "",
      command: "omarchy-theme-bg-next",
    },
    {
      id: "hyprland",
      name: "Hyprland",
      icon: "",
      command: open_in_editor("~/.config/hypr/looknfeel.conf"),
    },
    {
      id: "screensaver",
      name: "Screensaver",
      icon: "󱄄",
      command: open_in_editor("~/.config/omarchy/branding/screensaver.txt"),
    },
    {
      id: "about",
      name: "About",
      icon: "",
      command: open_in_editor("~/.config/omarchy/branding/about.txt"),
    },
  ],
};
