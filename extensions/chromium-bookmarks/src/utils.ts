export const extractHost = (url: string): string | null => {
	try {
		return new URL(url).hostname;
	} catch (_) {
		return null;
	}
};
