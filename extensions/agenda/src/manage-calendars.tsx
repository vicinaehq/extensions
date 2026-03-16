import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import CalendarForm from "./components/CalendarForm";
import EditCalendar from "./edit-calendar";
import { getCalendars, setCalendars, getCalendarName } from "./lib/calendar";

export default function ManageCalendars() {
  const { push } = useNavigation();
  const calendars = getCalendars();

  const removeCalendar = async (urlToRemove: string) => {
    const updatedCalendars = calendars.filter((cal) => cal.url !== urlToRemove);
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
          title="No calendars configured"
          description="Add your first calendar to get started"
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
