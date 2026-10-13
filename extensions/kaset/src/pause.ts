import { runCommand } from "./lib/command";
import { mutate } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		await mutate("pause");
		return "⏸ Paused";
	});
}
