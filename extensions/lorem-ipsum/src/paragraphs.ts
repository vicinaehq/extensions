import { LaunchProps } from "@vicinae/api";
import { runNoView } from "./lib/run";

export default async function Command(props: LaunchProps<{ arguments: Arguments.Paragraphs }>) {
  await runNoView("paragraphs", props.arguments?.count);
}
