import { useEffect, useState } from "react";
import { Action, ActionPanel, Form, Icon, LaunchProps, popToRoot, showToast, Toast } from "@vicinae/api";
import { caffeinateAndNotify } from "./lib/feedback";
import { formatClock, parseClockTime } from "./lib/time";

function defaultPickerTarget(): Date {
  const target = new Date();
  target.setHours(target.getHours() + 1, 0, 0, 0);
  return target;
}

async function caffeinateUntil(target: Date) {
  const ms = target.getTime() - Date.now();
  if (ms <= 0) {
    await showToast({ style: Toast.Style.Failure, title: "Choose a future time" });
    return;
  }

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayLabel =
    target.toDateString() === now.toDateString()
      ? ""
      : target.toDateString() === tomorrow.toDateString()
        ? "tomorrow at "
        : `${target.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} at `;

  await caffeinateAndNotify(
    { mode: "until", until: target, reason: `Until ${dayLabel}${formatClock(target)}` },
    `Caffeinated until ${dayLabel}${formatClock(target)}`,
  );
  await popToRoot();
}

export default function Command(props: LaunchProps<{ arguments: { time?: string } }>) {
  const typed = props.arguments.time?.trim() ?? "";
  const parsed = typed ? parseClockTime(typed) : null;
  const [handled, setHandled] = useState(false);

  useEffect(() => {
    if (!typed || handled) return;
    setHandled(true);
    if (parsed) {
      void caffeinateUntil(parsed);
      return;
    }
    void showToast({ style: Toast.Style.Failure, title: "Enter a time like 5pm" });
  }, [typed, handled, parsed]);

  if (typed && parsed) return null;

  return (
    <Form
      navigationTitle="Until"
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="Caffeinate"
            icon={Icon.Clock}
            onSubmit={(values) => {
              const target = values.target;
              if (!(target instanceof Date)) {
                void showToast({ style: Toast.Style.Failure, title: "Choose a time" });
                return;
              }
              void caffeinateUntil(target);
            }}
          />
        </ActionPanel>
      }
    >
      <Form.DatePicker
        id="target"
        title="Until"
        type={Form.DatePicker.Type.DateTime}
        defaultValue={defaultPickerTarget()}
      />
    </Form>
  );
}
