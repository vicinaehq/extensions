import { learn } from "./learn";
import { trigger } from "./trigger";
import { style } from "./style";
import { setup } from "./setup";
import { installMenu as install } from "./install";
import { remove } from "./remove";
import { update } from "./update";
import { about } from "./about";
import { system } from "./system";

export { type MenuItem } from "./types";

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
