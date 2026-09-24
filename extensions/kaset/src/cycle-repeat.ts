import { runCommand } from "./lib/command";
import { repeatLabel } from "./lib/format";
import { mutateAndRead } from "./lib/kaset";

export default async function Command() {
	await runCommand(async () => {
		const info = await mutateAndRead("cycleRepeat");
		return `🔁 Repeat: ${repeatLabel(info.repeating)}`;
	});
}
