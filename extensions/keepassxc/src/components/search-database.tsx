import React, { useCallback, useEffect, useState } from "react";
import { JSX } from "react/jsx-runtime";
import {
  Action,
  ActionPanel,
  Clipboard,
  closeMainWindow,
  Color,
  getPreferenceValues,
  Icon,
  Image,
  List,
  open,
  showHUD,
  showToast,
  Toast
} from "@vicinae/api";
import { getFavicon } from "@raycast/utils";
import { KeePassLoader, showToastCliErrors } from "../utils/keepass-loader";
import { arrayToEntry, processPlaceholders } from "../utils/placeholder-processor";
import { getTOTPCode } from "../utils/totp";
import { isValidUrl } from "../utils/url-checker";
import { useAccessories } from "../utils/use-accessories";
import ImageLike = Image.ImageLike;

// eslint-disable-next-line no-undef
const preferences: ExtensionPreferences = getPreferenceValues();
// Whether to display favicons in the user interface
const userInterfaceFavicon = Boolean(preferences.userInterfaceFavicon);

/**
 * Get an array of unique folder names from the given entries.
 *
 * Folders are determined by the first element of each entry.
 * If the first element is empty, it is considered not a folder.
 * The folders are sorted case-insensitively.
 *
 * @param {string[][]} entries - The KeePass database entries.
 * @returns {string[]} - The unique folder names.
 */
function getFolders(entries: string[][]): string[] {
  return Array.from(new Set(entries.map((entry: string[]) => entry[0]).filter((v: string) => "" !== v))).sort((a, b) =>
    (a as string).localeCompare(b as string),
  );
}

type FolderFilterDropdownProps = {
  folders: string[];
  // eslint-disable-next-line no-unused-vars
  onFolderChange: (newValue: string) => void;
};

/**
 * A dropdown component to filter by folder.
 *
 * @param {Object} props - The component props.
 * @param {string[]} props.folders - The list of unique folder names.
 * @param {(newValue: string) => void} props.onFolderChange - The function to be called when the selected folder changes.
 *
 * @returns {JSX.Element} The dropdown component.
 */
function FolderFilterDropdown(props: FolderFilterDropdownProps): JSX.Element {
  const { folders, onFolderChange } = props;
  return (
    <List.Dropdown
      tooltip="Filter by Folder"
      defaultValue=""
      onChange={newValue => {
        onFolderChange(newValue);
      }}
    >
      <List.Dropdown.Item title="All" key="-1" value="" />
      <List.Dropdown.Section title="Folder">
        {folders.map((folder: string, index: number) => (
          <List.Dropdown.Item key={index.toString()} title={folder} value={folder} icon={Icon.Folder} />
        ))}
      </List.Dropdown.Section>
    </List.Dropdown>
  );
}

type SearchDatabaseParams = {
  // eslint-disable-next-line no-unused-vars
  setIsUnlocked: (isUnlocked: boolean) => void;
};

/**
 * Component for searching and displaying KeePass database entries.
 *
 * @param {Object} props - The component props.
 * @param {(isUnlocked: boolean) => void} props.setIsUnlocked - A function to update the lock status of the database.
 *
 * @returns {JSX.Element} The search interface for KeePass database entries.
 *
 * This component loads entries from the cache and updates them by refreshing the cache.
 * It displays the entries in a searchable list format. Users can perform actions such as
 * pasting or copying passwords, usernames, and TOTP, as well as opening URLs associated
 * with entries. If an error occurs, the database is locked, and an error message is shown.
 */
export default function SearchDatabase({ setIsUnlocked }: SearchDatabaseParams): JSX.Element {
  const [entries, setEntries] = useState<string[][]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [entriesFolder, setEntriesFolder] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isShowingDetail, setIsShowingDetail] = useState(false);
  const accessories = useAccessories();

  const errorHandler = (e: { message: string }) => {
    setIsUnlocked(false);
    showToastCliErrors(e);
  };

  const entryFavicon = useCallback((icon: string): ImageLike | undefined => {
    if (userInterfaceFavicon) {
      return isValidUrl(icon)
        ? getFavicon(icon, { fallback: Icon.QuestionMarkCircle })
        : { source: Icon.QuestionMarkCircle, tintColor: Color.SecondaryText };
    }

    return undefined;
  }, []);

  useEffect(() => {
    KeePassLoader.loadEntriesCache()
      .then(entries => {
        setEntries(entries);
        setFolders(getFolders(entries));
      })
      .then(KeePassLoader.refreshEntriesCache)
      .then(entries => {
        setIsLoading(false);
        setEntries(entries);
        setFolders(getFolders(entries));
      }, errorHandler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <List
      searchBarPlaceholder="Search in KeePassXC"
      searchBarAccessory={
        0 < folders.length ? <FolderFilterDropdown folders={folders} onFolderChange={setEntriesFolder} /> : undefined
      }
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      throttle
    >
      {entries.map((entry: string[], i: number) => {
        const keePassEntry = arrayToEntry(entry);
        const { folderTree, title, username, password, url, notes, totp, createdAt, updatedAt } = keePassEntry;

        if (!(folderTree.startsWith(entriesFolder) && "" !== title)) return;

        return (
          <List.Item
            key={i}
            title={title}
            icon={entryFavicon(url)}
            subtitle={{ value: username, tooltip: "Username" }}
            accessories={accessories(isShowingDetail, keePassEntry)}
            detail={(
              <List.Item.Detail
                metadata={(
                  <List.Item.Detail.Metadata>
                    {"" !== url && <List.Item.Detail.Metadata.Link title="Url" text={url} target="_blank" />}
                    <List.Item.Detail.Metadata.Label title="Created at" text={createdAt} />
                    <List.Item.Detail.Metadata.Label title="Updated at" text={updatedAt} />
                    <List.Item.Detail.Metadata.Separator />
                  </List.Item.Detail.Metadata>
                )}
                {...("" !== notes ? { markdown: notes } : {})}
              />
            )}
            actions={(
              <ActionPanel>
                <Action
                  title="Show Details"
                  icon={Icon.Cog}
                  onAction={async () => {
                    setIsShowingDetail(!isShowingDetail);
                  }}
                />
                <ActionPanel.Section title="Copy">
                  <Action
                    title="Copy Password"
                    onAction={async () => {
                      if ("" === password) {
                        await showToast(Toast.Style.Failure, "Error", "No Password Set");
                        return;
                      }

                      const processedPassword = processPlaceholders(password, keePassEntry);
                      await Clipboard.copy(processedPassword, { concealed: true });
                      await showHUD("Password has been copied to clipboard");
                    }}
                  />
                  <Action
                    title="Copy Username"
                    shortcut={{ modifiers: ["ctrl"], key: "b" }}
                    onAction={async () => {
                      if ("" === username) {
                        await showToast(Toast.Style.Failure, "Error", "No Username Set");
                        return;
                      }

                      const processedUsername = processPlaceholders(username, keePassEntry);
                      await Clipboard.copy(processedUsername);
                      await showHUD("Username has been copied to clipboard");
                    }}
                  />
                  <Action
                    title="Copy TOTP"
                    shortcut={{ modifiers: ["ctrl"], key: "t" }}
                    onAction={async () => {
                      if ("" === totp) {
                        await showToast(Toast.Style.Failure, "Error", "No TOTP Set");
                        return;
                      }

                      try {
                        await Clipboard.copy(getTOTPCode(totp), { concealed: true });
                        await showHUD("TOTP has been copied to clipboard");
                      } catch {
                        await showToast(Toast.Style.Failure, "Error", "Invalid TOTP URL");
                      }
                    }}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section title="Paste">
                  <Action
                    title="Paste Password"
                    icon={Icon.BlankDocument}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "c" }}
                    onAction={async () => {
                      if ("" === password) {
                        await showToast(Toast.Style.Failure, "Error", "No Password Set");
                        return;
                      }

                      const processedPassword = processPlaceholders(password, keePassEntry);
                      Clipboard.paste(processedPassword).then(() => closeMainWindow());
                    }}
                  />
                  <Action
                    title="Paste Username"
                    icon={Icon.BlankDocument}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "b" }}
                    onAction={async () => {
                      if ("" === username) {
                        await showToast(Toast.Style.Failure, "Error", "No Username Set");
                        return;
                      }

                      const processedUsername = processPlaceholders(username, keePassEntry);
                      Clipboard.paste(processedUsername).then(() => closeMainWindow());
                    }}
                  />
                  <Action
                    title="Paste TOTP"
                    icon={Icon.BlankDocument}
                    shortcut={{ modifiers: ["ctrl", "shift"], key: "t" }}
                    onAction={async () => {
                      if ("" === totp) {
                        await showToast(Toast.Style.Failure, "Error", "No TOTP Set");
                        return;
                      }

                      try {
                        Clipboard.paste(getTOTPCode(totp)).then(() => closeMainWindow());
                      } catch {
                        await showToast(Toast.Style.Failure, "Error", "Invalid TOTP URL");
                      }
                    }}
                  />
                </ActionPanel.Section>
                <Action
                  title="Open URL"
                  icon={Icon.Globe01}
                  shortcut={{ modifiers: ["ctrl", "shift"], key: "u" }}
                  onAction={async () => {
                    if ("" === url) {
                      await showToast(Toast.Style.Failure, "Error", "No URL Set");
                      return;
                    }

                    await open(url);
                  }}
                />
              </ActionPanel>
            )}
          />
        );
      })}
      <List.EmptyView
        title="No Entries Found"
        description={0 === entries.length ? "Your database seems empty" : "Try adjusting your search"}
      />
    </List>
  );
}
