import { useCallback, useEffect, useMemo, useState } from "react";
import { Action, ActionPanel, Color, Icon, List, openExtensionPreferences } from "@vicinae/api";
import { coffeeStatsSummary, toggle } from "./lib/coffee";
import { readState } from "./lib/state";
import { applySchedulesAndNotify, caffeinateAndNotify, decaffeinateAndNotify, fail } from "./lib/feedback";
import { formatClock, formatDuration } from "./lib/time";
import { sortSchedules } from "./lib/schedule";
import { NewScheduleAction, ScheduleItem } from "./schedule";
import { Status } from "./lib/types";

const QUICK = [
  { title: "15 minutes", ms: 15 * 60 * 1000 },
  { title: "30 minutes", ms: 30 * 60 * 1000 },
  { title: "1 hour", ms: 60 * 60 * 1000 },
  { title: "2 hours", ms: 2 * 60 * 60 * 1000 },
];

export default function Command() {
  const [status, setStatus] = useState<Status>(() => applySchedulesAndNotify());
  const [now, setNow] = useState(Date.now());
  const [search, setSearch] = useState("");

  const refresh = useCallback(() => {
    setStatus(applySchedulesAndNotify());
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const id = setInterval(refresh, 1000);
    return () => clearInterval(id);
  }, [refresh]);

  const schedules = useMemo(() => {
    void now;
    return sortSchedules(readState().schedules, new Date(now));
  }, [now]);

  const remaining =
    status.session?.endsAt && status.session.endsAt > now ? status.session.endsAt - now : status.remainingMs;
  const stats = useMemo(() => coffeeStatsSummary(new Date(now)), [now, status.caffeinated]);

  return (
    <List
      isShowingDetail
      searchBarPlaceholder="Search Coffee"
      onSearchTextChange={setSearch}
      actions={
        <ActionPanel>
          <NewScheduleAction onCreated={refresh} />
          <Action title="Settings" icon={Icon.Cog} shortcut={{ key: ",", modifiers: ["cmd"] }} onAction={openExtensionPreferences} />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title={search.trim() ? "No matching items" : "Coffee"}
        description={search.trim() ? "Try a different search." : "Caffeinate, pick a duration, or add a weekly schedule."}
        icon={Icon.Moon}
      />
      <List.Section title="Status">
        <List.Item
          title={status.caffeinated ? "Caffeinated" : "Decaffeinated"}
          icon={status.caffeinated ? "☕" : Icon.Moon}
          accessories={statusAccessories(status, remaining)}
          detail={
            <List.Item.Detail
              markdown={statusMarkdown(status, remaining)}
              metadata={
                <List.Item.Detail.Metadata>
                  <List.Item.Detail.Metadata.Label
                    title="Status"
                    text={status.caffeinated ? "Caffeinated" : "Decaffeinated"}
                  />
                  <List.Item.Detail.Metadata.Label title="Mode" text={modeLabel(status)} />
                  {remaining != null ? (
                    <List.Item.Detail.Metadata.Label title="Remaining" text={formatDuration(remaining)} />
                  ) : null}
                  {status.session?.waitName ? (
                    <List.Item.Detail.Metadata.Label title="App" text={status.session.waitName} />
                  ) : null}
                </List.Item.Detail.Metadata>
              }
            />
          }
          actions={
            <ActionPanel>
              {status.caffeinated ? (
                <Action
                  title="Decaffeinate"
                  icon={Icon.Moon}
                  onAction={async () => {
                    await decaffeinateAndNotify();
                    refresh();
                  }}
                />
              ) : (
                <Action
                  title="Caffeinate"
                  icon={Icon.CheckCircle}
                  onAction={async () => {
                    await caffeinateAndNotify({ mode: "indefinite" }, "Caffeinated");
                    refresh();
                  }}
                />
              )}
              <Action
                title="Toggle"
                icon={Icon.Switch}
                shortcut={{ key: "t", modifiers: ["cmd"] }}
                onAction={async () => {
                  try {
                    toggle();
                    refresh();
                  } catch (error) {
                    await fail(error);
                  }
                }}
              />
              <ActionPanel.Section>
                <Action.Push
                  title="Your Coffees"
                  icon={Icon.BarChart}
                  target={<StatisticsView stats={stats} />}
                />
                <NewScheduleAction onCreated={refresh} />
                <Action
                  title="Settings"
                  icon={Icon.Cog}
                  shortcut={{ key: ",", modifiers: ["cmd"] }}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
        <List.Item
          title="Your Coffees"
          icon={Icon.BarChart}
          detail={
            <List.Item.Detail
              markdown={statisticsOverviewMarkdown(stats)}
            />
          }
          actions={
            <ActionPanel>
              <Action.Push title="Open Your Coffees" icon={Icon.BarChart} target={<StatisticsView stats={stats} />} />
              <ActionPanel.Section>
                <NewScheduleAction onCreated={refresh} />
                <Action
                  title="Settings"
                  icon={Icon.Cog}
                  shortcut={{ key: ",", modifiers: ["cmd"] }}
                  onAction={openExtensionPreferences}
                />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      </List.Section>

      <List.Section title="Keep awake">
        {QUICK.map((preset) => (
          <List.Item
            key={preset.title}
            title={preset.title}
            icon={Icon.Clock}
            detail={<List.Item.Detail markdown={quickPresetMarkdown(preset.ms, now)} />}
            actions={
              <ActionPanel>
                <Action
                  title={`Caffeinate for ${preset.title}`}
                  icon={Icon.Clock}
                  onAction={async () => {
                    await caffeinateAndNotify(
                      { mode: "timed", durationMs: preset.ms },
                      `Caffeinated for ${preset.title}`,
                    );
                    refresh();
                  }}
                />
                <ActionPanel.Section>
                  <NewScheduleAction onCreated={refresh} />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))}
      </List.Section>

      <List.Section title="Schedules">
        {schedules.length === 0 ? (
          <List.Item
            title="New Schedule"
            subtitle="Weekly windows, including overnight"
            icon={Icon.Plus}
            detail={
              <List.Item.Detail markdown={"# Schedules\n\nAdd a weekly window to stay awake. Overnight is fine — 11:00 to 08:00 runs until morning."} />
            }
            actions={
              <ActionPanel>
                <NewScheduleAction onCreated={refresh} />
              </ActionPanel>
            }
          />
        ) : (
          schedules.map((schedule) => (
            <ScheduleItem key={schedule.id} schedule={schedule} onChange={refresh} />
          ))
        )}
      </List.Section>
    </List>
  );
}

function StatisticsView({ stats }: { stats: { allTime: number; thisWeek: number; thisMonth: number } }) {
  return (
    <List isShowingDetail searchBarPlaceholder="Search your coffees">
      <List.Section title="Your Coffees">
        <List.Item
          title="All Time"
          subtitle="Since you started using Coffee"
          icon={Icon.Clock}
          accessories={[{ text: `${stats.allTime}` }]}
          detail={
            <List.Item.Detail
              markdown={[
                "# All Time",
                "",
                "Total sessions ever brewed on this machine.",
                "",
                `**${stats.allTime}** coffee session${stats.allTime === 1 ? "" : "s"}.`,
              ].join("\n")}
            />
          }
        />
        <List.Item
          title="This Week"
          subtitle="Sessions brewed since Monday"
          icon={Icon.Calendar}
          accessories={[{ text: `${stats.thisWeek}` }]}
          detail={
            <List.Item.Detail
              markdown={[
                "# This Week",
                "",
                "Counts sessions started during the current week.",
                "",
                `**${stats.thisWeek}** coffee session${stats.thisWeek === 1 ? "" : "s"} this week.`,
              ].join("\n")}
            />
          }
        />
        <List.Item
          title="This Month"
          subtitle="Sessions brewed this calendar month"
          icon={Icon.Calendar}
          accessories={[{ text: `${stats.thisMonth}` }]}
          detail={
            <List.Item.Detail
              markdown={[
                "# This Month",
                "",
                "Counts sessions started in the current calendar month.",
                "",
                `**${stats.thisMonth}** coffee session${stats.thisMonth === 1 ? "" : "s"} this month.`,
              ].join("\n")}
            />
          }
        />
      </List.Section>
    </List>
  );
}

function statisticsOverviewMarkdown(stats: { allTime: number; thisWeek: number; thisMonth: number }): string {
  return [
    "# Your Coffees",
    "",
    "Track your caffeination habits over time.",
    "",
    `- **All time:** ${stats.allTime}`,
    `- **This week:** ${stats.thisWeek}`,
    `- **This month:** ${stats.thisMonth}`,
  ].join("\n");
}

function statusAccessories(status: Status, remaining: number | null) {
  if (!status.caffeinated) return undefined;
  if (status.session?.mode === "schedule") {
    return [{ tag: { value: remaining != null ? `Brewing · ${formatDuration(remaining)}` : "Brewing", color: Color.Green } }];
  }
  if (remaining != null) {
    return [{ tag: { value: formatDuration(remaining), color: Color.Green } }];
  }
  return [{ tag: { value: "Caffeinated", color: Color.Green } }];
}

function modeLabel(status: Status): string {
  if (!status.session) return "Decaffeinated";
  switch (status.session.mode) {
    case "indefinite":
      return "Until you decaffeinate";
    case "timed":
      return "For a duration";
    case "until":
      return "Until a time";
    case "while":
      return "While an app is open";
    case "schedule":
      return "On a schedule";
    default:
      return status.session.mode;
  }
}

function statusMarkdown(status: Status, remaining: number | null): string {
  if (!status.caffeinated) {
    return [
      "# Decaffeinated",
      "",
      "Sleep can take over.",
      "",
      "Caffeinate, pick a duration, or add a weekly schedule.",
    ].join("\n");
  }

  const lines = ["# Caffeinated", "", status.summary];
  if (remaining != null) lines.push("", `**${formatDuration(remaining)}** remaining.`);
  if (status.session?.waitName) lines.push("", `Waiting on **${status.session.waitName}**.`);
  return lines.join("\n");
}

function quickPresetMarkdown(durationMs: number, nowMs: number): string {
  const end = new Date(nowMs + durationMs);
  return [
    `# ${formatDuration(durationMs)}`,
    "",
    `Keeps your machine caffeinated for **${formatDuration(durationMs)}**.`,
    "",
    `Ends around **${formatClock(end)}**.`,
  ].join("\n");
}
