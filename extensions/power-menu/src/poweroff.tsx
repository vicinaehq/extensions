import { executePowerCommandWithConfirmation, POWER_COMMANDS } from "./core/power-commands";

export default async function PowerOff() {
  await executePowerCommandWithConfirmation(POWER_COMMANDS.POWEROFF);
}
