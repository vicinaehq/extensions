export type Skill = {
	id: string;
	skillId: string;
	name: string;
	installs: number;
	source: string;
};

export type SearchSkillResponse = {
	query: string;
	searchType: string;
	skills: Skill[];
};

export const searchSkills = async (
	q: string,
	limit = 100,
	signal?: AbortSignal,
): Promise<SearchSkillResponse> => {
	const params = new URLSearchParams({ q, limit: String(limit) });
	const url = `https://skills.sh/api/search?${params}`;
	const res = await fetch(url, { signal });

	if (!res.ok) throw new Error(await res.text());

	return res.json();
};
