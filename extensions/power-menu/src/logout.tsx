import { executeLogout } from "./core/power-commands";

export default async function Logout() {
  await executeLogout();
}
