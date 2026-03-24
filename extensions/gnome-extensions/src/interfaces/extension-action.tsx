import { GnomeExtension } from "./gnome-extension";

export interface ExtensionAction {
  extension: GnomeExtension;
  onReload: () => void;
}
