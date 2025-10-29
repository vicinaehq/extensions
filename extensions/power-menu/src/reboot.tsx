import { executePowerCommandWithConfirmation, POWER_COMMANDS } from "./core/power-commands";

export default async function Reboot() {
  await executePowerCommandWithConfirmation(POWER_COMMANDS.REBOOT);
}
