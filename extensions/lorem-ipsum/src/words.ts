import { LaunchProps } from "@vicinae/api";
import { runNoView } from "./lib/run";

export default async function Command(props: LaunchProps<{ arguments: Arguments.Words }>) {
  await runNoView("words", props.arguments?.count);
}
