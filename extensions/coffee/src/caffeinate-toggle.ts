import { toggleAndNotify } from "./lib/feedback";

export default async function Command() {
  await toggleAndNotify();
}
