import { Action, ActionPanel, Form, Icon, getPreferenceValues, showToast, Toast, useNavigation } from "@vicinae/api";
import { useState } from "react";
import { showFailureToast } from "../lib/feedback";
import { createId } from "../lib/id";
import {
  formatReasoningHint,
  formatTemperatureHint,
  parseOptionalMaxOutputTokens,
  parseOptionalTemperature,
} from "../lib/model-settings";
import { DEFAULT_SYSTEM_PROMPT } from "../lib/prompt";
import { getProvider, parseProviderId, PROVIDERS } from "../lib/providers";
import { ShortcutRepository } from "../lib/storage";
import { trimText } from "../lib/string";
import type { ContextSource, LlmShortcut, Preferences, ProviderType, ShortcutFormValues } from "../lib/types";
import { QuicklinkWizard } from "./QuicklinkWizard";

interface ShortcutFormProps {
  shortcut?: LlmShortcut;
  /** Prefills the name field when creating, e.g. from an unmatched list search. */
  initialName?: string;
  onSaved: () => void;
}

const repository = new ShortcutRepository();

/**
 * Form used for both creating and editing prompt definitions.
 */
export function ShortcutForm({ shortcut, initialName, onSaved }: ShortcutFormProps) {
  const { pop, push } = useNavigation();
  const isEditing = Boolean(shortcut);
  const preferences = getPreferenceValues<Preferences>();
  const initialProvider = shortcut?.provider ?? "default";
  const [selectedProvider, setSelectedProvider] = useState(initialProvider);
  const [pastesToActiveApp, setPastesToActiveApp] = useState(shortcut?.pasteToActiveApp ?? false);
  const [closesWindowOnCopy, setClosesWindowOnCopy] = useState(shortcut?.closeWindowOnCopy ?? true);
  const resolvedProvider = resolveProvider(selectedProvider, preferences.provider);
  const resolvedDefinition = getProvider(resolvedProvider);

  async function handleSubmit(values: Record<string, unknown>) {
    const input = values as ShortcutFormValues;
    const now = new Date().toISOString();
    const contextSources = getContextSources(input);
    const provider = parseProviderId(input.provider);
    const resolvedInputProvider = provider ?? preferences.provider;
    const name = trimText(input.name);
    const systemPrompt = trimText(input.systemPrompt);
    let temperature: number | undefined;
    let maxOutputTokens: number | undefined;

    if (!name) {
      await showFailureToast("Name is required");
      return false;
    }
    if (!systemPrompt) {
      await showFailureToast("System prompt is required");
      return false;
    }
    try {
      temperature = parseOptionalTemperature(trimText(input.temperature), resolvedInputProvider, "Temperature override");
    } catch (error) {
      await showFailureToast("Invalid temperature", error);
      return false;
    }
    try {
      maxOutputTokens = parseOptionalMaxOutputTokens(input.maxOutputTokens, "Max output tokens");
    } catch (error) {
      await showFailureToast("Invalid max output tokens", error);
      return false;
    }

    const updated: LlmShortcut = {
      id: shortcut?.id ?? createId("shortcut"),
      name,
      alias: trimText(input.alias),
      description: trimText(input.description),
      systemPrompt,
      defaultCommand: trimText(input.defaultCommand),
      contextSources,
      provider,
      model: trimText(input.model) || undefined,
      temperature,
      reasoningLevel: trimText(input.reasoningLevel) || undefined,
      maxOutputTokens,
      closeWindowOnCopy: input.closeWindowOnCopy,
      pasteToActiveApp: input.pasteToActiveApp,
      createdAt: shortcut?.createdAt ?? now,
      updatedAt: now,
    };

    try {
      await repository.saveShortcut(updated);
    } catch (error) {
      await showFailureToast("Failed to save prompt", error);
      return false;
    }

    await showToast({
      style: Toast.Style.Success,
      title: isEditing ? "Prompt updated" : "Prompt created",
      message: updated.name,
    });
    onSaved();
    pop();
    if (!isEditing) {
      push(<QuicklinkWizard shortcut={updated} />);
    }
    return true;
  }

  return (
    <Form
      navigationTitle={isEditing ? "Edit Prompt" : "Create Prompt"}
      actions={
        <ActionPanel>
          <Action.SubmitForm title={isEditing ? "Save Prompt" : "Create Prompt"} icon={Icon.Check} onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.TextField id="name" title="Name" placeholder="Summarize" defaultValue={shortcut?.name ?? initialName ?? ""} autoFocus />
      <Form.TextField
        id="alias"
        title="Keywords"
        placeholder="summary, tldr"
        info="Extra search terms for finding this prompt in the Manage Prompts list. Root search finds a created Quicklink by its name only."
        defaultValue={shortcut?.alias ?? ""}
      />
      <Form.TextField id="description" title="Description" placeholder="What this prompt does" defaultValue={shortcut?.description ?? ""} />
      <Form.TextArea
        id="systemPrompt"
        title="System Prompt"
        placeholder="You are an intelligent summarizer..."
        defaultValue={shortcut?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT}
      />
      <Form.TextArea
        id="defaultCommand"
        title="Default Command"
        placeholder="Leave empty to ask each time"
        defaultValue={shortcut?.defaultCommand ?? ""}
      />
      <Form.Separator />
      <Form.Checkbox
        id="includeSelectedText"
        title="Selected Text"
        label="Include selected text"
        defaultValue={shortcut ? shortcut.contextSources.includes("selectedText") : true}
      />
      <Form.Checkbox
        id="includeClipboardText"
        title="Clipboard Text"
        label="Include clipboard text"
        defaultValue={shortcut ? shortcut.contextSources.includes("clipboardText") : false}
      />
      <Form.Checkbox
        id="pasteToActiveApp"
        title="Result"
        label="Paste into the active app"
        info="Makes Paste the primary action on the result, so Enter sends it straight back to whatever you were working in — replacing the selection where the app keeps one. Pasting always closes Vicinae."
        value={pastesToActiveApp}
        onChange={(next) => {
          setPastesToActiveApp(next);
          // Pasting only works with Vicinae out of the way, so a prompt set up
          // for it wants the same get-in-get-out behaviour when copying.
          if (next) {
            setClosesWindowOnCopy(true);
          }
        }}
      />
      <Form.Checkbox
        id="closeWindowOnCopy"
        title="Copy Behavior"
        label="Close Vicinae after copying"
        info="Applies to the Copy action. Pasting closes Vicinae regardless."
        value={closesWindowOnCopy}
        onChange={setClosesWindowOnCopy}
      />
      <Form.Separator />
      <Form.Dropdown
        id="provider"
        title="Provider Override"
        value={selectedProvider}
        onChange={setSelectedProvider}
      >
        <Form.Dropdown.Item title="Use Extension Default" value="default" />
        {PROVIDERS.map((definition) => (
          <Form.Dropdown.Item key={definition.id} title={definition.selectionTitle} value={definition.id} />
        ))}
      </Form.Dropdown>
      <Form.TextField
        id="model"
        title="Model Override"
        placeholder={`Use extension default (e.g. ${resolvedDefinition.modelPlaceholder})`}
        defaultValue={shortcut?.model ?? ""}
      />
      <Form.TextField
        id="temperature"
        title="Temperature Override"
        placeholder="Use provider/model default"
        info={formatTemperatureHint(resolvedProvider)}
        defaultValue={shortcut?.temperature === undefined ? "" : String(shortcut.temperature)}
      />
      <Form.TextField
        id="reasoningLevel"
        title="Reasoning Level Override"
        placeholder="Use extension default"
        info={formatReasoningHint(resolvedProvider)}
        defaultValue={shortcut?.reasoningLevel ?? ""}
      />
      <Form.TextField
        id="maxOutputTokens"
        title="Max Output Tokens Override"
        placeholder="Use extension default"
        info="Blank uses the provider/model default. Must be a positive whole number when set."
        defaultValue={shortcut?.maxOutputTokens === undefined ? "" : String(shortcut.maxOutputTokens)}
      />
    </Form>
  );
}

function getContextSources(input: ShortcutFormValues): ContextSource[] {
  const sources: ContextSource[] = [];
  if (input.includeSelectedText) {
    sources.push("selectedText");
  }
  if (input.includeClipboardText) {
    sources.push("clipboardText");
  }

  return sources;
}

function resolveProvider(value: string, defaultProvider: ProviderType): ProviderType {
  return parseProviderId(value) ?? defaultProvider;
}
