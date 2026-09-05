import { caffeinateAndNotify } from "./lib/feedback";

export default async function Command() {
  await caffeinateAndNotify({ mode: "indefinite" }, "Caffeinated");
}
