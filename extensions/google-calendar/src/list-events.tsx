import { useEffect, useRef, useState } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  confirmAlert,
  openExtensionPreferences,
  showToast,
  Toast,
} from "@vicinae/api";
import { GoogleApiError, type CalendarListEntry, type GoogleEvent } from "./api/calendar";
import { ensureSession, signOut } from "./auth/google-oauth";
import { getListEventsPreferences } from "./preferences";
import { getCalendarClient } from "./lib/get-client";
import {
  fetchCalendarsWithCache,
  getDefaultCalendarId,
  getVisibleCalendars,
  invalidateCalendarsCache,
  toggleCalendarHidden,
} from "./lib/calendar-selection";
import { computeTimeRange, formatEventDayGroup } from "./lib/date-utils";
import { getMeetingUrl } from "./lib/meet-links";
import { compareEventsByStart, dedupeEvents } from "./lib/event-dedupe";
import type { EventListItemData } from "./lib/event-dedupe";
import { EventDetailView, EventListItem } from "./components/EventListItem";
import { formatGoogleApiError } from "./lib/api-errors";
import { UnauthenticatedView } from "./components/UnauthenticatedView";
import ListCalendarsCommand from "./list-calendars";
import CreateEventCommand from "./create-event";

type Status = "checking" | "ready" | "unauthed";

type Group = "Today" | "Tomorrow" | "Upcoming";

const GROUP_ORDER: Group[] = ["Today", "Tomorrow", "Upcoming"];

function describeRange(daysToShow: string): string {
  const n = Number(daysToShow);
  if (!Number.isFinite(n) || n <= 0) return "coming days";
  const whole = Math.floor(n);
  return `${whole} day${whole === 1 ? "" : "s"}`;
}

function isAbortError(error: unknown, signal?: AbortSignal): boolean {
  if (signal?.aborted) return true;
  return (
    error instanceof DOMException && error.name === "AbortError" ||
    (error instanceof Error && error.name === "AbortError")
  );
}

export default function ListEventsCommand() {
  const [status, setStatus] = useState<Status>("checking");
  const [calendars, setCalendars] = useState<CalendarListEntry[]>([]);
  const [items, setItems] = useState<EventListItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchText, setSearchText] = useState("");
  const [reload, setReload] = useState(0);
  const [loadError, setLoadError] = useState<string | undefined>();
  const calendarsRef = useRef<CalendarListEntry[]>([]);
  const authedRef = useRef(false);
  const generationRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const prefs = getListEventsPreferences();
  const daysToShow = prefs.daysToShow;
  const showLocation = prefs.showLocation;
  const openJoinsMeeting = prefs.openCommandJoinsMeeting;

  async function loadEvents(
    cals: CalendarListEntry[],
    query: string,
    defaultId: string,
    primaryId: string | undefined,
    signal?: AbortSignal,
    expectedGeneration?: number,
  ): Promise<void> {
    const client = getCalendarClient();
    const { timeMin, timeMax } = computeTimeRange(daysToShow);
    const q = query.trim().length > 0 ? query.trim() : undefined;

    // Default calendar first so its occurrences win de-duplication.
    const ordered = [...cals].sort((a, b) => {
      const rank = (c: CalendarListEntry) =>
        c.id === defaultId ? 0 : c.primary ? 1 : 2;
      return rank(a) - rank(b);
    });

    const settled = await Promise.all(
      ordered.map(async (cal) => {
        try {
          const events = (await client.listAllEvents(
            cal.id,
            { timeMin, timeMax, query: q },
            signal ? { signal } : undefined,
          )) as GoogleEvent[];
          return { cal, events };
        } catch (error) {
          if (isAbortError(error, signal)) throw error;
          if (error instanceof GoogleApiError && error.status === 401) {
            throw error;
          }
          await showToast({
            style: Toast.Style.Failure,
            title: `Could not load “${cal.summary ?? cal.id}”`,
            message: formatGoogleApiError(error),
          });
          return { cal, events: [] as GoogleEvent[] };
        }
      }),
    );

    if (signal?.aborted) return;
    if (expectedGeneration !== undefined && generationRef.current !== expectedGeneration) return;

    const byCalendar = new Map<string, CalendarListEntry>();
    for (const cal of cals) byCalendar.set(cal.id, cal);
    const merged: EventListItemData[] = [];
    for (const { cal, events } of settled) {
      for (const event of events) {
        if (event.status === "cancelled") continue;
        merged.push({
          event,
          calendarId: cal.id,
          calendarName: cal.summaryOverride ?? cal.summary ?? cal.id,
          calendarColor: cal.backgroundColor,
        });
      }
    }
    const deduped = dedupeEvents(merged, defaultId, primaryId);
    deduped.sort((a, b) => compareEventsByStart(a.event, b.event));
    setItems(deduped);
    setLoadError(undefined);
  }

  async function boot(query: string): Promise<void> {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    try {
      if (!(await ensureSession())) {
        if (generationRef.current !== generation) return;
        authedRef.current = false;
        setStatus("unauthed");
        setItems([]);
        return;
      }
      authedRef.current = true;
      const client = getCalendarClient();
      const list = await fetchCalendarsWithCache(client);
      if (controller.signal.aborted || generationRef.current !== generation) return;
      const defaultId = await getDefaultCalendarId(list);
      const visible = await getVisibleCalendars(list);
      const primaryId = list.find((c) => c.primary)?.id;
      calendarsRef.current = visible;
      setCalendars(visible);
      setStatus("ready");
      await loadEvents(visible, query, defaultId, primaryId, controller.signal, generation);
    } catch (error) {
      if (isAbortError(error, controller.signal)) return;
      if (generationRef.current !== generation) return;
      if (error instanceof GoogleApiError && error.status === 401) {
        await showToast({
          style: Toast.Style.Failure,
          title: "Google session expired",
          message: "Please sign in again.",
        });
        authedRef.current = false;
        setStatus("unauthed");
      } else {
        const message = formatGoogleApiError(error);
        setLoadError(message);
        await showToast({
          style: Toast.Style.Failure,
          title: "Could not load events",
          message,
        });
        setStatus("ready");
      }
    } finally {
      if (generationRef.current === generation) setIsLoading(false);
    }
  }

  // Initial load + explicit refreshes.
  useEffect(() => {
    void boot("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload]);

  // Server-side search, debounced ~300ms (List also throttles keystrokes).
  // Each keystroke bumps the generation and aborts the in-flight fetch so a
  // slow older response can never overwrite newer results.
  useEffect(() => {
    if (!authedRef.current || calendarsRef.current.length === 0) return;
    const timer = setTimeout(() => {
      const generation = generationRef.current + 1;
      generationRef.current = generation;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setIsLoading(true);
      void (async () => {
        try {
          const cals = calendarsRef.current;
          const defaultId = await getDefaultCalendarId(cals);
          const primaryId = cals.find((c) => c.primary)?.id;
          if (controller.signal.aborted || generationRef.current !== generation) return;
          await loadEvents(cals, searchText, defaultId, primaryId, controller.signal, generation);
        } catch (error) {
          if (isAbortError(error, controller.signal)) return;
          if (generationRef.current !== generation) return;
          if (error instanceof GoogleApiError && error.status === 401) {
            setStatus("unauthed");
          } else {
            await showToast({
              style: Toast.Style.Failure,
              title: "Search failed",
              message: formatGoogleApiError(error),
            });
          }
        } finally {
          if (generationRef.current === generation) setIsLoading(false);
        }
      })();
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchText]);

  if (status === "checking") {
    return <List isLoading navigationTitle="My Schedule" searchBarPlaceholder="Search events" />;
  }

  if (status === "unauthed") {
    return <UnauthenticatedView onAuthenticated={() => setReload((n) => n + 1)} />;
  }

  function handleRefresh() {
    invalidateCalendarsCache();
    setReload((n) => n + 1);
  }

  async function handleToggleVisibility(item: EventListItemData) {
    const nowHidden = await toggleCalendarHidden(item.calendarId);
    await showToast({
      style: Toast.Style.Success,
      title: nowHidden ? "Calendar hidden" : "Calendar shown",
      message: item.calendarName,
    });
    handleRefresh();
  }

  async function handleSignOut() {
    const confirmed = await confirmAlert({
      title: "Sign out of Google?",
      message: "This clears your stored Google tokens on this machine.",
      primaryAction: { title: "Sign Out" },
    });
    if (!confirmed) return;
    await signOut();
    invalidateCalendarsCache();
    abortRef.current?.abort();
    authedRef.current = false;
    setCalendars([]);
    calendarsRef.current = [];
    setItems([]);
    setStatus("unauthed");
  }

  function itemActions(item: EventListItemData) {
    const meetingUrl = getMeetingUrl(item.event);
    const joinFirst = openJoinsMeeting && meetingUrl !== undefined;
    return (
      <ActionPanel>
        {joinFirst && meetingUrl ? (
          <Action.OpenInBrowser
            title="Join Meeting"
            url={meetingUrl}
            icon={Icon.Video}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
        ) : null}
        {item.event.htmlLink && !joinFirst ? (
          <Action.OpenInBrowser
            title="Open in Google Calendar"
            url={item.event.htmlLink}
            icon={Icon.Globe01}
            shortcut={Keyboard.Shortcut.Common.Open}
          />
        ) : null}
        {item.event.htmlLink && joinFirst ? (
          <Action.OpenInBrowser
            title="Open in Google Calendar"
            url={item.event.htmlLink}
            icon={Icon.Globe01}
          />
        ) : null}
        {joinFirst && meetingUrl ? null : meetingUrl ? (
          <Action.OpenInBrowser title="Join Meeting" url={meetingUrl} icon={Icon.Video} />
        ) : null}
        <Action.Push
          title="View Details"
          icon={Icon.Eye}
          target={<EventDetailView item={item} actions={detailActions(item)} />}
        />
        {meetingUrl ? (
          <Action.CopyToClipboard
            title="Copy Meeting Link"
            content={meetingUrl}
            shortcut={Keyboard.Shortcut.Common.Copy}
          />
        ) : null}
        {item.event.htmlLink ? (
          <Action.CopyToClipboard title="Copy Event Link" content={item.event.htmlLink} />
        ) : null}
        <Action.CopyToClipboard title="Copy Event ID" content={item.event.id} />
        <ActionPanel.Section>
          <Action
            title="Refresh"
            icon={Icon.ArrowClockwise}
            shortcut={Keyboard.Shortcut.Common.Refresh}
            onAction={handleRefresh}
          />
          <Action
            title="Toggle Calendar Visibility"
            icon={Icon.EyeDisabled}
            onAction={() => void handleToggleVisibility(item)}
          />
          <Action.Push
            title="Configure Calendars"
            icon={Icon.Cog}
            target={<ListCalendarsCommand />}
          />
          <Action.Push
            title="Create Event"
            icon={Icon.Plus}
            shortcut={Keyboard.Shortcut.Common.New}
            target={<CreateEventCommand />}
          />
          <Action
            title="Sign Out"
            icon={Icon.Logout}
            style={Action.Style.Destructive}
            onAction={() => void handleSignOut()}
          />
        </ActionPanel.Section>
      </ActionPanel>
    );
  }

  function detailActions(item: EventListItemData) {
    const meetingUrl = getMeetingUrl(item.event);
    return (
      <ActionPanel>
        {meetingUrl ? (
          <Action.OpenInBrowser title="Join Meeting" url={meetingUrl} icon={Icon.Video} />
        ) : null}
        {item.event.htmlLink ? (
          <Action.OpenInBrowser
            title="Open in Google Calendar"
            url={item.event.htmlLink}
            icon={Icon.Globe01}
          />
        ) : null}
        {meetingUrl ? <Action.CopyToClipboard title="Copy Meeting Link" content={meetingUrl} /> : null}
        <Action.CopyToClipboard title="Copy Event ID" content={item.event.id} />
      </ActionPanel>
    );
  }

  const groups = new Map<Group, EventListItemData[]>();
  for (const item of items) {
    const group = formatEventDayGroup(item.event.start);
    if (group === "Past") continue;
    const list = groups.get(group) ?? [];
    list.push(item);
    groups.set(group, list);
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="My Schedule"
      searchBarPlaceholder="Search events"
      filtering={false}
      throttle
      onSearchTextChange={setSearchText}
    >
      {items.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No events found"
          description={
            loadError ??
            (searchText.trim()
              ? `No events matching “${searchText.trim()}”.`
              : `No events in the next ${describeRange(daysToShow)}. Enjoy the quiet.`)
          }
          icon={Icon.Calendar}
          actions={
            <ActionPanel>
              <Action
                title="Refresh"
                icon={Icon.ArrowClockwise}
                shortcut={Keyboard.Shortcut.Common.Refresh}
                onAction={handleRefresh}
              />
              <Action
                title="Open Extension Preferences"
                icon={Icon.Cog}
                onAction={() => void openExtensionPreferences().catch(() => undefined)}
              />
            </ActionPanel>
          }
        />
      ) : null}
      {GROUP_ORDER.filter((g) => (groups.get(g) ?? []).length > 0).map((group) => (
        <List.Section key={group} title={group}>
          {(groups.get(group) ?? []).map((item) => (
            <EventListItem
              key={`${item.calendarId}:${item.event.id}`}
              item={item}
              showLocation={showLocation}
              actions={itemActions(item)}
            />
          ))}
        </List.Section>
      ))}
    </List>
  );
}
