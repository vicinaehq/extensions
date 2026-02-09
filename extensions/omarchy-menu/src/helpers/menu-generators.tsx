import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";

import { List, showToast, Toast } from "@vicinae/api";
import { MenuItem } from "../config/types";

export const themes_list = (): MenuItem[] => {
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
        png: `${themes}/${themeId}/preview.png`,
        jpg: `${themes}/${themeId}/preview.jpg`,
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
        command: `omarchy-theme-set "${theme}"`,
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
