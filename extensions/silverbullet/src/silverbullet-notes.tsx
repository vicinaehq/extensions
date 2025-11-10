import {
  Action,
  ActionPanel,
  Icon,
  List,
  getPreferenceValues,
  showToast,
  Toast,
} from "@vicinae/api";
import Fuse from "fuse.js";
import { useEffect, useMemo, useState } from "react";

import SilverbulletNote from "./silverbullet-note";
import NoteActions from "./note-actions";
import { fetchFileList, parseNote, buildNoteUrl } from "./utils";
import { Preferences, Note } from "./types";

export default function Command() {
  const { silverbulletApiUrl, silverbulletApiToken } =
    getPreferenceValues<Preferences>();
  const [notes, setNotes] = useState<Note[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      setIsLoading(true);
      try {
        const fileList = await fetchFileList(
          silverbulletApiUrl,
          silverbulletApiToken,
        );

        // Filter for markdown files only, excluding standard library and plugins
        const markdownFiles = fileList.filter(
          (file) =>
            file.name.endsWith(".md") &&
            file.contentType === "text/markdown" &&
            !file.name.startsWith("Library/") &&
            !file.name.startsWith("_plug/") &&
            file.name !== "CONFIG.md",
        );

        // Create notes without content initially (lazy loading)
        const parsedNotes: Note[] = markdownFiles.map((fileInfo) =>
          parseNote(fileInfo),
        );

        // Sort by modified date (most recent first)
        parsedNotes.sort((a, b) => b.modified - a.modified);
        setNotes(parsedNotes);

        await showToast({
          style: Toast.Style.Success,
          title: `Found ${parsedNotes.length} notes`,
        });
      } catch (error) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Error loading notes",
          message: String(error),
        });
        setNotes([]);
      }
      setIsLoading(false);
    })();
  }, [silverbulletApiUrl, silverbulletApiToken]);

  const fuse = useMemo(() => {
    return new Fuse(notes, {
      keys: ["title"],
      threshold: 0.4,
    });
  }, [notes]);

  const filteredNotes = useMemo(() => {
    if (!query.trim()) {
      // Show first 50 notes when no search
      return notes.slice(0, 50);
    }

    // Search all notes by title using Fuse
    const searchResults = fuse.search(query).slice(0, 50);
    return searchResults.map((result) => result.item);
  }, [notes, query, fuse]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search Silverbullet notes"
      onSearchTextChange={setQuery}
    >
      {filteredNotes.map((note) => {
        const modifiedDate = new Date(note.modified).toLocaleDateString();
        const accessories: { text: string }[] = [
          {
            text: modifiedDate,
          },
        ];

        return (
          <List.Item
            key={note.id}
            icon={Icon.Document}
            title={note.title}
            accessories={accessories}
            actions={
              <ActionPanel>
                <Action.Push
                  title="Show Details"
                  icon={Icon.Window}
                  target={
                    <SilverbulletNote
                      note={note}
                      apiUrl={silverbulletApiUrl}
                      apiToken={silverbulletApiToken}
                    />
                  }
                />
                <NoteActions
                  note={note}
                  apiUrl={silverbulletApiUrl}
                  apiToken={silverbulletApiToken}
                  onDelete={(filePath) => {
                    setNotes((prev) =>
                      prev.filter((n) => n.filePath !== filePath),
                    );
                  }}
                />
              </ActionPanel>
            }
          />
        );
      })}
      {filteredNotes.length === 0 && (
        <List.Item
          icon={Icon.Plus}
          title={query ? "Create new page" : "No notes available"}
          subtitle={query ? query : "Check your Silverbullet instance"}
          actions={
            <ActionPanel>
              <Action.OpenInBrowser
                title="Open Silverbullet"
                url={`${silverbulletApiUrl}/${
                  query ? `${encodeURIComponent(query)}` : ""
                }`}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
