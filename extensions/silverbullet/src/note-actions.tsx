import { Action, ActionPanel, Icon, showToast, Toast } from "@vicinae/api";
import { deleteFile, buildNoteUrl } from "./utils";
import { Note } from "./types";

interface NoteActionsProps {
  note: Note;
  apiUrl: string;
  apiToken?: string;
  onDelete?: (filePath: string) => void;
}

export default function NoteActions({
  note,
  apiUrl,
  apiToken,
  onDelete,
}: NoteActionsProps) {
  return (
    <ActionPanel.Section>
      <Action.OpenInBrowser
        title="Open in Silverbullet"
        url={buildNoteUrl(apiUrl, note.filePath)}
      />
      <Action.CopyToClipboard
        title="Copy URL"
        content={buildNoteUrl(apiUrl, note.filePath)}
      />
      <Action.CopyToClipboard title="Copy Title" content={note.title} />
      {note.contentLoaded && (
        <Action.CopyToClipboard title="Copy Content" content={note.content} />
      )}
      <Action
        title="Delete"
        icon={Icon.Trash}
        style={Action.Style.Destructive}
        onAction={async () => {
          try {
            await deleteFile(apiUrl, note.filePath, apiToken);
            onDelete?.(note.filePath);
            await showToast({
              style: Toast.Style.Success,
              title: "Note deleted",
            });
          } catch (error) {
            await showToast({
              style: Toast.Style.Failure,
              title: "Failed to delete",
              message: String(error),
            });
          }
        }}
      />
    </ActionPanel.Section>
  );
}
