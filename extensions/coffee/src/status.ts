import { LaunchProps, LaunchType, showHUD, updateCommandMetadata } from "@vicinae/api";
import { applySchedules } from "./lib/coffee";
import { fail } from "./lib/feedback";

export default async function Command(props: LaunchProps) {
  try {
    const status = applySchedules();
    await updateCommandMetadata({
      subtitle: status.caffeinated ? `Caffeinated · ${status.summary}` : "Decaffeinated",
    });

    if (props.launchType === LaunchType.Background) return;

    await showHUD(status.caffeinated ? status.summary : "Decaffeinated");
  } catch (error) {
    await fail(error);
  }
}
