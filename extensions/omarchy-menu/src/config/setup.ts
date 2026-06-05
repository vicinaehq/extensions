import { Icon } from "@vicinae/api";
import { MenuItem } from "./types";
import { open_in_editor, present_terminal } from "../helpers/actions";
import {
  browsers_list,
  editors_list,
  powerprofiles_list,
  terminals_list,
} from "../helpers/menu-generators";

export const setup: MenuItem = {
  id: "setup",
  name: "Setup",
  icon: Icon.Cog,
  items: [
    {
      id: "audio",
      name: "Audio",
      icon: "",
      command: "omarchy-launch-audio",
    },
    {
      id: "wifi",
      name: "Wifi",
      icon: "",
      command: "omarchy-launch-wifi",
    },
    {
      id: "bluetooth",
      name: "Bluetooth",
      icon: "󰂯",
      command: "omarchy-launch-bluetooth",
    },
    {
      id: "power",
      name: "Power",
      icon: "󱐋",
      items: powerprofiles_list(),
    },
    {
      id: "monitors",
      name: "Monitors",
      icon: "󰍹",
      command: open_in_editor("~/.config/hypr/monitors.conf"),
    },
    {
      id: "keybindings",
      name: "Keybindings",
      icon: "",
      command: open_in_editor("~/.config/hypr/bindings.conf"),
    },
    {
      id: "input",
      name: "Input",
      icon: "",
      command: open_in_editor("~/.config/hypr/input.conf"),
    },
    {
      id: "defaults",
      name: "Defaults",
      icon: "",
      items: [
        {
          id: "browser",
          name: "Browser",
          icon: "",
          items: browsers_list(),
        },
        {
          id: "terminal",
          name: "Terminal",
          icon: "",
          items: terminals_list(),
        },
        {
          id: "editor",
          name: "Editor",
          icon: "",
          items: editors_list(),
        },
      ],
    },
    {
      id: "dns",
      name: "DNS",
      icon: "󰱔",
      command: present_terminal("omarchy-setup-dns"),
    },
    {
      id: "security",
      name: "Security",
      icon: "",
      items: [
        {
          id: "fingerprint",
          name: "Fingerprint",
          icon: "󰈷",
          command: present_terminal("omarchy-setup-fingerprint"),
        },
        {
          id: "fido-2",
          name: "Fido2",
          icon: "",
          command: present_terminal("omarchy-setup-fido2"),
        },
      ],
    },
    {
      id: "config",
      name: "Config",
      icon: "",
      items: [
        {
          id: "defaults",
          name: "Defaults",
          icon: "",
          command: open_in_editor("~/.config/uwsm/default"),
        },
        {
          id: "hyperland",
          name: "Hyprland",
          icon: "",
          command: open_in_editor("~/.config/hypr/hyprland.conf"),
        },
        {
          id: "hypridle",
          name: "Hypridle",
          icon: "",
          command: open_in_editor(
            "~/.config/hypr/hypridle.conf && omarchy-restart-hypridle",
          ),
        },
        {
          id: "hyprlock",
          name: "Hyprlock",
          icon: "",
          command: open_in_editor("~/.config/hypr/hyprlock.conf"),
        },
        {
          id: "hyprsunset",
          name: "Hyprsunset",
          icon: "",
          command: open_in_editor(
            "~/.config/hypr/hyprsunset.conf && omarchy-restart-hyprsunset",
          ),
        },
        {
          id: "swayosd",
          name: "Swayosd",
          icon: "",
          command: open_in_editor(
            "~/.config/swayosd/config.toml && omarchy-restart-swayosd",
          ),
        },
        {
          id: "walker",
          name: "Walker",
          icon: "󰌧",
          command: open_in_editor(
            "~/.config/walker/config.toml && omarchy-restart-walker",
          ),
        },
        {
          id: "waybar",
          name: "Waybar",
          icon: "󰍜",
          command: open_in_editor(
            "~/.config/waybar/config.jsonc && omarchy-restart-waybar",
          ),
        },
        {
          id: "x-compose",
          name: "XCompose",
          icon: "󰞅",
          command: open_in_editor("~/.XCompose && omarchy-restart-xcompose"),
        },
      ],
    },
  ],
};
