export interface Preferences {
	tavilyApiKey: string;
	groqApiKey?: string;
	groqModel?: string;
	searchDepth?: "basic" | "advanced";
	maxResults?: string;
	includeImages?: boolean;
}

export interface TavilyResult {
	title: string;
	url: string;
	content: string;
	score?: number;
}

export interface TavilyImage {
	url: string;
}

export type TurnPhase = "searching" | "synthesizing" | "done" | "error";

export interface ConversationTurn {
	id: string;
	query: string;
	answer: string;
	results: TavilyResult[];
	images: TavilyImage[];
	phase: TurnPhase;
	errorMsg: string | null;
	createdAt: number;
}

export interface ChatThread {
	id: string;
	title: string;
	createdAt: number;
	updatedAt: number;
	/** Ordered newest turn first (index 0 is the latest turn). */
	turns: ConversationTurn[];
}

export type TurnRunMode = "initial" | "new" | "followup" | "regenerate";
