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

export type RouteMode = "cloud" | "local" | "hybrid";

export interface DocumentHitRef {
	path: string;
	title: string;
	source_type: string;
	sensitivity: string;
	start_line: number;
	end_line: number;
	snippet: string;
	score: number;
}

export interface MessageHitRef {
	id: string;
	connector: string;
	chat_or_folder: string;
	thread_id: string;
	sender: string;
	subject: string;
	sent_at: number;
	sensitivity: string;
	snippet: string;
	attachments: string[];
	score: number;
}

export interface DraftRecordRef {
	draft_id: string;
	connector: string;
	to: string[];
	cc: string[];
	subject: string;
	body: string;
	attachments: string[];
	reply_to_message_id?: string | null;
	status: string;
	created_at: number;
	expires_at: number;
	sent_message_id?: string | null;
}

export type TurnPhase = "searching" | "synthesizing" | "done" | "error";

export interface ConversationTurn {
	id: string;
	query: string;
	answer: string;
	results: TavilyResult[];
	images: TavilyImage[];
	screenContext?: ScreenContext;
	routeMode?: RouteMode;
	statusNote?: string;
	needsOllamaFallback?: boolean;
	localDocs?: DocumentHitRef[];
	localMessages?: MessageHitRef[];
	inlineDraft?: DraftRecordRef;
	phase: TurnPhase;
	errorMsg: string | null;
	createdAt: number;
}

export interface ChatThread {
	id: string;
	title: string;
	kind?: "web" | "screen" | "personal";
	createdAt: number;
	updatedAt: number;
	/** Ordered newest turn first (index 0 is the latest turn). */
	turns: ConversationTurn[];
}

export type TurnRunMode = "initial" | "new" | "followup" | "regenerate";
