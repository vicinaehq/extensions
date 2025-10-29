import { executePowerCommandWithConfirmation, POWER_COMMANDS } from "./core/power-commands";

export default async function RebootUEFI() {
  await executePowerCommandWithConfirmation(POWER_COMMANDS.REBOOT_UEFI);
}
