import { Icon } from "@vicinae/api";
import { execSync } from "node:child_process";
import {
  terminal,
  open_in_editor,
  present_terminal,
  install,
  install_and_launch,
  install_font,
  install_terminal,
  aur_install_and_launch,
} from "~/helpers/actions";

export type MenuItem = {
  id: string;
  name: string;
  icon: string;
  command?: string;
  items?: MenuItem[];
};

const themes_list = () => {
  const themes = execSync("omarchy-theme-list")
    .toString()
    .split(/\r\n|\r|\n/)
    .filter(Boolean);
  // TODO: indicate current theme
  // const currentTheme = execSync("omarchy-theme-current").toString();

  return themes.map((theme) => {
    return {
      id: theme.replace(/\s/g, "-").toLowerCase(),
      name: theme,
      icon: "󰸌",
      command: `omarchy-theme-set "${theme}"`,
    };
  });
};

const fonts_list = () => {
  const fonts = execSync("omarchy-font-list")
    .toString()
    .split(/\r\n|\r|\n/)
    .filter(Boolean);
  // TODO: indicate current font
  // const currentFont = execSync("omarchy-font-current").toString();

  return fonts.map((font) => {
    return {
      id: font.replace(/\s/g, "-").toLowerCase(),
      name: font,
      icon: "󰸌",
      command: `omarchy-font-set "${font}"`,
    };
  });
};

export const MENU_ITEMS: MenuItem[] = [
  {
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
  },
  {
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
                id: "region-audio",
                name: "Region + Audio",
                icon: "",
                command: "omarchy-cmd-screenrecord region --with-audio",
              },
              {
                id: "region",
                name: "Region",
                icon: "",
                command: "omarchy-cmd-screenrecord",
              },
              {
                id: "display-audio",
                name: "Display + Audio",
                icon: "",
                command: "omarchy-cmd-screenrecord output --with-audio",
              },
              {
                id: "display-webcam",
                name: "Display + Webcam",
                icon: "",
                command:
                  "omarchy-cmd-screenrecord output --with-audio --with-webcam",
              },
              {
                id: "display",
                name: "Display",
                icon: "",
                command: "omarchy-cmd-screenrecord output",
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
  },
  {
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
  },
  {
    id: "setup",
    name: "Setup",
    icon: Icon.Gear,
    items: [
      {
        id: "audio",
        name: "Audio",
        icon: "",
        command: "xdg-terminal-exec --app-id=com.omarchy.Wiremix -e wiremix",
      },
      {
        id: "wifi",
        name: "Wifi",
        icon: "",
        command: "rfkill unblock wifi && omarchy-launch-wifi",
      },
      {
        id: "bluetooth",
        name: "Bluetooth",
        icon: "󰂯",
        command: "rfkill unblock bluetooth && blueberry",
      },
      {
        id: "power",
        name: "Power",
        icon: "󱐋",
        command: "show_setup_power_menu",
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
        icon: "",
        command: open_in_editor("~/.config/uwsm/default"),
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
  },
  {
    id: "install",
    name: "Install",
    icon: Icon.MemoryChip,
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
        name: "Web",
        icon: "󰣇",
        command: present_terminal("omarchy-webapp-install"),
      },
      {
        id: "tui",
        name: "TUI",
        icon: "󰣇",
        command: present_terminal("omarchy-tui-install"),
      },
      {
        id: "service",
        name: "Service",
        icon: "󰣇",
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
            command: present_terminal(
              "omarchy-install-chromium-google-account",
            ),
          },
        ],
      },
      {
        id: "style",
        name: "Style",
        icon: "󰣇",
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
            command: "nautilus ~/.config/omarchy/current/theme/backgrounds",
          },
          {
            id: "font",
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
            ],
          },
        ],
      },
      {
        id: "development",
        name: "Development",
        icon: "󰣇",
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
            command: "",
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
        ],
      },
      {
        id: "editor",
        name: "Editor",
        icon: "󰣇",
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
        icon: "󰣇",
        items: [
          {
            id: "alacritty",
            name: "Alacritty",
            icon: "",
            command: install_terminal("alacritty"),
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
        id: "ai",
        name: "AI",
        icon: "󰣇",
        items: [
          {
            id: "claude-code",
            name: "Claude Code",
            icon: "󱚤",
            command: install("Claude Code", "claude-code"),
          },
          {
            id: "cursor-cli",
            name: "Cursor CLI",
            icon: "󱚤",
            command: install("Cursor CLI", "cursor-cli"),
          },
          {
            id: "gemini",
            name: "Gemini",
            icon: "󱚤",
            command: install("OpenAI Codex", "openai-codex-bin"),
          },
          {
            id: "openai-codex",
            name: "OpenAI Codex",
            icon: "󱚤",
            command: install("Gemini", "gemini-cli"),
          },
          {
            id: "lm-studio",
            name: "LM Studio",
            icon: "󱚤",
            command: install("LM Studio", "lmstudio"),
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
          {
            id: "opencode",
            name: "opencode",
            icon: "󱚤",
            command: install("opencode", "opencode"),
          },
        ],
      },
      {
        id: "windows",
        name: "Windows",
        icon: "󰣇",
        command: present_terminal("omarchy-windows-vm install"),
      },
      {
        id: "gaming",
        name: "Gaming",
        icon: "󰣇",
        items: [
          {
            id: "steam",
            name: "Steam",
            icon: "",
            command: present_terminal("omarchy-install-steam"),
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
        ],
      },
    ],
  },
  {
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
        id: "theme",
        name: "Theme",
        icon: "󰣇",
        command: present_terminal("omarchy-theme-remove"),
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
  },
  {
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
  },
  {
    id: "about",
    name: "About",
    icon: Icon.Info,
    command: "omarchy-launch-about",
  },
  {
    id: "system",
    name: "System",
    icon: Icon.Power,
    items: [
      { id: "lock", name: "Lock", icon: "", command: "omarchy-lock-screen" },
      {
        id: "screensaver",
        name: "Screensaver",
        icon: "",
        command: "omarchy-launch-screensaver force",
      },
      {
        id: "suspend",
        name: "Suspend",
        icon: "",
        command: "systemctl suspend",
      },
      {
        id: "restart",
        name: "Restart",
        icon: "",
        command:
          "omarchy-state clear re*-required && systemctl reboot --no-wall",
      },
      {
        id: "shutdown",
        name: "Shutdown",
        icon: "",
        command:
          "omarchy-state clear re*-required && systemctl poweroff --no-wall",
      },
    ],
  },
];
