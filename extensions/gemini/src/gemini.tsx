import {
  Action,
  ActionPanel,
  List,
  getPreferenceValues,
  Icon,
  Keyboard,
} from "@vicinae/api";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";
import { useState, useCallback } from "react";

function extractAllCodeBlocks(text: string): string | null {
  const matches = text.match(/```\w*\n?([\s\S]*?)```/g);
  if (!matches) return null;
  const blocks = matches
    .map((block) => block.replace(/^```(\w*)\n?/, "").replace(/```$/, "").trim());
  return blocks.join("\n\n");
}

type Message = {
  role: "user" | "model";
  content: string;
};

interface Preferences {
  apiKey: string;
  model: string;
}

type ListItemData = {
  id: string;
  question: string;
  answer: string;
};

function GeminiCommand({ thinkingLevel }: { thinkingLevel: ThinkingLevel }) {
  const [items, setItems] = useState<ListItemData[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [conversation, setConversation] = useState<Message[]>([]);

  const handleSubmit = useCallback(
    async (prompt: string) => {
      if (!prompt || !prompt.trim()) return;

      const userMessage: Message = { role: "user", content: prompt };
      const updatedConversation = [userMessage, ...conversation];

      // Build context from conversation history (reverse chronological for display, but send in order)
      const contextMessages: Message[] = [...updatedConversation].reverse();

      setConversation(updatedConversation);
      setIsLoading(true);

      try {
        const result = await generateGeminiContentWithContext(
          contextMessages,
          thinkingLevel,
        );

        const assistantMessage: Message = { role: "model", content: result };
        setConversation((prev) => [assistantMessage, ...prev]);

        const newItem: ListItemData = {
          id: `qa-${Date.now()}`,
          question: prompt,
          answer: result,
        };

        setItems((prev) => [newItem, ...prev]);
        setSearchText("");
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorItem: ListItemData = {
          id: `error-${Date.now()}`,
          question: prompt,
          answer: `**Error:** ${errorMessage}`,
        };
        setItems((prev) => [errorItem, ...prev]);
        // Remove the failed user message from conversation
        setConversation((prev) => prev.slice(1));
      } finally {
        setIsLoading(false);
      }
    },
    [conversation, thinkingLevel],
  );

  const handleSearchTextChange = (text: string) => {
    setSearchText(text);
  };

  const handleNewChat = () => {
    setItems([]);
    setConversation([]);
    setSearchText("");
  };

  return (
    <List
      navigationTitle="Gemini AI"
      searchBarPlaceholder="Ask Gemini anything..."
      isLoading={isLoading}
      isShowingDetail={true}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={handleSearchTextChange}
      actions={
        <ActionPanel>
          <ActionPanel.Section>
            <Action
              title="Ask"
              onAction={() => handleSubmit(searchText)}
              shortcut={Keyboard.Shortcut.Common.Refresh}
              autoFocus
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    >
      {items.length === 0 && (
        <List.EmptyView
          icon={Icon.Gemini}
          title="No messages history yet"
          description="Type a question and press Enter to start chatting with Gemini."
        />
      )}
      {items.map((item) => (
        <List.Item
          key={item.id}
          id={item.id}
          title={item.question}
          detail={<List.Item.Detail markdown={`${item.answer}`} />}
          actions={
            <ActionPanel>
              <ActionPanel.Section>
                <Action
                  title="Ask"
                  onAction={() => handleSubmit(searchText)}
                  shortcut={Keyboard.Shortcut.Common.Refresh}
                  autoFocus
                />
                <Action.CopyToClipboard
                  content={item.answer}
                  title="Copy response"
                />
                {extractAllCodeBlocks(item.answer) !== null && (
                  <Action.CopyToClipboard
                    content={extractAllCodeBlocks(item.answer) || item.answer}
                    title="Copy Code"
                  />
                )}
                <Action title="New chat" onAction={handleNewChat} />
              </ActionPanel.Section>
            </ActionPanel>
          }
        />
      ))}
    </List>
  );
}

export function GeminiLow() {
  return <GeminiCommand thinkingLevel={ThinkingLevel.LOW} />;
}

export function GeminiMedium() {
  return <GeminiCommand thinkingLevel={ThinkingLevel.MEDIUM} />;
}

export function GeminiHigh() {
  return <GeminiCommand thinkingLevel={ThinkingLevel.HIGH} />;
}

export async function generateGeminiContentWithContext(
  messages: Message[],
  thinkingLevel: ThinkingLevel,
): Promise<string> {
  const preferences = getPreferenceValues<Preferences>();
  const apiKey = preferences.apiKey;
  const model = preferences.model;

  const ai = new GoogleGenAI({ apiKey });

  const contents = messages.map((msg) => ({
    role: msg.role,
    parts: [{ text: msg.content }],
  }));

  const response = await ai.models.generateContent({
    model,
    contents,
    config: {
      thinkingConfig: {
        thinkingLevel,
      },
    },
  });

  const resultText = response.text;

  if (!resultText) {
    throw new Error("No text content returned from Gemini API.");
  }

  return resultText;
}
