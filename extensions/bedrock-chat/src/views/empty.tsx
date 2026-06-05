import { Icon, List } from "@vicinae/api";

export const EmptyView = () => (
  <List.EmptyView
    title="Ask AI anything"
    description="Type your question above and press Enter"
    icon={Icon.Stars}
  />
);
