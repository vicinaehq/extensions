import { Icon } from "@vicinae/api";

import { MenuItem } from "./types";
import {
  terminal,
  present_terminal,
  install_and_launch,
  install_font,
  install,
  install_terminal,
  aur_install_and_launch,
} from "../helpers/actions";

export const installMenu: MenuItem = {
  id: "install",
  name: "Install",
  icon: Icon.PlusSquare,
  items: [
    {
      id: "package",
      name: "Package",
      icon: "󰣇",
      command: terminal("omarchy-pkg-install"),
    },
    {
      id: "aur",
      name: "AUR",
      icon: "󰣇",
      command: terminal("omarchy-pkg-aur-install"),
    },
    {
      id: "web",
      name: "Web App",
      icon: "",
      command: present_terminal("omarchy-webapp-install"),
    },
    {
      id: "tui",
      name: "TUI",
      icon: "",
      command: present_terminal("omarchy-tui-install"),
    },
    {
      id: "service",
      name: "Service",
      icon: "",
      items: [
        {
          id: "dropbox",
          name: "Dropbox",
          icon: "",
          command: present_terminal("omarchy-install-dropbox"),
        },
        {
          id: "tailscale",
          name: "Tailscale",
          icon: "",
          command: present_terminal("omarchy-install-tailscale"),
        },
        {
          id: "bitwarden",
          name: "Bitwarden",
          icon: "󰟵",
          command: install_and_launch(
            "Bitwarden",
            "bitwarden bitwarden-cli",
            "bitwarden",
          ),
        },
        {
          id: "chromium-account",
          name: "Chromium Account",
          icon: "",
          command: present_terminal("omarchy-install-chromium-google-account"),
        },
        {
          id: "once",
          name: "ONCE",
          icon: "󰏖",
          command: present_terminal("omarchy-install-once"),
        },
        {
          id: "nord-vpn",
          name: "NordVPN",
          icon: "󱇱",
          command: present_terminal("omarchy-install-nordvpn"),
        },
      ],
    },
    {
      id: "install-style",
      name: "Style",
      icon: "",
      items: [
        {
          id: "theme",
          name: "Theme",
          icon: "󰸌",
          command: present_terminal("omarchy-theme-install"),
        },
        {
          id: "background",
          name: "Background",
          icon: "",
          command: "omarchy-theme-bg-install",
        },
        {
          id: "install-font",
          name: "Font",
          icon: "",
          items: [
            {
              id: "meslo-lg-mono",
              name: "Meslo LG Mono",
              icon: "",
              command: install_font(
                "Meslo LG Mono",
                "ttf-meslo-nerd",
                "MesloLGL Nerd Font",
              ),
            },
            {
              id: "casadia",
              name: "Cascadia",
              icon: "",
              command: install_font(
                "Cascadia Mono",
                "ttf-cascadia-mono-nerd",
                "CaskaydiaMono Nerd Font",
              ),
            },
            {
              id: "fira-code",
              name: "Fira Code",
              icon: "",
              command: install_font(
                "Fira Code",
                "ttf-firacode-nerd",
                "FiraCode Nerd Font",
              ),
            },
            {
              id: "victor-mono",
              name: "Victor Code",
              icon: "",
              command: install_font(
                "Victor Code",
                "ttf-victor-mono-nerd",
                "VictorMono Nerd Font",
              ),
            },
            {
              id: "bistream-vera-mono",
              name: "Bistream Vera Mono",
              icon: "",
              command: install_font(
                "Bistream Vera Code",
                "ttf-bitstream-vera-mono-nerd",
                "BitstromWera Nerd Font",
              ),
            },
            {
              id: "iosevka",
              name: "Iosevka",
              icon: "",
              command: install_font(
                "Iosevka",
                "ttf-iosevka-nerd",
                "Iosevka Nerd Font Mono",
              ),
            },
          ],
        },
      ],
    },
    {
      id: "development",
      name: "Development",
      icon: "󰵮",
      items: [
        {
          id: "ruby-on-rails",
          name: "Ruby on Rails",
          icon: "󰫏",
          command: present_terminal('"omarchy-install-dev-env ruby"'),
        },
        {
          id: "docker-db",
          name: "Docker DB",
          icon: "",
          command: present_terminal("omarchy-install-docker-dbs"),
        },
        {
          id: "javascript",
          name: "JavaScript",
          icon: "",
          items: [
            {
              id: "node",
              name: "Node.js",
              icon: "",
              command: present_terminal("omarchy-install-dev-env node"),
            },
            {
              id: "bun",
              name: "Bun",
              icon: "",
              command: present_terminal("omarchy-install-dev-env bun"),
            },
            {
              id: "deno",
              name: "Deno",
              icon: "",
              command: present_terminal("omarchy-install-dev-env deno"),
            },
          ],
        },
        {
          id: "go",
          name: "Go",
          icon: "",
          command: present_terminal("omarchy-install-dev-env go"),
        },
        {
          id: "php",
          name: "PHP",
          icon: "",
          items: [
            {
              id: "php",
              name: "PHP",
              icon: "",
              command: present_terminal("omarchy-install-dev-env php"),
            },
            {
              id: "laravel",
              name: "Laravel",
              icon: "",
              command: present_terminal("omarchy-install-dev-env laravel"),
            },
            {
              id: "symfony",
              name: "Symfony",
              icon: "",
              command: present_terminal("omarchy-install-dev-env symfony"),
            },
          ],
        },
        {
          id: "python",
          name: "Python",
          icon: "",
          command: present_terminal("omarchy-install-dev-env python"),
        },
        {
          id: "elixir",
          name: "Elixir",
          icon: "",
          items: [
            {
              id: "elixir",
              name: "Elixir",
              icon: "",
              command: present_terminal("omarchy-install-dev-env elixir"),
            },
            {
              id: "phoenix",
              name: "Phoenix",
              icon: "",
              command: present_terminal("omarchy-install-dev-env phoenix"),
            },
          ],
        },
        {
          id: "zig",
          name: "Zig",
          icon: "",
          command: present_terminal("omarchy-install-dev-env zig"),
        },
        {
          id: "rust",
          name: "Rust",
          icon: "",
          command: present_terminal("omarchy-install-dev-env rust"),
        },
        {
          id: "java",
          name: "Java",
          icon: "",
          command: present_terminal("omarchy-install-dev-env java"),
        },
        {
          id: "net",
          name: ".NET",
          icon: "",
          command: present_terminal("omarchy-install-dev-env dotnet"),
        },
        {
          id: "o-caml",
          name: "OCaml",
          icon: "",
          command: present_terminal("omarchy-install-dev-env ocaml"),
        },
        {
          id: "clojure",
          name: "Clojure",
          icon: "",
          command: present_terminal("omarchy-install-dev-env clojure"),
        },
        {
          id: "scala",
          name: "Scala",
          icon: "",
          command: present_terminal("omarchy-install-dev-env scala"),
        },
      ],
    },
    {
      id: "editor",
      name: "Editor",
      icon: "",
      items: [
        {
          id: "vs-code",
          name: "VSCode",
          icon: "",
          command: present_terminal("omarchy-install-vscode"),
        },
        {
          id: "cursor",
          name: "Cursor",
          icon: "",
          command: install_and_launch("Cursor", "cursor-bin", "cursor"),
        },
        {
          id: "zed",
          name: "Zed",
          icon: "",
          command: install_and_launch("Zed", "zed", "dev.zed.Zed"),
        },
        {
          id: "sublime-text",
          name: "Sublime Text",
          icon: "",
          command: install_and_launch(
            "Sublime Text",
            "sublime-text-4",
            "sublime_text",
          ),
        },
        {
          id: "helix",
          name: "Helix",
          icon: "",
          command: install("Helix", "helix"),
        },
        {
          id: "emacs",
          name: "Emacs",
          icon: "",
          command: `${install("Emacs", "emacs-wayland")}  && systemctl --user enable --now emacs.service`,
        },
      ],
    },
    {
      id: "terminal",
      name: "Terminal",
      icon: "",
      items: [
        {
          id: "alacritty",
          name: "Alacritty",
          icon: "",
          command: install_terminal("alacritty"),
        },
        {
          id: "foot",
          name: "Foot",
          icon: "",
          command: install_terminal("foot"),
        },
        {
          id: "ghostty",
          name: "Ghostty",
          icon: "",
          command: install_terminal("ghostty"),
        },
        {
          id: "kitty",
          name: "Kitty",
          icon: "",
          command: install_terminal("kitty"),
        },
      ],
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
          command: present_terminal("omarchy-install-browser chrome"),
        },
        {
          id: "edge",
          name: "Edge",
          icon: "󰇩",
          command: present_terminal("omarchy-install-browser edge"),
        },
        {
          id: "brave-origin",
          name: "Brave Origin",
          icon: "󰖟",
          command: present_terminal("omarchy-install-browser brave-origin"),
        },
        {
          id: "brave",
          name: "Brave",
          icon: "󰖟",
          command: present_terminal("omarchy-install-browser brave"),
        },
        {
          id: "firefox",
          name: "Firefox",
          icon: "󰈹",
          command: present_terminal("omarchy-install-browser firefox"),
        },
        {
          id: "zen",
          name: "Zen",
          icon: "󰈹",
          command: present_terminal("omarchy-install-browser zen"),
        },
      ],
    },
    {
      id: "ai",
      name: "AI",
      icon: "󱚤",
      items: [
        {
          id: "dictation",
          name: "Dictation",
          icon: "",
          command: present_terminal("omarchy-voxtype-install"),
        },
        {
          id: "studio",
          name: "Studio",
          icon: "",
          command: install("LM Studio", "lmstudio-bin"),
        },
        {
          id: "ollama",
          name: "Ollama",
          icon: "󱚤",
          command: 'install "Ollama" $ollama_pkg',
        },
        {
          id: "crush",
          name: "Crush",
          icon: "󱚤",
          command: install("Crush", "crush-bin"),
        },
      ],
    },
    {
      id: "windows",
      name: "Windows",
      icon: "󰍲",
      command: present_terminal("omarchy-windows-vm install"),
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
          command: present_terminal("omarchy-install-steam"),
        },
        {
          id: "nvidia-geforce-now",
          name: "NVIDIA GeForce NOW",
          icon: "󰢹",
          command: present_terminal("omarchy-install-geforce-now"),
        },
        {
          id: "retroarch",
          name: "RetroArch [AUR]",
          icon: "",
          command: aur_install_and_launch(
            "RetroArch",
            "retroarch retroarch-assets libretro libretro-fbneo",
            "com.libretro.RetroArch.desktop",
          ),
        },
        {
          id: "minecraft",
          name: "Minecraft",
          icon: "󰍳",
          command: install_and_launch(
            "Minecraft",
            "minecraft-launcher",
            "minecraft-launcher",
          ),
        },
        {
          id: "xbox",
          name: "Xbox Controller [AUR]",
          icon: "󰖺",
          command: present_terminal("omarchy-install-xbox-controllers"),
        },
        {
          id: "xbox-cloud",
          name: "Xbox Cloud Gaming",
          icon: "",
          command: present_terminal("omarchy-install-gaming-xbox-cloud"),
        },
        {
          id: "lutris",
          name: "Lutris",
          icon: "",
          command: present_terminal("omarchy-install-gaming-lutris"),
        },
        {
          id: "heroic",
          name: "Heroic",
          icon: "󱓟",
          command: present_terminal("omarchy-install-gaming-heroic"),
        },
        {
          id: "moonlight",
          name: "Moonlight",
          icon: "󰍹",
          command: present_terminal("omarchy-install-gaming-moonlight"),
        },
      ],
    },
  ],
};
