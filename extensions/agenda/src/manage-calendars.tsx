import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { useEffect, useRef } from "react";
import CalendarForm from "./components/CalendarForm";
import EditCalendar from "./edit-calendar";
import {
  getCalendars,
  setCalendars,
  getCalendarName,
} from "./lib/calendar";
import { toastLoadError } from "./lib/toastLoadError";

export default function ManageCalendars() {
  const { push } = useNavigation();

  // Re-read on every render. The mtime cache in getCalendars makes this
  // essentially free when the file hasn't changed, and it means the list
  // stays in sync after the form pops back with new/edited entries.
  const r = getCalendars();
  const calendars = r.ok ? r.calendars : [];
  const loadError = r.ok ? null : r.error;

  const lastToastedErrorKey = useRef<string | null>(null);
  useEffect(() => {
    if (!loadError) {
      lastToastedErrorKey.current = null;
      return;
    }
    const key = `${loadError.filePath}|${loadError.reason}`;
    if (lastToastedErrorKey.current === key) return;
    lastToastedErrorKey.current = key;
    toastLoadError(loadError);
  }, [loadError]);

  const removeCalendar = async (urlToRemove: string) => {
    // Re-read the file at mutation time so we never filter against a stale
    // snapshot (which could overwrite calendars added since this view mounted).
    const current = getCalendars();
    if (!current.ok) {
      toastLoadError(current.error);
      return;
    }
    const updatedCalendars = current.calendars.filter(
      (cal) => cal.url !== urlToRemove,
    );
    setCalendars(updatedCalendars);

    await showToast({
      title: "Calendar Removed",
      message: "Calendar has been removed successfully.",
      style: Toast.Style.Success,
    });
  };

  if (calendars.length === 0) {
    return (
      <List
        searchBarPlaceholder="Search calendars..."
        actions={
          <ActionPanel>
            <Action
              title="Add Calendar"
              icon={Icon.Plus}
              onAction={() => push(<CalendarForm />)}
            />
          </ActionPanel>
        }
      >
        <List.EmptyView
          title={
            loadError
              ? "Couldn't read calendars.json"
              : "No calendars configured"
          }
          description={
            loadError
              ? `Reason: ${loadError.message}${
                  loadError.backupPath
                    ? `. Backup at ${loadError.backupPath}`
                    : ""
                }`
              : "Add your first calendar to get started"
          }
          icon={Icon.Calendar}
        />
      </List>
    );
  }

  return (
    <List searchBarPlaceholder="Search calendars...">
      <List.Section title={`${calendars.length} calendars`}>
        {calendars.map((calendar, index) => (
          <List.Item
            key={index}
            title={getCalendarName(calendar)}
            subtitle={calendar.url}
            icon={Icon.Calendar}
            actions={
              <ActionPanel>
                <ActionPanel.Section>
                  <Action
                    title="Edit Calendar"
                    icon={Icon.Pencil}
                    onAction={() => push(<EditCalendar calendar={calendar} />)}
                  />
                  <Action
                    title="Add Calendar"
                    icon={Icon.Plus}
                    onAction={() => push(<CalendarForm />)}
                  />
                </ActionPanel.Section>
                <ActionPanel.Section>
                  <Action.CopyToClipboard
                    icon={Icon.CopyClipboard}
                    title="Copy URL"
                    content={calendar.url}
                  />
                  <Action
                    title="Remove Calendar"
                    icon={Icon.Trash}
                    style={Action.Style.Destructive}
                    shortcut={{ modifiers: ["shift"], key: "delete" }}
                    onAction={() => removeCalendar(calendar.url)}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
