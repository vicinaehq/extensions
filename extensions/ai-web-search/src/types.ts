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

export interface ScreenWindowInfo {
	className: string;
	title: string;
	workspace?: string;
}

export interface TerminalContextInfo {
	cwd?: string;
	command?: string;
}

export interface BrowserTabInfo {
	title?: string;
	url: string;
}

export interface ScreenContext {
	blocked: boolean;
	reason?: string;
	window?: ScreenWindowInfo;
	visibleWindows?: ScreenWindowInfo[];
	terminal?: TerminalContextInfo;
	activeTab?: BrowserTabInfo;
	selection?: string;
	clipboard?: string;
	ocrText?: string;
	capturedAt: number;
}

export type TurnPhase = "searching" | "synthesizing" | "done" | "error";

export interface ConversationTurn {
	id: string;
	query: string;
	answer: string;
	results: TavilyResult[];
	images: TavilyImage[];
	screenContext?: ScreenContext;
	phase: TurnPhase;
	errorMsg: string | null;
	createdAt: number;
}

export interface ChatThread {
	id: string;
	title: string;
	kind?: "web" | "screen";
	createdAt: number;
	updatedAt: number;
	/** Ordered newest turn first (index 0 is the latest turn). */
	turns: ConversationTurn[];
}

export type TurnRunMode = "initial" | "new" | "followup" | "regenerate";
