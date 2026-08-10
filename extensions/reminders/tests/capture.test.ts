import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("capture discovery", () => {
	it("exposes the reminder view and native interval command", async () => {
		const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
			commands: Array<Record<string, unknown>>;
		};
		expect(manifest.commands).toHaveLength(2);
		const [command, intervalCommand] = manifest.commands;
		expect(command).toMatchObject({ title: "Remind Me", mode: "view" });
		expect(command?.keywords).toEqual(expect.arrayContaining(["remind"]));
		expect(command?.arguments).toEqual([
			expect.objectContaining({ name: "reminder", type: "text", required: false }),
		]);
		expect(intervalCommand).toMatchObject({
			name: "check-reminders",
			mode: "no-view",
			interval: "1m",
		});
	});
});
