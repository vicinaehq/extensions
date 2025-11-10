import { Detail } from "@vicinae/api";
import QRCode from "qrcode";
import { useEffect, useState } from "react";

interface QRCodeDisplayProps {
	url: string;
}

export default function QRCodeDisplay({ url }: QRCodeDisplayProps) {
	const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>("");
	const [_isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		QRCode.toDataURL(url, { width: 350, margin: 2 })
			.then((dataUrl: string) => {
				setQrCodeDataUrl(dataUrl);
				setIsLoading(false);
			})
			.catch((error: unknown) => {
				console.error("Failed to generate QR code:", error);
				setIsLoading(false);
			});
	}, [url]);

	return <Detail markdown={`![QR Code](${qrCodeDataUrl})`} />;
}
