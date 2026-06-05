import { ActionPanel, Action, Icon, List, useNavigation } from "@vicinae/api";
import { useState } from "react";
import { DestructiveAction, PinAction, PrimaryAction } from "./actions";
import { PreferencesActionSection } from "./actions/preferences";
import Ask from "./ask";
import { useConversations } from "./hooks/useConversations";
import { Conversation as ConversationType } from "./type";
import { ConversationListView } from "./views/conversation-list";
import { ConversationDetailReadonly } from "./views/conversation-detail";
import { ExportData, ImportData } from "./utils/import-export";
import { ImportForm } from "./views/import-form";

export default function Conversation() {
  const conversations = useConversations();
  const { push } = useNavigation();

  const [searchText, setSearchText] = useState<string>("");

  const pushImportForm = () =>
    push(
      <ImportForm
        moduleName="Conversation"
        onSubmit={async (file) => {
          ImportData<ConversationType>("conversations", file).then((data) => {
            conversations.setConversations(data);
          });
        }}
      />,
    );

  const uniqueConversations = conversations.data.filter(
    (value, index, self) => index === self.findIndex((conversation) => conversation.id === value.id),
  );

  const filteredConversations = searchText
    ? uniqueConversations.filter(
        (x) =>
          x.chats.some(
            (x) =>
              x.question.toLowerCase().includes(searchText.toLocaleLowerCase()) ||
              x.answer.toLowerCase().includes(searchText.toLocaleLowerCase()),
          ) || x.title.toLowerCase().includes(searchText.toLowerCase()),
      )
    : uniqueConversations;

  const sortedConversations = filteredConversations.sort(
    (a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime(),
  );

  const pinnedConversation = sortedConversations.filter((x) => x.pinned);

  const uniqueSortedConversations =
    pinnedConversation.length > 0 ? sortedConversations.filter((x) => !x.pinned) : sortedConversations;

  const getActionPanel = (conversation: ConversationType) => (
    <ActionPanel>
      <PrimaryAction title="Continue Conversation" onAction={() => push(<Ask conversation={conversation} />)} />
      <Action
        title="View Conversation"
        icon={Icon.Eye}
        onAction={() =>
          push(
            <ConversationDetailReadonly
              conversation={conversation}
              onPin={() => conversations.update({ ...conversation, pinned: !conversation.pinned })}
              onRemove={() => conversations.remove(conversation)}
            />,
          )
        }
      />
      <PinAction
        title={conversation.pinned ? "Unpin Conversation" : "Pin Conversation"}
        isPinned={conversation.pinned}
        onAction={() => conversations.update({ ...conversation, pinned: !conversation.pinned })}
      />
      <ActionPanel.Section title="Import/Export">
        <Action
          title={"Export Conversation"}
          icon={Icon.Upload}
          onAction={() => ExportData(conversations.data, "Conversation")}
        />
        <Action title={"Import Conversation"} icon={Icon.Download} onAction={pushImportForm} />
      </ActionPanel.Section>
      <ActionPanel.Section title="Delete">
        <DestructiveAction
          title="Remove"
          dialog={{
            title: "Are you sure you want to remove this conversation?",
          }}
          onAction={() => conversations.remove(conversation)}
        />
        <DestructiveAction
          title="Clear"
          dialog={{
            title: "Are you sure you want to clear your conversations?",
          }}
          onAction={() => conversations.clear()}
          shortcut={{ modifiers: ["cmd", "shift"], key: "delete" }}
        />
      </ActionPanel.Section>
      <PreferencesActionSection />
    </ActionPanel>
  );

  return (
    <List
      isShowingDetail={false}
      isLoading={conversations.isLoading}
      filtering={false}
      throttle={false}
      searchBarPlaceholder="Search conversation..."
      searchText={searchText}
      onSearchTextChange={setSearchText}
    >
      {conversations.data.length === 0 ? (
        <List.EmptyView
          title="No Conversation"
          description="Your recent conversation will be showed up here"
          icon={Icon.Stars}
          actions={
            <ActionPanel>
              <Action title={"Import Conversation"} icon={Icon.Download} onAction={pushImportForm} />
            </ActionPanel>
          }
        />
      ) : (
        <>
          {pinnedConversation.length > 0 && (
            <ConversationListView title="Pinned" conversations={pinnedConversation} actionPanel={getActionPanel} />
          )}
          {uniqueSortedConversations && (
            <ConversationListView
              title="Recent"
              conversations={uniqueSortedConversations}
              actionPanel={getActionPanel}
            />
          )}
        </>
      )}
    </List>
  );
}
