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

export const menu: MenuItem = {
  id: "menu",
  name: "Menu",
  icon: "",
  items: [learn, trigger, style, setup, install, remove, update, about, system],
};
