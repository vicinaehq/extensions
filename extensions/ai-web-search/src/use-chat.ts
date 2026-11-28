import {
	Alert,
	Toast,
	confirmAlert,
	getPreferenceValues,
	showToast,
} from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	buildSynthesisPrompt,
	buildTavilyQuery,
	extractInlineDraftSuggestion,
	highestSensitivity,
	searchTavily,
	streamOllamaSynthesis,
	streamSynthesis,
} from "./api";
import {
	type OllamaHealth,
	createInlineDraft,
	deidentifyForWeb,
	getDaemonStatus,
} from "./daemon";
import {
	clearChatThreads,
	deleteChatThread,
	loadChatThreads,
	upsertChatThread,
} from "./storage";
import type {
	ChatThread,
	ConversationTurn,
	DocumentHitRef,
	MessageHitRef,
	Preferences,
	RouteMode,
	ScreenContext,
	TavilyImage,
	TavilyResult,
	TurnRunMode,
} from "./types";

function makeId(prefix: string): string {
	return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

export function createTurn(
	query: string,
	screenContext?: ScreenContext,
	localDocs?: DocumentHitRef[],
	localMessages?: MessageHitRef[],
): ConversationTurn {
	return {
		id: makeId("turn"),
		query,
		answer: "",
		results: [],
		images: [],
		screenContext,
		localDocs,
		localMessages,
		phase: screenContext ? "synthesizing" : "searching",
		errorMsg: null,
		createdAt: Date.now(),
	};
}

export function createThread(
	query: string,
	kind: "web" | "screen" | "personal" = "web",
	screenContext?: ScreenContext,
	localDocs?: DocumentHitRef[],
	localMessages?: MessageHitRef[],
): ChatThread {
	const now = Date.now();
	return {
		id: makeId("chat"),
		title: query,
		kind,
		createdAt: now,
		updatedAt: now,
		turns: [createTurn(query, screenContext, localDocs, localMessages)],
	};
}

export function useChatController(options: {
	initialQuery?: string;
	initialThread?: ChatThread | null;
}) {
	const initialQuery = options.initialQuery?.trim() ?? "";

	const [thread, setThread] = useState<ChatThread | null>(() => {
		if (options.initialThread) return options.initialThread;
		return initialQuery ? createThread(initialQuery) : null;
	});
	const [history, setHistory] = useState<ChatThread[]>(() => loadChatThreads());

	const threadRef = useRef<ChatThread | null>(thread);
	threadRef.current = thread;

	const abortRef = useRef<AbortController | null>(null);
	const mountedRef = useRef(true);
	const didAutoLaunchRef = useRef(false);

	const commitThread = useCallback(
		(nextThread: ChatThread | null, persist = false) => {
			threadRef.current = nextThread;
			if (mountedRef.current) {
				setThread(nextThread);
			}
			if (persist && nextThread) {
				const updated = upsertChatThread(nextThread);
				if (mountedRef.current) {
					setHistory(updated);
				}
			}
		},
		[],
	);

	const updateTurnById = useCallback(
		(
			turnId: string,
			updater: (prev: ConversationTurn) => ConversationTurn,
			persist = false,
		) => {
			const current = threadRef.current;
			if (!current) return;
			const nextThread: ChatThread = {
				...current,
				updatedAt: Date.now(),
				turns: current.turns.map((t) => (t.id === turnId ? updater(t) : t)),
			};
			commitThread(nextThread, persist);
		},
		[commitThread],
	);

	const runTurn = useCallback(
		async (
			rawQuery: string,
			mode: TurnRunMode,
			turnOptions?: {
				screenContext?: ScreenContext;
				useWeb?: boolean;
				localDocs?: DocumentHitRef[];
				localMessages?: MessageHitRef[];
				ollama?: OllamaHealth;
				forceCloudConsent?: boolean;
			},
		) => {
			const query = rawQuery.trim();
			if (!query) return;

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			const current = threadRef.current;
			const prevLatest = current?.turns[0];
			const screenContext =
				turnOptions?.screenContext ??
				(mode === "regenerate" ? prevLatest?.screenContext : undefined);
			const localDocs =
				turnOptions?.localDocs ??
				(mode === "regenerate" || mode === "followup" ? prevLatest?.localDocs : undefined);
			const localMessages =
				turnOptions?.localMessages ??
				(mode === "regenerate" || mode === "followup" ? prevLatest?.localMessages : undefined);

			const useWeb = turnOptions?.useWeb ?? screenContext === undefined;
			const sensitivity = highestSensitivity(localDocs ?? [], localMessages ?? []);
			const hasPrivateData = sensitivity === "private_local";

			let activeThread: ChatThread;
			let priorChronological: ConversationTurn[] = [];
			let turnId: string;

			if (mode === "initial" && current && current.turns.length > 0) {
				activeThread = current;
				turnId = current.turns[0].id;
			} else if (mode === "regenerate" && current && current.turns.length > 0) {
				turnId = current.turns[0].id;
				priorChronological = current.turns.slice(1).reverse();
				const regenerated = {
					...createTurn(query, screenContext, localDocs, localMessages),
					id: turnId,
				};
				regenerated.phase = useWeb ? "searching" : "synthesizing";
				activeThread = {
					...current,
					updatedAt: Date.now(),
					turns: [regenerated, ...current.turns.slice(1)],
				};
			} else if (mode === "followup" && current) {
				priorChronological = [...current.turns].reverse();
				const nextTurn = createTurn(query, screenContext, localDocs, localMessages);
				nextTurn.phase = useWeb ? "searching" : "synthesizing";
				turnId = nextTurn.id;
				activeThread = {
					...current,
					updatedAt: Date.now(),
					turns: [nextTurn, ...current.turns],
				};
			} else {
				const kind = screenContext
					? "screen"
					: (localDocs?.length || localMessages?.length)
						? "personal"
						: "web";
				activeThread = createThread(query, kind, screenContext, localDocs, localMessages);
				activeThread.turns[0].phase = useWeb ? "searching" : "synthesizing";
				turnId = activeThread.turns[0].id;
			}

			commitThread(activeThread, true);
			const prefs = getPreferenceValues<Preferences>();

			try {
				let ollamaHealth = turnOptions?.ollama;
				if (hasPrivateData && !ollamaHealth) {
					ollamaHealth = (await getDaemonStatus())?.ollama;
				}

				// Fail closed cleanly if private_local context is active while Ollama is offline
				if (
					hasPrivateData &&
					!turnOptions?.forceCloudConsent &&
					(!ollamaHealth?.reachable || !ollamaHealth?.has_chat_model)
				) {
					updateTurnById(
						turnId,
						(t) => ({
							...t,
							routeMode: "local",
							phase: "error",
							needsOllamaFallback: true,
							statusNote: ollamaHealth?.reachable
								? `Pull local model first: ollama pull ${ollamaHealth.chat_model}`
								: "Local Ollama is not running — private context stayed offline",
							errorMsg: null,
						}),
						true,
					);
					return;
				}

				const routeMode: RouteMode =
					hasPrivateData && !turnOptions?.forceCloudConsent
						? useWeb
							? "hybrid"
							: "local"
						: "cloud";

				updateTurnById(turnId, (t) => ({
					...t,
					routeMode,
					needsOllamaFallback: false,
					statusNote:
						routeMode === "hybrid"
							? "Hybrid Split-Synthesis (Local De-identify + Anon Web)"
							: routeMode === "local"
								? `Private · Local Ollama (${ollamaHealth?.chat_model ?? "local"})`
								: "Cloud AI",
				}));

				let results: TavilyResult[] = [];
				let images: TavilyImage[] = [];

				if (useWeb) {
					let tavilyQuery = buildTavilyQuery(query, priorChronological);
					if (routeMode === "hybrid") {
						const snippets = [
							...(localDocs ?? []).slice(0, 3).map((d) => `${d.title}: ${d.snippet}`),
							...(localMessages ?? []).slice(0, 3).map((m) => `${m.subject}: ${m.snippet}`),
						];
						const cleanPublic = await deidentifyForWeb(query, snippets);
						if (cleanPublic) {
							tavilyQuery = cleanPublic;
						}
					}

					const fetched = await searchTavily(
						tavilyQuery,
						prefs,
						controller.signal,
					);
					if (controller.signal.aborted || !mountedRef.current) return;
					results = fetched.results;
					images = fetched.images;

					updateTurnById(turnId, (t) => ({
						...t,
						results,
						images,
						phase: "synthesizing",
					}));
				}

				const prompt = buildSynthesisPrompt(
					query,
					priorChronological,
					results,
					screenContext,
					localDocs,
					localMessages,
				);

				let fullRawAnswer = "";
				const handleDelta = (batch: string) => {
					fullRawAnswer += batch;
					if (!controller.signal.aborted && mountedRef.current) {
						updateTurnById(turnId, (t) => ({
							...t,
							answer: t.answer + batch,
						}));
					}
				};

				if ((routeMode === "local" || routeMode === "hybrid") && ollamaHealth) {
					await streamOllamaSynthesis(
						prompt,
						ollamaHealth.url,
						ollamaHealth.chat_model,
						handleDelta,
						controller.signal,
					);
				} else {
					await streamSynthesis(prompt, prefs, handleDelta, controller.signal);
				}

				if (!controller.signal.aborted && mountedRef.current) {
					const parsedDraft = extractInlineDraftSuggestion(fullRawAnswer);
					let createdDraft = undefined;
					if (parsedDraft.draft) {
						try {
							createdDraft = await createInlineDraft(parsedDraft.draft);
						} catch {
							// Keep clean answer text even if draft store fails
						}
					}
					updateTurnById(
						turnId,
						(t) => ({
							...t,
							answer: parsedDraft.cleanAnswer,
							inlineDraft: createdDraft,
							phase: "done",
						}),
						true,
					);
				}
			} catch (err) {
				if (controller.signal.aborted || !mountedRef.current) return;
				const message = err instanceof Error ? err.message : String(err);
				updateTurnById(
					turnId,
					(t) => ({ ...t, phase: "error", errorMsg: message }),
					true,
				);
				await showToast({
					style: Toast.Style.Failure,
					title: "Search Failed",
					message,
				});
			} finally {
				if (abortRef.current === controller) {
					abortRef.current = null;
				}
			}
		},
		[commitThread, updateTurnById],
	);

	const openThread = useCallback(
		(selected: ChatThread) => {
			abortRef.current?.abort();
			commitThread(selected, false);
		},
		[commitThread],
	);

	const removeThread = useCallback(
		async (target: ChatThread) => {
			const confirmed = await confirmAlert({
				title: "Delete chat?",
				message: `Remove "${target.title}" from search history.`,
				primaryAction: {
					title: "Delete",
					style: Alert.ActionStyle.Destructive,
				},
			});
			if (!confirmed) return false;

			const updated = deleteChatThread(target.id);
			if (mountedRef.current) {
				setHistory(updated);
				if (threadRef.current?.id === target.id) {
					commitThread(null, false);
				}
			}
			return true;
		},
		[commitThread],
	);

	const clearAllThreads = useCallback(async () => {
		const confirmed = await confirmAlert({
			title: "Clear all search history?",
			message: "This deletes all saved AI web search chats.",
			primaryAction: {
				title: "Clear All",
				style: Alert.ActionStyle.Destructive,
			},
		});
		if (!confirmed) return false;

		const updated = clearChatThreads();
		if (mountedRef.current) {
			setHistory(updated);
		}
		return true;
	}, []);

	const stopStreaming = useCallback(() => {
		abortRef.current?.abort();
		const current = threadRef.current;
		if (!current || current.turns.length === 0) return;
		const latest = current.turns[0];
		if (latest.phase === "searching" || latest.phase === "synthesizing") {
			updateTurnById(
				latest.id,
				(t) => ({
					...t,
					phase: t.answer ? "done" : "error",
					errorMsg: t.answer ? null : "Stopped.",
				}),
				true,
			);
		}
	}, [updateTurnById]);

	useEffect(() => {
		mountedRef.current = true;
		if (initialQuery && !didAutoLaunchRef.current) {
			didAutoLaunchRef.current = true;
			void runTurn(initialQuery, "initial");
		}
		return () => {
			mountedRef.current = false;
			abortRef.current?.abort();
		};
	}, [initialQuery, runTurn]);

	return {
		thread,
		history,
		runTurn,
		openThread,
		removeThread,
		clearAllThreads,
		stopStreaming,
	};
}
