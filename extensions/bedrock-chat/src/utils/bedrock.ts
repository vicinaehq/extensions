import {
  BedrockRuntimeClient,
  ConverseCommand,
  ConverseStreamCommand,
  TokenUsage,
} from "@aws-sdk/client-bedrock-runtime";
import type { Message, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime";

export interface ConverseOptions {
  client: BedrockRuntimeClient;
  modelId: string;
  system?: SystemContentBlock[];
  messages: Message[];
  inferenceConfig?: { temperature?: number };
  useStream: boolean;
  /** Called on each streaming text chunk with the accumulated full answer so far. */
  onStreamDelta?: (fullAnswer: string) => void;
  /** Called when token usage metadata is available. */
  onUsage?: (usage: TokenUsage) => void;
  /** Optional abort signal (only the Ask command uses this). */
  abortSignal?: AbortSignal;
}

export interface ConverseResult {
  answer: string;
  usage: TokenUsage | undefined;
}

/**
 * Sends a message to Bedrock via the Converse or ConverseStream API.
 * Handles the stream/non-stream branching in one place so callers
 * only need to provide callbacks for side effects.
 */
export async function converseWithBedrock({
  client,
  modelId,
  system,
  messages,
  inferenceConfig,
  useStream,
  onStreamDelta,
  onUsage,
  abortSignal,
}: ConverseOptions): Promise<ConverseResult> {
  let answer = "";
  let usage: TokenUsage | undefined;

  if (useStream) {
    const command = new ConverseStreamCommand({
      modelId,
      system,
      messages,
      inferenceConfig,
    });

    const sendOptions = abortSignal ? { abortSignal } : undefined;
    const response = await client.send(command, sendOptions);

    if (response.stream) {
      for await (const event of response.stream) {
        if (abortSignal?.aborted) break;

        if (event.contentBlockDelta?.delta && "text" in event.contentBlockDelta.delta) {
          const text = event.contentBlockDelta.delta.text;
          if (text) {
            answer += text;
            onStreamDelta?.(answer);
          }
        }

        if (event.metadata?.usage) {
          usage = event.metadata.usage;
          onUsage?.(usage);
        }
      }
    }
  } else {
    const command = new ConverseCommand({
      modelId,
      system,
      messages,
      inferenceConfig,
    });

    const sendOptions = abortSignal ? { abortSignal } : undefined;
    const response = await client.send(command, sendOptions);

    const outputContent = response.output?.message?.content;
    if (outputContent) {
      for (const block of outputContent) {
        if ("text" in block && block.text) {
          answer += block.text;
        }
      }
    }

    usage = response.usage;
    if (usage) {
      onUsage?.(usage);
    }
  }

  return { answer, usage };
}
