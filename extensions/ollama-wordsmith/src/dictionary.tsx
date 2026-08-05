import type { LaunchProps } from "@vicinae/api";
import OllamaView from "./components/ollama-view";

export default function Command(props: LaunchProps) {
	const initialText =
		(props.launchContext as { text?: string } | undefined)?.text || undefined;
	return <OllamaView mode="dictionary" initialText={initialText} />;
}
