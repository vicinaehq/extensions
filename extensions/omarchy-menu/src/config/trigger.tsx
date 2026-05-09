import {
  Action,
  ActionPanel,
  closeMainWindow,
  Form,
  Icon,
  open,
  runInTerminal,
} from "@vicinae/api";
import { MenuItem } from "./types";
import { setTimeout as delay } from "node:timers/promises";
import { terminal, present_terminal } from "../helpers/actions";
import { useState } from "react";
import { spawn } from "child_process";

export const capture: MenuItem = {
  id: "capture",
  name: "Capture",
  icon: "",
  items: [
    {
      id: "screenshot",
      name: "Screenshot",
      icon: "",
      command: "omarchy-capture-screenshot",
    },
    {
      id: "screenrecord",
      name: "Screenrecord",
      icon: "",
      items: [
        {
          id: "with-no-audio",
          name: "With no audio",
          command: "omarchy-capture-screenrecording",
          icon: "",
        },
        {
          id: "with-desktop-audio",
          name: "With desktop audio",
          icon: "",
          command: "omarchy-capture-screenrecording --with-desktop-audio",
        },
        {
          id: "with-desktop-mic-audio",
          name: "With desktop + microphone audio",
          icon: "",
          command:
            "omarchy-capture-screenrecording --with-desktop-audio --with-microphone-audio",
        },
        {
          id: "with-desktop-mic-webcam-audio",
          name: "With desktop + microphone audio + webcam",
          icon: "",
          command:
            "omarchy-capture-screenrecording --with-desktop-audio --with-microphone-audio --with-webcam",
        },
      ],
    },
    {
      id: "text-extraction",
      name: "Text Extraction",
      icon: "󰴑",
      command: "omarchy-capture-text-extraction",
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
      command: "omarchy-menu-share clipboard",
    },
    {
      id: "file",
      name: "File",
      icon: "",
      command: terminal('bash -c "omarchy-menu-share file"'),
    },
    {
      id: "folder",
      name: "Folder",
      icon: "",
      command: terminal('bash -c "omarchy-menu-share folder"'),
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
      id: "notifications",
      name: "Notifications",
      icon: "󰂛",
      command: "omarchy-toggle-notification-silencing",
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
      id: "ratio",
      name: "Window Ratio",
      icon: "",
      command: "omarchy-hyprland-window-single-square-aspect-toggle",
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
    {
      id: "direct-boot",
      name: "Direct Boot",
      icon: "",
      command: present_terminal("omarchy-config-direct-boot"),
    },
    {
      id: "passwordless-sudo",
      name: "Passwordless Sudo",
      icon: "󰟵",
      command: present_terminal("omarchy-sudo-passwordless"),
    },
  ],
};

export const trigger: MenuItem = {
  id: "trigger",
  name: "Trigger",
  icon: Icon.Rocket,
  items: [
    {
      id: "reminder",
      name: "Reminder",
      icon: "󰔛",
      items: [
        {
          id: "set-timer",
          name: "Set one",
          icon: "󰔛",
          form: () => {
            const [duration, setDuration] = useState(0);
            const [message, setMessage] = useState("");
            return (
              <Form
                actions={
                  <ActionPanel>
                    <Action.SubmitForm
                      onSubmit={async () => {
                        if (duration <= 0 || !message) return;
                        await closeMainWindow();
                        await delay(80);
                        spawn(`omarchy-reminder ${duration} ${message}`, {
                          shell: true,
                          detached: true,
                          stdio: "ignore",
                        }).unref();
                      }}
                    />
                  </ActionPanel>
                }
              >
                <Form.TextField
                  id="duration"
                  title="Duration"
                  value={duration.toString()}
                  onChange={(value) => setDuration(parseInt(value))}
                />
                <Form.TextField
                  id="message"
                  title="Message"
                  value={message}
                  onChange={setMessage}
                />
              </Form>
            );
          },
        },
        {
          id: "show-timers",
          name: "Show all",
          icon: "󰔛",
          command: "omarchy-reminder show",
        },
        {
          id: "clear-timers",
          name: "Clear all",
          icon: "󰔛",
          command: "omarchy-reminder clear",
        },
      ],
    },
    capture,
    {
      id: "transcode",
      name: "Transcode",
      icon: "󰧸",
      command: "omarchy-transcode",
    },
    share,
    toggle,
    {
      id: "hardware",
      name: "Hardware",
      icon: "",
      items: [
        {
          id: "laptop-display",
          name: "Laptop Display",
          icon: "󰛧",
          command: terminal(
            'bash -c "omarchy-hyprland-monitor-internal toggle"',
          ),
        },
        {
          id: "mirror-display",
          name: "Mirror Display",
          icon: "󰍹",
          command: terminal(
            'bash -c "omarchy-hyprland-monitor-internal-mirror toggle"',
          ),
        },
        {
          id: "hybrid-gpu",
          name: "Hybrid GPU",
          icon: "",
          command: present_terminal("omarchy-toggle-hybrid-gpu"),
        },
        {
          id: "touchpad",
          name: "Touchpad",
          icon: "󰟸",
          command: "omarchy-toggle-touchpad",
        },
        {
          id: "touchscreen",
          name: "Touchscreen",
          icon: "󰆽",
          command: "omarchy-toggle-touchscreen",
        },
      ],
    },
  ],
};
