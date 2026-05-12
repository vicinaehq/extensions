import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useRef, useState } from "react";
import { getCachedModel } from "../services/history";
import { buildMessages, streamChat } from "../services/ollama";
import type { EnhanceStyle, ExtensionPreferences, Mode } from "../types/index";
import { preprocessInput } from "../utils/preprocess";
import type { PreprocessedInput } from "../utils/preprocess";
import { postprocessOutput } from "../utils/postprocess";

export interface RequestCompleteResult {
  mode: Mode;
  input: string;
  output: string;
  model: string;
  targetLanguage: string;
}

interface UseOllamaRequestReturn {
  output: string;
  isLoading: boolean;
  error: string | null;
  resultModel: string;
  stopRequest: () => void;
  startRequest: () => void;
}

export function useOllamaRequest(
  mode: Mode,
  inputText: string,
  targetLanguage: string,
  enhanceStyle: EnhanceStyle,
  onComplete?: (result: RequestCompleteResult) => void,
): UseOllamaRequestReturn {
  const [output, setOutput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultModel, setResultModel] = useState("");

	const abortRef = useRef<AbortController | null>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const masksRef = useRef<Map<string, string>>(new Map());

	const modeRef = useRef(mode);
	const inputRef = useRef(inputText);
	const langRef = useRef(targetLanguage);
	const styleRef = useRef(enhanceStyle);
	const onCompleteRef = useRef(onComplete);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { inputRef.current = inputText; }, [inputText]);
  useEffect(() => { langRef.current = targetLanguage; }, [targetLanguage]);
  useEffect(() => { styleRef.current = enhanceStyle; }, [enhanceStyle]);
  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);

  const stopRequest = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

	const startRequest = useCallback(async () => {
		const rawText = inputRef.current;
		if (!rawText.trim()) return;

		// Preprocess: mask URLs/code so model doesn't translate/modify them
		const processed: PreprocessedInput = preprocessInput(rawText);
		masksRef.current = processed.masks;

		stopRequest();
		setIsLoading(true);
		setOutput("");
		setError(null);
		setResultModel("");

		const controller = new AbortController();
		abortRef.current = controller;

		const prefs = getPreferenceValues<ExtensionPreferences>();
		const model = getCachedModel(modeRef.current) || prefs.defaultModel;
		const messages = buildMessages(modeRef.current, processed.text, langRef.current, styleRef.current);

		try {
			let fullOutput = "";
			for await (const token of streamChat(model, messages, controller.signal)) {
				if (controller.signal.aborted) return;
				fullOutput += token;
				setOutput(fullOutput);
			}

			if (fullOutput) {
				const cleaned = postprocessOutput(fullOutput, masksRef.current);
				setResultModel(model);
				onCompleteRef.current?.({
					mode: modeRef.current,
					input: rawText,
					output: cleaned,
					model,
					targetLanguage: langRef.current,
				});
			}
		} catch (err) {
      if (controller.signal.aborted) return;
      const raw = err instanceof Error ? err.message : "An unknown error occurred";
      const message = raw.includes("fetch")
        ? "Cannot reach Ollama. Make sure it's running (`ollama serve`)."
        : raw;
      setError(message);
      showToast({
        style: Toast.Style.Failure,
        title: "Request failed",
        message,
      });
    } finally {
      setIsLoading(false);
    }
  }, [stopRequest]);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    stopRequest();

    if (!inputText.trim()) {
      setOutput("");
      setError(null);
      setIsLoading(false);
      return;
    }

    debounceRef.current = setTimeout(startRequest, 800);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [inputText, targetLanguage, enhanceStyle, stopRequest, startRequest]);

  useEffect(() => {
    return () => stopRequest();
  }, [stopRequest]);

  return { output, isLoading, error, resultModel, stopRequest, startRequest };
}
