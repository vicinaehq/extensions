import { Action, ActionPanel, Detail, Icon, useNavigation } from "@vicinae/api";
import { Conversation } from "../type";
import { buildConversationMarkdown } from "../utils";
import { getModelDisplayName } from "../utils/modelInfo";
import { CopyActionSection } from "../actions/copy";
import { PreferencesActionSection } from "../actions/preferences";
import Ask from "../ask";

/**
 * Read-only detail view for viewing a saved conversation from the history list.
 * Shows the full conversation as markdown. Provides an action to continue the conversation.
 */
export function ConversationDetailReadonly({
  conversation,
  onPin,
  onRemove,
}: {
  conversation: Conversation;
  onPin: () => void;
  onRemove: () => void;
}) {
  const { push, pop } = useNavigation();

  const markdown = buildConversationMarkdown(conversation.chats, false);
  const lastChat = conversation.chats[conversation.chats.length - 1];

  // Derive model info for the metadata sidebar
  const modelIds = [...new Set(conversation.chats.map((c) => c.modelId).filter(Boolean))];
  if (modelIds.length === 0) {
    modelIds.push(conversation.model.option);
  }

  return (
    <Detail
      markdown={markdown}
      navigationTitle={conversation.title}
      metadata={
        <Detail.Metadata>
          <Detail.Metadata.Label title="Title" text={conversation.title} />
          <Detail.Metadata.Label title="Messages" text={String(conversation.chats.length)} />
          <Detail.Metadata.Separator />
          {modelIds.map((id) => (
            <Detail.Metadata.Label key={id} title="Model" text={getModelDisplayName(id)} />
          ))}
          <Detail.Metadata.Separator />
          <Detail.Metadata.Label title="Created" text={new Date(conversation.created_at).toLocaleString()} />
          <Detail.Metadata.Label
            title="Updated"
            text={new Date(conversation.updated_at || conversation.created_at).toLocaleString()}
          />
          {conversation.hasImages && <Detail.Metadata.Label title="Type" text="Image Conversation" />}
        </Detail.Metadata>
      }
      actions={
        <ActionPanel>
          <Action
            title="Continue Conversation"
            icon={Icon.ArrowRight}
            onAction={() => push(<Ask conversation={conversation} />)}
          />
          {lastChat?.answer && <CopyActionSection answer={lastChat.answer} question={lastChat.question} />}
          <ActionPanel.Section title="Manage">
            <Action
              title={conversation.pinned ? "Unpin Conversation" : "Pin Conversation"}
              icon={conversation.pinned ? Icon.PinDisabled : Icon.Pin}
              onAction={onPin}
            />
            <Action
              title="Remove Conversation"
              icon={Icon.Trash}
              style={Action.Style.Destructive}
              onAction={() => {
                onRemove();
                pop();
              }}
            />
          </ActionPanel.Section>
          <PreferencesActionSection />
        </ActionPanel>
      }
    />
  );
}
