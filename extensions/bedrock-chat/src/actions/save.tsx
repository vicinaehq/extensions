import { ActionPanel } from "@vicinae/api";
import { SaveAction } from "./index";

export const SaveActionSection = ({ onSaveAnswerAction }: { onSaveAnswerAction: () => void }) => (
  <ActionPanel.Section title="Save">
    <SaveAction title="Save Answer" onAction={onSaveAnswerAction} modifiers={["cmd"]} />
  </ActionPanel.Section>
);
