import { GnomeExtension } from "./gnome-extension";

export interface ExtensionListItemProps {
  extension: GnomeExtension;
  isShowingDetail: boolean;
  onToggleDetail: () => void;
  onReload: () => void;
}
