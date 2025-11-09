import { getPreferenceValues } from "@vicinae/api";
import { useCalendarData } from "./hooks/useCalendarData";
import { useCalendarFilter } from "./hooks/useCalendarFilter";
import { UpcomingEvents } from "./components/UpcomingEvents";

export default function Command() {
  const preferences = getPreferenceValues();
  const refreshInterval = parseInt(preferences.refreshInterval) || 15;

  const {
    calendars,
    eventsByDate,
    isLoading,
    lastRefresh,
    eventCalendarsRef,
  } = useCalendarData(refreshInterval);

  const { selectedCalendar, setSelectedCalendar } = useCalendarFilter(calendars);

  return (
    <UpcomingEvents
      calendars={calendars}
      eventsByDate={eventsByDate}
      isLoading={isLoading}
      lastRefresh={lastRefresh}
      selectedCalendar={selectedCalendar}
      onCalendarChange={setSelectedCalendar}
      eventCalendars={eventCalendarsRef.current}
    />
  );
}