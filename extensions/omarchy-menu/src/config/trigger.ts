import { Icon } from "@vicinae/api";
import { terminal, present_terminal } from "~/helpers/actions";
import { MenuItem } from "./types";

export const capture: MenuItem = {
  id: "capture",
  name: "Capture",
  icon: "",
  items: [
    {
      id: "screenshot",
      name: "Screenshot",
      icon: "",
      command: "omarchy-cmd-screenshot",
    },
    {
      id: "screenrecord",
      name: "Screenrecord",
      icon: " ",
      items: [
        {
          id: "with-no-audio",
          name: "With no audio",
          command: "omarchy-cmd-screenrecord",
          icon: " ",
        },
        {
          id: "with-desktop-audio",
          name: "With desktop audio",
          icon: " ",
          command: "omarchy-cmd-screenrecord --with-desktop-audio",
        },
        {
          id: "with-desktop-mic-audio",
          name: "With desktop + microphone audio",
          icon: " ",
          command:
            "omarchy-cmd-screenrecord --with-desktop-audio --with-microphone-audio",
        },
        {
          id: "with-desktop-mic-webcam-audio",
          name: "With desktop + microphone audio + webcam",
          icon: " ",
          command:
            "omarchy-cmd-screenrecord --with-desktop-audio --with-microphone-audio --with-webcam",
        },
      ],
    },
    {
      id: "color",
      name: "Color",
      icon: "󰃉",
      command: "pkill hyprpicker || hyprpicker -a",
    },
  ],
};

export const share: MenuItem = {
  id: "share",
  name: "Share",
  icon: "",
  items: [
    {
      id: "clipboard",
      name: "Clipboard",
      icon: "",
      command: terminal('bash -c "omarchy-cmd-share clipboard"'),
    },
    {
      id: "file",
      name: "File",
      icon: "",
      command: terminal('bash -c "omarchy-cmd-share file"'),
    },
    {
      id: "folder",
      name: "Folder",
      icon: "",
      command: terminal('bash -c "omarchy-cmd-share folder"'),
    },
  ],
};

export const toggle: MenuItem = {
  id: "toggle",
  name: "Toggle",
  icon: "󰔎",
  items: [
    {
      id: "screensaver",
      name: "Screensaver",
      icon: "󱄄",
      command: "omarchy-toggle-screensaver",
    },
    {
      id: "nightlight",
      name: "Nightlight",
      icon: "󰔎",
      command: "omarchy-toggle-nightlight",
    },
    {
      id: "idle-lock",
      name: "Idle Lock",
      icon: "󱫖",
      command: "omarchy-toggle-idle",
    },
    {
      id: "top-bar",
      name: "Top Bar",
      icon: "󰍜",
      command: "omarchy-toggle-waybar",
    },
    {
      id: "workspace-layout",
      name: "Workspace Layout",
      icon: "󱂬",
      command: "omarchy-hyprland-workspace-layout-toggle",
    },
    {
      id: "window-gaps",
      name: "Window Gaps",
      icon: "",
      command: "omarchy-hyprland-window-gaps-toggle",
    },
    {
      id: "scaling",
      name: "Display Scaling",
      icon: "󰍹",
      command: "omarchy-hyprland-monitor-scaling-cycle",
    },
  ],
};

export const trigger: MenuItem = {
  id: "trigger",
  name: "Trigger",
  icon: Icon.Rocket,
  items: [
    capture,
    share,
    toggle,
    {
      id: "hardware",
      name: "Hardware",
      icon: "",
      items: [
        {
          id: "hybrid-gpu",
          name: "Hybrid GPU",
          icon: "",
          command: present_terminal("omarchy-toggle-hybrid-gpu"),
        },
      ],
    },
  ],
};
