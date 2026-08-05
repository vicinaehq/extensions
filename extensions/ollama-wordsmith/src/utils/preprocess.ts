export interface PreprocessedInput {
	text: string;
	masks: Map<string, string>;
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/g;
const CODE_BLOCK_PATTERN = /```[\s\S]*?```/g;

let maskCounter = 0;

function resetCounter(): void {
	maskCounter = 0;
}

function nextId(prefix: string): string {
	maskCounter++;
	return `__${prefix}_${maskCounter}__`;
}

/**
 * Mask URLs and code blocks with placeholders.
 * This prevents the model from translating/modifying them,
 * which removes the need for "preserve URLs/code" prompt rules.
 */
export function preprocessInput(input: string): PreprocessedInput {
	resetCounter();
	const masks = new Map<string, string>();
	let text = input;

	// Mask code blocks first (they may contain URLs)
	text = text.replace(CODE_BLOCK_PATTERN, (match) => {
		const id = nextId("CODE");
		masks.set(id, match);
		return id;
	});

	// Mask URLs
	text = text.replace(URL_PATTERN, (match) => {
		const id = nextId("URL");
		masks.set(id, match);
		return id;
	});

	return { text, masks };
}


