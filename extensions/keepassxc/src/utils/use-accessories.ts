import { Color, Icon } from "@raycast/api";
import { KeePassEntry } from "./placeholder-processor";

type accessoryResponse = {
  tag: { value: string; color: Color };
  icon: Icon;
  tooltip: string;
};

const decideColor = (template: string) => "" !== template ? Color.Green : Color.SecondaryText;

const useAccessories = () =>
  (isShowingDetail: boolean, { folderTree, totp, password, url }: KeePassEntry): accessoryResponse[] | object => {
    const accessories: accessoryResponse[] = [];

    if (isShowingDetail) return accessories;

    if ("" !== folderTree) {
      accessories.push({
        tag: { value: folderTree, color: Color.SecondaryText },
        icon: Icon.Folder,
        tooltip: "Folder",
      });
    }

    return [
      ...accessories,
      {
        icon: { source: Icon.Clock, tintColor: decideColor(totp) },
        tooltip: "" !== totp ? "TOTP Set" : "TOTP Unset",
      },
      {
        icon: { source: Icon.Key, tintColor: decideColor(password) },
        tooltip: "" !== password ? "Password Set" : "Password Unset",
      },
      {
        icon: { source: Icon.Link, tintColor: decideColor(url) },
        tooltip: "" !== url ? "URL Set" : "URL Unset",
      },
    ];
  };

export { useAccessories };
