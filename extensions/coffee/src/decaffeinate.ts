import { decaffeinateAndNotify } from "./lib/feedback";

export default async function Command() {
  await decaffeinateAndNotify();
}
