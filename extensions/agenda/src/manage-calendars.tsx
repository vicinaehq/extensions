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
import MacOSCalendars from "./components/MacOSCalendars";
import {
  getActiveCalendars,
  getCalendars,
  setCalendars,
  getCalendarName,
  isMacOSEnabled,
} from "./lib/calendar";
import { isMacOS, isMacOSCalendarUrl } from "./lib/macosUrl";

export default function ManageCalendars() {
  const { push } = useNavigation();
  const calendars = getActiveCalendars();
  const macosEnabled = isMacOSEnabled();
  const macosCount = calendars.filter((calendar) =>
    isMacOSCalendarUrl(calendar.url),
  ).length;

  const removeCalendar = async (urlToRemove: string) => {
    const updatedCalendars = getCalendars().filter(
      (cal) => cal.url !== urlToRemove,
    );
    setCalendars(updatedCalendars);

    await showToast({
      title: "Calendar Removed",
      message: "Calendar has been removed successfully.",
      style: Toast.Style.Success,
    });
  };

  const macosSection = isMacOS() ? (
    <List.Section title="macOS Calendar">
      <List.Item
        title="Read from macOS Calendar"
        subtitle={
          macosEnabled
            ? `${macosCount} calendar${macosCount === 1 ? "" : "s"} selected`
            : "Disabled"
        }
        icon={macosEnabled ? Icon.Checkmark : Icon.Circle}
        actions={
          <ActionPanel>
            <Action
              title={
                macosEnabled
                  ? "Configure Selected Calendars"
                  : "Enable macOS Calendar"
              }
              icon={Icon.Cog}
              onAction={() => push(<MacOSCalendars />)}
            />
            <ActionPanel.Section>
              <Action
                title="Add Calendar"
                icon={Icon.Plus}
                onAction={() => push(<CalendarForm />)}
              />
            </ActionPanel.Section>
          </ActionPanel>
        }
      />
    </List.Section>
  ) : null;

  return (
    <List searchBarPlaceholder="Search calendars...">
      {macosSection}
      {calendars.length > 0 ? (
        <List.Section title={`${calendars.length} calendars`}>
          {calendars.map((calendar, index) => {
            const isMacos = isMacOSCalendarUrl(calendar.url);
            return (
              <List.Item
                key={index}
                title={getCalendarName(calendar)}
                subtitle={isMacos ? "macOS Calendar" : calendar.url}
                icon={Icon.Calendar}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      {isMacos ? (
                        <Action
                          title="Configure Selected Calendars"
                          icon={Icon.Cog}
                          onAction={() => push(<MacOSCalendars />)}
                        />
                      ) : (
                        <Action
                          title="Edit Calendar"
                          icon={Icon.Pencil}
                          onAction={() =>
                            push(<EditCalendar calendar={calendar} />)
                          }
                        />
                      )}
                      <Action
                        title="Add Calendar"
                        icon={Icon.Plus}
                        onAction={() => push(<CalendarForm />)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      {!isMacos && (
                        <Action.CopyToClipboard
                          icon={Icon.CopyClipboard}
                          title="Copy URL"
                          content={calendar.url}
                        />
                      )}
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
            );
          })}
        </List.Section>
      ) : (
        <List.EmptyView
          title="No calendars configured"
          description="Add your first calendar to get started"
          icon={Icon.Calendar}
          actions={
            <ActionPanel>
              <Action
                title="Add Calendar"
                icon={Icon.Plus}
                onAction={() => push(<CalendarForm />)}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
