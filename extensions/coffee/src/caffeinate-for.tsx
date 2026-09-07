import { useEffect, useState } from "react";
import {
  Action,
  ActionPanel,
  Color,
  Form,
  Icon,
  LaunchProps,
  List,
  showToast,
  popToRoot,
  Toast,
} from "@vicinae/api";
import { caffeinateAndNotify } from "./lib/feedback";
import { formatDuration, parseDuration } from "./lib/time";

const PRESETS = [
  { title: "15 minutes", ms: 15 * 60 * 1000 },
  { title: "30 minutes", ms: 30 * 60 * 1000 },
  { title: "1 hour", ms: 60 * 60 * 1000 },
  { title: "2 hours", ms: 2 * 60 * 60 * 1000 },
  { title: "4 hours", ms: 4 * 60 * 60 * 1000 },
];

async function caffeinateFor(ms: number) {
  await caffeinateAndNotify(
    { mode: "timed", durationMs: ms, reason: `For ${formatDuration(ms)}` },
    `Caffeinated for ${formatDuration(ms)}`,
  );
  await popToRoot();
}

function CustomDurationForm() {
  const [error, setError] = useState<string | undefined>();

  return (
    <Form
      navigationTitle="Duration"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Caffeinate"
            icon={Icon.Clock}
            onSubmit={async (values) => {
              const ms = parseDuration(String(values.duration ?? ""));
              if (!ms) {
                setError("Enter a duration like 45m or 1h");
                return;
              }
              await caffeinateFor(ms);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.TextField
        id="duration"
        title="Duration"
        placeholder="45m"
        autoFocus
        error={error}
        onChange={() => setError(undefined)}
      />
    </Form>
  );
}

export default function Command(props: LaunchProps<{ arguments: { duration?: string } }>) {
  const duration = props.arguments.duration?.trim();
  const parsed = duration ? parseDuration(duration) : null;
  const [handled, setHandled] = useState(false);
  const [search, setSearch] = useState("");
  const durationInvalid = Boolean(duration && !parsed);

  useEffect(() => {
    if (!duration || handled) return;
    setHandled(true);
    if (parsed) void caffeinateFor(parsed);
    else
      void showToast({
        style: Toast.Style.Failure,
        title: "Unknown duration",
        message: "Enter a duration like 45m or 1h.",
      });
  }, [duration, handled, parsed]);

  if (duration && parsed) return null;

  const untilMidnight = () => {
    const target = new Date();
    target.setHours(24, 0, 0, 0);
    return target.getTime() - Date.now();
  };

  return (
    <List searchBarPlaceholder="Search" onSearchTextChange={setSearch}>
      <List.EmptyView
        title={search.trim() ? "No matching durations" : "Pick a duration"}
        description={search.trim() ? "Try a different search." : "Choose a preset or set a custom duration."}
        icon={Icon.Clock}
      />
      <>
      <List.Section title="Duration">
        {PRESETS.map((preset) => (
          <List.Item
            key={preset.title}
            title={preset.title}
            icon={Icon.Clock}
            actions={
              <ActionPanel>
                <Action title="Caffeinate" icon={Icon.Clock} onAction={() => caffeinateFor(preset.ms)} />
              </ActionPanel>
            }
          />
        ))}
        <List.Item
          title="Until midnight"
          icon={Icon.Moon}
          accessories={[{ text: formatDuration(untilMidnight()) }]}
          actions={
            <ActionPanel>
              <Action title="Caffeinate" icon={Icon.Moon} onAction={() => caffeinateFor(untilMidnight())} />
            </ActionPanel>
          }
        />
      </List.Section>
      <List.Section title="Custom">
        <List.Item
          title="Custom"
          icon={{ source: Icon.Plus, tintColor: Color.SecondaryText }}
          actions={
            <ActionPanel>
              <Action.Push title="Set Duration" icon={Icon.Plus} target={<CustomDurationForm />} />
            </ActionPanel>
          }
        />
      </List.Section>
      </>
    </List>
  );
}
