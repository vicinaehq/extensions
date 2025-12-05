import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";

import { List } from "@vicinae/api";
import { MenuItem } from "../config/types";

export const themes_list = (): MenuItem[] => {
  const themes = execSync("omarchy-theme-list")
    .toString()
    .split(/\r\n|\r|\n/)
    .filter(Boolean);

  const currentTheme = execSync("omarchy-theme-current").toString();

  return themes.map((theme) => {
    const themes = `${process.env.HOME}/.config/omarchy/themes`;
    const themeId = theme.replace(/\s/g, "-").toLowerCase();
    let imagePath = `${themes}/${themeId}/preview.png`;

    try {
      readFileSync(imagePath);
    } catch {
      const files = readdirSync(`${themes}/${themeId}/backgrounds/`);
      imagePath = `${themes}/${themeId}/backgrounds/${files[0]}`;
    }

    return {
      id: themeId,
      name: theme,
      icon: theme === currentTheme.trim() ? "" : "󰸌",
      command: `omarchy-theme-set "${theme}"`,
      preview: (
        <List.Item.Detail
          markdown={`<img height="320" src="${imagePath}" />`}
        />
      ),
    };
  });
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
