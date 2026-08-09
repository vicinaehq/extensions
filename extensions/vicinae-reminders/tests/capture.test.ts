import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

describe("capture discovery", () => {
	it("exposes one Remind Me view command with optional inline text", async () => {
		const manifest = JSON.parse(await readFile("package.json", "utf8")) as {
			commands: Array<Record<string, unknown>>;
		};
		expect(manifest.commands).toHaveLength(1);
		const [command] = manifest.commands;
		expect(command).toMatchObject({ title: "Remind Me", mode: "view" });
		expect(command?.keywords).toEqual(expect.arrayContaining(["remind"]));
		expect(command?.arguments).toEqual([
			expect.objectContaining({ name: "reminder", type: "text", required: false }),
		]);
	});
});
