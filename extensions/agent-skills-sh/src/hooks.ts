import { type Skill, searchSkills } from "./skills";
import { useState, useEffect, useRef } from "react";

export const useSkills = (q: string) => {
	const [skills, setSkills] = useState<Skill[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const abortRef = useRef<AbortController | null>(null);

	useEffect(() => {
		abortRef.current?.abort();
		setError(null);

		if (q.length <= 2) {
			setSkills([]);
			return;
		}

		const controller = new AbortController();
		abortRef.current = controller;

		setIsLoading(true);
		searchSkills(q, 100, controller.signal)
			.then((res) => {
				setSkills(res.skills);
			})
			.catch((err) => {
				if (controller.signal.aborted) return;
				setError(err instanceof Error ? err : new Error(String(err)));
				setSkills([]);
			})
			.finally(() => {
				if (!controller.signal.aborted) {
					setIsLoading(false);
				}
			});

		return () => controller.abort();
	}, [q]);

	return { skills, isLoading, error };
};
