import { useState, useEffect, useCallback } from "react";
import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
  useNavigation,
  Form,
} from "@vicinae/api";
import { exec } from "child_process";
import { promisify } from "util";
import { ensureGogInstalled, useGogAccounts } from "./utils";

const execAsync = promisify(exec);

interface Event {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string; timeZone?: string };
  end?: { dateTime?: string; date?: string; timeZone?: string };
  htmlLink?: string;
  status?: string;
  attendees?: {
    email: string;
    responseStatus?: string;
    displayName?: string;
    self?: boolean;
  }[];
  created?: string;
  updated?: string;
  creator?: { email: string; self?: boolean };
  organizer?: { email: string; self?: boolean; displayName?: string };
  eventType?: string;
  transparency?: string;
  visibility?: string;
  iCalUID?: string;
  etag?: string;
  kind?: string;
  recurringEventId?: string;
  colorId?: string;
  hangoutLink?: string;
}

interface CalendarEventsResponse {
  events: Event[];
  nextPageToken?: string;
}

interface CalendarInfo {
  id: string;
  summary: string;
  primary?: boolean;
  description?: string;
  summaryOverride?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  colorId?: string;
  accessRole?: string;
  timeZone?: string;
  selected?: boolean;
  etag?: string;
  kind?: string;
}

interface CalendarsResponse {
  calendars: CalendarInfo[];
}

function formatEventTime(event: Event): string {
  const start = event.start?.dateTime || event.start?.date;
  if (!start) return "";

  const date = new Date(start);
  const isAllDay = !event.start?.dateTime;

  if (isAllDay) {
    return date.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  }

  return date.toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface CreateEventFormProps {
  account: string;
  calendarId: string;
  onComplete: () => void;
}

function CreateEventForm({
  account,
  calendarId,
  onComplete,
}: CreateEventFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Plus}
            title="Create Event"
            onSubmit={async (values) => {
              try {
                const { summary, from, to, location, description, allDay } =
                  values as {
                    summary: string;
                    from: string;
                    to: string;
                    location?: string;
                    description?: string;
                    allDay?: boolean;
                  };
                let cmd = `gog calendar create --account "${account}" ${calendarId} --summary "${summary}" --from "${from}" --to "${to}"`;
                if (location) cmd += ` --location "${location}"`;
                if (description) cmd += ` --description "${description}"`;
                if (allDay) cmd += " --all-day";
                await execAsync(cmd);
                showToast({ title: "Event created" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to create event",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="summary" title="Title" />
      <Form.TextField id="from" title="Start (e.g., 2024-01-15 09:00)" />
      <Form.TextField id="to" title="End (e.g., 2024-01-15 10:00)" />
      <Form.TextField id="location" title="Location" />
      <Form.TextArea id="description" title="Description" />
      <Form.Checkbox id="allDay" label="All Day Event" />
    </Form>
  );
}

interface UpdateEventFormProps {
  account: string;
  calendarId: string;
  event: Event;
  onComplete: () => void;
}

function UpdateEventForm({
  account,
  calendarId,
  event,
  onComplete,
}: UpdateEventFormProps) {
  const { pop } = useNavigation();

  const startTime = event.start?.dateTime || event.start?.date || "";
  const endTime = event.end?.dateTime || event.end?.date || "";

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Check}
            title="Update Event"
            onSubmit={async (values) => {
              try {
                const { summary, from, to, location, description } = values as {
                  summary: string;
                  from?: string;
                  to?: string;
                  location?: string;
                  description?: string;
                };
                let cmd = `gog calendar update --account "${account}" ${calendarId} ${event.id}`;
                if (summary) cmd += ` --summary "${summary}"`;
                if (from) cmd += ` --from "${from}"`;
                if (to) cmd += ` --to "${to}"`;
                if (location !== undefined)
                  cmd += ` --location "${location || ""}"`;
                if (description !== undefined)
                  cmd += ` --description "${description || ""}"`;
                await execAsync(cmd);
                showToast({ title: "Event updated" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to update event",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="summary"
        title="Title"
        defaultValue={event.summary || ""}
      />
      <Form.TextField
        id="from"
        title="Start (leave empty to keep current)"
        defaultValue={startTime}
      />
      <Form.TextField
        id="to"
        title="End (leave empty to keep current)"
        defaultValue={endTime}
      />
      <Form.TextField
        id="location"
        title="Location"
        defaultValue={event.location || ""}
      />
      <Form.TextArea
        id="description"
        title="Description"
        defaultValue={event.description || ""}
      />
    </Form>
  );
}

// Search Events View
interface SearchEventsViewProps {
  account: string;
  calendarId: string;
}

function SearchEventsView({ account, calendarId }: SearchEventsViewProps) {
  const [searchText, setSearchText] = useState("");
  const [results, setResults] = useState<Event[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const searchEvents = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setResults([]);
        return;
      }
      try {
        setIsLoading(true);
        const calArg =
          calendarId === "all" ? "--all" : `--calendar ${calendarId}`;
        const { stdout } = await execAsync(
          `gog calendar search --account "${account}" "${query}" ${calArg} --json`,
        );
        const data = JSON.parse(stdout);
        setResults(data.events || []);
      } catch (error) {
        console.error(error);
        showToast({ title: "Search failed", style: Toast.Style.Failure });
      } finally {
        setIsLoading(false);
      }
    },
    [calendarId],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      searchEvents(searchText);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchText, searchEvents]);

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search events..."
      filtering={false}
      onSearchTextChange={setSearchText}
    >
      {results.length === 0 && !isLoading && searchText ? (
        <List.EmptyView
          title="No Results"
          description={`No events found for "${searchText}"`}
          icon={Icon.MagnifyingGlass}
        />
      ) : (
        results.map((event) => (
          <List.Item
            key={event.id}
            title={event.summary || "(No title)"}
            subtitle={event.location || ""}
            accessories={[{ text: formatEventTime(event) }]}
            icon={Icon.Calendar}
            actions={
              <ActionPanel>
                {event.htmlLink && (
                  <Action.OpenInBrowser
                    icon={Icon.Link}
                    title="Open in Calendar"
                    url={event.htmlLink}
                  />
                )}
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}

// Focus Time Form
interface FocusTimeFormProps {
  account: string;
  calendarId: string;
  onComplete: () => void;
}

function FocusTimeForm({
  account,
  calendarId,
  onComplete,
}: FocusTimeFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Clock}
            title="Create Focus Time"
            onSubmit={async (values) => {
              try {
                const { from, to, summary } = values as {
                  from: string;
                  to: string;
                  summary?: string;
                };
                const calArg = calendarId === "all" ? "primary" : calendarId;
                let cmd = `gog calendar focus-time --account "${account}" ${calArg} --from "${from}" --to "${to}"`;
                if (summary) cmd += ` --summary "${summary}"`;
                await execAsync(cmd);
                showToast({ title: "Focus time created" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to create focus time",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="from" title="Start (e.g., 2024-01-15 09:00)" />
      <Form.TextField id="to" title="End (e.g., 2024-01-15 12:00)" />
      <Form.TextField id="summary" title="Title (optional)" />
    </Form>
  );
}

// Out of Office Form
interface OutOfOfficeFormProps {
  account: string;
  calendarId: string;
  onComplete: () => void;
}

function OutOfOfficeForm({
  account,
  calendarId,
  onComplete,
}: OutOfOfficeFormProps) {
  const { pop } = useNavigation();

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm
            icon={Icon.Airplane}
            title="Create Out of Office"
            onSubmit={async (values) => {
              try {
                const { from, to, message } = values as {
                  from: string;
                  to: string;
                  message?: string;
                };
                const calArg = calendarId === "all" ? "primary" : calendarId;
                let cmd = `gog calendar out-of-office --account "${account}" ${calArg} --from "${from}" --to "${to}"`;
                if (message) cmd += ` --message "${message}"`;
                await execAsync(cmd);
                showToast({ title: "Out of office created" });
                onComplete();
                pop();
              } catch (error) {
                console.error(error);
                showToast({
                  title: "Failed to create out of office",
                  style: Toast.Style.Failure,
                });
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField id="from" title="Start (e.g., 2024-01-15)" />
      <Form.TextField id="to" title="End (e.g., 2024-01-20)" />
      <Form.TextField id="message" title="Message (optional)" />
    </Form>
  );
}

export default function Calendar() {
  const [events, setEvents] = useState<Event[]>([]);
  const [calendars, setCalendars] = useState<CalendarInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [calendarId, setCalendarId] = useState("all");
  const [account, setAccount] = useState<string>("");
  const { accounts } = useGogAccounts();
  const { push } = useNavigation();

  // Set default account when accounts load
  useEffect(() => {
    if (accounts.length > 0 && !account) {
      setAccount(accounts[0]?.email || "");
    }
  }, [accounts, account]);

  // Load calendars on mount
  useEffect(() => {
    if (!account) return;
    async function loadCalendars() {
      try {
        const { stdout } = await execAsync(
          `gog calendar calendars --account "${account}" --json`,
        );
        const data: CalendarsResponse = JSON.parse(stdout);
        setCalendars(data.calendars || []);
      } catch (error) {
        console.error(error);
      }
    }
    loadCalendars();
  }, [account]);

  const loadEvents = useCallback(async () => {
    if (!(await ensureGogInstalled())) {
      setIsLoading(false);
      return;
    }
    if (!account) {
      setIsLoading(false);
      return;
    }
    try {
      setIsLoading(true);
      const calArg = calendarId === "all" ? "--all" : calendarId;
      const { stdout } = await execAsync(
        `gog calendar events --account "${account}" ${calArg} --days 30 --max 100 --json`,
      );
      const data: CalendarEventsResponse = JSON.parse(stdout);
      setEvents(data.events || []);
    } catch (error) {
      console.error(error);
      showToast({
        title: "Error loading events",
        style: Toast.Style.Failure,
      });
    } finally {
      setIsLoading(false);
    }
  }, [calendarId, account]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const deleteEvent = async (eventId: string) => {
    try {
      await execAsync(
        `gog calendar delete --account "${account}" ${calendarId} ${eventId} --force`,
      );
      showToast({ title: "Event deleted" });
      await loadEvents();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed to delete", style: Toast.Style.Failure });
    }
  };

  const respondToEvent = async (
    eventId: string,
    response: "accepted" | "declined" | "tentative",
  ) => {
    try {
      await execAsync(
        `gog calendar respond --account "${account}" ${calendarId} ${eventId} --response ${response}`,
      );
      const labels = {
        accepted: "Accepted",
        declined: "Declined",
        tentative: "Maybe",
      };
      showToast({ title: labels[response] });
      await loadEvents();
    } catch (error) {
      console.error(error);
      showToast({ title: "Failed", style: Toast.Style.Failure });
    }
  };

  // Deduplicate events by ID (same event can appear from multiple calendars when using --all)
  const uniqueEvents = Array.from(
    new Map(events.map((event) => [event.id, event])).values(),
  );

  // Group events by date
  const groupedEvents = uniqueEvents.reduce(
    (acc, event) => {
      const date = event.start?.dateTime?.split("T")[0] || event.start?.date;
      if (!date) return acc;
      if (!acc[date]) acc[date] = [];
      acc[date].push(event);
      return acc;
    },
    {} as Record<string, Event[]>,
  );

  const globalActions = (
    <ActionPanel>
      <Action
        title="Create Event"
        icon={Icon.Plus}
        onAction={() =>
          push(
            <CreateEventForm
              account={account}
              calendarId={calendarId}
              onComplete={loadEvents}
            />,
          )
        }
      />
      <Action
        title="Search Events"
        icon={Icon.MagnifyingGlass}
        onAction={() =>
          push(<SearchEventsView account={account} calendarId={calendarId} />)
        }
      />
      <Action
        title="Create Focus Time"
        icon={Icon.Clock}
        onAction={() =>
          push(
            <FocusTimeForm
              account={account}
              calendarId={calendarId}
              onComplete={loadEvents}
            />,
          )
        }
      />
      <Action
        title="Create Out of Office"
        icon={Icon.Airplane}
        onAction={() =>
          push(
            <OutOfOfficeForm
              account={account}
              calendarId={calendarId}
              onComplete={loadEvents}
            />,
          )
        }
      />
      <Action
        title="Refresh"
        icon={Icon.RotateClockwise}
        shortcut={{ modifiers: ["ctrl"], key: "r" }}
        onAction={loadEvents}
      />
    </ActionPanel>
  );

  const hasEvents = Object.keys(groupedEvents).length > 0;
  const calendarOptions = [
    { id: "all", summary: "All Calendars" },
    { id: "primary", summary: "Primary Calendar" },
    ...calendars.filter((c) => !c.primary),
  ];

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search events..."
      searchBarAccessory={
        <List.Dropdown
          tooltip="Account & Calendar"
          value={`${account}|${calendarId}`}
          onChange={(value) => {
            const [acc, cal] = value.split("|");
            if (acc && cal) {
              setAccount(acc);
              setCalendarId(cal);
            }
          }}
        >
          {accounts.map((acc) => (
            <List.Dropdown.Section key={acc.email} title={acc.email}>
              {calendarOptions.map((cal) => (
                <List.Dropdown.Item
                  key={`${acc.email}|${cal.id}`}
                  title={cal.summary}
                  value={`${acc.email}|${cal.id}`}
                />
              ))}
            </List.Dropdown.Section>
          ))}
        </List.Dropdown>
      }
      actions={globalActions}
    >
      {!isLoading && !hasEvents ? (
        <List.EmptyView
          title="No Upcoming Events"
          description="Create an event to get started"
          icon={Icon.Calendar}
          actions={globalActions}
        />
      ) : (
        Object.entries(groupedEvents).map(([date, dateEvents]) => (
          <List.Section
            key={date}
            title={`${new Date(date).toLocaleDateString(undefined, {
              weekday: "long",
              month: "long",
              day: "numeric",
            })} (${dateEvents.length})`}
          >
            {dateEvents.map((event) => (
              <List.Item
                key={event.id}
                title={event.summary || "(No title)"}
                subtitle={event.location || ""}
                accessories={[
                  ...(event.hangoutLink
                    ? [{ icon: Icon.Video, tooltip: "Google Meet" }]
                    : []),
                  ...(event.recurringEventId
                    ? [{ icon: Icon.Repeat, tooltip: "Recurring event" }]
                    : []),
                  ...(event.attendees && event.attendees.length > 0
                    ? [
                        {
                          icon: Icon.AddPerson,
                          text: `${event.attendees.length}`,
                          tooltip: `${event.attendees.length} attendees`,
                        },
                      ]
                    : []),
                  ...(!event.start?.dateTime
                    ? [{ tag: { value: "All day", color: "#6366f1" } }]
                    : []),
                  ...(event.status === "tentative"
                    ? [{ tag: { value: "Tentative", color: "#f59e0b" } }]
                    : []),
                  ...(event.status === "cancelled"
                    ? [{ tag: { value: "Cancelled", color: "#ef4444" } }]
                    : []),
                  { text: formatEventTime(event) },
                ]}
                icon={Icon.Calendar}
                actions={
                  <ActionPanel>
                    <ActionPanel.Section>
                      {event.hangoutLink && (
                        <Action.OpenInBrowser
                          icon={Icon.Video}
                          title="Join Google Meet"
                          url={event.hangoutLink}
                        />
                      )}
                      {event.htmlLink && (
                        <Action.OpenInBrowser
                          icon={Icon.Link}
                          title="Open in Calendar"
                          url={event.htmlLink}
                        />
                      )}
                      <Action.CopyToClipboard
                        icon={Icon.CopyClipboard}
                        title="Copy Event Link"
                        content={event.htmlLink || ""}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="Edit">
                      <Action
                        title="Edit Event"
                        icon={Icon.Pencil}
                        onAction={() =>
                          push(
                            <UpdateEventForm
                              account={account}
                              calendarId={
                                calendarId === "all" ? "primary" : calendarId
                              }
                              event={event}
                              onComplete={loadEvents}
                            />,
                          )
                        }
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section title="RSVP">
                      <Action
                        title="Accept"
                        icon={Icon.Check}
                        onAction={() => respondToEvent(event.id, "accepted")}
                      />
                      <Action
                        title="Decline"
                        icon={Icon.XMarkCircle}
                        onAction={() => respondToEvent(event.id, "declined")}
                      />
                      <Action
                        title="Maybe"
                        icon={Icon.QuestionMarkCircle}
                        onAction={() => respondToEvent(event.id, "tentative")}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Delete Event"
                        icon={Icon.Trash}
                        style={Action.Style.Destructive}
                        shortcut={{ modifiers: ["shift"], key: "delete" }}
                        onAction={() => deleteEvent(event.id)}
                      />
                    </ActionPanel.Section>
                    <ActionPanel.Section>
                      <Action
                        title="Create Event"
                        icon={Icon.Plus}
                        onAction={() =>
                          push(
                            <CreateEventForm
                              account={account}
                              calendarId={calendarId}
                              onComplete={loadEvents}
                            />,
                          )
                        }
                      />
                      <Action
                        title="Refresh"
                        icon={Icon.RotateClockwise}
                        shortcut={{ modifiers: ["ctrl"], key: "r" }}
                        onAction={loadEvents}
                      />
                    </ActionPanel.Section>
                  </ActionPanel>
                }
              />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}
