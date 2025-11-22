import { Icon } from "@vicinae/api";
import { present_terminal } from "~/helpers/actions";
import { MenuItem } from "./types";

export const update: MenuItem = {
  id: "update",
  name: "Update",
  icon: Icon.Download,
  items: [
    {
      id: "omarchy",
      name: "Omarchy",
      icon: "󰣇",
      command: present_terminal("omarchy-update"),
    },
    {
      id: "config",
      name: "Config",
      icon: "󰣇",
      items: [
        {
          id: "hyprland",
          name: "Hyprland",
          icon: "",
          command: present_terminal("omarchy-refresh-hyprland"),
        },
        {
          id: "hypridle",
          name: "Hypridle",
          icon: "",
          command: present_terminal("omarchy-refresh-hypridle"),
        },
        {
          id: "hyprlock",
          name: "Hyprlock",
          icon: "",
          command: present_terminal("omarchy-refresh-hyprlock"),
        },
        {
          id: "hyprsunset",
          name: "Hyprsunset",
          icon: "",
          command: present_terminal("omarchy-refresh-hyprsunset"),
        },
        {
          id: "plymouth",
          name: "Plymouth",
          icon: "󱣴",
          command: present_terminal("omarchy-refresh-plymouth"),
        },
        {
          id: "swayosd",
          name: "Swayosd",
          icon: "",
          command: present_terminal("omarchy-refresh-swayosd"),
        },
        {
          id: "walker",
          name: "Walker",
          icon: "󰌧",
          command: present_terminal("omarchy-refresh-walker"),
        },
        {
          id: "waybar",
          name: "Waybar",
          icon: "󰍜",
          command: present_terminal("omarchy-refresh-waybar"),
        },
      ],
    },
    {
      id: "themes",
      name: "Themes",
      icon: "󰣇",
      command: present_terminal("omarchy-theme-update"),
    },
    {
      id: "process",
      name: "Process",
      icon: "󰣇",
      items: [
        {
          id: "hypridle",
          name: "Hypridle",
          icon: "",
          command: "omarchy-restart-hypridle",
        },
        {
          id: "hyprsunset",
          name: "Hyprsunset",
          icon: "",
          command: "omarchy-restart-hyprsunset",
        },
        {
          id: "swayosd",
          name: "Swayosd",
          icon: "",
          command: "omarchy-restart-swayosd",
        },
        {
          id: "walker",
          name: "Walker",
          icon: "󰌧",
          command: "omarchy-restart-walker",
        },
        {
          id: "waybar",
          name: "Waybar",
          icon: "󰍜",
          command: "omarchy-restart-waybar",
        },
      ],
    },
    {
      id: "hardware",
      name: "Hardware",
      icon: "󰣇",
      items: [
        {
          id: "audio",
          name: "Audio",
          icon: "",
          command: present_terminal("omarchy-restart-pipewire"),
        },
        {
          id: "wifi",
          name: "Wi-Fi",
          icon: "󱚾",
          command: present_terminal("omarchy-restart-wifi"),
        },
        {
          id: "bluetooth",
          name: "Bluetooth",
          icon: "󰂯",
          command: present_terminal("omarchy-restart-bluetooth"),
        },
      ],
    },
    {
      id: "firmware",
      name: "Firmware",
      icon: "󰣇",
      command: present_terminal("omarchy-update-firmware"),
    },
    {
      id: "timezone",
      name: "Timezone",
      icon: "󰣇",
      command: present_terminal("omarchy-tz-select"),
    },
    {
      id: "time",
      name: "Time",
      icon: "󰣇",
      command: present_terminal("omarchy-update-time"),
    },
    {
      id: "password",
      name: "Password",
      icon: "󰣇",
      items: [
        {
          id: "drive-encryption",
          name: "Drive Encryption",
          icon: "",
          command: present_terminal("omarchy-drive-set-password"),
        },
        {
          id: "user",
          name: "User",
          icon: "",
          command: present_terminal("passwd"),
        },
      ],
    },
  ],
};
