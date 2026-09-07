import { LaunchProps } from "@vicinae/api";
import { runNoView } from "./lib/run";

export default async function Command(props: LaunchProps<{ arguments: Arguments.Html }>) {
  await runNoView("html", props.arguments?.count);
}
