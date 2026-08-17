import { LaunchProps } from "@vicinae/api";
import { runNoView } from "./lib/run";

export default async function Command(props: LaunchProps<{ arguments: Arguments.Sentences }>) {
  await runNoView("sentences", props.arguments?.count);
}
