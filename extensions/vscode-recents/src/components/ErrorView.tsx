import { List, Icon } from "@vicinae/api";

interface ErrorViewProps {
    error: Error;
}

export function ErrorView({ error }: ErrorViewProps) {
    return (
        <List searchBarPlaceholder="An error occurred">
            <List.EmptyView title="An error occurred" description={error.message} icon={Icon.ExclamationMark} />
        </List>
    );
}
