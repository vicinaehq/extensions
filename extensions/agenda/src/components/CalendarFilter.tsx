import { List, Icon, Color } from "@vicinae/api";
import { Calendar } from "../lib/types";
import { getCalendarName } from "../lib/calendar";

interface CalendarFilterProps {
  selectedCalendar: string;
  onCalendarChange: (calendar: string) => void;
  calendars: Calendar[];
}

export function CalendarFilter({
  selectedCalendar,
  onCalendarChange,
  calendars,
}: CalendarFilterProps) {
  return (
    <List.Dropdown
      tooltip="Filter by calendar"
      value={selectedCalendar}
      onChange={onCalendarChange}
    >
      <List.Dropdown.Item value="all" title="All Calendars" icon={Icon.List} />
      {calendars.map((calendar, index) => (
        <List.Dropdown.Item
          key={index}
          value={calendar.url}
          title={getCalendarName(calendar)}
          icon={{
            source: Icon.Dot,
            tintColor: calendar.color || Color.Blue,
          }}
        />
      ))}
    </List.Dropdown>
  );
}