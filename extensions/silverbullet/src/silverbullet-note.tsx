import { Action, ActionPanel, Detail, Icon } from "@vicinae/api";
import { useEffect, useState } from "react";
import { fetchFileContent, buildNoteUrl } from "./utils";
import NoteActions from "./note-actions";
import { NoteDetailProps } from "./types";

export default function SilverbulletNote({
  note,
  apiUrl,
  apiToken,
}: NoteDetailProps) {
  const [showMetadata, setShowMetadata] = useState(false);
  const [content, setContent] = useState(note.content);
  const [isLoading, setIsLoading] = useState(!note.contentLoaded);

  useEffect(() => {
    if (!note.contentLoaded) {
      setIsLoading(true);
      fetchFileContent(apiUrl, note.filePath, apiToken)
        .then((fetchedContent) => {
          setContent(fetchedContent);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error("Failed to load content:", error);
          setIsLoading(false);
        });
    }
  }, [note.contentLoaded, apiUrl, note.filePath, apiToken]);

  const markdown = isLoading
    ? `*Loading content...*`
    : content
      ? content
      : `*Content not available*`;

  const modifiedDate = new Date(note.modified).toLocaleDateString();

  return (
    <Detail
      navigationTitle={note.title}
      markdown={markdown}
      metadata={
        showMetadata ? (
          <Detail.Metadata>
            <Detail.Metadata.Label title="File" text={note.filePath} />
            <Detail.Metadata.Label title="Last Modified" text={modifiedDate} />
            <Detail.Metadata.Label
              title="Size"
              text={`${content.length} characters`}
            />
          </Detail.Metadata>
        ) : null
      }
      actions={
        <ActionPanel>
          {isLoading ? (
            <Action title="Loading..." onAction={() => {}} />
          ) : (
            <>
              <Action.OpenInBrowser
                title="Open in Silverbullet"
                url={buildNoteUrl(apiUrl, note.filePath)}
              />
              <Action
                icon={Icon.Info}
                title="Toggle Metadata"
                onAction={() => setShowMetadata(!showMetadata)}
              />
              <NoteActions note={note} apiUrl={apiUrl} apiToken={apiToken} />
            </>
          )}
        </ActionPanel>
      }
    />
  );
}
