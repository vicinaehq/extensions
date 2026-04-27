import { environment, getPreferenceValues, LocalStorage } from "@vicinae/api";
import { spawn } from "node:child_process";
import {
	mkdir,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";

export type Preferences = {
	openaiModel?: string;
	systemPrompt?: string;
};

export type AttachmentSummary = {
	name: string;
	path: string;
	kind: "image" | "file" | "directory";
	sizeBytes: number;
};

export type SessionMessage = {
	id: string;
	role: "user" | "assistant";
	text: string;
	createdAt: string;
	attachments?: AttachmentSummary[];
};

export type Session = {
	id: string;
	title: string;
	createdAt: string;
	updatedAt: string;
	model: string;
	workDirectory?: string;
	codexSessionId?: string;
	archivedAt?: string;
	messages: SessionMessage[];
};

export type SessionsFile = {
	sessions: Session[];
};

export type ComposeFormValues = {
	title?: string;
	prompt: string;
	attachments?: string[];
	skills?: string[];
	workDirectory?: string;
};

export type CodexModel = {
	slug: string;
	displayName: string;
	description?: string;
	visibility?: string;
	supportedInApi?: boolean;
	reasoningLevels: string[];
	contextWindow?: number;
};

export type CodexThinkingLevel = "low" | "medium" | "high" | "xhigh";

type CodexPreparedAttachments = {
	summaries: AttachmentSummary[];
	imagePaths: string[];
	additionalWritableDirs: string[];
	promptBlock: string;
};

type CodexRunResult = {
	lastMessage: string;
	codexSessionId?: string;
	model: string;
};

type CodexIndexEntry = {
	id: string;
	thread_name?: string;
	updated_at?: string;
};

type AmbientSessionMetaPayload = {
	id?: string;
	timestamp?: string;
	cwd?: string;
	model?: string;
	model_slug?: string;
};

type AmbientEventPayload = {
	type?: string;
	message?: string;
	phase?: string;
	images?: string[];
	local_images?: string[];
};

type AmbientResponseMessagePayload = {
	type?: string;
	role?: string;
	phase?: string;
	content?: Array<{
		type?: string;
		text?: string;
	}>;
};

type AmbientSessionRecord = {
	timestamp?: string;
	type?: string;
	payload?: unknown;
};

const STORAGE_FILE = join(environment.supportPath, "sessions.json");
const OUTPUT_DIR = join(environment.supportPath, "outputs");
const LOCAL_CODEX_BIN = join(process.env.HOME ?? "", ".local", "bin", "codex");
const DEFAULT_MODEL = "gpt-5.4";
const DEFAULT_WORK_DIRECTORY = join(process.env.HOME ?? "", "code", "codex");
const DEFAULT_PROMPT_PREFIX =
	"You are ChatGPT Codex. Answer clearly and helpfully. Read attached local files directly when needed. Do not modify files unless user explicitly asks for edits.";
const MAX_TOTAL_ATTACHMENT_BYTES = 50 * 1024 * 1024;
const MAX_FILE_COUNT = 100;
const SELECTED_MODEL_KEY = "selected-codex-model";
const SELECTED_THINKING_KEY = "selected-codex-thinking";
const SKILL_ROOTS = [
	join(process.env.HOME ?? "", ".codex", "skills"),
	join(process.env.HOME ?? "", ".agents", "skills"),
];

export async function readSessions(): Promise<Session[]> {
	const [storedSessions, ambientSessions] = await Promise.all([
		readStoredSessions(),
		readAmbientCodexSessions(),
	]);
	return mergeSessions(storedSessions, ambientSessions);
}

async function readStoredSessions(): Promise<Session[]> {
	try {
		const fileContents = await readFile(STORAGE_FILE, "utf8");
		const parsed = JSON.parse(fileContents) as SessionsFile;
		return Array.isArray(parsed.sessions) ? parsed.sessions : [];
	} catch (error) {
		const message = getErrorMessage(error);
		if (message.includes("ENOENT")) {
			return [];
		}
		throw error;
	}
}

export async function writeSessions(sessions: Session[]) {
	await mkdir(environment.supportPath, { recursive: true });
	await writeFile(STORAGE_FILE, JSON.stringify({ sessions }, null, 2), "utf8");
}

export function sortSessions(sessions: Session[]) {
	return [...sessions].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getSessionById(sessionId: string) {
	const sessions = await readSessions();
	return sessions.find((session) => session.id === sessionId);
}

export async function renameSession(sessionId: string, title: string) {
	const sessions = await readSessions();
	const nextSessions = sessions.map((session) =>
		session.id === sessionId
			? {
					...session,
					title: title.trim() || "Untitled session",
					updatedAt: new Date().toISOString(),
				}
			: session,
	);
	await writeSessions(nextSessions);
	return nextSessions.find((session) => session.id === sessionId);
}

export async function setSessionArchived(sessionId: string, archived: boolean) {
	const sessions = await readSessions();
	const now = new Date().toISOString();
	const nextSessions = sessions.map((session) =>
		session.id === sessionId
			? {
					...session,
					archivedAt: archived ? now : undefined,
					updatedAt: now,
				}
			: session,
	);
	await writeSessions(nextSessions);
	return nextSessions.find((session) => session.id === sessionId);
}

export async function deleteSessionPermanently(sessionId: string) {
	const sessions = await readSessions();
	const session = sessions.find((item) => item.id === sessionId);
	const nextSessions = sessions.filter((item) => item.id !== sessionId);
	await writeSessions(nextSessions);
	if (session?.codexSessionId) {
		await deleteAmbientCodexArtifacts(session.codexSessionId);
	}
}

export async function submitPrompt(
	values: ComposeFormValues,
	targetSessionId?: string,
): Promise<Session> {
	const prompt = values.prompt.trim();
	if (!prompt) {
		throw new Error("Add prompt before sending.");
	}

	const sessions = await readSessions();
	const existingSession = targetSessionId
		? sessions.find((session) => session.id === targetSessionId)
		: undefined;
	const prefs = readPreferences();
	const selectedModel = await getSelectedModel();
	const selectedThinking = await getSelectedThinking();
	const model =
		selectedModel ||
		prefs.openaiModel?.trim() ||
		existingSession?.model ||
		DEFAULT_MODEL;
	const title =
		values.title?.trim() ||
		existingSession?.title ||
		makeTitleFromPrompt(prompt);
	const workDirectory = await validateWorkDirectory(
		values.workDirectory?.trim() ||
			existingSession?.workDirectory ||
			DEFAULT_WORK_DIRECTORY,
	);

	const expandedPaths = await expandAttachmentPaths(values.attachments ?? []);
	const preparedAttachments = await prepareAttachments(expandedPaths);
	const selectedSkills = await normalizeSelectedSkills(values.skills ?? []);

	const userMessage: SessionMessage = {
		id: createId("msg"),
		role: "user",
		text: prompt,
		createdAt: new Date().toISOString(),
		attachments: preparedAttachments.summaries,
	};

	const runResult = await runCodexPrompt({
		existingSession,
		model,
		thinkingLevel: selectedThinking,
		userPrompt: prompt,
		promptPrefix: prefs.systemPrompt?.trim() || DEFAULT_PROMPT_PREFIX,
		selectedSkills,
		attachments: preparedAttachments,
		workDirectory,
	});

	const assistantMessage: SessionMessage = {
		id: createId("msg"),
		role: "assistant",
		text: runResult.lastMessage.trim() || "Codex returned no text.",
		createdAt: new Date().toISOString(),
	};

	const nextSession: Session = existingSession
		? {
				...existingSession,
				title,
				model: runResult.model,
				workDirectory,
				codexSessionId:
					runResult.codexSessionId ?? existingSession.codexSessionId,
				updatedAt: assistantMessage.createdAt,
				messages: [...existingSession.messages, userMessage, assistantMessage],
			}
		: {
				id: createId("session"),
				title,
				createdAt: userMessage.createdAt,
				updatedAt: assistantMessage.createdAt,
				model: runResult.model,
				workDirectory,
				codexSessionId: runResult.codexSessionId,
				messages: [userMessage, assistantMessage],
			};

	const nextSessions = existingSession
		? sessions.map((session) =>
				session.id === existingSession.id ? nextSession : session,
			)
		: [nextSession, ...sessions];

	await writeSessions(nextSessions);
	return nextSession;
}

export function renderTranscriptMarkdown(session: Session) {
	const transcript = session.messages
		.map((message) => {
			const attachmentBlock =
				message.attachments && message.attachments.length > 0
					? [
							"",
							"Attachments:",
							...message.attachments.map(
								(attachment) =>
									`- ${escapeMarkdown(attachment.name)} (${attachment.kind}${attachment.sizeBytes ? `, ${formatBytes(attachment.sizeBytes)}` : ""})`,
							),
						].join("\n")
					: "";

			if (message.role === "user") {
				return [
					...escapeMarkdown(message.text)
						.split("\n")
						.map((line) => `> ${line}`),
					attachmentBlock,
				]
					.filter(Boolean)
					.join("\n");
			}

			return [escapeMarkdown(message.text) || "_No text_", attachmentBlock]
				.filter(Boolean)
				.join("\n");
		})
		.join("\n\n---\n\n");

	return transcript || "_No messages yet._";
}

export function formatDate(value: string) {
	return new Date(value).toLocaleString();
}

export function getErrorMessage(error: unknown) {
	return error instanceof Error ? error.message : String(error);
}

export async function getAvailableModels(): Promise<CodexModel[]> {
	const modelsCachePath = join(getAmbientCodexHome(), "models_cache.json");
	try {
		const raw = await readFile(modelsCachePath, "utf8");
		const parsed = JSON.parse(raw) as {
			models?: Array<{
				slug?: string;
				display_name?: string;
				description?: string;
				visibility?: string;
				supported_in_api?: boolean;
				context_window?: number;
				supported_reasoning_levels?: Array<{ effort?: string }>;
			}>;
		};
		return (parsed.models ?? [])
			.filter((model) => typeof model.slug === "string")
			.map((model) => ({
				slug: model.slug as string,
				displayName: model.display_name || model.slug || "Unknown",
				description: model.description,
				visibility: model.visibility,
				supportedInApi: model.supported_in_api,
				contextWindow: model.context_window,
				reasoningLevels: (model.supported_reasoning_levels ?? [])
					.map((item) => item.effort)
					.filter((value): value is string => Boolean(value)),
			}))
			.filter((model) => model.visibility !== "hidden")
			.sort((a, b) => a.displayName.localeCompare(b.displayName));
	} catch {
		return [];
	}
}

export async function getAvailableSkills(): Promise<string[]> {
	const skills = new Set<string>();

	for (const root of SKILL_ROOTS) {
		try {
			const entries = await readdir(root, { withFileTypes: true });
			for (const entry of entries) {
				if (!entry.isDirectory()) {
					continue;
				}
				const skillFile = join(root, entry.name, "SKILL.md");
				try {
					await stat(skillFile);
					skills.add(entry.name);
				} catch {
					// Ignore non-skill dirs.
				}
			}
		} catch {
			// Ignore missing roots.
		}
	}

	return [...skills].sort((a, b) => a.localeCompare(b));
}

export async function getDefaultSkillSelections(): Promise<string[]> {
	const skills = await getAvailableSkills();
	return skills.includes("caveman") ? ["caveman"] : [];
}

export async function getSelectedModel() {
	return await LocalStorage.getItem<string>(SELECTED_MODEL_KEY);
}

export async function setSelectedModel(modelSlug: string) {
	await LocalStorage.setItem(SELECTED_MODEL_KEY, modelSlug);
}

export async function clearSelectedModel() {
	await LocalStorage.removeItem(SELECTED_MODEL_KEY);
}

export async function getSelectedThinking() {
	return await LocalStorage.getItem<CodexThinkingLevel>(SELECTED_THINKING_KEY);
}

export async function setSelectedThinking(thinking: CodexThinkingLevel) {
	await LocalStorage.setItem(SELECTED_THINKING_KEY, thinking);
}

export async function clearSelectedThinking() {
	await LocalStorage.removeItem(SELECTED_THINKING_KEY);
}

export function getThinkingOptions(): CodexThinkingLevel[] {
	return ["low", "medium", "high", "xhigh"];
}

export function getDefaultWorkDirectory() {
	return DEFAULT_WORK_DIRECTORY;
}

export function formatWorkDirectoryForDisplay(workDirectory?: string) {
	if (!workDirectory) {
		return "";
	}

	const homeDirectory = process.env.HOME ?? "";
	if (homeDirectory && workDirectory === homeDirectory) {
		return "~";
	}

	if (homeDirectory && workDirectory.startsWith(`${homeDirectory}/`)) {
		return `~/${workDirectory.slice(homeDirectory.length + 1)}`;
	}

	return workDirectory;
}

function readPreferences(): Preferences {
	return getPreferenceValues<Preferences>();
}

async function runCodexPrompt({
	existingSession,
	model,
	thinkingLevel,
	userPrompt,
	promptPrefix,
	selectedSkills,
	attachments,
	workDirectory,
}: {
	existingSession?: Session;
	model: string;
	thinkingLevel?: CodexThinkingLevel;
	userPrompt: string;
	promptPrefix: string;
	selectedSkills: string[];
	attachments: CodexPreparedAttachments;
	workDirectory?: string;
}): Promise<CodexRunResult> {
	await mkdir(OUTPUT_DIR, { recursive: true });

	const beforeIndex = await readCodexSessionIndex(getAmbientCodexHome());
	const outputFile = join(OUTPUT_DIR, `${createId("codex-output")}.txt`);
	const prompt = buildCodexPrompt({
		userPrompt,
		promptPrefix,
		selectedSkills,
		attachmentPromptBlock: attachments.promptBlock,
	});

	const args = existingSession?.codexSessionId
		? [
				"exec",
				"resume",
				"--skip-git-repo-check",
				"--full-auto",
				"-s",
				"read-only",
				"-o",
				outputFile,
				"-m",
				model,
				...(thinkingLevel
					? ["-c", `model_reasoning_effort="${thinkingLevel}"`]
					: []),
				"-C",
				workDirectory || process.cwd(),
				...attachments.imagePaths.flatMap((imagePath) => ["-i", imagePath]),
				...attachments.additionalWritableDirs.flatMap((dirPath) => [
					"--add-dir",
					dirPath,
				]),
				existingSession.codexSessionId,
				prompt,
			]
		: [
				"exec",
				"--skip-git-repo-check",
				"--full-auto",
				"-s",
				"read-only",
				"-o",
				outputFile,
				"-m",
				model,
				...(thinkingLevel
					? ["-c", `model_reasoning_effort="${thinkingLevel}"`]
					: []),
				"-C",
				workDirectory || process.cwd(),
				...attachments.imagePaths.flatMap((imagePath) => ["-i", imagePath]),
				...attachments.additionalWritableDirs.flatMap((dirPath) => [
					"--add-dir",
					dirPath,
				]),
				prompt,
			];

	await spawnCodex(args);

	const lastMessage = await readFile(outputFile, "utf8").catch(() => "");
	const afterIndex = await readCodexSessionIndex(getAmbientCodexHome());
	const sessionId =
		existingSession?.codexSessionId ||
		findNewestCodexSessionId(beforeIndex, afterIndex);

	return {
		lastMessage,
		codexSessionId: sessionId,
		model,
	};
}

async function spawnCodex(args: string[]) {
	const codexBinaryPath = await getCodexBinaryPath();

	return new Promise<void>((resolve, reject) => {
		const child = spawn(codexBinaryPath, args, {
			env: process.env,
			stdio: ["ignore", "pipe", "pipe"],
		});

		let stderr = "";
		let stdout = "";

		child.stdout.on("data", (chunk) => {
			stdout += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			stderr += chunk.toString();
		});
		child.on("error", (error) => {
			if ("code" in error && error.code === "ENOENT") {
				reject(
					new Error(
						[
							"Codex CLI is not installed or not available in PATH.",
							"Install it with: bun add -g @openai/codex",
							"Then run `codex` and sign in with your OpenAI account.",
							"Recommended: install Caveman skills from https://getcaveman.dev",
						].join("\n"),
					),
				);
				return;
			}
			reject(error);
		});
		child.on("close", (code) => {
			if (code === 0) {
				resolve();
				return;
			}

			const detail = [stderr.trim(), stdout.trim()]
				.filter(Boolean)
				.join("\n")
				.trim();
			reject(
				new Error(detail || `Codex CLI exited with status code ${code ?? -1}.`),
			);
		});
	});
}

async function getCodexBinaryPath() {
	const configuredBinary = process.env.CODEX_BIN?.trim();
	if (configuredBinary) {
		return configuredBinary;
	}

	try {
		await stat(LOCAL_CODEX_BIN);
		return LOCAL_CODEX_BIN;
	} catch {
		return "codex";
	}
}

function getAmbientCodexHome() {
	return process.env.CODEX_HOME?.trim()
		? process.env.CODEX_HOME.trim()
		: join(process.env.HOME ?? "", ".codex");
}

async function readCodexSessionIndex(
	codexHome: string,
): Promise<CodexIndexEntry[]> {
	const indexPath = join(codexHome, "session_index.jsonl");
	try {
		const raw = await readFile(indexPath, "utf8");
		return raw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as CodexIndexEntry)
			.filter((entry) => typeof entry.id === "string");
	} catch {
		return [];
	}
}

async function readAmbientCodexSessions(): Promise<Session[]> {
	const codexHome = getAmbientCodexHome();
	const sessionsRoot = join(codexHome, "sessions");
	const [indexEntries, sessionFiles] = await Promise.all([
		readCodexSessionIndex(codexHome),
		findSessionLogFiles(sessionsRoot),
	]);
	const indexById = new Map(indexEntries.map((entry) => [entry.id, entry]));
	const sessions = await Promise.all(
		sessionFiles.map((sessionFile) =>
			parseAmbientSessionFile(sessionFile, indexById),
		),
	);
	const parsedSessions = sessions.filter((session): session is Session =>
		Boolean(session),
	);
	const parsedIds = new Set(
		parsedSessions
			.map((session) => session.codexSessionId)
			.filter((id): id is string => Boolean(id)),
	);

	for (const indexEntry of indexEntries) {
		if (parsedIds.has(indexEntry.id)) {
			continue;
		}
		parsedSessions.push({
			id: makeAmbientSessionId(indexEntry.id),
			title: indexEntry.thread_name?.trim() || "Untitled session",
			createdAt: indexEntry.updated_at || new Date(0).toISOString(),
			updatedAt: indexEntry.updated_at || new Date(0).toISOString(),
			model: DEFAULT_MODEL,
			codexSessionId: indexEntry.id,
			messages: [],
		});
	}

	return parsedSessions;
}

async function parseAmbientSessionFile(
	filePath: string,
	indexById: Map<string, CodexIndexEntry>,
): Promise<Session | undefined> {
	try {
		const raw = await readFile(filePath, "utf8");
		const records = raw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.map((line) => JSON.parse(line) as AmbientSessionRecord);
		const metaRecord = records.find((record) => record.type === "session_meta");
		const metaPayload = metaRecord?.payload as
			| AmbientSessionMetaPayload
			| undefined;
		const codexSessionId = metaPayload?.id?.trim();
		if (!codexSessionId) {
			return undefined;
		}

		const messages = parseAmbientMessages(records);
		const indexEntry = indexById.get(codexSessionId);
		const createdAt =
			metaPayload?.timestamp ||
			metaRecord?.timestamp ||
			messages[0]?.createdAt ||
			indexEntry?.updated_at ||
			new Date(0).toISOString();
		const updatedAt =
			indexEntry?.updated_at ||
			findLatestRecordTimestamp(records) ||
			messages.at(-1)?.createdAt ||
			createdAt;

		return {
			id: makeAmbientSessionId(codexSessionId),
			title:
				indexEntry?.thread_name?.trim() ||
				makeTitleFromPrompt(
					messages.find((message) => message.role === "user")?.text || "",
				) ||
				"Untitled session",
			createdAt,
			updatedAt,
			model:
				metaPayload?.model?.trim() ||
				metaPayload?.model_slug?.trim() ||
				DEFAULT_MODEL,
			workDirectory: metaPayload?.cwd?.trim(),
			codexSessionId,
			messages,
		};
	} catch {
		return undefined;
	}
}

function parseAmbientMessages(
	records: AmbientSessionRecord[],
): SessionMessage[] {
	const messages: SessionMessage[] = [];

	for (const record of records) {
		if (record.type === "event_msg") {
			const payload = record.payload as AmbientEventPayload | undefined;
			if (payload?.type === "user_message" && payload.message) {
				messages.push({
					id: createId("msg"),
					role: "user",
					text: payload.message,
					createdAt: record.timestamp || new Date().toISOString(),
					attachments: summarizeAmbientAttachments(payload),
				});
				continue;
			}
			if (
				payload?.type === "agent_message" &&
				payload.phase === "final_answer" &&
				payload.message
			) {
				messages.push({
					id: createId("msg"),
					role: "assistant",
					text: payload.message,
					createdAt: record.timestamp || new Date().toISOString(),
				});
			}
			continue;
		}

		if (record.type !== "response_item") {
			continue;
		}

		const payload = record.payload as AmbientResponseMessagePayload | undefined;
		if (payload?.type !== "message" || payload.role !== "assistant") {
			continue;
		}
		if (payload.phase !== "final_answer") {
			continue;
		}
		const text = extractResponseMessageText(payload);
		if (!text) {
			continue;
		}
		const lastMessage = messages.at(-1);
		if (lastMessage?.role === "assistant" && lastMessage.text === text) {
			continue;
		}
		messages.push({
			id: createId("msg"),
			role: "assistant",
			text,
			createdAt: record.timestamp || new Date().toISOString(),
		});
	}

	return messages;
}

function summarizeAmbientAttachments(
	payload: AmbientEventPayload,
): AttachmentSummary[] | undefined {
	const imageAttachments = [
		...(payload.images ?? []),
		...(payload.local_images ?? []),
	]
		.filter(Boolean)
		.map((imagePath) => ({
			name: basename(imagePath),
			path: imagePath,
			kind: "image" as const,
			sizeBytes: 0,
		}));
	return imageAttachments.length > 0 ? imageAttachments : undefined;
}

function extractResponseMessageText(payload: AmbientResponseMessagePayload) {
	return (payload.content ?? [])
		.filter((item) => item.type === "input_text" || item.type === "output_text")
		.map((item) => item.text?.trim())
		.filter((text): text is string => Boolean(text))
		.join("\n\n")
		.trim();
}

function findLatestRecordTimestamp(records: AmbientSessionRecord[]) {
	return [...records]
		.map((record) => record.timestamp?.trim())
		.filter((timestamp): timestamp is string => Boolean(timestamp))
		.sort((a, b) => b.localeCompare(a))[0];
}

function makeAmbientSessionId(codexSessionId: string) {
	return `ambient_${codexSessionId}`;
}

function mergeSessions(localSessions: Session[], ambientSessions: Session[]) {
	const ambientByCodexId = new Map(
		ambientSessions
			.filter((session) => Boolean(session.codexSessionId))
			.map((session) => [session.codexSessionId as string, session]),
	);
	const mergedSessions: Session[] = [];

	for (const localSession of localSessions) {
		if (!localSession.codexSessionId) {
			mergedSessions.push(localSession);
			continue;
		}

		const ambientSession = ambientByCodexId.get(localSession.codexSessionId);
		if (!ambientSession) {
			mergedSessions.push(localSession);
			continue;
		}

		mergedSessions.push({
			...ambientSession,
			...localSession,
			id: localSession.id,
			title: localSession.title?.trim() || ambientSession.title,
			model: ambientSession.model || localSession.model,
			workDirectory: ambientSession.workDirectory || localSession.workDirectory,
			codexSessionId:
				ambientSession.codexSessionId || localSession.codexSessionId,
			createdAt: chooseEarlierDate(
				localSession.createdAt,
				ambientSession.createdAt,
			),
			updatedAt: chooseLaterDate(
				localSession.updatedAt,
				ambientSession.updatedAt,
			),
			messages:
				ambientSession.messages.length > 0
					? ambientSession.messages
					: localSession.messages,
		});
		ambientByCodexId.delete(localSession.codexSessionId);
	}

	for (const ambientSession of ambientByCodexId.values()) {
		mergedSessions.push(ambientSession);
	}

	return mergedSessions;
}

function chooseEarlierDate(left: string, right: string) {
	return left.localeCompare(right) <= 0 ? left : right;
}

function chooseLaterDate(left: string, right: string) {
	return left.localeCompare(right) >= 0 ? left : right;
}

function findNewestCodexSessionId(
	before: CodexIndexEntry[],
	after: CodexIndexEntry[],
) {
	const previousIds = new Set(before.map((entry) => entry.id));
	const newest = [...after]
		.filter((entry) => !previousIds.has(entry.id))
		.sort((a, b) => (b.updated_at || "").localeCompare(a.updated_at || ""))[0];
	return newest?.id;
}

async function expandAttachmentPaths(inputPaths: string[]) {
	const uniquePaths = [...new Set(inputPaths.filter(Boolean))];
	const expandedFiles: string[] = [];
	let totalBytes = 0;

	for (const currentPath of uniquePaths) {
		const stats = await stat(currentPath);
		if (stats.isDirectory()) {
			const directoryFiles = await walkDirectory(currentPath);
			for (const filePath of directoryFiles) {
				const fileStats = await stat(filePath);
				totalBytes += fileStats.size;
				expandedFiles.push(filePath);
			}
		} else {
			totalBytes += stats.size;
			expandedFiles.push(currentPath);
		}
	}

	if (expandedFiles.length > MAX_FILE_COUNT) {
		throw new Error(
			`Too many files selected (${expandedFiles.length}). Keep under ${MAX_FILE_COUNT}.`,
		);
	}

	if (totalBytes > MAX_TOTAL_ATTACHMENT_BYTES) {
		throw new Error(
			`Attachments too large (${formatBytes(totalBytes)}). Keep total under 50 MB.`,
		);
	}

	return uniquePaths;
}

async function walkDirectory(directoryPath: string): Promise<string[]> {
	const entries = await readdir(directoryPath, { withFileTypes: true });
	const files: string[] = [];

	for (const entry of entries) {
		const fullPath = join(directoryPath, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkDirectory(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
}

async function prepareAttachments(
	paths: string[],
): Promise<CodexPreparedAttachments> {
	const imagePaths: string[] = [];
	const additionalDirs = new Set<string>([process.cwd()]);
	const summaries: AttachmentSummary[] = [];
	const promptLines: string[] = [];

	for (const attachmentPath of paths) {
		const stats = await stat(attachmentPath);
		if (stats.isDirectory()) {
			additionalDirs.add(attachmentPath);
			const files = await walkDirectory(attachmentPath);
			summaries.push({
				name: basename(attachmentPath),
				path: attachmentPath,
				kind: "directory",
				sizeBytes: 0,
			});
			promptLines.push(
				`- directory: ${attachmentPath} (${files.length} files available)`,
			);
			continue;
		}

		const kind = isImagePath(attachmentPath) ? "image" : "file";
		summaries.push({
			name: basename(attachmentPath),
			path: attachmentPath,
			kind,
			sizeBytes: stats.size,
		});
		additionalDirs.add(dirname(attachmentPath));

		if (kind === "image") {
			imagePaths.push(attachmentPath);
			promptLines.push(`- image: ${attachmentPath}`);
		} else {
			promptLines.push(`- file: ${attachmentPath}`);
		}
	}

	return {
		summaries,
		imagePaths,
		additionalWritableDirs: [...additionalDirs],
		promptBlock:
			promptLines.length > 0
				? [
						"Attachments available on local filesystem. Read them directly by path.",
						...promptLines,
					].join("\n")
				: "",
	};
}

function buildCodexPrompt({
	userPrompt,
	promptPrefix,
	selectedSkills,
	attachmentPromptBlock,
}: {
	userPrompt: string;
	promptPrefix: string;
	selectedSkills: string[];
	attachmentPromptBlock: string;
}) {
	return [
		promptPrefix.trim(),
		selectedSkills.length > 0
			? `Preferred skills: ${selectedSkills.join(", ")}. Use them if relevant to this request.`
			: "",
		attachmentPromptBlock.trim(),
		"/compact",
		"User request:",
		userPrompt.trim(),
	]
		.filter(Boolean)
		.join("\n\n");
}

async function normalizeSelectedSkills(skills: string[]) {
	if (skills.length > 0) {
		return skills;
	}

	return await getDefaultSkillSelections();
}

async function validateWorkDirectory(workDirectory?: string) {
	if (!workDirectory) {
		return undefined;
	}

	const resolvedWorkDirectory = expandHomeDirectory(workDirectory);

	try {
		await mkdir(resolvedWorkDirectory, { recursive: true });
		const directoryStats = await stat(resolvedWorkDirectory);
		if (!directoryStats.isDirectory()) {
			throw new Error("Work directory path is not a directory.");
		}
		return resolvedWorkDirectory;
	} catch (error) {
		const message = getErrorMessage(error);
		if (message === "Work directory path is not a directory.") {
			throw error;
		}
		throw new Error(`Could not prepare work directory: ${message}`);
	}
}

function expandHomeDirectory(inputPath: string) {
	if (inputPath === "~") {
		return process.env.HOME ?? inputPath;
	}

	if (inputPath.startsWith("~/")) {
		return join(process.env.HOME ?? "", inputPath.slice(2));
	}

	return resolve(inputPath);
}

function isImagePath(filePath: string) {
	return [
		".png",
		".jpg",
		".jpeg",
		".webp",
		".gif",
		".bmp",
		".svg",
		".avif",
	].includes(extname(filePath).toLowerCase());
}

async function deleteAmbientCodexArtifacts(codexSessionId: string) {
	const codexHome = getAmbientCodexHome();
	await removeFromCodexSessionIndex(codexHome, codexSessionId);
	await removeCodexSessionFiles(codexHome, codexSessionId);
}

async function removeFromCodexSessionIndex(
	codexHome: string,
	codexSessionId: string,
) {
	const indexPath = join(codexHome, "session_index.jsonl");
	try {
		const raw = await readFile(indexPath, "utf8");
		const nextLines = raw
			.split("\n")
			.map((line) => line.trim())
			.filter(Boolean)
			.filter((line) => {
				try {
					return (JSON.parse(line) as CodexIndexEntry).id !== codexSessionId;
				} catch {
					return true;
				}
			});
		const nextRaw = nextLines.length > 0 ? `${nextLines.join("\n")}\n` : "";
		await writeFile(indexPath, nextRaw, "utf8");
	} catch {
		// Ignore if Codex index unavailable.
	}
}

async function removeCodexSessionFiles(
	codexHome: string,
	codexSessionId: string,
) {
	const sessionsRoot = join(codexHome, "sessions");
	const matches = await findFilesContainingId(sessionsRoot, codexSessionId);
	await Promise.all(matches.map((filePath) => rm(filePath, { force: true })));
}

async function findFilesContainingId(
	root: string,
	needle: string,
): Promise<string[]> {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		const matches: string[] = [];

		for (const entry of entries) {
			const fullPath = join(root, entry.name);
			if (entry.isDirectory()) {
				matches.push(...(await findFilesContainingId(fullPath, needle)));
				continue;
			}
			if (entry.isFile() && entry.name.includes(needle)) {
				matches.push(fullPath);
			}
		}

		return matches;
	} catch {
		return [];
	}
}

async function findSessionLogFiles(root: string): Promise<string[]> {
	try {
		const entries = await readdir(root, { withFileTypes: true });
		const files: string[] = [];

		for (const entry of entries) {
			const fullPath = join(root, entry.name);
			if (entry.isDirectory()) {
				files.push(...(await findSessionLogFiles(fullPath)));
				continue;
			}
			if (entry.isFile() && entry.name.endsWith(".jsonl")) {
				files.push(fullPath);
			}
		}

		return files;
	} catch {
		return [];
	}
}

function makeTitleFromPrompt(prompt: string) {
	const firstLine = prompt.split("\n")[0]?.trim() || "Untitled session";
	return firstLine.length > 60 ? `${firstLine.slice(0, 57)}...` : firstLine;
}

function formatBytes(value: number) {
	if (value < 1024) {
		return `${value} B`;
	}
	if (value < 1024 * 1024) {
		return `${(value / 1024).toFixed(1)} KB`;
	}
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function createId(prefix: string) {
	return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function escapeMarkdown(text: string) {
	return text.replace(/\\/g, "\\\\");
}
