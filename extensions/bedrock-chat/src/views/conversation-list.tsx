import { Icon, List } from "@vicinae/api";
import { Conversation } from "../type";
import { getModelDisplayName, getModelIcon } from "../utils/modelInfo";

/**
 * Derives unique model display tags from a conversation's chat history.
 * Falls back to the conversation-level model if chats don't have modelId.
 */
function getModelTags(conversation: Conversation): { text: string; icon: string | { source: string } }[] {
  const modelIds = new Set<string>();

  for (const chat of conversation.chats) {
    if (chat.modelId) {
      modelIds.add(chat.modelId);
    }
  }

  // Fallback: use conversation-level model if no per-chat model info
  if (modelIds.size === 0) {
    modelIds.add(conversation.model.option);
  }

  return [...modelIds].map((id) => ({
    text: getModelDisplayName(id),
    icon: getModelIcon(id) as string | { source: string },
  }));
}

export const ConversationListView = (props: {
  title: string;
  conversations: Conversation[];
  actionPanel: (conversation: Conversation) => React.JSX.Element;
}) => {
  const { title, conversations, actionPanel } = props;

  return (
    <List.Section title={title} subtitle={conversations.length.toLocaleString()}>
      {conversations.map((conversation) => {
        const modelTags = getModelTags(conversation);

        return (
          <List.Item
            id={conversation.id}
            key={conversation.id}
            title={conversation.title}
            icon={conversation.hasImages ? Icon.Image : Icon.SpeechBubble}
            accessories={[
              ...modelTags.map((tag) => ({ tag: tag.text })),
              { text: new Date(conversation.updated_at || conversation.created_at).toLocaleDateString() },
            ]}
            actions={actionPanel(conversation)}
          />
        );
      })}
    </List.Section>
  );
};
