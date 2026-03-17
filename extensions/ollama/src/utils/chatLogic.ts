import { Toast, showToast } from '@vicinae/api';
import { OllamaAPI } from '@/api';
import { OllamaChatMessage, OllamaConversationThread } from '@/types';
import { generateUniqueId } from '@/utils/keyGenerator';

export async function sendChatMessage(
  api: OllamaAPI,
  thread: OllamaConversationThread,
  message: string,
  maxMessages: number,
  onMessagesGenerated: (userMsg: OllamaChatMessage, assistantMsg: OllamaChatMessage, newTitle?: string) => Promise<void>
): Promise<void> {
  if (!message.trim()) return;

  const userMessage: OllamaChatMessage = {
    id: generateUniqueId('msg'),
    role: 'user',
    content: message,
  };

  try {
    const contextMessages = thread.messages.slice(-maxMessages);
    const systemMessages = thread.systemPrompt.trim()
      ? [{ id: generateUniqueId('msg'), role: 'system', content: thread.systemPrompt.trim() } as OllamaChatMessage]
      : [];

    let assistantContent = '';

    for await (const chunk of api.chatStream({
      model: thread.model,
      messages: [...systemMessages, ...contextMessages, userMessage],
    })) {
      if (chunk.message?.content) {
        assistantContent += chunk.message.content;
      }
    }

    const assistantMessage: OllamaChatMessage = {
      id: generateUniqueId('msg'),
      role: 'assistant',
      content: assistantContent,
    };

    // Generate title for new conversations (only on first message)
    let newTitle: string | undefined;
    if (thread.title === 'New Conversation' && thread.messages.length === 0) {
      try {
        let titleContent = '';
        for await (const chunk of api.chatStream({
          model: thread.model,
          messages: [
            {
              id: generateUniqueId('msg'),
              role: 'system',
              content: 'You are a helpful assistant that generates concise conversation titles. Generate a short title (max 50 chars) for the following conversation. Respond with only the title, nothing else.'
            } as OllamaChatMessage,
            {
              id: generateUniqueId('msg'),
              role: 'user',
              content: `User: ${userMessage.content}\n\nAssistant: ${assistantContent}`
            }
          ]
        })) {
          if (chunk.message?.content) {
            titleContent += chunk.message.content;
          }
        }
        newTitle = titleContent.trim().substring(0, 50);
      } catch (titleError) {
        // If title generation fails, fall back to first message
        newTitle = userMessage.content.substring(0, 50) + (userMessage.content.length > 50 ? '...' : '');
      }
    }

    onMessagesGenerated(userMessage, assistantMessage, newTitle);
  } catch (error) {
    await showToast({
      style: Toast.Style.Failure,
      title: 'Chat failed',
      message: String(error),
    });
    throw error;
  }
}

