import { Icon } from "@vicinae/api";
import { terminal } from "~/helpers/actions";
import { MenuItem } from "./types";

export const trigger: MenuItem = {
  id: "trigger",
  name: "Trigger",
  icon: Icon.Rocket,
  items: [
    {
      id: "capture",
      name: "Capture",
      icon: "",
      items: [
        {
          id: "screenshot",
          name: "Screenshot",
          icon: "",
          items: [
            {
              id: "editing",
              name: "Snap with Editing",
              icon: "",
              command: "omarchy-cmd-screenshot smart",
            },
            {
              id: "clipboard",
              name: "Straight to Clipboard",
              icon: "",
              command: "omarchy-cmd-screenshot smart clipboard",
            },
          ],
        },
        {
          id: "screenrecord",
          name: "Screenrecord",
          icon: "",
          items: [
            {
              id: "wit-desktop-audio",
              name: "With desktop audio",
              icon: "",
              command: "omarchy-cmd-screenrecord --with-desktop-audio",
            },
            {
              id: "with-desktop-mic-audio",
              name: "With desktop + microphone audio",
              icon: "",
              command:
                "omarchy-cmd-screenrecord --with-desktop-audio --with-microphone-audio",
            },
            {
              id: "with-desktop-mic-webcam-audio",
              name: "With desktop + microphone audio + webcam",
              icon: "",
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
    },
    {
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
    },
    {
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
      ],
    },
  ],
};
