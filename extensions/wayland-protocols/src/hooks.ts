import { fetchProtocols, type ProtocolData } from "./client"
import { useEffect, useState } from 'react';

export const useProtocols = () => {
	const [protocols, setProtocols] = useState<ProtocolData[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	useEffect(() => {
		setIsLoading(true);
		fetchProtocols()
			.then(setProtocols)
			.finally(() => setIsLoading(false));
	}, []);

	return {protocols, isLoading};
}
