import {
	Action,
	ActionPanel,
	Alert,
	confirmAlert,
	Icon,
	List,
	showToast,
} from "@vicinae/api";
import { useFileContent } from "../hooks/use-file-content";
import { useWorkflows } from "../hooks/use-workflows";
import type { Workflow } from "../types/workflow";

interface WorkflowItemProps {
	workflow: Workflow;
	onApply: (workflowName: string) => Promise<void>;
	onRemove: (workflowName: string) => Promise<void>;
	id?: string;
}

export function WorkflowItem({
	workflow,
	onApply,
	onRemove,
	id,
}: WorkflowItemProps) {
	const { content: fileContent, isLoading } = useFileContent(workflow.filePath);
	const { validateWorkflow } = useWorkflows();

	const handleApply = async () => {
		await onApply(workflow.name);
	};

	const handleValidate = async () => {
		await validateWorkflow(workflow.name);
	};

	const handleRemove = async () => {
		const confirmed = await confirmAlert({
			title: "Remove Workflow",
			message: `Are you sure you want to remove "${workflow.name}"? This cannot be undone.`,
			icon: Icon.Trash,
			primaryAction: {
				title: "Remove",
				style: Alert.ActionStyle.Destructive,
			},
			dismissAction: {
				title: "Cancel",
			},
		});

		if (confirmed) {
			await onRemove(workflow.name);
		}
	};

	const getWorkflowIcon = (_workflow: Workflow) => {
		// Use bullet point icon for all workflows
		return Icon.Bolt;
	};

	const getWorkflowSubtitle = (workflow: Workflow) => {
		return workflow.fileExtension.toUpperCase();
	};

	const formatModifiedDate = (date: Date) => {
		return date.toLocaleDateString();
	};

	const markdownContent = `# ${workflow.name}

${workflow.description || "No description available"}

**File:** ${workflow.filePath}

**Modified:** ${workflow.lastModified ? formatModifiedDate(workflow.lastModified) : "Unknown"}

\`\`\`${workflow.fileExtension.startsWith(".") ? workflow.fileExtension.substring(1) : workflow.fileExtension}
${fileContent}
\`\`\``;

	return (
		<List.Item
			id={id || workflow.name}
			title={workflow.name}
			subtitle={getWorkflowSubtitle(workflow)}
			icon={getWorkflowIcon(workflow)}
			keywords={[
				workflow.name,
				workflow.description || "",
				workflow.fileExtension,
			]}
			detail={
				<List.Item.Detail isLoading={isLoading} markdown={markdownContent} />
			}
			actions={
				<ActionPanel>
					<Action
						title="Apply Workflow"
						icon={Icon.Play}
						onAction={handleApply}
						shortcut={{ modifiers: ["cmd"], key: "enter" }}
					/>
					<Action
						title="Validate Workflow"
						icon={Icon.CheckCircle}
						onAction={handleValidate}
						shortcut={{ modifiers: ["cmd"], key: "v" }}
					/>
					<Action
						title="Remove Workflow"
						icon={Icon.Trash}
						onAction={handleRemove}
						shortcut={{ modifiers: ["cmd"], key: "backspace" }}
					/>
					<Action.CopyToClipboard
						title="Copy Workflow Name"
						content={workflow.name}
						shortcut={{ modifiers: ["cmd"], key: "c" }}
					/>
					<Action
						title="Show in Finder"
						icon={Icon.Finder}
						onAction={() => {
							showToast({
								title: "Show in Finder",
								message: "Feature not implemented yet",
							});
						}}
						shortcut={{ modifiers: ["cmd"], key: "f" }}
					/>
				</ActionPanel>
			}
		/>
	);
}
