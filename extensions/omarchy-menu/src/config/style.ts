import { Icon } from "@vicinae/api";
import { open_in_editor } from "~/helpers/actions";
import { themes_list, fonts_list } from "~/helpers/menu-generators";
import { MenuItem } from "./types";

export const style: MenuItem = {
  id: "style",
  name: "Style",
  icon: Icon.Wand,
  items: [
    { id: "theme", name: "Theme", icon: "󰸌", items: themes_list() },
    { id: "font", name: "Font", icon: "", items: fonts_list() },
    {
      id: "background",
      name: "Background",
      icon: "",
      command: "omarchy-theme-bg-next",
    },
    {
      id: "hyperland",
      name: "Hyperland",
      icon: "󱄄",
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
