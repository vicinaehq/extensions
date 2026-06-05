import { Action, ActionPanel, Icon, List } from "@vicinae/api";
import { PrimaryAction } from "../actions";
import { PreferencesActionSection } from "../actions/preferences";
import { getModelDisplayName } from "../utils/modelInfo";

export interface ChatListItem {
  id: string;
  question: string;
  answer: string;
  created_at: string;
  modelId?: string;
}

/**
 * Renders a sorted list of chat Q&A pairs as List.Items.
 * Each chat produces two items: an answer item and a question item.
 * Handles the shared action panel logic for editing, submitting, regenerating, etc.
 */
export function ChatListItems<T extends ChatListItem>({
  chats,
  isLoading,
  editingChatId,
  searchText,
  onSubmit,
  onCancelEdit,
  onRegenerate,
  onEditQuestion,
  onViewConversation,
}: {
  chats: T[];
  isLoading: boolean;
  editingChatId: string | null;
  searchText: string;
  onSubmit: () => void;
  onCancelEdit: () => void;
  onRegenerate: (chat: T) => void;
  onEditQuestion: (chatId: string, question: string) => void;
  onViewConversation: () => void;
}) {
  const hasSearchText = searchText.trim().length > 0;

  const buildAnswerActions = (chat: T) => {
    if (isLoading) return null;
    if (editingChatId && hasSearchText) {
      return (
        <>
          <PrimaryAction title="Submit Edited Question" onAction={onSubmit} />
          <Action title="Cancel Edit" icon={Icon.XMarkCircle} onAction={onCancelEdit} />
        </>
      );
    }
    if (editingChatId) {
      return <Action title="Cancel Edit" icon={Icon.XMarkCircle} onAction={onCancelEdit} />;
    }
    if (hasSearchText) {
      return <PrimaryAction title="Get Answer" onAction={onSubmit} />;
    }
    if (chat.answer && !isLoading) {
      return <Action title="Regenerate" icon={Icon.ArrowClockwise} onAction={() => onRegenerate(chat)} />;
    }
    return null;
  };

  const buildQuestionActions = (chat: T) => {
    if (isLoading) return null;
    if (editingChatId && hasSearchText) {
      return (
        <>
          <PrimaryAction title="Submit Edited Question" onAction={onSubmit} />
          <Action title="Cancel Edit" icon={Icon.XMarkCircle} onAction={onCancelEdit} />
        </>
      );
    }
    if (editingChatId) {
      return <Action title="Cancel Edit" icon={Icon.XMarkCircle} onAction={onCancelEdit} />;
    }
    if (hasSearchText) {
      return <PrimaryAction title="Get Answer" onAction={onSubmit} />;
    }
    return <Action title="Edit Question" icon={Icon.Pencil} onAction={() => onEditQuestion(chat.id, chat.question)} />;
  };

  return (
    <>
      {[...chats]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .flatMap((chat) => [
          <List.Item
            key={`a-${chat.id}`}
            id={`a-${chat.id}`}
            icon={chat.answer ? "💬" : "⏳"}
            title={chat.answer ? chat.answer.substring(0, 150).replace(/\n/g, " ") : "Generating..."}
            accessories={chat.modelId ? [{ tag: getModelDisplayName(chat.modelId) }] : undefined}
            actions={
              <ActionPanel>
                {buildAnswerActions(chat)}
                <Action title="View Conversation" icon="icon.png" onAction={onViewConversation} />
                <PreferencesActionSection />
              </ActionPanel>
            }
          />,
          <List.Item
            key={`q-${chat.id}`}
            id={`q-${chat.id}`}
            icon={{ source: "icon.png" }}
            title={chat.question}
            actions={
              <ActionPanel>
                {buildQuestionActions(chat)}
                <Action title="View Conversation" icon="icon.png" onAction={onViewConversation} />
                <PreferencesActionSection />
              </ActionPanel>
            }
          />,
        ])}
    </>
  );
}
