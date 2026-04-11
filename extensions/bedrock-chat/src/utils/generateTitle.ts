import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { converseWithBedrock } from "./bedrock";

const MAX_TITLE_LENGTH = 60;

/**
 * Generates a short conversation title using a Bedrock model.
 * Falls back to a truncated version of the first question on failure.
 */
export async function generateTitle(
  client: BedrockRuntimeClient,
  modelId: string,
  titlePrompt: string,
  firstQuestion: string,
  firstAnswer: string,
): Promise<string> {
  try {
    const { answer } = await converseWithBedrock({
      client,
      modelId,
      system: [{ text: titlePrompt }],
      messages: [
        {
          role: "user",
          content: [
            {
              text: `User question: ${firstQuestion}\n\nAssistant answer: ${firstAnswer.slice(0, 500)}`,
            },
          ],
        },
      ],
      inferenceConfig: { temperature: 0.3 },
      useStream: false,
    });

    const title = answer.replace(/^["']|["']$/g, "").trim();
    if (title.length > 0) {
      return title.slice(0, MAX_TITLE_LENGTH);
    }
  } catch {
    // Fall through to fallback
  }

  return truncateTitle(firstQuestion);
}

/**
 * Truncates a question to use as a fallback title.
 */
export function truncateTitle(question: string): string {
  if (question.length <= MAX_TITLE_LENGTH) {
    return question;
  }
  return question.slice(0, MAX_TITLE_LENGTH - 3) + "...";
}
