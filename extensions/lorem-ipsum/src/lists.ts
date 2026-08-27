import { LaunchProps } from "@vicinae/api";
import { runNoView } from "./lib/run";

export default async function Command(props: LaunchProps<{ arguments: Arguments.Lists }>) {
  await runNoView("list", props.arguments?.count, 5);
}
