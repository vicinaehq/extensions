import { useEffect, useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Detail,
  Form,
  Icon,
  openExtensionPreferences,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { GoogleApiError, type CalendarListEntry } from "./api/calendar";
import { ensureSession } from "./auth/google-oauth";
import { readSendUpdates } from "./preferences";
import { getCalendarClient } from "./lib/get-client";
import {
  fetchCalendarsWithCache,
  getDefaultCalendarId,
} from "./lib/calendar-selection";
import { parseQuickEventText } from "./lib/quick-event";
import { UnauthenticatedView } from "./components/UnauthenticatedView";
import { calendarDisplayName } from "./components/EventListItem";
import { formatGoogleApiError } from "./lib/api-errors";

type Status = "checking" | "ready" | "unauthed";

function formatPreviewDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function CreateQuickEventCommand() {
  const { push } = useNavigation();
  const [status, setStatus] = useState<Status>("checking");
  const [reload, setReload] = useState(0);
  const [calendars, setCalendars] = useState<CalendarListEntry[]>([]);
  const [calendarsLoading, setCalendarsLoading] = useState(true);
  const [text, setText] = useState("");
  const [calendarId, setCalendarId] = useState("");
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

  const preview = useMemo(() => parseQuickEventText(text), [text]);

  if (status === "checking") {
    return <Form isLoading navigationTitle="Create Quick Event" />;
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

  function previewText(): string {
    if (text.trim().length === 0) {
      return 'Try "Standup tomorrow 9:30 for 30 minutes".';
    }
    if (!preview || preview.confidence === "none" || !preview.start) {
      return `No date detected — Google will interpret "${text.trim()}".`;
    }
    const when =
      preview.end && preview.hasTime
        ? `${formatPreviewDate(preview.start)} → ${formatPreviewDate(preview.end)}`
        : formatPreviewDate(preview.start);
    return `“${preview.title}” — ${when}`;
  }

  async function handleSubmit() {
    const raw = text.trim();
    if (raw.length === 0) {
      await showToast({ style: Toast.Style.Failure, title: "Describe the event first" });
      return;
    }
    if (submitting) return;
    setSubmitting(true);
    const toast = await showToast({ style: Toast.Style.Animated, title: "Creating event…" });
    try {
      const targetCalendar = calendarId || (await getDefaultCalendarId(calendars));
      // Always send the raw text: Google's quickAdd does its own
      // server-side interpretation even when local parsing found nothing.
      const created = await getCalendarClient().quickAddEvent(targetCalendar, raw, {
        sendUpdates: readSendUpdates(),
      });
      toast.style = Toast.Style.Success;
      toast.title = "Event created";
      toast.message = created.summary ?? raw;
      await toast.update();
      const htmlLink = created.htmlLink;
      push(
        <Detail
          markdown={`# ${created.summary ?? raw}\n\nQuick event created${htmlLink ? ` — [open in Google Calendar](${htmlLink})` : ""}.`}
          actions={
            htmlLink ? (
              <ActionPanel>
                <Action.OpenInBrowser
                  title="Open Event"
                  url={htmlLink}
                  icon={Icon.Globe01}
                />
              </ActionPanel>
            ) : undefined
          }
        />,
      );
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

  return (
    <Form
      navigationTitle="Create Quick Event"
      isLoading={submitting || calendarsLoading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="Create Quick Event" onSubmit={() => void handleSubmit()} />
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
        id="text"
        title="Event"
        placeholder="Standup tomorrow 9:30 for 30 minutes"
        value={text}
        onChange={setText}
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
      <Form.Description title="Preview" text={previewText()} />
    </Form>
  );
}
