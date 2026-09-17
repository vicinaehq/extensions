import { Detail } from "@vicinae/api";

function prettyMessage(error: Error): string {
	try {
		return "```json\n" + JSON.stringify(JSON.parse(error.message), null, 2) + "\n```";
	} catch {
		return error.message;
	}
}

export function ErrorView({ error, screen, message, actions }: { error: Error, screen: string, message?: string, actions?: React.ReactNode }) {
	return <Detail
		navigationTitle={screen}
		markdown={
			"# Error\n\n" +
			(message ? message + "\n\n" : "") +
			prettyMessage(error)
		}
		actions={actions}
	/>;
}
