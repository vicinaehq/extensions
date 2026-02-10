import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import type { VEvent } from "node-ical";
import { usePreferences } from "../hooks/usePreferences";
import { getCalendarName } from "../lib/calendar";
import { isAllDayEvent, getDisplayStart, getDisplayEnd } from "../lib/events";
import { Calendar } from "../lib/types";
import { getSupportedUrls, urlHandlers } from "../lib/urls";

interface EventListItemProps {
  event: VEvent;
  eventCalendarUrl?: string;
  isShowingDetail: boolean;
  onToggleDetail: () => void;
  calendars: Calendar[];
}

export function EventListItem({
  event,
  eventCalendarUrl,
  isShowingDetail,
  onToggleDetail,
  calendars,
}: EventListItemProps) {
  const { use24Hour } = usePreferences();
  const startDate = new Date(event.start);
  const endDate = new Date(event.end);
  const isAllDay = isAllDayEvent(startDate, endDate);
  const displayStart = getDisplayStart(startDate, isAllDay, use24Hour);
  const displayEnd = getDisplayEnd(endDate, isAllDay, use24Hour);
  const calendar = eventCalendarUrl
    ? calendars.find((cal) => cal.url === eventCalendarUrl)
    : undefined;

  return (
    <List.Item
      title={event.summary || "Untitled Event"}
      subtitle={
        isShowingDetail
          ? undefined
          : isAllDay
            ? ""
            : `${displayStart}${displayEnd ? " - " + displayEnd : ""}`
      }
      icon={Icon.Calendar}
      accessories={
        calendar
          ? [
              {
                tag: {
                  value: getCalendarName(calendar),
                  color: calendar.color,
                },
              },
            ]
          : []
      }
      actions={
        <ActionPanel>
          <Action
            icon={Icon.Eye}
            title={isShowingDetail ? "Hide Details" : "Show Details"}
            onAction={onToggleDetail}
            shortcut={{ modifiers: ["ctrl"], key: "d" }}
          />
          {event.url && (
            <Action.OpenInBrowser
              icon={Icon.Link}
              title="Open Event in Browser"
              url={event.url}
            />
          )}
          {event.description &&
            getSupportedUrls(event.description).length > 0 && (
              <ActionPanel.Section title="Links in Description">
                {getSupportedUrls(event.description).map((url, index) => {
                  const handler = urlHandlers.find((h) => h.pattern.test(url));
                  return handler ? (
                    <Action.OpenInBrowser
                      key={index}
                      icon={Icon.Link}
                      title={handler.name}
                      url={url}
                    />
                  ) : null;
                })}
              </ActionPanel.Section>
            )}
          {event.location && (
            <ActionPanel.Section>
              <Action.CopyToClipboard
                icon={Icon.CopyClipboard}
                title="Copy Location"
                content={event.location}
              />
            </ActionPanel.Section>
          )}
        </ActionPanel>
      }
      detail={
        <List.Item.Detail
          metadata={
            <List.Item.Detail.Metadata>
              {[
                event.status && (
                  <List.Item.Detail.Metadata.Label
                    key="status"
                    title="Status"
                    text={event.status}
                  />
                ),
                event.location && (
                  <List.Item.Detail.Metadata.Label
                    key="location"
                    title="Location"
                    text={event.location}
                  />
                ),
                event.organizer && (
                  <List.Item.Detail.Metadata.Label
                    key="organizer"
                    title="Organizer"
                    text={
                      typeof event.organizer === "string"
                        ? event.organizer
                        : event.organizer?.val || "Unknown"
                    }
                  />
                ),
                event.url && (
                  <List.Item.Detail.Metadata.Label
                    key="url"
                    title="URL"
                    text={event.url}
                  />
                ),
              ].filter(Boolean)}
            </List.Item.Detail.Metadata>
          }
          markdown={
            event.description
              ? `**Description**\n\n${event.description}`
              : undefined
          }
        />
      }
    />
  );
}
