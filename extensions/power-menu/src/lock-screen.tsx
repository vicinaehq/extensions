import { executeLockScreen } from "./core/power-commands";

export default async function LockScreen() {
  await executeLockScreen();
}
