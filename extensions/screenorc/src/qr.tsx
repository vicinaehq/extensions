import { performScanAndCopy, runQrScan } from "./tools";

export default async function Command() {
	await performScanAndCopy(async (imagePath) => {
		return await runQrScan(imagePath);
	}, "No QR code detected");
}
