import type { ContentBlock, Message as BedrockMessage, SystemContentBlock } from "@aws-sdk/client-bedrock-runtime";

export type Set<T> = React.Dispatch<React.SetStateAction<T>>;

// Re-export Bedrock types for convenience
export type Message = BedrockMessage;
export type { ContentBlock, SystemContentBlock };

export interface Chat {
  id: string;
  question: string;
  files: string[];
  created_at: string;
  answer: string;
  modelId: string;
}

export interface SavedChat extends Chat {
  saved_at?: string;
}

export interface Conversation {
  id: string;
  title: string;
  model: Model;
  chats: Chat[];
  updated_at: string;
  created_at: string;
  pinned: boolean;
  hasImages: boolean;
}

export interface Model {
  id: string;
  updated_at: string;
  created_at: string;
  name: string;
  prompt: string;
  option: string;
  temperature: string;
  pinned: boolean;
  vision?: boolean;
}

type FunctionNoArg = () => void;
type PromiseFunctionNoArg = () => Promise<void>;
type PromiseFunctionWithOneArg<T> = (arg: T) => Promise<void>;
type PromiseFunctionWithThreeArg<T, V, W> = (arg_1: T, arg_2: V, arg_3: W) => Promise<void>;

interface BaseFunctionHook<T> {
  add: PromiseFunctionWithOneArg<T>;
  remove: PromiseFunctionWithOneArg<T>;
  clear: PromiseFunctionNoArg;
}

interface BaseHook<T> {
  data: T;
  isLoading: boolean;
}

type Hook<T> = BaseHook<T[]> & BaseFunctionHook<T>;

export type SavedChatHook = Hook<SavedChat>;

export type ConversationsHook = Hook<Conversation> & {
  update: PromiseFunctionWithOneArg<Conversation>;
  setConversations: PromiseFunctionWithOneArg<Conversation[]>;
};

export type ModelHook = BaseHook<Record<string, Model>> &
  BaseFunctionHook<Model> & {
    setModels: PromiseFunctionWithOneArg<Record<string, Model>>;
    update: PromiseFunctionWithOneArg<Model>;
    option: Model["option"][];
    addCustomModelId: PromiseFunctionWithOneArg<string>;
    removeCustomModelId: PromiseFunctionWithOneArg<string>;
  };

export interface ChatHook {
  data: Chat[];
  setData: Set<Chat[]>;
  isLoading: boolean;
  setLoading: Set<boolean>;
  selectedChatId: string | null;
  setSelectedChatId: Set<string | null>;
  ask: PromiseFunctionWithThreeArg<string, string[], Model>;
  clear: PromiseFunctionNoArg;
  streamData: Chat | undefined;
}

export type AskImageProps = {
  user_prompt: string;
  load: "clipboard" | "selected";
  imageData?: { data: Buffer; type: { type: string; height: number; width: number } };
  selected_text?: string;
  user_extra_msg?: string;
  model_override?: string;
  toast_title: string;
  temperature?: number;
};
