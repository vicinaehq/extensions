import { useState, useMemo, useEffect, useRef } from "react";
import {
  Action,
  ActionPanel,
  Icon,
  Keyboard,
  List,
  Detail,
  showToast,
  Toast,
  useNavigation,
  getPreferenceValues,
  openCommandPreferences,
  clearSearchBar,
} from "@vicinae/api";
import { generateStreamedResponse } from "./api/openrouter";
import { POPULAR_MODELS } from "./api/models";
import { useModelSearch } from "./hooks/useModelSearch";
import { useQuestions } from "./hooks/useQuestions";
import { addConversation } from "./utils/conversations";
import { v4 as uuidv4 } from "uuid";
import { Question } from "./types/question";
import { isValidQuestionPrompt } from "./utils/chat";

function ConversationDetailView({
  conversationId,
  initialQuestionPrompt,
  selectedModel,
  isFirstQuestion,
  onStartNew,
  addQuestion,
  updateQuestion,
  existingQuestions,
}: {
  conversationId: string;
  initialQuestionPrompt?: string;
  selectedModel: string;
  isFirstQuestion: boolean;
  onStartNew: () => void;
  addQuestion: (q: Question) => Promise<void>;
  updateQuestion: (q: Question) => Promise<void>;
  existingQuestions: Question[];
}) {
  const { pop } = useNavigation();

  const [output, setOutput] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(!!initialQuestionPrompt);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const [questions, setQuestions] = useState<Question[]>(existingQuestions);

  useEffect(() => {
    if (!initialQuestionPrompt) return;

    const run = async () => {
      const newQuestion: Question = {
        id: uuidv4(),
        conversationId,
        prompt: initialQuestionPrompt,
        response: "",
        createdAt: new Date().toISOString(),
        isStreaming: true,
      };

      if (isFirstQuestion) {
        await addConversation({
          id: conversationId,
          title: initialQuestionPrompt.substring(0, 50),
          createdAt: new Date().toISOString(),
        });
      }

      await addQuestion(newQuestion);
      setQuestions((prev) => [newQuestion, ...prev]);

      const controller = new AbortController();
      setAbortController(controller);

      try {
        const response = await generateStreamedResponse(
          [newQuestion, ...existingQuestions].reverse(),
          newQuestion.id,
          (chunk) => {
            setOutput(chunk);
          },
          controller.signal,
          selectedModel,
        );

        if (response) {
          await updateQuestion({ ...newQuestion, response, isStreaming: false });
          setQuestions((prev) =>
            prev.map((q) => (q.id === newQuestion.id ? { ...q, response, isStreaming: false } : q))
          );
        }
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          setOutput((prevOutput) => {
            updateQuestion({ ...newQuestion, response: prevOutput, isStreaming: false });
            setQuestions((prev) =>
              prev.map((q) => (q.id === newQuestion.id ? { ...q, response: prevOutput, isStreaming: false } : q))
            );
            return prevOutput;
          });
          return;
        }
        showToast({ style: Toast.Style.Failure, title: "Error", message: String(error) });
      } finally {
        setIsGenerating(false);
        setAbortController(null);
      }
    };
    run();
  }, [initialQuestionPrompt]);

  const markdown = [...questions].reverse().map((q) => {
    const isCurrent = isGenerating && q.id === questions[0]?.id;
    return `### You\n${q.prompt}\n\n### AI\n${isCurrent ? output : q.response}\n\n---\n`;
  }).join("\n");

  return (
    <Detail
      markdown={markdown || "No conversation history."}
      isLoading={isGenerating}
      actions={
        <ActionPanel>
          <Action title="Ask Follow-Up" icon={Icon.Message} onAction={() => pop()} />
          {isGenerating ? (
            <Action title="Stop Generating" icon={Icon.Stop} onAction={() => abortController?.abort()} />
          ) : (
            <Action
              title="Start New Chat"
              icon={Icon.Plus}
              shortcut={Keyboard.Shortcut.Common.New}
              onAction={() => {
                onStartNew();
                pop();
              }}
            />
          )}
          <Action.CopyToClipboard title="Copy Conversation" content={markdown} />
        </ActionPanel>
      }
    />
  );
}

interface ChatProps {
  conversationId?: string;
}

export default function AskQuestion({ conversationId }: ChatProps) {
  const { push } = useNavigation();
  const preferences = getPreferenceValues<Preferences>();

  const isConfigured = useMemo(() => {
    return !!preferences.openrouterApiKey && !!preferences.defaultModel;
  }, [preferences]);

  const [selectedModel, setSelectedModel] = useState<string>(preferences.defaultModel);
  const { searchResults, isSearching, searchModels } = useModelSearch();

  const [activeConversationId, setActiveConversationId] = useState<string>(conversationId ?? uuidv4());
  const [searchText, setSearchText] = useState<string>("");

  const {
    isLoading: isLoadingQuestions,
    getByConversationId,
    add: addQuestion,
    update: updateQuestion,
  } = useQuestions();
  const activeQuestions = getByConversationId(activeConversationId);
  
  // Keep track of whether we've auto-pushed the detail view for this component mount
  const hasAutoPushed = useRef(false);

  useEffect(() => {
    if (activeQuestions.length > 0 && !hasAutoPushed.current) {
      hasAutoPushed.current = true;
      push(
        <ConversationDetailView
          conversationId={activeConversationId}
          selectedModel={selectedModel}
          isFirstQuestion={false}
          existingQuestions={activeQuestions}
          addQuestion={addQuestion}
          updateQuestion={updateQuestion}
          onStartNew={() => {
            setActiveConversationId(uuidv4());
            clearSearchBar({ clearText: true });
            setSearchText("");
            hasAutoPushed.current = false;
          }}
        />
      );
    }
  }, [activeQuestions.length, activeConversationId]);

  const handleSubmit = () => {
    if (!searchText.trim()) return;
    
    const isFirst = activeQuestions.length === 0;
    const promptToSubmit = searchText.trim();
    
    setSearchText("");
    clearSearchBar({ clearText: true });
    
    push(
      <ConversationDetailView
        conversationId={activeConversationId}
        initialQuestionPrompt={promptToSubmit}
        selectedModel={selectedModel}
        isFirstQuestion={isFirst}
        existingQuestions={activeQuestions}
        addQuestion={addQuestion}
        updateQuestion={updateQuestion}
        onStartNew={() => {
          setActiveConversationId(uuidv4());
          clearSearchBar({ clearText: true });
          setSearchText("");
          hasAutoPushed.current = false;
        }}
      />
    );
  };

  return (
    <List
      searchText={searchText}
      onSearchTextChange={setSearchText}
      searchBarPlaceholder={activeQuestions.length > 0 ? "Ask follow-up..." : "Type a message..."}
      isLoading={isLoadingQuestions}
      searchBarAccessory={
        <List.Dropdown
          tooltip="Select Model"
          storeValue={true}
          onChange={(newValue) => setSelectedModel(newValue)}
          defaultValue={selectedModel}
          filtering={false}
          isLoading={isSearching}
          onSearchTextChange={searchModels}
          throttle={true}
          placeholder="Search models..."
        >
          {searchResults.length > 0 ? (
            <List.Dropdown.Section title="Search Results">
              {searchResults.map((model) => (
                <List.Dropdown.Item key={model.id} title={model.name} value={model.id} />
              ))}
            </List.Dropdown.Section>
          ) : (
            <>
              <List.Dropdown.Section title="Popular Models">
                {POPULAR_MODELS.map((model) => (
                  <List.Dropdown.Item key={model.id} title={model.name} value={model.id} />
                ))}
              </List.Dropdown.Section>
              {!POPULAR_MODELS.find((m) => m.id === preferences.defaultModel) && (
                <List.Dropdown.Section title="Custom Model (from settings)">
                  <List.Dropdown.Item title={preferences.defaultModel} value={preferences.defaultModel} />
                </List.Dropdown.Section>
              )}
            </>
          )}
        </List.Dropdown>
      }
    >
      {!isConfigured ? (
        <List.EmptyView
          title="Configuration Required"
          description="Please set your OpenRouter API Key and Model ID in preferences for Omelette."
          icon={Icon.Gear}
          actions={
            <ActionPanel>
              <Action title="Open Preferences" icon={Icon.Gear} onAction={openCommandPreferences} />
            </ActionPanel>
          }
        />
      ) : activeQuestions.length === 0 ? (
        <List.EmptyView
          title="Start a Conversation"
          description="Type a message above to get started."
          icon={Icon.Bubble}
          actions={
            <ActionPanel>
              {isValidQuestionPrompt(searchText) && (
                <Action title="Send Message" icon={Icon.Message} onAction={handleSubmit} />
              )}
            </ActionPanel>
          }
        />
      ) : (
        <List.EmptyView
          title="Resume Conversation"
          description="Press Enter to view chat or type a new message above."
          icon={Icon.Message}
          actions={
            <ActionPanel>
              {isValidQuestionPrompt(searchText) ? (
                <Action title="Send Message" icon={Icon.Message} onAction={handleSubmit} />
              ) : (
                <Action
                  title="View Chat"
                  icon={Icon.Binoculars}
                  onAction={() => {
                    hasAutoPushed.current = true;
                    push(
                      <ConversationDetailView
                        conversationId={activeConversationId}
                        selectedModel={selectedModel}
                        isFirstQuestion={false}
                        existingQuestions={activeQuestions}
                        addQuestion={addQuestion}
                        updateQuestion={updateQuestion}
                        onStartNew={() => {
                          setActiveConversationId(uuidv4());
                          clearSearchBar({ clearText: true });
                          setSearchText("");
                          hasAutoPushed.current = false;
                        }}
                      />
                    );
                  }}
                />
              )}
              <Action
                title="Start New Chat"
                icon={Icon.Plus}
                shortcut={Keyboard.Shortcut.Common.New}
                onAction={() => {
                  setActiveConversationId(uuidv4());
                  clearSearchBar({ clearText: true });
                  setSearchText("");
                  hasAutoPushed.current = false;
                }}
              />
            </ActionPanel>
          }
        />
      )}
    </List>
  );
}
