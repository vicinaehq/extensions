import { useState, useEffect } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Clipboard,
  confirmAlert,
  Icon,
  List,
  showToast,
  Toast,
} from "@vicinae/api";
import type { CustomLink } from "./types";
import { deleteLink, loadLinks } from "./utils/storage";
import { AddLinkForm } from "./components/AddLinkForm";
import { EditLinkForm } from "./components/EditLinkForm";
import { ImportForm } from "./components/ImportForm";

export default function CustomLinksCommand() {
  const [links, setLinks] = useState<CustomLink[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    async function fetchLinks() {
      setIsLoading(true);
      const storedLinks = await loadLinks();
      setLinks(storedLinks);
      setIsLoading(false);
    }
    fetchLinks();
  }, []);

  function handleLinkAdded(newLink: CustomLink) {
    setLinks((prev) => [...prev, newLink]);
  }

  function handleLinkUpdated(updatedLink: CustomLink) {
    setLinks((prev) =>
      prev.map((link) => (link.id === updatedLink.id ? updatedLink : link))
    );
  }

  async function handleDeleteLink(link: CustomLink) {
    const confirmed = await confirmAlert({
      title: "Delete Link",
      message: `Are you sure you want to delete "${link.title}"?`,
      primaryAction: {
        title: "Delete",
        style: Alert.ActionStyle.Destructive,
      },
      dismissAction: {
        title: "Cancel",
      },
    });

    if (confirmed) {
      const success = await deleteLink(link.id);
      if (success) {
        setLinks((prev) => prev.filter((l) => l.id !== link.id));
        await showToast({
          style: Toast.Style.Success,
          title: "Link Deleted",
          message: link.title,
        });
      } else {
        await showToast({
          style: Toast.Style.Failure,
          title: "Failed to Delete",
          message: "Link not found",
        });
      }
    }
  }

  function handleLinksImported(importedLinks: CustomLink[]) {
    setLinks(importedLinks);
  }

  async function handleExportLinks() {
    if (links.length === 0) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Nothing to Export",
        message: "You don't have any bookmarks yet",
      });
      return;
    }

    // Export only the essential data (title, url, createdAt)
    const exportData = links.map(({ title, url, createdAt }) => ({
      title,
      url,
      createdAt,
    }));

    const jsonString = JSON.stringify(exportData, null, 2);
    await Clipboard.copy(jsonString);

    await showToast({
      style: Toast.Style.Success,
      title: "Bookmarks Exported",
      message: `${links.length} bookmark${
        links.length !== 1 ? "s" : ""
      } copied to clipboard`,
    });
  }

  function renderAddLinkAction() {
    return (
      <Action.Push
        title="Add New Link"
        icon={Icon.Plus}
        target={<AddLinkForm onLinkAdded={handleLinkAdded} />}
      />
    );
  }

  function renderExportAction() {
    return (
      <Action
        title="Export Bookmarks"
        icon={Icon.Upload}
        shortcut={{ modifiers: ["cmd", "shift"], key: "e" }}
        onAction={handleExportLinks}
      />
    );
  }

  function renderImportAction() {
    return (
      <Action.Push
        title="Import Bookmarks"
        icon={Icon.Download}
        shortcut={{ modifiers: ["cmd", "shift"], key: "i" }}
        target={<ImportForm onLinksImported={handleLinksImported} />}
      />
    );
  }

  // Only show "Add New Link" when not searching
  const isSearching = searchText.trim().length > 0;

  // Filter links based on search text
  const filteredLinks = links.filter((link) => {
    if (!isSearching) return true;
    const query = searchText.toLowerCase();
    return (
      link.title.toLowerCase().includes(query) ||
      link.url.toLowerCase().includes(query)
    );
  });

  return (
    <List
      isLoading={isLoading}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder="Search links..."
      navigationTitle="Simple Bookmarks"
    >
      {/* Show Add New Link item only when not searching */}
      {!isSearching && (
        <List.Section title="Actions">
          <List.Item
            key="__add_new_link__"
            title="Add New Link"
            subtitle="Create a new bookmark"
            icon={Icon.Plus}
            actions={
              <ActionPanel>
                {renderAddLinkAction()}
                <ActionPanel.Section title="Import/Export">
                  {renderExportAction()}
                  {renderImportAction()}
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        </List.Section>
      )}

      {filteredLinks.length > 0 && (
        <List.Section
          title="Your Links"
          subtitle={`${filteredLinks.length} link${
            filteredLinks.length !== 1 ? "s" : ""
          }`}
        >
          {filteredLinks.map((link) => (
            <List.Item
              key={link.id}
              title={link.title}
              subtitle={link.url}
              icon={Icon.Link}
              keywords={[link.title, link.url]}
              accessories={[
                { text: new URL(link.url).hostname, tooltip: "Domain" },
              ]}
              actions={
                <ActionPanel>
                  <Action.OpenInBrowser
                    title="Open in Browser"
                    url={link.url}
                    icon={Icon.Globe}
                  />
                  <Action.CopyToClipboard
                    title="Copy URL"
                    content={link.url}
                    onCopy={() => {
                      showToast({
                        style: Toast.Style.Success,
                        title: "Copied to Clipboard",
                        message: link.url,
                      });
                    }}
                  />
                  <Action.Push
                    title="Edit Link"
                    icon={Icon.Pencil}
                    target={
                      <EditLinkForm
                        link={link}
                        onLinkUpdated={handleLinkUpdated}
                      />
                    }
                  />
                  <Action
                    title="Delete Link"
                    icon={Icon.Trash}
                    style="destructive"
                    onAction={() => handleDeleteLink(link)}
                  />
                  <ActionPanel.Section title="Import/Export">
                    {renderExportAction()}
                    {renderImportAction()}
                  </ActionPanel.Section>
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}
    </List>
  );
}
