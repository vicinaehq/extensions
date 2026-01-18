import React, { useMemo, useState } from "react";
import { List, Icon, ActionPanel, Action } from "@vicinae/api";
import { useEvents } from "./hooks/useEvents";
import { useCalendars } from "./hooks/useCalendars";
import { groupEventsByDate, getSectionOrder } from "./utils/date-utils";
import { EventItem } from "./components/EventItem";

/**
 * List Events Command
 *
 * Features:
 * - Event caching with 5-minute refresh
 * - Calendar selection dropdown
 * - Events grouped by date sections (Today, Tomorrow, etc.)
 * - Search functionality
 * - Visual indicators for event status
 * - Google Meet integration
 */
export default function ListEventsCommand() {
  const { calendars, isLoading: calendarsLoading, selectedCalendarId, setSelectedCalendarId } = useCalendars();
  const { events, isLoading: eventsLoading, refresh, lastFetch } = useEvents(selectedCalendarId);
  const [searchText, setSearchText] = useState("");

  // Filter events by search query
  const filteredEvents = useMemo(() => {
    if (!searchText.trim()) return events;

    const query = searchText.toLowerCase();
    return events.filter((event) =>
      event.title.toLowerCase().includes(query) ||
      event.description?.toLowerCase().includes(query) ||
      event.location?.toLowerCase().includes(query) ||
      event.attendees?.some((a) =>
        a.email.toLowerCase().includes(query) ||
        a.name?.toLowerCase().includes(query)
      )
    );
  }, [events, searchText]);

  // Group and sort events by date sections
  const groupedEvents = useMemo(() => groupEventsByDate(filteredEvents), [filteredEvents]);
  const sections = useMemo(() => getSectionOrder(Object.keys(groupedEvents)), [groupedEvents]);

  // Combined loading state
  const isLoading = calendarsLoading || eventsLoading;

  // Get selected calendar name
  const selectedCalendar = calendars.find((cal) => cal.id === selectedCalendarId);
  const calendarName = selectedCalendar?.summary || "Calendar";

  // Format last updated time
  const lastUpdated = lastFetch
    ? `Updated ${lastFetch.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
    : "";

  return (
    <List
      isLoading={isLoading}
      searchBarPlaceholder="Search events..."
      onSearchTextChange={setSearchText}
      navigationTitle={`${calendarName}${lastUpdated ? ` · ${lastUpdated}` : ""}`}
      searchBarAccessory={
        calendars.length > 0 && (
          <List.Dropdown
            tooltip="Select Calendar"
            value={selectedCalendarId}
            onChange={setSelectedCalendarId}
          >
            {calendars.map((calendar) => (
              <List.Dropdown.Item
                key={calendar.id}
                title={calendar.summary}
                value={calendar.id}
                icon={calendar.primary ? Icon.Star : Icon.Calendar}
              />
            ))}
          </List.Dropdown>
        )
      }
    >
      {filteredEvents.length === 0 && !isLoading ? (
        <List.EmptyView
          icon={Icon.Calendar}
          title={searchText ? "No Events Found" : "No Upcoming Events"}
          description={
            searchText
              ? `No events match "${searchText}"`
              : "You don't have any upcoming events in this calendar."
          }
          actions={
            !searchText && (
              <ActionPanel>
                <Action.Push
                  title="Create Event"
                  icon={Icon.Plus}
                  target={<CreateEventForm />}
                  shortcut={{ modifiers: ["cmd"], key: "n" }}
                />
              </ActionPanel>
            )
          }
        />
      ) : (
        sections.map((section) => (
          <List.Section key={section} title={section}>
            {groupedEvents[section].map((event) => (
              <EventItem key={event.id} event={event} onRefresh={refresh} />
            ))}
          </List.Section>
        ))
      )}
    </List>
  );
}

/**
 * Lazy-load create event form
 */
function CreateEventForm() {
  const CreateEvent = require("./create-event").default;
  return <CreateEvent />;
}
