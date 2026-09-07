import { useMemo, useState } from "react";
import {
  Action,
  ActionPanel,
  Alert,
  Color,
  Form,
  Icon,
  Keyboard,
  List,
  confirmAlert,
  showToast,
  Toast,
  useNavigation,
} from "@vicinae/api";
import { Schedule, Weekday } from "./lib/types";
import { readState } from "./lib/state";
import { addSchedules, removeSchedule, updateSchedule } from "./lib/coffee";
import {
  activeWindow,
  formatDayList,
  formatNextStart,
  formatTimeRange,
  isOvernight,
  nextWindowStart,
  runsToday,
  scheduleLabel,
  sortSchedules,
  WEEK_ORDER,
} from "./lib/schedule";
import { formatClock, normalizeClockInput, titleDay } from "./lib/time";
import { applySchedulesAndNotify, fail } from "./lib/feedback";

const newShortcut = Keyboard.Shortcut.Common.New as Keyboard.Shortcut.Common;
const removeShortcut = Keyboard.Shortcut.Common.Remove as Keyboard.Shortcut.Common;

export default function ScheduleCommand() {
  return <ScheduleView />;
}

export function ScheduleView() {
  const [tick, setTick] = useState(0);
  const [search, setSearch] = useState("");
  const schedules = useMemo(() => {
    void tick;
    applySchedulesAndNotify();
    return sortSchedules(readState().schedules);
  }, [tick]);

  const refresh = () => setTick((value) => value + 1);
  const todays = schedules.filter((schedule) => runsToday(schedule));
  const rest = schedules.filter((schedule) => !runsToday(schedule));
  const searching = Boolean(search.trim());

  return (
    <List
      isShowingDetail
      searchBarPlaceholder="Search schedules"
      onSearchTextChange={setSearch}
      actions={
        <ActionPanel>
          <NewScheduleAction onCreated={refresh} />
        </ActionPanel>
      }
    >
      <List.EmptyView
        title={searching ? "No matching schedules" : "No schedules yet"}
        description={
          searching
            ? "Try a different search."
            : "Add a weekly window to stay awake. Overnight is fine — 11:00 to 08:00 runs until morning."
        }
        icon={Icon.Calendar}
        actions={
          <ActionPanel>
            <NewScheduleAction onCreated={refresh} />
          </ActionPanel>
        }
      />
      {todays.length > 0 ? (
        <List.Section title="Today">
          {todays.map((schedule) => (
            <ScheduleItem key={schedule.id} schedule={schedule} onChange={refresh} />
          ))}
        </List.Section>
      ) : null}
      {rest.length > 0 ? (
        <List.Section title="Later">
          {rest.map((schedule) => (
            <ScheduleItem key={schedule.id} schedule={schedule} onChange={refresh} />
          ))}
        </List.Section>
      ) : null}
    </List>
  );
}

export function NewScheduleAction({ onCreated }: { onCreated: () => void }) {
  return (
    <Action.Push
      title="New Schedule"
      icon={Icon.Plus}
      shortcut={newShortcut}
      target={<AddScheduleForm onCreated={onCreated} />}
    />
  );
}

export function ScheduleItem({ schedule, onChange }: { schedule: Schedule; onChange: () => void }) {
  const window = activeWindow(schedule);
  const label = scheduleLabel(schedule);
  const color = label === "Paused" ? Color.SecondaryText : label === "Brewing" ? Color.Green : Color.Blue;
  const overnight = isOvernight(schedule.from, schedule.to);
  const days = formatDayList(schedule.days);

  return (
    <List.Item
      title={formatTimeRange(schedule.from, schedule.to)}
      subtitle={overnight ? `${days} · Overnight` : days}
      icon={Icon.Calendar}
      accessories={[{ tag: { value: label, color } }]}
      detail={<List.Item.Detail markdown={scheduleMarkdown(schedule)} />}
      actions={
        <ActionPanel>
          {schedule.paused ? (
            <Action
              title="Resume"
              icon={Icon.Play}
              onAction={() => {
                updateSchedule(schedule.id, { paused: false, skipUntil: null });
                applySchedulesAndNotify();
                onChange();
              }}
            />
          ) : (
            <Action
              title="Pause"
              icon={Icon.Pause}
              onAction={() => {
                updateSchedule(schedule.id, { paused: true });
                if (window) applySchedulesAndNotify();
                onChange();
              }}
            />
          )}
          <Action
            title="Delete Schedule"
            icon={Icon.Trash}
            style={Action.Style.Destructive}
            shortcut={removeShortcut}
            onAction={async () => {
              const confirmed = await confirmAlert({
                title: "Delete this schedule?",
                message: `${days} · ${formatTimeRange(schedule.from, schedule.to)}`,
                primaryAction: { title: "Delete Schedule", style: Alert.ActionStyle.Destructive },
              });
              if (!confirmed) return;
              try {
                removeSchedule(schedule.id);
              } catch (error) {
                void fail(error);
              }
              onChange();
            }}
          />
          <ActionPanel.Section>
            <NewScheduleAction onCreated={onChange} />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

export function AddScheduleForm({ onCreated }: { onCreated: () => void }) {
  const { pop } = useNavigation();
  const [preset, setPreset] = useState("weekdays");
  const [fromError, setFromError] = useState<string | undefined>();
  const [toError, setToError] = useState<string | undefined>();

  return (
    <Form
      navigationTitle="New Schedule"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Add Schedule"
            icon={Icon.Calendar}
            onSubmit={(values) => {
              const from = normalizeClockInput(String(values.from ?? ""));
              const to = normalizeClockInput(String(values.to ?? ""));
              if (!from) {
                setFromError("Enter a time like 11 or 11:00");
                return;
              }
              if (!to) {
                setToError("Enter a time like 08 or 08:00");
                return;
              }
              if (from === to) {
                setToError("Choose a different end time");
                return;
              }

              const days = daysFromForm(String(values.preset ?? "weekdays"), {
                sunday: Boolean(values.sunday),
                monday: Boolean(values.monday),
                tuesday: Boolean(values.tuesday),
                wednesday: Boolean(values.wednesday),
                thursday: Boolean(values.thursday),
                friday: Boolean(values.friday),
                saturday: Boolean(values.saturday),
              });
              if (days.length === 0) {
                void showToast({ style: Toast.Style.Failure, title: "Choose at least one day" });
                return;
              }

              try {
                addSchedules([{ days, from, to }]);
                onCreated();
                pop();
                void showToast({
                  style: Toast.Style.Success,
                  title: isOvernight(from, to) ? "Overnight schedule added" : "Schedule added",
                });
              } catch (error) {
                void fail(error);
              }
            }}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        title="24-hour clock"
        text="Type 11 or 11:00. If start is later than end, the window runs overnight — 11:00 to 08:00 stays awake until morning."
      />
      <Form.Dropdown id="preset" title="Repeat" value={preset} onChange={setPreset}>
        <Form.Dropdown.Item value="weekdays" title="Weekdays" />
        <Form.Dropdown.Item value="weekends" title="Weekends" />
        <Form.Dropdown.Item value="everyday" title="Every day" />
        <Form.Dropdown.Item value="custom" title="Custom" />
      </Form.Dropdown>
      {preset === "custom"
        ? WEEK_ORDER.map((day) => (
            <Form.Checkbox
              key={day}
              id={day}
              label={titleDay(day)}
              defaultValue={day !== "sunday" && day !== "saturday"}
            />
          ))
        : null}
      <Form.Separator />
      <Form.TextField
        id="from"
        title="Starts"
        placeholder="11:00"
        autoFocus
        error={fromError}
        onChange={() => setFromError(undefined)}
      />
      <Form.TextField
        id="to"
        title="Ends"
        placeholder="08:00"
        error={toError}
        onChange={() => setToError(undefined)}
      />
    </Form>
  );
}

function scheduleMarkdown(schedule: Schedule): string {
  const range = formatTimeRange(schedule.from, schedule.to);
  const days = formatDayList(schedule.days);
  const overnight = isOvernight(schedule.from, schedule.to);
  const label = scheduleLabel(schedule);
  const window = activeWindow(schedule);
  const next = nextWindowStart(schedule);
  const lines = [`# ${range}`, "", overnight ? `${days} · Overnight` : days];

  if (label === "Brewing" && window) {
    lines.push("", `Brewing until ${formatClock(new Date(window.endsAt))}.`);
  } else if (label === "Paused") {
    lines.push("", "Paused. Resume to keep this window.");
  } else if (next) {
    lines.push("", `Next starts ${formatNextStart(next)}.`);
  }

  return lines.join("\n");
}

function daysFromForm(preset: string, values: Partial<Record<Weekday, boolean>>): Weekday[] {
  if (preset === "everyday") return [...WEEK_ORDER];
  if (preset === "weekdays") return ["monday", "tuesday", "wednesday", "thursday", "friday"];
  if (preset === "weekends") return ["saturday", "sunday"];
  return WEEK_ORDER.filter((day) => values[day]);
}
