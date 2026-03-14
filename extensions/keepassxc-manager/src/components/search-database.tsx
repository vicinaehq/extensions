import {
   Action,
   ActionPanel,
   Clipboard,
   Icon,
   List,
   showToast,
   Toast,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import { KeePassLoader } from "../utils/keepass-loader";
import EditEntry from "./edit-entry";

interface SearchDatabaseProps {
   onLock: () => void;
}

/**
 * Component to search and display KeePassXC database entries.
 */
export default function SearchDatabase({ onLock }: SearchDatabaseProps) {
   const [entries, setEntries] = useState<string[][]>([]);
   const [isLoading, setIsLoading] = useState(true);

   const loadEntries = () => {
      setIsLoading(true);
      KeePassLoader.loadEntriesCache().then((cachedEntries) => {
         if (cachedEntries.length > 0) {
            setEntries(cachedEntries);
            setIsLoading(false);
         } else {
            KeePassLoader.refreshEntriesCache()
               .then((freshEntries) => {
                  setEntries(freshEntries);
                  setIsLoading(false);
               })
               .catch((error) => {
                  showToast(Toast.Style.Failure, "Error", error.message);
                  setIsLoading(false);
               });
         }
      });
   };

   useEffect(() => {
      loadEntries();
   }, []);

   const copyToClipboard = async (text: string, message: string) => {
      try {
         await Clipboard.copy(text);
         showToast(Toast.Style.Success, "Copied", message);
      } catch (error) {
         showToast(Toast.Style.Failure, "Error", "Failed to copy to clipboard");
      }
   };

   return (
      <List
         isLoading={isLoading}
         isShowingDetail
         searchBarPlaceholder="Search KeePassXC entries..."
      >
         {entries.map((entry, index) => {
            const [group, title, username, password, url, notes] = entry;

            return (
               <List.Item
                  key={index}
                  title={title}
                  detail={
                     <List.Item.Detail
                        metadata={
                           <List.Item.Detail.Metadata>
                              <List.Item.Detail.Metadata.Label
                                 title="Title"
                                 text={title}
                                 icon={Icon.Circle}
                              />
                              <List.Item.Detail.Metadata.Separator />

                              <List.Item.Detail.Metadata.Label
                                 title="Group"
                                 text={group || "None"}
                                 icon={Icon.Folder}
                              />
                              <List.Item.Detail.Metadata.Separator />

                              <List.Item.Detail.Metadata.Label
                                 title="Username"
                                 text={username || "—"}
                                 icon={Icon.Person}
                              />
                              <List.Item.Detail.Metadata.Separator />

                              <List.Item.Detail.Metadata.Label
                                 title="Password"
                                 text={password ? "••••••••" : "—"}
                                 icon={Icon.Key}
                              />
                              <List.Item.Detail.Metadata.Separator />

                              {url && url.trim() !== "" && (
                                 <>
                                    <List.Item.Detail.Metadata.Link
                                       title="URL"
                                       text={url}
                                       target={url}
                                    />
                                    <List.Item.Detail.Metadata.Separator />
                                 </>
                              )}

                              {notes && notes.trim() !== "" && (
                                 <>
                                    <List.Item.Detail.Metadata.Label
                                       title="Notes"
                                       text={notes}
                                    />
                                    <List.Item.Detail.Metadata.Separator />
                                 </>
                              )}
                           </List.Item.Detail.Metadata>
                        }
                     />
                  }
                  actions={
                     <ActionPanel>
                        <Action
                           title="Copy Password"
                           icon={Icon.Key}
                           onAction={() =>
                              copyToClipboard(password, "Password copied")
                           }
                           shortcut={{ modifiers: ["cmd"], key: "c" }}
                        />
                        <Action
                           title="Copy Username"
                           icon={Icon.Person}
                           onAction={() =>
                              copyToClipboard(username, "Username copied")
                           }
                           shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
                        />
                        {url && url.trim() !== "" && (
                           <Action.OpenInBrowser
                              title="Open URL"
                              url={url}
                              icon={Icon.Globe01}
                              shortcut={{ modifiers: ["cmd"], key: "o" }}
                           />
                        )}
                        <Action
                           title="Copy URL"
                           icon={Icon.Link}
                           onAction={() => copyToClipboard(url, "URL copied")}
                           shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
                        />
                        <ActionPanel.Section>
                           <Action.Push
                              title="Edit Entry"
                              icon={Icon.Pencil}
                              target={
                                 <EditEntry
                                    entry={entry}
                                    onEditComplete={loadEntries}
                                 />
                              }
                              shortcut={{ modifiers: ["cmd"], key: "e" }}
                           />
                        </ActionPanel.Section>
                        <ActionPanel.Section>
                           <Action
                              title="Lock Database"
                              icon={Icon.Lock}
                              onAction={onLock}
                              shortcut={{ modifiers: ["cmd"], key: "l" }}
                           />
                        </ActionPanel.Section>
                     </ActionPanel>
                  }
               />
            );
         })}
      </List>
   );
}
