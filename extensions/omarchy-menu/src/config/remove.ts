import { Icon } from "@vicinae/api";
import { MenuItem } from "./types";
import { terminal, present_terminal } from "../helpers/actions";

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
      id: "remove-development-menu",
      name: "Development",
      icon: "󰵮",
      items: [
        {
          id: "rails",
          name: "Ruby on Rails",
          icon: "󰫏",
          command: present_terminal("omarchy-remove-dev-env ruby"),
        },
        {
          id: "javascript",
          name: "JavaScript",
          icon: "󰌞",
          items: [
            {
              id: "node",
              name: "Node.js",
              icon: "󰢻",
              command: present_terminal("omarchy-remove-dev-env node"),
            },
            {
              id: "bun",
              name: "Bun",
              icon: "",
              command: present_terminal("omarchy-remove-dev-env bun"),
            },
            {
              id: "deno",
              name: "Deno",
              icon: "",
              command: present_terminal("omarchy-remove-dev-env deno"),
            },
          ],
        },
      ],
    },
    {
      id: "gaming",
      name: "Gaming",
      icon: "",
      items: [
        {
          id: "steam",
          name: "Steam",
          icon: "",
          command: present_terminal("omarchy-remove-gaming-steam"),
        },
        {
          id: "retroarch",
          name: "RetroArch",
          icon: "",
          command: present_terminal("omarchy-remove-gaming-retroarch"),
        },
        {
          id: "mincraft",
          name: "Minecraft",
          icon: "󰍳",
          command: present_terminal("omarchy-remove-gaming-minecraft"),
        },
        {
          id: "geforce",
          name: "NVIDIA GeForce NOW",
          icon: "󰢹",
          command: present_terminal("omarchy-remove-gaming-geforce"),
        },
        {
          id: "xbox-cloud",
          name: "Xbox Cloud Gaming",
          icon: "",
          command: present_terminal("omarchy-remove-gaming-xbox-cloud"),
        },
        {
          id: "xbox",
          name: "Xbox Controller (󰂯)",
          icon: "󰖺",
          command: present_terminal("omarchy-remove-gaming-xbox-controllers"),
        },
        {
          id: "moonlight",
          name: "Moonlight (GameStream)",
          icon: "󰍹",
          command: present_terminal("omarchy-remove-gaming-moonlight"),
        },
        {
          id: "lutris",
          name: "Lutris (Battle.net)",
          icon: "",
          command: present_terminal("omarchy-remove-gaming-lutris"),
        },
        {
          id: "heroic",
          name: "Heroic (Epic Games)",
          icon: "󱓟",
          command: present_terminal("omarchy-remove-gaming-heroic"),
        },
      ],
    },
    {
      id: "preinstalls",
      name: "Preinstalls",
      icon: "󰏓",
      command: present_terminal("omarchy-remove-preinstalls"),
    },
    {
      id: "dication",
      name: "Dictation",
      icon: "",
      command: present_terminal("omarchy-voxtype-remove"),
    },
    {
      id: "theme",
      name: "Theme",
      icon: "󰣇",
      command: present_terminal("omarchy-theme-remove"),
    },
    {
      id: "browser",
      name: "Browser",
      icon: "",
      items: [
        {
          id: "chrome",
          name: "Chrome",
          icon: "",
          command: present_terminal("omarchy-remove-browser chrome"),
        },
        {
          id: "edge",
          name: "Edge",
          icon: "󰇩",
          command: present_terminal("omarchy-remove-browser edge"),
        },
        {
          id: "brave-origin",
          name: "Brave Origin",
          icon: "󰖟",
          command: present_terminal("omarchy-remove-browser brave-origin"),
        },
        {
          id: "brave",
          name: "Brave",
          icon: "󰖟",
          command: present_terminal("omarchy-remove-browser brave"),
        },
        {
          id: "firefox",
          name: "Firefox",
          icon: "󰈹",
          command: present_terminal("omarchy-remove-browser firefox"),
        },
        {
          id: "zen",
          name: "Zen",
          icon: "󰈹",
          command: present_terminal("omarchy-remove-browser zen"),
        },
      ],
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
