import { GnomeExtension } from "./gnome-extension";

export interface ExtensionDetailProps {
  extension: GnomeExtension;
  screenshot?: string;
  isLoadingScreenshot: boolean;
}
