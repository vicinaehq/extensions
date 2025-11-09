import {
  Action,
  ActionPanel,
  Icon,
  List,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import EditCalendar from "./edit-calendar";
import { getCalendars, setCalendars, getCalendarName } from "./utils/calendar";

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
      <List>
        <List.Item
          title="No calendars configured"
          subtitle="Use 'Add Calendar' to add your first calendar"
          icon={Icon.ExclamationMark}
        />
      </List>
    );
  }

  return (
    <List>
      <List.Section title="Configured Calendars">
        {calendars.map((calendar, index) => (
          <List.Item
            key={index}
            title={getCalendarName(calendar)}
            subtitle={calendar.url}
            icon={Icon.Calendar}
            actions={
              <ActionPanel>
                <Action
                  title="Edit Calendar"
                  icon={Icon.Pencil}
                  onAction={() => push(<EditCalendar calendar={calendar} />)}
                />
                <Action
                  title="Remove Calendar"
                  icon={Icon.Trash}
                  style={Action.Style.Destructive}
                  onAction={() => removeCalendar(calendar.url)}
                />
                <Action.CopyToClipboard
                  title="Copy URL"
                  content={calendar.url}
                />
              </ActionPanel>
            }
          />
        ))}
      </List.Section>
    </List>
  );
}
