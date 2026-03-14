import React from "react";
import { List, Icon, Color } from "@vicinae/api";
import { CalendarEvent } from "../types";
import { formatEventTime, formatEventDuration, getRelativeTime, isEventNow, isEventSoon } from "../utils/date-utils";
import { EventActions } from "./EventActions";

interface EventItemProps {
  event: CalendarEvent;
  onRefresh: () => void;
}

/**
 * Calendar event list item with styled accessories and icons
 */
export function EventItem({ event, onRefresh }: EventItemProps) {
  const icon = getEventIcon(event);
  const accessories = getEventAccessories(event);
  const subtitle = getEventSubtitle(event);

  return (
    <List.Item
      icon={icon}
      title={event.title}
      subtitle={subtitle}
      accessories={accessories}
      actions={<EventActions event={event} onRefresh={onRefresh} />}
    />
  );
}

/**
 * Get icon based on event status and timing
 */
function getEventIcon(event: CalendarEvent): List.Item.Icon {
  // Event happening now - green circle
  if (isEventNow(event)) {
    return {
      source: Icon.Circle,
      tintColor: Color.Green,
    };
  }

  // Event starting soon - yellow circle
  if (isEventSoon(event)) {
    return {
      source: Icon.Circle,
      tintColor: Color.Yellow,
    };
  }

  // Response status based icons
  if (event.responseStatus === "accepted") {
    return {
      source: Icon.CheckCircle,
      tintColor: Color.Green,
    };
  }

  if (event.responseStatus === "declined") {
    return {
      source: Icon.XMarkCircle,
      tintColor: Color.Red,
    };
  }

  if (event.responseStatus === "tentative") {
    return {
      source: Icon.QuestionMarkCircle,
      tintColor: Color.Yellow,
    };
  }

  // Default calendar icon
  return Icon.Calendar;
}

/**
 * Get accessories for event item
 */
function getEventAccessories(event: CalendarEvent): List.Item.Accessory[] {
  const accessories: List.Item.Accessory[] = [];

  // Relative time (e.g., "in 2h", "Happening now")
  const relativeTime = getRelativeTime(event);
  if (relativeTime) {
    accessories.push({
      text: relativeTime,
      tooltip: "Time until event starts",
    });
  }

  // Video conference indicator
  if (event.meetLink) {
    accessories.push({
      icon: Icon.Video,
      tooltip: "Has Google Meet link",
    });
  }

  // Attendee count
  if (event.attendees && event.attendees.length > 1) {
    accessories.push({
      icon: Icon.Person,
      text: `${event.attendees.length}`,
      tooltip: `${event.attendees.length} attendee(s)`,
    });
  }

  // Recurrence indicator
  if (event.recurrence || event.recurringEventId) {
    accessories.push({
      icon: Icon.Repeat,
      tooltip: "Recurring event",
    });
  }

  return accessories;
}

/**
 * Get subtitle showing time and duration
 */
function getEventSubtitle(event: CalendarEvent): string {
  const time = formatEventTime(event);
  const duration = formatEventDuration(event);

  if (duration) {
    return `${time} · ${duration}`;
  }

  return time;
}
