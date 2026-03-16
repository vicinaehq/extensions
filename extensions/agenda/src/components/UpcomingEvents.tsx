import { Icon, List } from "@vicinae/api";
import { useState } from "react";
import type { VEvent } from "node-ical";
import { Calendar } from "../lib/types";
import { formatDate } from "../lib/calendar";
import { CalendarFilter } from "./CalendarFilter";
import { EventListItem } from "./EventListItem";

interface UpcomingEventsProps {
  calendars: Calendar[];
  eventsByDate: Record<string, VEvent[]>;
  isLoading: boolean;
  lastRefresh: Date | null;
  selectedCalendar: string;
  onCalendarChange: (calendar: string) => void;
  eventCalendars: Map<string, string>;
}

export function UpcomingEvents({
  calendars,
  eventsByDate,
  isLoading,
  lastRefresh,
  selectedCalendar,
  onCalendarChange,
  eventCalendars,
}: UpcomingEventsProps) {
  const [isShowingDetail, setIsShowingDetail] = useState<boolean>(false);

  // Filter events based on selected calendar
  const getFilteredEvents = () => {
    if (selectedCalendar === "all") {
      return eventsByDate;
    }

    const filtered: Record<string, VEvent[]> = {};
    for (const [date, events] of Object.entries(eventsByDate)) {
      const filteredEvents = events.filter((event) => {
        const eventCalendarUrl = eventCalendars.get(event.uid);
        return eventCalendarUrl === selectedCalendar;
      });
      if (filteredEvents.length > 0) {
        filtered[date] = filteredEvents;
      }
    }
    return filtered;
  };

  const filteredEventsByDate = getFilteredEvents();

  if (calendars.length === 0) {
    return (
      <List>
        <List.EmptyView
          title="No calendars configured"
          description="Add iCal URLs using the 'Add Calendar' command"
          icon={Icon.ExclamationMark}
        />
      </List>
    );
  }

  return (
    <List
      isLoading={isLoading}
      isShowingDetail={isShowingDetail}
      searchBarPlaceholder="Search events..."
      searchBarAccessory={
        <CalendarFilter
          selectedCalendar={selectedCalendar}
          onCalendarChange={onCalendarChange}
          calendars={calendars}
        />
      }
    >
      {Object.keys(filteredEventsByDate).length === 0 && !isLoading && (
        <List.EmptyView
          title={
            selectedCalendar === "all"
              ? "No upcoming events"
              : "No events for selected calendar"
          }
          description={
            lastRefresh
              ? `Last updated: ${lastRefresh.toLocaleTimeString()}`
              : "Add calendars to get started"
          }
          icon={Icon.Calendar}
        />
      )}
      {Object.entries(filteredEventsByDate)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, events]) => (
          <List.Section
            key={date}
            title={`${formatDate(date)}${
              events.length > 1 ? ` (${events.length})` : ""
            }`}
          >
            {events.map((event) => {
              const eventCalendarUrl = eventCalendars.get(event.uid);
              return (
                <EventListItem
                  key={event.uid}
                  event={event}
                  eventCalendarUrl={eventCalendarUrl}
                  isShowingDetail={isShowingDetail}
                  onToggleDetail={() => setIsShowingDetail((v) => !v)}
                  calendars={calendars}
                />
              );
            })}
          </List.Section>
        ))}
    </List>
  );
}
