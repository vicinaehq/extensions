import { Color, type List } from "@vicinae/api";

const LABELS: Record<string, { label: string; color: Color }> = {
	modified: { label: "Modified", color: Color.Orange },
	untracked: { label: "Untracked", color: Color.Green },
	deleted: { label: "Deleted", color: Color.Red },
	renamed: { label: "Renamed", color: Color.Blue },
	staged_new: { label: "Staged", color: Color.Green },
	staged_modified: { label: "Staged", color: Color.Orange },
	staged_deleted: { label: "Staged", color: Color.Red },
};

export const gitLabel = (status?: string) =>
	status ? LABELS[status] : undefined;

export function gitAccessory(status?: string): List.Item.Accessory[] {
	const info = gitLabel(status);
	return info ? [{ tag: { value: info.label, color: info.color } }] : [];
}
