import { learn } from "./learn";
import { trigger } from "./trigger";
import { style } from "./style";
import { setup } from "./setup";
import { installMenu as install } from "./install";
import { remove } from "./remove";
import { update } from "./update";
import { about } from "./about";
import { system } from "./system";
import { MenuItem } from "./types";

export { type MenuItem } from "./types";
export type FlattenedMenuItem = MenuItem & { path: string };

export const MENU_ITEMS = [
  learn,
  trigger,
  style,
  setup,
  install,
  remove,
  update,
  about,
  system,
];

export const FLATTEND_MENU_ITEMS: FlattenedMenuItem[] = [];
const flatten = (items: MenuItem[], path: string[] = []) => {
  for (const item of items) {
    const currentPath = [...path, item.name];
    if (path.length > 0) {
      FLATTEND_MENU_ITEMS.push({
        ...item,
        path: currentPath.join(" → "),
      });
    }
    if (item.items && item.items.length > 0) flatten(item.items, currentPath);
  }
};

flatten(MENU_ITEMS);
