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
	searchTavily,
	streamSynthesis,
} from "./api";
import {
	clearChatThreads,
	deleteChatThread,
	loadChatThreads,
	upsertChatThread,
} from "./storage";
import type {
	ChatThread,
	ConversationTurn,
	Preferences,
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
): ConversationTurn {
	return {
		id: makeId("turn"),
		query,
		answer: "",
		results: [],
		images: [],
		screenContext,
		phase: screenContext ? "synthesizing" : "searching",
		errorMsg: null,
		createdAt: Date.now(),
	};
}

export function createThread(
	query: string,
	kind: "web" | "screen" = "web",
	screenContext?: ScreenContext,
): ChatThread {
	const now = Date.now();
	return {
		id: makeId("chat"),
		title: query,
		kind,
		createdAt: now,
		updatedAt: now,
		turns: [createTurn(query, screenContext)],
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
			turnOptions?: { screenContext?: ScreenContext; useWeb?: boolean },
		) => {
			const query = rawQuery.trim();
			if (!query) return;

			abortRef.current?.abort();
			const controller = new AbortController();
			abortRef.current = controller;

			const current = threadRef.current;
			const screenContext =
				turnOptions?.screenContext ??
				(mode === "regenerate" ? current?.turns[0]?.screenContext : undefined);
			const useWeb =
				turnOptions?.useWeb ?? (screenContext === undefined);

			let activeThread: ChatThread;
			let priorChronological: ConversationTurn[] = [];
			let turnId: string;

			if (mode === "initial" && current && current.turns.length > 0) {
				activeThread = current;
				turnId = current.turns[0].id;
			} else if (mode === "regenerate" && current && current.turns.length > 0) {
				turnId = current.turns[0].id;
				priorChronological = current.turns.slice(1).reverse();
				const regenerated = { ...createTurn(query, screenContext), id: turnId };
				regenerated.phase = useWeb ? "searching" : "synthesizing";
				activeThread = {
					...current,
					updatedAt: Date.now(),
					turns: [regenerated, ...current.turns.slice(1)],
				};
			} else if (mode === "followup" && current) {
				priorChronological = [...current.turns].reverse();
				const nextTurn = createTurn(query, screenContext);
				nextTurn.phase = useWeb ? "searching" : "synthesizing";
				turnId = nextTurn.id;
				activeThread = {
					...current,
					updatedAt: Date.now(),
					turns: [nextTurn, ...current.turns],
				};
			} else {
				const kind = screenContext ? "screen" : "web";
				activeThread = createThread(query, kind, screenContext);
				activeThread.turns[0].phase = useWeb ? "searching" : "synthesizing";
				turnId = activeThread.turns[0].id;
			}

			commitThread(activeThread, true);
			const prefs = getPreferenceValues<Preferences>();

			try {
				let results: TavilyResult[] = [];
				let images: TavilyImage[] = [];

				if (useWeb) {
					const tavilyQuery = buildTavilyQuery(query, priorChronological);
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
				);

				await streamSynthesis(
					prompt,
					prefs,
					(batch) => {
						if (!controller.signal.aborted && mountedRef.current) {
							updateTurnById(turnId, (t) => ({
								...t,
								answer: t.answer + batch,
							}));
						}
					},
					controller.signal,
				);

				if (!controller.signal.aborted && mountedRef.current) {
					updateTurnById(turnId, (t) => ({ ...t, phase: "done" }), true);
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
