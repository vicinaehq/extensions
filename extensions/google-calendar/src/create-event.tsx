import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  openExtensionPreferences,
  popToRoot,
  showToast,
  Toast,
} from "@vicinae/api";
import { GoogleApiError, type CalendarListEntry, type EventInput } from "./api/calendar";
import { ensureSession } from "./auth/google-oauth";
import { getExtensionPreferences, readSendUpdates } from "./preferences";
import { getCalendarClient } from "./lib/get-client";
import {
  fetchCalendarsWithCache,
  getDefaultCalendarId,
} from "./lib/calendar-selection";
import { addMinutes, resolveEventDurationMinutes, toLocalISOString } from "./lib/date-utils";
import { GOOGLE_EVENT_COLORS, splitAttendeeEmails } from "./lib/event-values";
import { UnauthenticatedView } from "./components/UnauthenticatedView";
import { calendarDisplayName } from "./components/EventListItem";
import { formatGoogleApiError } from "./lib/api-errors";

type Status = "checking" | "ready" | "unauthed";

const DURATION_OPTIONS = ["15", "30", "45", "60", "90", "120"];

const REMINDER_OPTIONS = [
  { title: "Default", value: "default" },
  { title: "10 minutes before", value: "10" },
  { title: "30 minutes before", value: "30" },
  { title: "1 hour before", value: "60" },
  { title: "1 day before", value: "1440" },
];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateOnly(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function nextDay(date: Date): Date {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + 1);
  return copy;
}

function readAddSignature(): boolean {
  try {
    return getExtensionPreferences().addSignature;
  } catch {
    return true;
  }
}

function roundUpToNextHalfHour(from: Date): Date {
  const copy = new Date(from);
  copy.setSeconds(0, 0);
  const minutes = copy.getMinutes();
  const remainder = minutes % 30;
  if (remainder !== 0) copy.setMinutes(minutes + (30 - remainder));
  return copy;
}

export default function CreateEventCommand() {
  const [status, setStatus] = useState<Status>("checking");
  const [reload, setReload] = useState(0);
  const [calendars, setCalendars] = useState<CalendarListEntry[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [titleError, setTitleError] = useState<string | undefined>();
  const [calendarId, setCalendarId] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [start, setStart] = useState<Date | null>(() => roundUpToNextHalfHour(new Date()));
  const [startError, setStartError] = useState<string | undefined>();
  const [duration, setDuration] = useState<string>(() => {
    try {
      return String(resolveEventDurationMinutes(getExtensionPreferences().defaultEventDuration));
    } catch {
      return "30";
    }
  });
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [attendeesText, setAttendeesText] = useState("");
  const [colorId, setColorId] = useState("default");
  const [reminder, setReminder] = useState("default");
  const [createMeet, setCreateMeet] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setCalendarsLoading(true);
      try {
        if (!(await ensureSession())) {
          if (!cancelled) setStatus("unauthed");
          return;
        }
        const list = await fetchCalendarsWithCache(getCalendarClient());
        if (!cancelled) {
          setCalendars(list);
          setCalendarId(await getDefaultCalendarId(list));
          setStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          if (error instanceof GoogleApiError && error.status === 401) {
            setStatus("unauthed");
          } else {
            await showToast({
              style: Toast.Style.Failure,
              title: "Could not load calendars",
              message: formatGoogleApiError(error),
            });
            setStatus("ready");
          }
        }
      } finally {
        if (!cancelled) setCalendarsLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (status === "checking") {
    return <Form isLoading navigationTitle="Create Event" />;
  }

  if (status === "unauthed") {
    // Flip to "checking" AND bump reload: the boot effect depends on reload,
    // so a bare setStatus would leave a stale loading view that never boots.
    return (
      <UnauthenticatedView
        onAuthenticated={() => {
          setStatus("checking");
          setReload((n) => n + 1);
        }}
      />
    );
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim();
    if (trimmedTitle.length === 0) {
      setTitleError("Title is required");
      await showToast({ style: Toast.Style.Failure, title: "Title is required" });
      return;
    }
    setTitleError(undefined);
    if (!start) {
      setStartError("Start date is required");
      await showToast({ style: Toast.Style.Failure, title: "Start date is required" });
      return;
    }
    setStartError(undefined);
    if (submitting) return;
    setSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Creating event…" });
    try {
      const targetCalendar = calendarId || (await getDefaultCalendarId(calendars));
      const { valid: attendeeEmails, invalid: invalidAttendees } =
        splitAttendeeEmails(attendeesText);
      if (invalidAttendees.length > 0) {
        await showToast({
          style: Toast.Style.Failure,
          title:
            invalidAttendees.length === 1
              ? "1 invalid attendee ignored"
              : `${invalidAttendees.length} invalid attendees ignored`,
          message: invalidAttendees.join(", "),
        });
      }

      let descriptionText = description.trim().length > 0 ? description : undefined;
      if (descriptionText && readAddSignature()) {
        descriptionText = `${descriptionText}\n\nCreated with Vicinae`;
      } else if (!descriptionText && readAddSignature()) {
        descriptionText = "Created with Vicinae";
      }

      const input: EventInput = allDay
        ? {
            summary: trimmedTitle,
            start: { date: toDateOnly(start) },
            end: { date: toDateOnly(nextDay(start)) },
          }
        : {
            summary: trimmedTitle,
            start: { dateTime: toLocalISOString(start) },
            end: {
              dateTime: toLocalISOString(
                addMinutes(start, resolveEventDurationMinutes(duration)),
              ),
            },
          };
      if (location.trim()) input.location = location.trim();
      if (descriptionText) input.description = descriptionText;
      if (attendeeEmails.length > 0) {
        input.attendees = attendeeEmails.map((email) => ({ email }));
      }
      if (colorId !== "default" && GOOGLE_EVENT_COLORS[colorId]) {
        input.colorId = colorId;
      }
      if (reminder === "default") {
        input.reminders = { useDefault: true };
      } else {
        input.reminders = {
          useDefault: false,
          overrides: [{ method: "popup", minutes: Number(reminder) }],
        };
      }
      if (createMeet) {
        input.conferenceData = {
          createRequest: {
            requestId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        };
      }

      const created = await getCalendarClient().createEvent(targetCalendar, input, {
        sendUpdates: readSendUpdates(),
        ...(createMeet ? { conferenceDataVersion: 1 } : {}),
      });
      toast.style = Toast.Style.Success;
      toast.title = "Event created";
      toast.message = created.summary ?? trimmedTitle;
      await toast.update();
      await popToRoot();
    } catch (error) {
      if (error instanceof GoogleApiError && error.status === 401) {
        toast.style = Toast.Style.Failure;
        toast.title = "Google session expired";
        toast.message = "Please sign in again.";
        await toast.update();
        setStatus("unauthed");
      } else {
        toast.style = Toast.Style.Failure;
        toast.title = "Could not create event";
        toast.message = formatGoogleApiError(error);
        await toast.update();
      }
    } finally {
      setSubmitting(false);
    }
  }

  const invalidAttendeePreview = splitAttendeeEmails(attendeesText).invalid;

  return (
    <Form
      navigationTitle="Create Event"
      isLoading={submitting || calendarsLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Event" onSubmit={() => void handleSubmit()} />
          <ActionPanel.Section>
            <Action
              title="Open Extension Preferences"
              icon={Icon.Cog}
              onAction={() => void openExtensionPreferences().catch(() => undefined)}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      <Form.TextField
        id="title"
        title="Title"
        placeholder="Team standup"
        value={title}
        error={titleError}
        onChange={setTitle}
        autoFocus
      />
      <Form.Dropdown
        id="calendar"
        title="Calendar"
        value={calendarId}
        onChange={setCalendarId}
        isLoading={calendarsLoading}
      >
        {calendars.map((cal) => (
          <Form.Dropdown.Item
            key={cal.id}
            title={calendarDisplayName(cal)}
            value={cal.id}
          />
        ))}
      </Form.Dropdown>
      {calendars.length === 0 && !calendarsLoading ? (
        <Form.Description text="No calendars loaded. Sign in with Google and set your Client ID in the extension preferences." />
      ) : null}
      <Form.Checkbox
        id="allDay"
        title="All-day"
        label="All-day event"
        value={allDay}
        onChange={setAllDay}
      />
      <Form.DatePicker
        id="start"
        title={allDay ? "Date" : "Start"}
        type={allDay ? Form.DatePicker.Type.Date : Form.DatePicker.Type.DateTime}
        value={start}
        error={startError}
        onChange={setStart}
      />
      {allDay ? null : (
        <Form.Dropdown id="duration" title="Duration" value={duration} onChange={setDuration}>
          {DURATION_OPTIONS.map((minutes) => (
            <Form.Dropdown.Item
              key={minutes}
              title={`${minutes} minutes`}
              value={minutes}
            />
          ))}
        </Form.Dropdown>
      )}
      <Form.TextField
        id="location"
        title="Location"
        placeholder="Meeting room or address"
        value={location}
        onChange={setLocation}
      />
      <Form.TextArea
        id="description"
        title="Description"
        placeholder="Agenda, notes, links…"
        value={description}
        onChange={setDescription}
      />
      <Form.TextField
        id="attendees"
        title="Attendees"
        placeholder="alice@example.com, bob@example.com"
        info="Separate multiple email addresses with commas or spaces."
        value={attendeesText}
        onChange={setAttendeesText}
      />
      {invalidAttendeePreview.length > 0 ? (
        <Form.Description
          title="Invalid attendees"
          text={`Ignored (${invalidAttendeePreview.length}): ${invalidAttendeePreview.join(", ")} — valid addresses are still invited.`}
        />
      ) : null}
      <Form.Dropdown id="color" title="Colour" value={colorId} onChange={setColorId}>
        <Form.Dropdown.Item title="Default" value="default" />
        {Object.entries(GOOGLE_EVENT_COLORS).map(([id, color]) => (
          <Form.Dropdown.Item key={id} title={color.name} value={id} />
        ))}
      </Form.Dropdown>
      <Form.Dropdown id="reminder" title="Reminder" value={reminder} onChange={setReminder}>
        {REMINDER_OPTIONS.map((option) => (
          <Form.Dropdown.Item key={option.value} title={option.title} value={option.value} />
        ))}
      </Form.Dropdown>
      <Form.Checkbox
        id="createMeet"
        title="Google Meet"
        label="Create a Google Meet link"
        value={createMeet}
        onChange={setCreateMeet}
      />
    </Form>
  );
}
