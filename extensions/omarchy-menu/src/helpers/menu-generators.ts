import { execSync } from "node:child_process";
import { MenuItem } from "../config/types";

export const themes_list = (): MenuItem[] => {
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
