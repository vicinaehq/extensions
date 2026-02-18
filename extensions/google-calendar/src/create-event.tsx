import React, { useState } from "react";
import { Form, Action, ActionPanel, showToast, Toast, Icon, popToRoot } from "@vicinae/api";
import { useCalendars } from "./hooks/useCalendars";
import { googleCalendarAPI } from "./lib/google-api";
import { parseDuration, calculateEndTime } from "./utils/date-utils";

interface FormValues {
  title: string;
  startDate: Date;
  duration: string;
  calendarId: string;
  description: string;
  location: string;
  attendees: string;
  createMeet: boolean;
}

/**
 * Create Event Command
 *
 * Allows users to create new calendar events with:
 * - Title, date/time, duration
 * - Calendar selection
 * - Optional Google Meet integration
 * - Attendees, location, description
 */
export default function CreateEventCommand() {
  const { calendars, isLoading, selectedCalendarId } = useCalendars();
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(values: FormValues) {
    try {
      setIsSubmitting(true);

      // Validate title
      if (!values.title.trim()) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Title Required",
          message: "Please enter an event title",
        });
        return;
      }

      // Parse and validate duration
      const durationMinutes = parseDuration(values.duration);
      if (!durationMinutes) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Invalid Duration",
          message: "Please use formats like: 30m, 1h, 1h30m",
        });
        return;
      }

      // Ensure startDate is a Date object (form might return string)
      const startTime = values.startDate instanceof Date
        ? values.startDate
        : new Date(values.startDate);

      // Calculate end time
      const endTime = calculateEndTime(startTime, durationMinutes);

      // Parse attendees (comma-separated)
      const attendeeEmails = values.attendees
        ? values.attendees
            .split(",")
            .map((email) => email.trim())
            .filter((email) => email.length > 0)
        : undefined;

      // Create event
      const event = await googleCalendarAPI.createEvent(values.calendarId, {
        title: values.title.trim(),
        startTime,
        endTime,
        description: values.description.trim() || undefined,
        location: values.location.trim() || undefined,
        attendees: attendeeEmails,
        createMeet: values.createMeet,
      });

      // Success toast
      await showToast({
        style: Toast.Style.Success,
        title: "Event Created",
        message: event.meetLink ? "Google Meet link created" : `"${event.title}"`,
      });

      // Close the form
      await popToRoot();
    } catch (error) {
      console.error("Failed to create event:", error);
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to Create Event",
        message: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Default to 30 minutes from now, rounded to next 15-minute interval
  const defaultStartTime = getDefaultStartTime();

  return (
    <Form
      isLoading={isLoading || isSubmitting}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Event" icon={Icon.Plus} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Team Meeting"
        autoFocus
      />

      <Form.DatePicker
        id="startDate"
        title="Start Time"
        defaultValue={defaultStartTime}
        type={Form.DatePicker.Type.DateTime}
      />

      <Form.TextField
        id="duration"
        title="Duration"
        placeholder="1h"
        defaultValue="1h"
        info="Examples: 30m, 1h, 1h30m, 90m"
      />

      {calendars.length > 0 && (
        <Form.Dropdown
          id="calendarId"
          title="Calendar"
          defaultValue={selectedCalendarId}
        >
          {calendars.map((calendar) => (
            <Form.Dropdown.Item
              key={calendar.id}
              value={calendar.id}
              title={calendar.summary}
              icon={calendar.primary ? Icon.Star : Icon.Calendar}
            />
          ))}
        </Form.Dropdown>
      )}

      <Form.Separator />

      <Form.Checkbox
        id="createMeet"
        label="Add Google Meet"
        defaultValue={false}
        info="Automatically create a Google Meet video conference link"
      />

      <Form.TextArea
        id="attendees"
        title="Attendees"
        placeholder="email1@example.com, email2@example.com"
        info="Comma-separated email addresses"
      />

      <Form.TextField
        id="location"
        title="Location"
        placeholder="Conference Room A"
      />

      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Meeting agenda and notes"
      />
    </Form>
  );
}

/**
 * Get default start time (next 15-minute interval, 30 minutes from now)
 */
function getDefaultStartTime(): Date {
  const now = new Date();
  const futureTime = new Date(now.getTime() + 30 * 60000); // 30 minutes from now

  // Round to next 15-minute interval
  const minutes = futureTime.getMinutes();
  const roundedMinutes = Math.ceil(minutes / 15) * 15;

  futureTime.setMinutes(roundedMinutes);
  futureTime.setSeconds(0);
  futureTime.setMilliseconds(0);

  return futureTime;
}
