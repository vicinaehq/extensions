import { ActionPanel, Icon, List } from "@vicinae/api";
import type { ReactNode } from "react";
import { RefreshAction } from "./RefreshAction";

interface UmbrielListProps {
	children?: ReactNode;
	isLoading: boolean;
	isEmpty: boolean;
	error?: string | null;
	emptyTitle: string;
	emptyDescription: string;
	emptyIcon?: Icon;
	searchBarPlaceholder?: string;
	onRefresh?: () => void | Promise<void>;
	emptyActions?: ReactNode;
	isShowingDetail?: boolean;
	navigationTitle?: string;
}

export function UmbrielList({
	children,
	isLoading,
	isEmpty,
	error,
	emptyTitle,
	emptyDescription,
	emptyIcon = Icon.AppWindow,
	searchBarPlaceholder,
	onRefresh,
	emptyActions,
	isShowingDetail,
	navigationTitle,
}: UmbrielListProps) {
	const refreshAction = onRefresh ? (
		<RefreshAction onRefresh={onRefresh} />
	) : null;
	const emptyStateActions = error ? null : emptyActions;

	return (
		<List
			isLoading={isLoading}
			isShowingDetail={isShowingDetail}
			navigationTitle={navigationTitle}
			searchBarPlaceholder={searchBarPlaceholder}
			actions={
				<ActionPanel>
					{emptyStateActions}
					{refreshAction}
				</ActionPanel>
			}
		>
			{isEmpty && !isLoading ? (
				<List.EmptyView
					icon={error ? Icon.Warning : emptyIcon}
					title={error ? "Umbriel Is Not Available" : emptyTitle}
					description={error ?? emptyDescription}
					actions={
						<ActionPanel>
							{emptyStateActions}
							{refreshAction}
						</ActionPanel>
					}
				/>
			) : (
				children
			)}
		</List>
	);
}
