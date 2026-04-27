import {
	Action,
	ActionPanel,
	confirmAlert,
	Detail,
	Form,
	Icon,
	List,
	showToast,
	Toast,
	useNavigation,
} from "@vicinae/api";
import { useEffect, useState } from "react";
import {
	clearSelectedModel,
	clearSelectedThinking,
	type ComposeFormValues,
	deleteSessionPermanently,
	formatWorkDirectoryForDisplay,
	getAvailableModels,
	getAvailableSkills,
	getDefaultWorkDirectory,
	getDefaultSkillSelections,
	getErrorMessage,
	getSessionById,
	getSelectedModel,
	getSelectedThinking,
	getThinkingOptions,
	type CodexModel,
	type CodexThinkingLevel,
	type Session,
	readSessions,
	renderTranscriptMarkdown,
	renameSession,
	setSelectedModel,
	setSelectedThinking,
	setSessionArchived,
	sortSessions,
	submitPrompt,
} from "./codex-service";

type AskFormProps = {
	defaultSessionId?: string;
	draftValues?: Partial<ComposeFormValues>;
};

type RenameFormValues = {
	title: string;
};

export function AskCodexForm({ defaultSessionId, draftValues }: AskFormProps) {
	const { push } = useNavigation();
	const [session, setSession] = useState<Session>();
	const [availableSkills, setAvailableSkills] = useState<string[]>([]);
	const [selectedSkills, setSelectedSkills] = useState<string[]>(
		draftValues?.skills ?? [],
	);
	const [defaultSkills, setDefaultSkills] = useState<string[]>([]);
	const [isFormReady, setIsFormReady] = useState(false);
	const isReply = Boolean(defaultSessionId);

	useEffect(() => {
		let isCancelled = false;

		async function loadFormState() {
			setIsFormReady(false);
			const [skills, defaults, nextSession] = await Promise.all([
				getAvailableSkills(),
				getDefaultSkillSelections(),
				defaultSessionId
					? getSessionById(defaultSessionId)
					: Promise.resolve(undefined),
			]);

			if (isCancelled) {
				return;
			}

			setAvailableSkills(skills);
			setDefaultSkills(defaults);
			setSession(nextSession);
			if (!draftValues?.skills?.length) {
				setSelectedSkills((current) =>
					current.length > 0 ? current : defaults,
				);
			}
			setIsFormReady(true);
		}

		void loadFormState();

		return () => {
			isCancelled = true;
		};
	}, [defaultSessionId, draftValues?.skills]);

	return (
		<Form
			enableDrafts
			isLoading={!isFormReady}
			navigationTitle={isReply ? "Chat in Session" : "Chat"}
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title={isReply ? "Send Follow-up" : "Start Chat"}
						onSubmit={async (input) => {
							const toast = await showToast({
								style: Toast.Style.Animated,
								title: isReply ? "Sending follow-up" : "Starting chat",
							});

							try {
								const formValues = input as unknown as ComposeFormValues;
								const nextSession = await submitPrompt(
									{
										...formValues,
										skills:
											selectedSkills.length > 0
												? selectedSkills
												: defaultSkills,
									},
									defaultSessionId,
								);
								toast.style = Toast.Style.Success;
								toast.title = "Reply received";
								toast.message = nextSession.title;
								await toast.update();
								push(<SessionDetailScreen sessionId={nextSession.id} />);
							} catch (error) {
								toast.style = Toast.Style.Failure;
								toast.title = "Codex request failed";
								toast.message = getErrorMessage(error);
								await toast.update();
								throw error;
							}
						}}
					/>
					<Action.Push
						title="Open Sessions"
						icon={Icon.List}
						target={<SessionsBrowser />}
					/>
					<Action.Push
						title="Open Models"
						icon={Icon.Cog}
						target={<ModelsBrowser />}
					/>
					<Action.Push
						title="Open Thinking"
						icon={Icon.Bolt}
						target={<ThinkingBrowser />}
					/>
				</ActionPanel>
			}
		>
			{!isReply ? (
				<Form.TextField
					id="title"
					title="Session Title"
					placeholder="Optional. Defaults to first prompt."
					defaultValue={draftValues?.title}
				/>
			) : null}
			<Form.TextArea
				id="prompt"
				title="Question"
				autoFocus
				defaultValue={draftValues?.prompt}
				placeholder="Type your message here..."
			/>
			{!isReply ? (
				<Form.TextField
					id="workDirectory"
					title="Work Directory"
					placeholder="~/code/codex/"
				/>
			) : null}
			<Form.FilePicker
				id="attachments"
				title="Attachment File"
				allowMultipleSelection
				canChooseDirectories
				canChooseFiles
				defaultValue={draftValues?.attachments}
			/>
			<Form.Dropdown
				id="skillMatch"
				title="Skills"
				placeholder="Select a skill"
				storeValue={false}
				onChange={(skill) => {
					if (!skill) {
						return;
					}
					setSelectedSkills((current) =>
						current.includes(skill)
							? current.filter((selectedSkill) => selectedSkill !== skill)
							: [...current, skill],
					);
				}}
			>
				{filterSkills(availableSkills).map((skill) => (
					<Form.Dropdown.Item
						key={skill}
						value={skill}
						title={skill}
						keywords={[skill]}
						icon={
							selectedSkills.includes(skill) ? Icon.CheckCircle : Icon.Hammer
						}
					/>
				))}
			</Form.Dropdown>
			<Form.Description
				text={
					selectedSkills.length > 0
						? selectedSkills.join(", ")
						: "No skills selected."
				}
			/>
		</Form>
	);
}

export function SessionsBrowser() {
	const { push } = useNavigation();
	const [sessions, setSessions] = useState<Session[]>([]);
	const [isLoading, setIsLoading] = useState(true);

	async function loadState() {
		setIsLoading(true);
		try {
			setSessions(sortSessions(await readSessions()));
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		void loadState();
	}, []);

	const activeSessions = sessions.filter((session) => !session.archivedAt);
	const archivedSessions = sessions.filter((session) =>
		Boolean(session.archivedAt),
	);

	return (
		<List
			isLoading={isLoading}
			isShowingDetail
			navigationTitle="Codex Sessions"
			searchBarPlaceholder="Search sessions..."
			actions={
				<ActionPanel>
					<Action.Push
						title="Chat"
						icon={Icon.Plus}
						target={<AskCodexForm />}
					/>
					<Action
						title="Refresh"
						icon={Icon.ArrowClockwise}
						onAction={() => loadState()}
					/>
					<Action.Push
						title="Models"
						icon={Icon.Cog}
						target={<ModelsBrowser />}
					/>
					<Action.Push
						title="Thinking"
						icon={Icon.Bolt}
						target={<ThinkingBrowser />}
					/>
				</ActionPanel>
			}
		>
			{sessions.length === 0 ? (
				<List.EmptyView
					icon={Icon.Openai}
					title="No sessions yet"
					description="Start a chat first, then manage sessions here."
					actions={
						<ActionPanel>
							<Action.Push
								title="Chat"
								icon={Icon.Plus}
								target={<AskCodexForm />}
							/>
							<Action.Push
								title="Models"
								icon={Icon.Cog}
								target={<ModelsBrowser />}
							/>
							<Action.Push
								title="Thinking"
								icon={Icon.Bolt}
								target={<ThinkingBrowser />}
							/>
						</ActionPanel>
					}
				/>
			) : null}

			{activeSessions.length > 0 ? (
				<List.Section title="Active" subtitle={`${activeSessions.length}`}>
					{activeSessions.map((session) => (
						<List.Item
							key={session.id}
							id={session.id}
							icon={Icon.Openai}
							title={session.title}
							detail={<SessionListDetail session={session} />}
							actions={
								<SessionActions
									session={session}
									onRefresh={loadState}
									onEnter={() =>
										push(<SessionDetailScreen sessionId={session.id} />)
									}
									onReply={() =>
										push(<AskCodexForm defaultSessionId={session.id} />)
									}
									onRename={() =>
										push(
											<RenameSessionForm
												session={session}
												onSaved={loadState}
											/>,
										)
									}
								/>
							}
						/>
					))}
				</List.Section>
			) : null}

			{archivedSessions.length > 0 ? (
				<List.Section title="Archived" subtitle={`${archivedSessions.length}`}>
					{archivedSessions.map((session) => (
						<List.Item
							key={session.id}
							id={session.id}
							icon={Icon.Box}
							title={session.title}
							detail={<SessionListDetail session={session} />}
							actions={
								<SessionActions
									session={session}
									onRefresh={loadState}
									onEnter={() =>
										push(<SessionDetailScreen sessionId={session.id} />)
									}
									onReply={() =>
										push(<AskCodexForm defaultSessionId={session.id} />)
									}
									onRename={() =>
										push(
											<RenameSessionForm
												session={session}
												onSaved={loadState}
											/>,
										)
									}
								/>
							}
						/>
					))}
				</List.Section>
			) : null}
		</List>
	);
}

function SessionListDetail({ session }: { session: Session }) {
	return <List.Item.Detail markdown={renderTranscriptMarkdown(session)} />;
}

export function ModelsBrowser() {
	const [models, setModels] = useState<CodexModel[]>([]);
	const [selectedModel, setSelectedModelState] = useState<string>();
	const [isLoading, setIsLoading] = useState(true);

	async function loadState() {
		setIsLoading(true);
		try {
			const [availableModels, currentModel] = await Promise.all([
				getAvailableModels(),
				getSelectedModel(),
			]);
			setModels(availableModels);
			setSelectedModelState(currentModel ?? undefined);
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		void loadState();
	}, []);

	return (
		<List
			isLoading={isLoading}
			navigationTitle="Codex Models"
			searchBarPlaceholder="Search models..."
			actions={
				<ActionPanel>
					<Action
						title="Refresh"
						icon={Icon.ArrowClockwise}
						onAction={() => loadState()}
					/>
					<Action
						title="Use Preference Default"
						icon={Icon.XMarkCircle}
						onAction={async () => {
							await clearSelectedModel();
							await showToast({
								style: Toast.Style.Success,
								title: "Model override cleared",
							});
							await loadState();
						}}
					/>
				</ActionPanel>
			}
		>
			{models.length === 0 ? (
				<List.EmptyView
					icon={Icon.Cog}
					title="No models found"
					description="Could not read Codex model cache."
				/>
			) : null}
			<List.Section
				title="Available Models"
				subtitle={
					selectedModel
						? `Selected: ${selectedModel}`
						: "Using preference default"
				}
			>
				{models.map((model) => (
					<List.Item
						key={model.slug}
						title={model.displayName}
						subtitle={model.slug}
						accessories={[
							...(selectedModel === model.slug
								? [{ tag: "Selected" as const }]
								: []),
							...(model.reasoningLevels.length > 0
								? [{ text: model.reasoningLevels.join(", ") }]
								: []),
						]}
						detail={
							<List.Item.Detail
								markdown={[
									model.description || "_No description available._",
									model.contextWindow
										? `\n\nContext window: ${model.contextWindow.toLocaleString()}`
										: "",
									model.reasoningLevels.length > 0
										? `\n\nReasoning levels: ${model.reasoningLevels.join(", ")}`
										: "",
								]
									.filter(Boolean)
									.join("")}
							/>
						}
						actions={
							<ActionPanel>
								<Action
									title="Use This Model"
									icon={Icon.CheckCircle}
									onAction={async () => {
										await setSelectedModel(model.slug);
										await showToast({
											style: Toast.Style.Success,
											title: "Model selected",
											message: model.slug,
										});
										await loadState();
									}}
								/>
								<Action.CopyToClipboard
									title="Copy Model Slug"
									content={model.slug}
								/>
								<Action
									title="Use Preference Default"
									icon={Icon.XMarkCircle}
									onAction={async () => {
										await clearSelectedModel();
										await showToast({
											style: Toast.Style.Success,
											title: "Model override cleared",
										});
										await loadState();
									}}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}

export function ThinkingBrowser() {
	const [selectedThinking, setSelectedThinkingState] =
		useState<CodexThinkingLevel>();
	const options = getThinkingOptions();

	async function loadState() {
		setSelectedThinkingState((await getSelectedThinking()) ?? undefined);
	}

	useEffect(() => {
		void loadState();
	}, []);

	return (
		<List
			navigationTitle="Model Thinking"
			searchBarPlaceholder="Search thinking levels..."
			actions={
				<ActionPanel>
					<Action
						title="Use Default Thinking"
						icon={Icon.XMarkCircle}
						onAction={async () => {
							await clearSelectedThinking();
							await showToast({
								style: Toast.Style.Success,
								title: "Thinking override cleared",
							});
							await loadState();
						}}
					/>
				</ActionPanel>
			}
		>
			<List.Section
				title="Thinking Levels"
				subtitle={
					selectedThinking
						? `Selected: ${selectedThinking}`
						: "Using Codex default"
				}
			>
				{options.map((thinking) => (
					<List.Item
						key={thinking}
						title={thinking}
						accessories={
							selectedThinking === thinking ? [{ tag: "Selected" }] : []
						}
						detail={
							<List.Item.Detail markdown={getThinkingDescription(thinking)} />
						}
						actions={
							<ActionPanel>
								<Action
									title="Use This Thinking Level"
									icon={Icon.CheckCircle}
									onAction={async () => {
										await setSelectedThinking(thinking);
										await showToast({
											style: Toast.Style.Success,
											title: "Thinking level selected",
											message: thinking,
										});
										await loadState();
									}}
								/>
								<Action
									title="Use Default Thinking"
									icon={Icon.XMarkCircle}
									onAction={async () => {
										await clearSelectedThinking();
										await showToast({
											style: Toast.Style.Success,
											title: "Thinking override cleared",
										});
										await loadState();
									}}
								/>
							</ActionPanel>
						}
					/>
				))}
			</List.Section>
		</List>
	);
}

export function SessionDetailScreen({ sessionId }: { sessionId: string }) {
	const { push, pop } = useNavigation();
	const [session, setSession] = useState<Session>();
	const [isLoading, setIsLoading] = useState(true);

	async function loadSession() {
		setIsLoading(true);
		try {
			setSession(await getSessionById(sessionId));
		} finally {
			setIsLoading(false);
		}
	}

	useEffect(() => {
		void loadSession();
	}, [sessionId]);

	if (!session) {
		return (
			<Detail
				navigationTitle="Session"
				markdown={isLoading ? "Loading..." : "# Session not found"}
				actions={
					<ActionPanel>
						<Action
							title="Refresh"
							icon={Icon.ArrowClockwise}
							onAction={() => loadSession()}
						/>
					</ActionPanel>
				}
			/>
		);
	}

	return (
		<Detail
			navigationTitle={session.title}
			markdown={renderTranscriptMarkdown(session)}
			actions={
				<SessionActions
					session={session}
					onRefresh={loadSession}
					onEnter={() => loadSession()}
					onReply={() => push(<AskCodexForm defaultSessionId={session.id} />)}
					onRename={() =>
						push(<RenameSessionForm session={session} onSaved={loadSession} />)
					}
					onDeleted={() => pop()}
				/>
			}
		/>
	);
}

function SessionActions({
	session,
	onRefresh,
	onEnter,
	onReply,
	onRename,
	onDeleted,
}: {
	session: Session;
	onRefresh: () => void | Promise<void>;
	onEnter: () => void;
	onReply: () => void;
	onRename: () => void;
	onDeleted?: () => void;
}) {
	return (
		<ActionPanel>
			<Action title="Chat Follow-up" icon={Icon.Message} onAction={onReply} />
			<Action
				title="Refresh Session"
				icon={Icon.ArrowClockwise}
				onAction={onEnter}
			/>
			<Action title="Rename Session" icon={Icon.Pencil} onAction={onRename} />
			<Action
				title={session.archivedAt ? "Unarchive Session" : "Archive Session"}
				icon={session.archivedAt ? Icon.ArrowClockwise : Icon.Box}
				onAction={async () => {
					await setSessionArchived(session.id, !session.archivedAt);
					await showToast({
						style: Toast.Style.Success,
						title: session.archivedAt ? "Session restored" : "Session archived",
						message: session.title,
					});
					await onRefresh();
				}}
			/>
			<Action
				title="Delete Permanently"
				icon={Icon.Trash}
				style={Action.Style.Destructive}
				onAction={async () => {
					const confirmed = await confirmAlert({
						title: `Delete "${session.title}" permanently?`,
						message:
							"This removes session from Vicinae storage and also deletes matching Codex session artifacts when found.",
						primaryAction: {
							title: "Delete Permanently",
							style: "destructive",
						},
					});
					if (!confirmed) {
						return;
					}
					await deleteSessionPermanently(session.id);
					await showToast({
						style: Toast.Style.Success,
						title: "Session deleted",
						message: session.title,
					});
					if (onDeleted) {
						onDeleted();
					}
					await onRefresh();
				}}
			/>
			<Action.CopyToClipboard
				title="Copy Transcript"
				content={renderTranscriptMarkdown(session)}
			/>
			<Action
				title="Refresh"
				icon={Icon.ArrowClockwise}
				onAction={() => onRefresh()}
			/>
		</ActionPanel>
	);
}

function RenameSessionForm({
	session,
	onSaved,
}: {
	session: Session;
	onSaved: () => void | Promise<void>;
}) {
	const { pop } = useNavigation();

	return (
		<Form
			navigationTitle="Rename Session"
			actions={
				<ActionPanel>
					<Action.SubmitForm
						title="Save Name"
						onSubmit={async (input) => {
							const values = input as unknown as RenameFormValues;
							await renameSession(session.id, values.title);
							await showToast({
								style: Toast.Style.Success,
								title: "Session renamed",
								message: values.title.trim() || "Untitled session",
							});
							await onSaved();
							pop();
						}}
					/>
				</ActionPanel>
			}
		>
			<Form.TextField
				id="title"
				title="Title"
				autoFocus
				defaultValue={session.title}
			/>
		</Form>
	);
}

function getThinkingDescription(thinking: CodexThinkingLevel) {
	switch (thinking) {
		case "low":
			return "Fast responses with lighter reasoning.";
		case "medium":
			return "Balanced speed and reasoning depth.";
		case "high":
			return "Deeper reasoning for harder tasks.";
		case "xhigh":
			return "Maximum reasoning depth for most complex tasks.";
	}
}

function filterSkills(availableSkills: string[]) {
	return availableSkills.slice(0, 24);
}
