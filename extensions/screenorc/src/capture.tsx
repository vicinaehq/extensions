import { performScanAndCopy, runOcr } from "./tools";

export default async function Command() {
	await performScanAndCopy(async (imagePath) => {
		return await runOcr(imagePath);
	}, "No text detected");
}
