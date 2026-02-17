import { describe, it, expect, beforeEach, vi } from 'vitest';
import { sendChatMessage } from '../chatLogic';
import { showToast } from '@vicinae/api';
import { OllamaAPI } from '@/api';
import { OllamaConversationThread, OllamaChatMessage } from '@/types';

const createStreamingResponse = (chunks: Array<{ content: string }>) => {
  return async function* () {
    for (const chunk of chunks) {
      yield { message: { content: chunk.content } } as any;
    }
  };
};

const createSingleMessageResponse = (content: string) => {
  return createStreamingResponse([{ content }]);
};

const createMultiChunkResponse = (contentParts: string[]) => {
  return createStreamingResponse(contentParts.map(content => ({ content })));
};

const createResponseWithEmptyChunks = (chunks: Array<{ content?: string }>) => {
  return async function* () {
    for (const chunk of chunks) {
      if (chunk.content !== undefined) {
        yield { message: { content: chunk.content } } as any;
      } else {
        yield { message: {} } as any;
      }
    }
  };
};

const createTwoCallResponse = (firstResponse: string, secondResponse: string) => {
  let callCount = 0;
  return async function* () {
    callCount++;
    if (callCount === 1) {
      yield { message: { content: firstResponse } } as any;
    } else {
      yield { message: { content: secondResponse } } as any;
    }
  };
};

const createFailingTitleGenerationResponse = (firstResponse: string) => {
  let callCount = 0;
  return async function* () {
    callCount++;
    if (callCount === 1) {
      yield { message: { content: firstResponse } } as any;
    } else {
      throw new Error('Title generation failed');
    }
  };
};

const createLongTitleResponse = (messageResponse: string, titleLength: number) => {
  let callCount = 0;
  return async function* () {
    callCount++;
    if (callCount === 1) {
      yield { message: { content: messageResponse } } as any;
    } else {
      yield { message: { content: 'A'.repeat(titleLength) } } as any;
    }
  };
};

const createErrorResponse = (error: Error) => {
  return async function* (): AsyncGenerator<any> {
    throw error;
  };
};

describe('chatLogic', () => {
  let mockApi: OllamaAPI;
  let mockThread: OllamaConversationThread;
  let onMessagesGenerated = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    mockApi = {
      chatStream: vi.fn(),
    } as any;

    mockThread = {
      id: 'thread_1',
      title: 'New Conversation',
      model: 'llama2',
      systemPrompt: 'You are helpful',
      messages: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    onMessagesGenerated = vi.fn();
  });

  describe('sendChatMessage', () => {
    it('should send message and return response', async () => {
      vi.mocked(mockApi.chatStream).mockImplementation(
        createMultiChunkResponse(['Hello', ' there', '!'])
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'Hi',
        20,
        onMessagesGenerated
      );

      expect(onMessagesGenerated).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user', content: 'Hi' }),
        expect.objectContaining({ role: 'assistant', content: 'Hello there!' }),
        expect.any(String) // Title for new conversation
      );
    });

    it('should not send empty messages', async () => {
      await sendChatMessage(
        mockApi,
        mockThread,
        '   ',
        20,
        onMessagesGenerated
      );

      expect(mockApi.chatStream).not.toHaveBeenCalled();
      expect(onMessagesGenerated).not.toHaveBeenCalled();
    });

    it('should include system prompt in messages', async () => {
      vi.mocked(mockApi.chatStream).mockImplementation(
        createSingleMessageResponse('Response')
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'Test message',
        20,
        onMessagesGenerated
      );

      const firstCall = vi.mocked(mockApi.chatStream).mock.calls[0][0];
      expect(firstCall.messages[0]).toEqual(
        expect.objectContaining({
          role: 'system',
          content: 'You are helpful',
        })
      );
    });

    it('should not include system prompt if empty', async () => {
      mockThread.systemPrompt = '';
      vi.mocked(mockApi.chatStream).mockImplementation(
        createSingleMessageResponse('Response')
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'Test message',
        20,
        onMessagesGenerated
      );

      const firstCall = vi.mocked(mockApi.chatStream).mock.calls[0][0];
      expect(firstCall.messages[0]).toEqual(
        expect.objectContaining({
          role: 'user',
          content: 'Test message',
        })
      );
    });

    it('should limit context messages to maxMessages', async () => {
      mockThread.messages = Array.from({ length: 30 }, (_, i) => ({
        id: `msg_${i}`,
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      })) as OllamaChatMessage[];

      vi.mocked(mockApi.chatStream).mockImplementation(
        createSingleMessageResponse('Response')
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'New message',
        10,
        onMessagesGenerated
      );

      const firstCall = vi.mocked(mockApi.chatStream).mock.calls[0][0];
      // System prompt + 10 context messages + new user message
      expect(firstCall.messages).toHaveLength(12);
    });

    it('should generate title for new conversations', async () => {
      vi.mocked(mockApi.chatStream).mockImplementation(
        createTwoCallResponse('Response to greeting', 'Greeting Conversation')
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'Hello',
        20,
        onMessagesGenerated
      );

      expect(onMessagesGenerated).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'Greeting Conversation'
      );
    });

    it('should not generate title for existing conversations', async () => {
      mockThread.title = 'Existing Conversation';
      mockThread.messages = [
        { id: 'msg_1', role: 'user', content: 'Previous message' },
        { id: 'msg_2', role: 'assistant', content: 'Previous response' },
      ];

      vi.mocked(mockApi.chatStream).mockImplementation(
        createSingleMessageResponse('Response')
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'New message',
        20,
        onMessagesGenerated
      );

      // Should only call chatStream once (no title generation)
      expect(mockApi.chatStream).toHaveBeenCalledTimes(1);
      expect(onMessagesGenerated).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        undefined
      );
    });

    it('should fallback to message content if title generation fails', async () => {
      vi.mocked(mockApi.chatStream).mockImplementation(
        createFailingTitleGenerationResponse('Response')
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'This is a very long message that should be truncated for the title',
        20,
        onMessagesGenerated
      );

      expect(onMessagesGenerated).toHaveBeenCalledWith(
        expect.any(Object),
        expect.any(Object),
        'This is a very long message that should be truncat...'
      );
    });

    it('should show error toast on API failure', async () => {
      const error = new Error('API Error');
      vi.mocked(mockApi.chatStream).mockImplementation(
        createErrorResponse(error)
      );

      await expect(
        sendChatMessage(
          mockApi,
          mockThread,
          'Test message',
          20,
          onMessagesGenerated
        )
      ).rejects.toThrow('API Error');

      expect(showToast).toHaveBeenCalledWith(
        expect.objectContaining({
          style: 'failure',
          title: 'Chat failed',
          message: 'Error: API Error',
        })
      );
    });

    it('should handle chunks without message content', async () => {
      vi.mocked(mockApi.chatStream).mockImplementation(
        createResponseWithEmptyChunks([
          { content: 'Hello' },
          {}, // No content
          { content: ' World' },
        ])
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'Hi',
        20,
        onMessagesGenerated
      );

      expect(onMessagesGenerated).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'user', content: 'Hi' }),
        expect.objectContaining({ role: 'assistant', content: 'Hello World' }),
        expect.any(String)
      );
    });

    it('should truncate title to 50 characters', async () => {
      vi.mocked(mockApi.chatStream).mockImplementation(
        createLongTitleResponse('Response', 100)
      );

      await sendChatMessage(
        mockApi,
        mockThread,
        'Message',
        20,
        onMessagesGenerated
      );

      const title = onMessagesGenerated.mock.calls[0][2];
      expect(title).toHaveLength(50);
    });
  });
});

