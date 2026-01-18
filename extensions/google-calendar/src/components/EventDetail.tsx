import React from "react";
import { Detail, ActionPanel, Action, Icon } from "@vicinae/api";
import { CalendarEvent } from "../types";
import { formatEventTime, formatEventDuration } from "../utils/date-utils";
import { format } from "date-fns";

interface EventDetailProps {
  event: CalendarEvent;
  onRefresh: () => void;
}

/**
 * Event detail view showing all event information
 */
export function EventDetail({ event, onRefresh }: EventDetailProps) {
  const markdown = buildEventMarkdown(event);

  return (
    <Detail
      markdown={markdown}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label
            title="Time"
            text={formatEventTime(event)}
            icon={Icon.Clock}
          />
          {!event.isAllDay && (
            <Detail.Metadata.Label
              title="Duration"
              text={formatEventDuration(event)}
              icon={Icon.Hourglass}
            />
          )}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label
            title="Calendar"
            text={event.calendarId}
            icon={Icon.Calendar}
          />
          {event.status && (
            <Detail.Metadata.Label
              title="Status"
              text={event.status}
              icon={getStatusIcon(event.status)}
            />
          )}
          {event.responseStatus && (
            <Detail.Metadata.Label
              title="Your Response"
              text={formatResponseStatus(event.responseStatus)}
              icon={getResponseIcon(event.responseStatus)}
            />
          )}
          {event.recurrence && (
            <Detail.Metadata.Label
              title="Recurrence"
              text="Recurring event"
              icon={Icon.Repeat}
            />
          )}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            {event.meetLink && (
              <Action.OpenInBrowser
                title="Join Google Meet"
                url={event.meetLink}
                icon={Icon.Video}
                shortcut={{ modifiers: ["cmd"], key: "j" }}
              />
            )}
            <Action.OpenInBrowser
              title="Open in Google Calendar"
              url={event.htmlLink}
              icon={Icon.Globe}
              shortcut={{ modifiers: ["cmd"], key: "o" }}
            />
          </ActionPanel.Section>

          {event.meetLink && (
            <ActionPanel.Section>
              <Action.CopyToClipboard
                title="Copy Meeting Link"
                content={event.meetLink}
                icon={Icon.Clipboard}
                shortcut={{ modifiers: ["cmd"], key: "c" }}
              />
            </ActionPanel.Section>
          )}

          <ActionPanel.Section>
            <Action
              title="Refresh Events"
              onAction={onRefresh}
              icon={Icon.Repeat}
              shortcut={{ modifiers: ["cmd"], key: "r" }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

/**
 * Build markdown content for event
 */
function buildEventMarkdown(event: CalendarEvent): string {
  const parts: string[] = [];

  // Title
  parts.push(`# ${event.title}\n`);

  // Date and time
  const dateStr = format(event.startTime, "EEEE, MMMM d, yyyy");
  const timeStr = event.isAllDay
    ? "All day"
    : `${format(event.startTime, "h:mm a")} - ${format(event.endTime, "h:mm a")}`;
  parts.push(`**${dateStr}**`);
  parts.push(`${timeStr}\n`);

  // Location
  if (event.location) {
    parts.push(`📍 ${event.location}\n`);
  }

  // Google Meet
  if (event.meetLink) {
    parts.push(`🎥 [Join Google Meet](${event.meetLink})\n`);
  }

  // Description
  if (event.description) {
    parts.push(`## Description\n`);
    parts.push(`${event.description}\n`);
  }

  // Attendees
  if (event.attendees && event.attendees.length > 0) {
    parts.push(`## Attendees (${event.attendees.length})\n`);
    event.attendees.forEach((attendee) => {
      const status = attendee.responseStatus
        ? ` ${getResponseEmoji(attendee.responseStatus)}`
        : "";
      const name = attendee.name || attendee.email;
      parts.push(`- ${name}${status}`);
      if (attendee.self) {
        parts.push(" (you)");
      }
      parts.push("\n");
    });
  }

  return parts.join("");
}

/**
 * Get icon for event status
 */
function getStatusIcon(status: string): Icon {
  switch (status) {
    case "confirmed":
      return Icon.CheckCircle;
    case "tentative":
      return Icon.QuestionMarkCircle;
    case "cancelled":
      return Icon.XMarkCircle;
    default:
      return Icon.Circle;
  }
}

/**
 * Get icon for response status
 */
function getResponseIcon(status: string): Icon {
  switch (status) {
    case "accepted":
      return Icon.CheckCircle;
    case "declined":
      return Icon.XMarkCircle;
    case "tentative":
      return Icon.QuestionMarkCircle;
    default:
      return Icon.Circle;
  }
}

/**
 * Format response status for display
 */
function formatResponseStatus(status: string): string {
  switch (status) {
    case "accepted":
      return "Accepted";
    case "declined":
      return "Declined";
    case "tentative":
      return "Maybe";
    case "needsAction":
      return "Not responded";
    default:
      return status;
  }
}

/**
 * Get emoji for response status
 */
function getResponseEmoji(status: string): string {
  switch (status) {
    case "accepted":
      return "✅";
    case "declined":
      return "❌";
    case "tentative":
      return "❓";
    default:
      return "⚪";
  }
}
