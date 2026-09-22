import { Alert, confirmAlert } from "@vicinae/api";

/**
 * Ask the user to confirm a potentially destructive operation.
 * Returns `true` only when the primary action was chosen.
 */
export async function askConfirm(
	title: string,
	message: string,
	primaryLabel = "Yes",
): Promise<boolean> {
	return confirmAlert({
		title,
		message,
		primaryAction: {
			title: primaryLabel,
			style: Alert.ActionStyle.Destructive,
		},
		dismissAction: { title: "Cancel", style: Alert.ActionStyle.Cancel },
	});
}
