import { Fragment, useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Form,
  Icon,
  LocalStorage,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import {
  getCalendars,
  isMacOSEnabled,
  setCalendars,
  setMacOSEnabled,
} from "../lib/calendar";
import {
  listMacOSCalendars,
  hasMacOSAccess,
  MacOSCalendarInfo,
} from "../lib/macosCalendar";
import { isMacOSCalendarUrl, macosCalendarUrl } from "../lib/macosUrl";
import { colorOptions } from "../lib/forms";
import { CACHE_KEY } from "../lib/constants";
import { Calendar } from "../lib/types";

type Step = "consent" | "pick";

const getSelectedUrls = (): Set<string> =>
  new Set(
    getCalendars()
      .filter((calendar) => isMacOSCalendarUrl(calendar.url))
      .map((calendar) => calendar.url),
  );

const groupBySource = (
  calendars: MacOSCalendarInfo[],
): Array<[string, MacOSCalendarInfo[]]> => {
  const groups = new Map<string, MacOSCalendarInfo[]>();

  for (const calendar of calendars) {
    const key = calendar.source || "Other";
    const items = groups.get(key) ?? [];
    items.push(calendar);
    groups.set(key, items);
  }

  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
};

export default function MacOSCalendars() {
  const { pop } = useNavigation();
  const [step, setStep] = useState<Step>(() =>
    isMacOSEnabled() ? "pick" : "consent",
  );
  const [calendars, setCalendarsState] = useState<MacOSCalendarInfo[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<Set<string>>(() =>
    getSelectedUrls(),
  );
  const [isLoading, setIsLoading] = useState(() => isMacOSEnabled());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step !== "pick") return;

    let cancelled = false;
    (async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listMacOSCalendars();
        if (cancelled) return;
        if (!hasMacOSAccess(result.status)) {
          setError(
            "Calendar access was denied. Enable Agenda in System Settings → Privacy & Security → Calendars, then reopen this screen.",
          );
        } else {
          setCalendarsState(result.calendars);
          setSelectedUrls(getSelectedUrls());
        }
      } catch (caught) {
        if (!cancelled) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [step]);

  const handleConsent = async () => {
    await showToast({
      style: Toast.Style.Animated,
      title: "Requesting Calendar access…",
    });

    try {
      const result = await listMacOSCalendars();

      if (!hasMacOSAccess(result.status)) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Calendar access not granted",
          message:
            "Open System Settings → Privacy & Security → Calendars, enable Agenda, then try again.",
        });
        return;
      }

      setMacOSEnabled(true);
      setCalendarsState(result.calendars);
      setSelectedUrls(getSelectedUrls());
      setError(null);
      setStep("pick");

      await showToast({
        style: Toast.Style.Success,
        title: "Calendar access granted",
      });
    } catch (caught) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Failed to access Calendar",
        message: caught instanceof Error ? caught.message : String(caught),
      });
    }
  };

  const handleSave = async (values: Form.Values) => {
    const chosen = calendars.filter((calendar) => Boolean(values[calendar.id]));
    const previous = new Map(
      getCalendars()
        .filter((calendar) => isMacOSCalendarUrl(calendar.url))
        .map((calendar) => [calendar.url, calendar]),
    );
    const others = getCalendars().filter(
      (calendar) => !isMacOSCalendarUrl(calendar.url),
    );
    const palette = colorOptions.map((option) => option.value);

    const selected: Calendar[] = chosen.map((calendar, index) => {
      const url = macosCalendarUrl(calendar.id);
      const existing = previous.get(url);
      return {
        url,
        name: calendar.title || calendar.id,
        color: existing?.color ?? palette[index % palette.length],
        source: calendar.source ?? undefined,
      };
    });

    setCalendars([...others, ...selected]);
    await LocalStorage.removeItem(CACHE_KEY);

    await showToast({
      style: Toast.Style.Success,
      title: "macOS Calendars Updated",
      message:
        selected.length === 0
          ? "No calendars selected."
          : `${selected.length} calendar(s) selected.`,
    });

    pop();
  };

  const handleDisable = async () => {
    setMacOSEnabled(false);
    await LocalStorage.removeItem(CACHE_KEY);
    await showToast({
      style: Toast.Style.Success,
      title: "macOS Calendar access disabled",
    });
    pop();
  };

  if (step === "consent") {
    return (
      <Form
        navigationTitle="macOS Calendar"
        actions={
          <ActionPanel>
            <Action
              title="Allow macOS Calendar Access"
              icon={Icon.Checkmark}
              onAction={handleConsent}
            />
          </ActionPanel>
        }
      >
        <Form.Description
          title="Read from macOS Calendar"
          text="Agenda can read events directly from the calendars configured in the macOS Calendar app, including iCloud, Google and Exchange accounts."
        />
        <Form.Separator />
        <Form.Description text="Agenda only reads the calendars you select. Events are fetched locally through macOS, cached on your machine, and never sent anywhere. You can turn this off at any time. macOS will ask for permission next." />
      </Form>
    );
  }

  const groups = groupBySource(calendars);

  return (
    <Form
      isLoading={isLoading}
      navigationTitle="Select macOS Calendars"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Save Selection"
            icon={Icon.Checkmark}
            onSubmit={handleSave}
          />
          <ActionPanel.Section>
            <Action
              title="Disable macOS Calendar Access"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={handleDisable}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      {error ? (
        <Form.Description title="Access problem" text={error} />
      ) : calendars.length === 0 ? (
        <Form.Description
          title="No calendars found"
          text="macOS Calendar did not return any calendars. Add an account in the Calendar app and reopen this screen."
        />
      ) : (
        <>
          {groups.map(([source, items]) => (
            <Fragment key={source}>
              <Form.Separator />
              <Form.Description
                title={source}
                text={`${items.length} calendar${items.length === 1 ? "" : "s"}`}
              />
              {items.map((calendar) => (
                <Form.Checkbox
                  key={calendar.id}
                  id={calendar.id}
                  label={
                    calendar.allowed
                      ? calendar.title
                      : `${calendar.title} (read-only)`
                  }
                  defaultValue={selectedUrls.has(macosCalendarUrl(calendar.id))}
                />
              ))}
            </Fragment>
          ))}
          <Form.Description text="Choose one or more calendars to show in Agenda." />
        </>
      )}
    </Form>
  );
}
