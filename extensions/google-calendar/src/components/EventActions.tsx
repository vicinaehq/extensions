import React from "react";
import { ActionPanel, Action, Icon } from "@vicinae/api";
import { CalendarEvent } from "../types";
import { EventDetail } from "./EventDetail";

interface EventActionsProps {
  event: CalendarEvent;
  onRefresh: () => void;
}

/**
 * Action panel for calendar events
 *
 * Provides actions for:
 * - View event details
 * - Joining Google Meet (if available)
 * - Opening in Google Calendar
 * - Copying meeting link
 * - Creating new event
 * - Refreshing events
 */
export function EventActions({ event, onRefresh }: EventActionsProps) {
  return (
    <ActionPanel>
      <ActionPanel.Section>
        <Action.Push
          title="View Details"
          icon={Icon.Eye}
          target={<EventDetail event={event} onRefresh={onRefresh} />}
          shortcut={{ modifiers: ["cmd"], key: "d" }}
        />
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
          <Action.CopyToClipboard
            title="Copy Event Link"
            content={event.htmlLink}
            icon={Icon.Link}
            shortcut={{ modifiers: ["cmd", "shift"], key: "c" }}
          />
        </ActionPanel.Section>
      )}

      {!event.meetLink && (
        <ActionPanel.Section>
          <Action.CopyToClipboard
            title="Copy Event Link"
            content={event.htmlLink}
            icon={Icon.Link}
            shortcut={{ modifiers: ["cmd"], key: "c" }}
          />
        </ActionPanel.Section>
      )}

      <ActionPanel.Section>
        <Action.Push
          title="Create Event"
          icon={Icon.Plus}
          target={<CreateEventForm />}
          shortcut={{ modifiers: ["cmd"], key: "n" }}
        />
        <Action
          title="Refresh Events"
          onAction={onRefresh}
          icon={Icon.Repeat}
          shortcut={{ modifiers: ["cmd"], key: "r" }}
        />
      </ActionPanel.Section>
    </ActionPanel>
  );
}

// Import create event form lazily
function CreateEventForm() {
  const CreateEvent = require("../create-event").default;
  return <CreateEvent />;
}
