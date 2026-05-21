import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { List, showToast, Toast } from "@vicinae/api";
import { MenuItem } from "../config/types";
import { present_terminal } from "./actions";

const browserDesktopExists = (browser: string) => {
  const paths = [
    `${process.env.HOME}/.local/share/applications/${browser}`,
    `${process.env.HOME}/.nix-profile/share/applications/${browser}`,
    `/usr/share/applications/${browser}`,
  ];
  return paths.some((path) => existsSync(path));
};

const terminalExists = (terminal: string) => {
  try {
    execSync(`omarchy-cmd-present ${terminal}`);
    return true;
  } catch {
    return false;
  }
};

const editorExists = (editor: string) => {
  try {
    execSync(`omarchy-cmd-present ${editor}`);
    return true;
  } catch {
    return false;
  }
};

export const editors_list = (): MenuItem[] => {
  const currentEditor = execSync("omarchy-default-editor").toString().trim();
  const editors = [
    {
      id: "nvim",
      name: "Neovim",
      icon: "",
      command: "omarchy-default-editor nvim",
    },
    {
      id: "code",
      name: "VSCode",
      icon: "",
      command: "omarchy-default-editor vscode",
    },
    {
      id: "cursor",
      name: "Cursor",
      icon: "",
      command: "omarchy-default-editor cursor",
    },
    {
      id: "zed",
      name: "Zed",
      icon: "",
      command: "omarchy-default-editor zed",
    },
    {
      id: "sublime",
      name: "Sublime Text",
      icon: "",
      command: "omarchy-default-editor sublime_text",
    },
    {
      id: "helix",
      name: "Helix",
      icon: "",
      command: "omarchy-default-editor helix",
    },
    {
      id: "vim",
      name: "Vim",
      icon: "",
      command: "omarchy-default-editor vim",
    },
    {
      id: "emacs",
      name: "Emacs",
      icon: "",
      command: "omarchy-default-editor emacs",
    },
  ]
    .filter((editor) => editorExists(editor.id))
    .map((editor) => {
      if (editor.id === currentEditor) {
        return { ...editor, icon: "" };
      }
      return editor;
    });
  return editors;
};

export const terminals_list = (): MenuItem[] => {
  const currentTerminal = execSync("omarchy-default-terminal")
    .toString()
    .trim();
  const terminals = [
    {
      id: "alacritty",
      name: "Alacritty",
      icon: "",
      command: "omarchy-default-terminal alacritty",
    },
    {
      id: "foot",
      name: "Foot",
      icon: "",
      command: "omarchy-default-terminal foot",
    },
    {
      id: "kitty",
      name: "Kitty",
      icon: "",
      command: "omarchy-default-terminal kitty",
    },
    {
      id: "ghostty",
      name: "Ghostty",
      icon: "",
      command: "omarchy-default-terminal ghostty",
    },
  ]
    .filter((terminal) => terminalExists(terminal.name.toLowerCase()))
    .map((terminal) => {
      if (terminal.name.toLowerCase() === currentTerminal) {
        return { ...terminal, icon: "" };
      }
      return terminal;
    });
  return terminals;
};

export const browsers_list = (): MenuItem[] => {
  const currentBrowser = execSync("omarchy-default-browser").toString().trim();
  console.log(currentBrowser);
  const browsers = [
    {
      id: "chromium.desktop",
      name: "Chromium",
      icon: "",
      command: "omarchy-default-browser chromium",
    },
    {
      id: "google-chrome.desktop",
      name: "Chrome",
      icon: "󰊯",
      command: "omarchy-default-browser chrome",
    },
    {
      id: "brave-browser.desktop",
      name: "Brave",
      icon: "󰖟",
      command: "omarchy-default-browser brave",
    },
    {
      id: "brave-origin-beta.desktop",
      name: "Brave Origin",
      icon: "󰖟",
      command: "omarchy-default-browser brave-origin",
    },
    {
      id: "microsoft-edge.desktop",
      name: "Edge",
      icon: "󰇩",
      command: "omarchy-default-browser edge",
    },
    {
      id: "firefox.desktop",
      name: "Firefox",
      icon: "󰈹",
      command: "omarchy-default-browser firefox",
    },
    {
      id: "zen.desktop",
      name: "Zen",
      icon: "󰈹",
      command: "omarchy-default-browser zen",
    },
  ]
    .filter((browser) => browserDesktopExists(browser.id))
    .map((browser) => {
      if (browser.name.toLowerCase() === currentBrowser) {
        return { ...browser, icon: "" };
      }
      return browser;
    });
  return browsers;
};

export const themes_list = (unlockImage = false): MenuItem[] => {
  try {
    const themes = execSync("omarchy-theme-list")
      .toString()
      .split(/\r\n|\r|\n/)
      .filter(Boolean);

    const currentTheme = execSync("omarchy-theme-current").toString();
    return themes.map((theme) => {
      let themes = `${process.env.HOME}/.local/share/omarchy/themes`;
      const themeId = theme.replace(/\s/g, "-").toLowerCase();

      if (!existsSync(`${themes}/${themeId}`)) {
        themes = `${process.env.HOME}/.config/omarchy/themes`;
      }

      const previewLocation = {
        png: `${themes}/${themeId}/preview${unlockImage ? "-unlock" : ""}.png`,
        jpg: `${themes}/${themeId}/preview${unlockImage ? "-unlock" : ""}.jpg`,
        backgrounds: `${themes}/${themeId}/backgrounds`,
      };

      let imagePath = "";

      if (existsSync(previewLocation.png)) {
        imagePath = previewLocation.png;
      }

      if (existsSync(previewLocation.jpg)) {
        imagePath = previewLocation.jpg;
      }

      if (!imagePath) {
        const files = readdirSync(previewLocation.backgrounds);
        imagePath = `${previewLocation.backgrounds}/${files[0]}`;
      }

      return {
        id: themeId,
        name: theme,
        icon: theme === currentTheme.trim() ? "" : "󰸌",
        command: !unlockImage
          ? `omarchy-theme-set "${theme}"`
          : present_terminal(
              `omarchy-plymouth-set-by-theme "${theme.toLowerCase().split(" ").join("-")}"`,
            ),
        preview: (
          <List.Item.Detail markdown={`![${theme} preview](${imagePath})`} />
        ),
      };
    });
  } catch {
    showToast({
      style: Toast.Style.Failure,
      title: "Failed to load themes",
    });
    return [];
  }
};

export const fonts_list = (): MenuItem[] => {
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

export const powerprofiles_list = (): MenuItem[] => {
  const profiles = execSync("omarchy-powerprofiles-list")
    .toString()
    .split(/\r\n|\r|\n/)
    .filter(Boolean);
  const currentProfile = execSync("powerprofilesctl get").toString().trim();

  return profiles.map((profile) => {
    return {
      id: profile.replace(/\s/g, "-").toLowerCase(),
      name: profile,
      icon: profile === currentProfile ? "" : "󰒓",
      command: `powerprofilesctl set ${profile.toLowerCase()}`,
    };
  });
};
