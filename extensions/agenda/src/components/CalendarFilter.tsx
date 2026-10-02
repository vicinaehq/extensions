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
  const groups = new Map<string, Calendar[]>();
  const ungrouped: Calendar[] = [];

  for (const calendar of calendars) {
    if (calendar.source) {
      const items = groups.get(calendar.source) ?? [];
      items.push(calendar);
      groups.set(calendar.source, items);
    } else {
      ungrouped.push(calendar);
    }
  }

  const sortedGroups = [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b),
  );

  const renderItem = (calendar: Calendar) => (
    <List.Dropdown.Item
      key={calendar.url}
      value={calendar.url}
      title={getCalendarName(calendar)}
      icon={{
        source: Icon.Dot,
        tintColor: calendar.color || Color.Blue,
      }}
    />
  );

  return (
    <List.Dropdown
      tooltip="Filter by calendar"
      value={selectedCalendar}
      onChange={onCalendarChange}
    >
      <List.Dropdown.Item
        value="all"
        title="All Calendars"
        icon={Icon.AppWindowList}
      />
      {sortedGroups.map(([source, items]) => (
        <List.Dropdown.Section key={source} title={source}>
          {items.map(renderItem)}
        </List.Dropdown.Section>
      ))}
      {ungrouped.map(renderItem)}
    </List.Dropdown>
  );
}
