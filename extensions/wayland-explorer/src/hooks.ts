import { fetchProtocols, type TransformedProtocolData } from "./client";
import { useEffect, useState } from "react";

export const useProtocols = () => {
	const [protocols, setProtocols] = useState<TransformedProtocolData[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>();

	useEffect(() => {
		setIsLoading(true);
		fetchProtocols()
			.then(setProtocols)
			.catch((e) => setError(new Error(`${e}`)))
			.finally(() => setIsLoading(false));
	}, []);

	return { protocols, error, isLoading };
};
