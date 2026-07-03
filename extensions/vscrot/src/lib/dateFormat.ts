export const formatDateTokens = (format: string): string => {
	const date = new Date();
	const tokens: Record<string, string> = {
		"%Y": date.getFullYear().toString(),
		"%m": (date.getMonth() + 1).toString().padStart(2, "0"),
		"%d": date.getDate().toString().padStart(2, "0"),
		"%H": date.getHours().toString().padStart(2, "0"),
		"%M": date.getMinutes().toString().padStart(2, "0"),
		"%S": date.getSeconds().toString().padStart(2, "0"),
	};
	let result = format;
	for (const [token, value] of Object.entries(tokens)) {
		result = result.split(token).join(value);
	}
	return result;
};
