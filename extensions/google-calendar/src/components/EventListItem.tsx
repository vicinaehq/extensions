import { Color, Detail, Icon, List } from "@vicinae/api";
import type { CalendarListEntry, GoogleEvent } from "../api/calendar";
import { formatEventTimeRange } from "../lib/date-utils";
import {
  GOOGLE_EVENT_COLORS,
  formatRecurrenceRule,
  getAttendeeSummary,
  getResponseStatusLabel,
  resolveEventColorHex,
} from "../lib/event-values";
import { getMeetingProviderName, getMeetingUrl } from "../lib/meet-links";
import {
  compareEventsByStart,
  dedupeEvents,
  type EventListItemData,
} from "../lib/event-dedupe";

export { compareEventsByStart, dedupeEvents, type EventListItemData };

export function eventSubtitle(
  event: GoogleEvent,
  options: { showLocation: boolean },
): string {
  const time = formatEventTimeRange(event.start, event.end);
  if (options.showLocation && event.location && event.location.length > 0) {
    return time ? `${time} · ${event.location}` : event.location;
  }
  return time;
}

export function eventAccessories(
  item: EventListItemData,
): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];
  const displayColor = resolveEventColorHex(item.event, item.calendarColor);
  if (item.calendarColor || item.calendarName || displayColor) {
    accessories.push({
      tag: {
        value: item.calendarName ?? item.calendarId,
        ...(displayColor ? { color: displayColor } : {}),
      },
      tooltip: item.calendarName ?? item.calendarId,
    });
  }
  const attendeeSummary = getAttendeeSummary(item.event);
  if (attendeeSummary) {
    accessories.push({ text: attendeeSummary });
  }
  const meetingUrl = getMeetingUrl(item.event);
  if (meetingUrl) {
    const provider = getMeetingProviderName(meetingUrl);
    accessories.push({
      tag: provider ?? "Video call",
      icon: Icon.Video,
      tooltip: meetingUrl,
    });
  }
  return accessories;
}

export function eventTitleColor(item: EventListItemData): string | undefined {
  return resolveEventColorHex(item.event, item.calendarColor);
}

export function EventListItem({
  item,
  showLocation,
  actions,
}: {
  item: EventListItemData;
  showLocation: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <List.Item
      id={`${item.calendarId}:${item.event.id}`}
      title={item.event.summary ?? "Untitled event"}
      subtitle={eventSubtitle(item.event, { showLocation })}
      keywords={[item.calendarName ?? ""].filter((k) => k.length > 0)}
      accessories={eventAccessories(item)}
      actions={actions}
    />
  );
}

function eventDetailMarkdown(item: EventListItemData): string {
  const { event } = item;
  const lines: string[] = [`# ${event.summary ?? "Untitled event"}`, ""];
  const time = formatEventTimeRange(event.start, event.end, { includeDate: true });
  if (time) {
    lines.push(`**When:** ${time}`);
    lines.push("");
  }
  if (event.location) {
    lines.push(`**Where:** ${event.location}`);
    lines.push("");
  }
  if (event.description) {
    lines.push(event.description);
    lines.push("");
  }
  const meetingUrl = getMeetingUrl(event);
  if (meetingUrl) {
    const provider = getMeetingProviderName(meetingUrl);
    lines.push(`**Meeting:** [${provider ?? "Join link"}](${meetingUrl})`);
    lines.push("");
  }
  return lines.join("\n");
}

export function EventDetailView({
  item,
  actions,
}: {
  item: EventListItemData;
  actions?: React.ReactNode;
}) {
  const { event } = item;
  const meetingUrl = getMeetingUrl(event);
  const recurrenceLines = event.recurrence;
  const recurrence = Array.isArray(recurrenceLines)
    ? recurrenceLines
        .filter((r): r is string => typeof r === "string")
        .map((r) => formatRecurrenceRule(r))
        .find(Boolean)
    : undefined;
  const colorId =
    typeof event.colorId === "string" && GOOGLE_EVENT_COLORS[event.colorId]
      ? event.colorId
      : undefined;
  return (
    <Detail
      markdown={eventDetailMarkdown(item)}
      metadata={
        <Detail.Metadata>
          {item.calendarName ? (
            <Detail.Metadata.Label title="Calendar" text={item.calendarName} icon={Icon.Calendar} />
          ) : null}
          {colorId ? (
            <Detail.Metadata.Label
              title="Colour"
              text={GOOGLE_EVENT_COLORS[colorId].name}
              icon={Icon.Circle}
            />
          ) : null}
          {event.organizer?.email ? (
            <Detail.Metadata.Label
              title="Organizer"
              text={event.organizer.displayName ?? event.organizer.email}
              icon={Icon.Person}
            />
          ) : null}
          {event.attendees && event.attendees.length > 0 ? (
            <Detail.Metadata.TagList title="Attendees">
              {event.attendees.slice(0, 20).map((a) => {
                const statusLabel = getResponseStatusLabel(a.responseStatus);
                const label = a.displayName ?? a.email ?? "Unknown";
                return (
                  <Detail.Metadata.TagList.Item
                    key={a.email ?? label}
                    text={statusLabel ? `${label} · ${statusLabel}` : label}
                    icon={Icon.Person}
                  />
                );
              })}
            </Detail.Metadata.TagList>
          ) : null}
          {recurrence ? (
            <Detail.Metadata.Label title="Repeats" text={recurrence} icon={Icon.ArrowClockwise} />
          ) : null}
          {event.location ? (
            <Detail.Metadata.Label title="Location" text={event.location} icon={Icon.Geopin} />
          ) : null}
          {meetingUrl ? (
            <Detail.Metadata.Link title="Meeting" target={meetingUrl} text="Join meeting" />
          ) : null}
          {event.htmlLink ? (
            <Detail.Metadata.Link title="Google Calendar" target={event.htmlLink} text="Open event" />
          ) : null}
          <Detail.Metadata.Label
            title="Event ID"
            text={{ value: event.id, color: Color.SecondaryText }}
          />
        </Detail.Metadata>
      }
      actions={actions}
    />
  );
}

/** Calendar display helpers shared by list-calendars and the create forms. */
export function calendarDisplayName(cal: CalendarListEntry): string {
  return cal.summaryOverride ?? cal.summary ?? cal.id;
}
