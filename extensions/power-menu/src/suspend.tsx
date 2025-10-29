import { executePowerCommandWithConfirmation, POWER_COMMANDS } from "./core/power-commands";

export default async function Suspend() {
  await executePowerCommandWithConfirmation(POWER_COMMANDS.SUSPEND);
}
