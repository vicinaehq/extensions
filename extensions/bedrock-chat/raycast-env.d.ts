/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Bedrock API Key - Enter your Amazon Bedrock API key (bearer token) */
  "bedrockApiKey": string,
  /** Bedrock Region - AWS region for Bedrock (e.g., us-east-1, us-west-2) */
  "bedrockRegion": string,
  /** Stream Completion - Stream the completions of the generated answer */
  "useStream": boolean,
  /** Auto-save Conversation - Auto-save every conversation that you had with the model */
  "isAutoSaveConversation": boolean,
  /** Pause History - Pause the history of the conversation */
  "isHistoryPaused": boolean,
  /** Auto-load Text - Load selected text from your frontmost application to the question bar automatically */
  "isAutoLoadText": boolean,
  /** Text-to-Speech - Enable auto TTS everytime you get a generated answer */
  "isAutoTTS": boolean
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `ask` command */
  export type Ask = ExtensionPreferences & {}
  /** Preferences accessible in the `saved` command */
  export type Saved = ExtensionPreferences & {}
  /** Preferences accessible in the `history` command */
  export type History = ExtensionPreferences & {}
  /** Preferences accessible in the `conversation` command */
  export type Conversation = ExtensionPreferences & {}
  /** Preferences accessible in the `model` command */
  export type Model = ExtensionPreferences & {}
  /** Preferences accessible in the `summarize` command */
  export type Summarize = ExtensionPreferences & {
  /** Prompt template for the website - Template support {{content}} tag, and it will replace with the content */
  "promptTemplate"?: string,
  /** Prompt template for the YouTube - Template support {{content}} tag, and it will replace with the video transcript */
  "promptTemplate2"?: string
}
  /** Preferences accessible in the `ask-selected-image` command */
  export type AskSelectedImage = ExtensionPreferences & {}
  /** Preferences accessible in the `ask-clipboard-image` command */
  export type AskClipboardImage = ExtensionPreferences & {}
  /** Preferences accessible in the `create-ai-command` command */
  export type CreateAiCommand = ExtensionPreferences & {}
  /** Preferences accessible in the `search-ai-command` command */
  export type SearchAiCommand = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `ask` command */
  export type Ask = {}
  /** Arguments passed to the `saved` command */
  export type Saved = {}
  /** Arguments passed to the `history` command */
  export type History = {}
  /** Arguments passed to the `conversation` command */
  export type Conversation = {}
  /** Arguments passed to the `model` command */
  export type Model = {}
  /** Arguments passed to the `summarize` command */
  export type Summarize = {}
  /** Arguments passed to the `ask-selected-image` command */
  export type AskSelectedImage = {
  /** What is it? */
  "query": string
}
  /** Arguments passed to the `ask-clipboard-image` command */
  export type AskClipboardImage = {
  /** What is it? */
  "query": string
}
  /** Arguments passed to the `create-ai-command` command */
  export type CreateAiCommand = {}
  /** Arguments passed to the `search-ai-command` command */
  export type SearchAiCommand = {}
}

