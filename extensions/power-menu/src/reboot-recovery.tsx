import { executePowerCommandWithConfirmation, POWER_COMMANDS } from "./core/power-commands";

export default async function RebootRecovery() {
  await executePowerCommandWithConfirmation(POWER_COMMANDS.REBOOT_RECOVERY);
}
