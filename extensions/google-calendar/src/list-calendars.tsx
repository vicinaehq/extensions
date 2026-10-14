import { useEffect, useState } from "react";
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
import { type CalendarListEntry } from "./api/calendar";
import { ensureSession, signOut } from "./auth/google-oauth";
import { getExtensionPreferences } from "./preferences";
import { getCalendarClient } from "./lib/get-client";
import {
  fetchCalendarsWithCache,
  getDefaultCalendarId,
  invalidateCalendarsCache,
  isCalendarHidden,
  setStoredDefaultCalendarId,
  toggleCalendarHidden,
} from "./lib/calendar-selection";
import { UnauthenticatedView } from "./components/UnauthenticatedView";
import { calendarDisplayName } from "./components/EventListItem";
import { formatGoogleApiError } from "./lib/api-errors";
import { isUnauthenticatedError } from "./lib/auth-errors";
import ListEventsCommand from "./list-events";

type Status = "checking" | "ready" | "unauthed";

function calendarUrlId(id: string): string {
  return `https://calendar.google.com/calendar/u/0/r?cid=${encodeURIComponent(id)}`;
}

export default function ListCalendarsCommand() {
  const [status, setStatus] = useState<Status>("checking");
  const [calendars, setCalendars] = useState<CalendarListEntry[]>([]);
  const [defaultId, setDefaultId] = useState<string>("primary");
  const [preferenceDefaultId, setPreferenceDefaultId] = useState<string | undefined>();
  const [hiddenIds, setHiddenIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function boot() {
      setIsLoading(true);
      try {
        if (!(await ensureSession())) {
          if (!cancelled) {
            setStatus("unauthed");
            setCalendars([]);
          }
          return;
        }
        const client = getCalendarClient();
        const list = await fetchCalendarsWithCache(client);
        const resolvedDefault = await getDefaultCalendarId(list);
        // The `defaultCalendarId` preference is an explicit override: when
        // set, "Set as Default" cannot change the effective default, so the
        // UI says so instead of reporting a success that changed nothing.
        let preferenceOverride: string | undefined;
        try {
          preferenceOverride = getExtensionPreferences().defaultCalendarId;
        } catch {
          preferenceOverride = undefined;
        }
        const hidden: string[] = [];
        for (const cal of list) {
          if (await isCalendarHidden(cal.id)) hidden.push(cal.id);
        }
        if (!cancelled) {
          setCalendars(list);
          setDefaultId(resolvedDefault);
          setPreferenceDefaultId(preferenceOverride);
          setHiddenIds(hidden);
          setStatus("ready");
        }
      } catch (error) {
        if (!cancelled) {
          if (isUnauthenticatedError(error)) {
            await showToast({
              style: Toast.Style.Failure,
              title: "Google session expired",
              message: "Please sign in again.",
            });
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
        if (!cancelled) setIsLoading(false);
      }
    }
    void boot();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  if (status === "checking") {
    return <List isLoading navigationTitle="Calendars" searchBarPlaceholder="Search calendars" />;
  }

  if (status === "unauthed") {
    return <UnauthenticatedView onAuthenticated={() => setReload((n) => n + 1)} />;
  }

  async function handleSetDefault(id: string) {
    // Defense in depth: the action itself is replaced when the preference
    // override is set, but never store a value that cannot take effect.
    if (preferenceDefaultId) {
      await showToast({
        style: Toast.Style.Failure,
        title: "Default calendar comes from preferences",
        message:
          "Clear the Default Calendar ID override in extension preferences to let Set as Default take effect.",
      });
      return;
    }
    await setStoredDefaultCalendarId(id);
    setDefaultId(id);
    await showToast({ style: Toast.Style.Success, title: "Default calendar updated" });
  }

  async function handleToggleVisibility(id: string) {
    const nowHidden = await toggleCalendarHidden(id);
    setHiddenIds((prev) =>
      nowHidden ? [...prev, id] : prev.filter((hidden) => hidden !== id),
    );
    await showToast({
      style: Toast.Style.Success,
      title: nowHidden ? "Calendar hidden from List Events" : "Calendar shown in List Events",
    });
  }

  function handleRefresh() {
    invalidateCalendarsCache();
    setReload((n) => n + 1);
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
    setStatus("unauthed");
  }

  return (
    <List
      isLoading={isLoading}
      navigationTitle="Calendars"
      searchBarPlaceholder="Search calendars"
      isShowingDetail={false}
    >
      {calendars.length === 0 && !isLoading ? (
        <List.EmptyView
          title="No calendars found"
          description="Your Google account has no visible calendars."
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
      {calendars.map((cal) => {
        const isDefault = cal.id === defaultId || (defaultId === "primary" && cal.primary === true);
        const hidden = hiddenIds.includes(cal.id);
        const defaultFromPreferences =
          preferenceDefaultId !== undefined && preferenceDefaultId.length > 0;
        return (
          <List.Item
            key={cal.id}
            id={cal.id}
            title={calendarDisplayName(cal)}
            subtitle={cal.description || cal.id}
            accessories={[
              ...(isDefault
                ? [
                    {
                      icon: Icon.Checkmark,
                      tooltip: defaultFromPreferences
                        ? "Default calendar (from extension preferences)"
                        : "Default calendar",
                    },
                  ]
                : []),
              ...(cal.accessRole ? [{ tag: cal.accessRole }] : []),
              ...(cal.backgroundColor
                ? [{ tag: { value: "●", color: cal.backgroundColor }, tooltip: "Calendar colour" }]
                : []),
              { tag: hidden ? "Hidden" : "Shown" },
            ]}
            actions={
              <ActionPanel>
                {defaultFromPreferences ? (
                  <Action
                    title="Default Set in Preferences"
                    icon={Icon.Info01}
                    onAction={() =>
                      void showToast({
                        style: Toast.Style.Failure,
                        title: "Default calendar comes from preferences",
                        message:
                          "Clear the Default Calendar ID override in extension preferences to let Set as Default take effect.",
                      })
                    }
                  />
                ) : (
                  <Action
                    title="Set as Default"
                    icon={Icon.Checkmark}
                    onAction={() => void handleSetDefault(cal.id)}
                  />
                )}
                <Action
                  title={hidden ? "Show in List Events" : "Hide from List Events"}
                  icon={hidden ? Icon.Eye : Icon.EyeDisabled}
                  onAction={() => void handleToggleVisibility(cal.id)}
                />
                <Action
                  title="Open Extension Preferences"
                  icon={Icon.Cog}
                  onAction={() => void openExtensionPreferences().catch(() => undefined)}
                />
                <Action.OpenInBrowser
                  title="Open in Google Calendar"
                  url={calendarUrlId(cal.id)}
                  icon={Icon.Globe01}
                />
                <Action.CopyToClipboard
                  title="Copy Calendar ID"
                  content={cal.id}
                  shortcut={Keyboard.Shortcut.Common.Copy}
                />
                <Action.Push
                  title="Open in List Events"
                  icon={Icon.Calendar}
                  target={<ListEventsCommand />}
                />
                <ActionPanel.Section>
                  <Action
                    title="Refresh"
                    icon={Icon.ArrowClockwise}
                    shortcut={Keyboard.Shortcut.Common.Refresh}
                    onAction={handleRefresh}
                  />
                  <Action
                    title="Sign Out"
                    icon={Icon.Logout}
                    style={Action.Style.Destructive}
                    onAction={() => void handleSignOut()}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        );
      })}
    </List>
  );
}
