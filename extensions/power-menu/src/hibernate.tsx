import { executePowerCommandWithConfirmation, POWER_COMMANDS } from "./core/power-commands";

export default async function Hibernate() {
  await executePowerCommandWithConfirmation(POWER_COMMANDS.HIBERNATE);
}
