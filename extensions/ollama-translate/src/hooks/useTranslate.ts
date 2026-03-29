import { getPreferenceValues, showToast, Toast } from "@vicinae/api";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchOllamaModels, translateText } from "../api/ollama";
import {
	DEBOUNCE_MS,
	DEFAULT_MODEL,
	DEFAULT_OLLAMA_HOST,
	DEFAULT_TARGET_LANG,
	type ExtensionPreferences,
	LANGUAGES,
} from "../constants";
import type { OllamaModel } from "../types";

export function useTranslate() {
	const prefs = getPreferenceValues<ExtensionPreferences>();
	const ollamaHost = prefs.ollamaHost || DEFAULT_OLLAMA_HOST;
	const defaultModel = prefs.defaultModel || DEFAULT_MODEL;

	const [searchText, setSearchText] = useState("");
	const [targetLang, setTargetLang] = useState(DEFAULT_TARGET_LANG);
	const [result, setResult] = useState("");
	const [isLoading, setIsLoading] = useState(false);
	const [isLoadingModels, setIsLoadingModels] = useState(true);
	const [modelsError, setModelsError] = useState<string | null>(null);
	const [models, setModels] = useState<OllamaModel[]>([]);
	const [selectedModel, setSelectedModel] = useState(defaultModel);

	const isMounted = useRef(true);
	const abortControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		return () => {
			isMounted.current = false;
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, []);

	useEffect(() => {
		setIsLoadingModels(true);
		setModelsError(null);

		fetchOllamaModels(ollamaHost)
			.then((modelList) => {
				if (!isMounted.current) return;
				setModels(modelList);
				if (
					modelList.length > 0 &&
					!modelList.find((m) => m.model === selectedModel)
				) {
					setSelectedModel(modelList[0].model);
				}
			})
			.catch((error) => {
				if (!isMounted.current) return;
				setModelsError(String(error));
			})
			.finally(() => {
				if (isMounted.current) setIsLoadingModels(false);
			});
	}, [ollamaHost]);

	useEffect(() => {
		// Abort any ongoing request when dependencies change
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}

		const timeoutId = setTimeout(async () => {
			if (!searchText.trim()) {
				if (isMounted.current) setResult("");
				return;
			}

			// Create a new AbortController for this request
			const abortController = new AbortController();
			abortControllerRef.current = abortController;

			if (isMounted.current) setIsLoading(true);
			try {
				const translated = await translateText(
					searchText,
					"auto",
					targetLang,
					selectedModel,
					ollamaHost,
					abortController.signal,
				);

				// Only update if still mounted and not aborted
				if (isMounted.current && !abortController.signal.aborted) {
					setResult(translated);
				}
			} catch (error) {
				if (isMounted.current) {
					// Ignore abort errors
					if (error instanceof Error && error.name !== "AbortError") {
						showToast(Toast.Style.Failure, "Translation failed", String(error));
					}
				}
			} finally {
				// Clean up
				if (isMounted.current && !abortController.signal.aborted) {
					setIsLoading(false);
				}
				abortControllerRef.current = null;
			}
		}, DEBOUNCE_MS);

		return () => {
			clearTimeout(timeoutId);
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
			}
		};
	}, [searchText, targetLang, selectedModel, ollamaHost]);

	const handleClear = useCallback(() => {
		setSearchText("");
		setResult("");
	}, []);

	const handleSwapLanguages = useCallback(() => {
		setTargetLang(DEFAULT_TARGET_LANG);
	}, []);

	const getLangName = useCallback(
		(code: string) => {
			const lang = LANGUAGES.find((l) => l.value === code);
			return lang?.title || code;
		},
		[LANGUAGES],
	);

	const languageLabel = useMemo(
		() => `Auto → ${getLangName(targetLang)}`,
		[targetLang, getLangName],
	);

	const ollamaStatus = useMemo(() => {
		if (isLoadingModels) return "Loading...";
		if (modelsError) return `Error: ${modelsError}`;
		if (models.length === 0) return "No models found";
		return `${models.length} model${models.length !== 1 ? "s" : ""} loaded`;
	}, [models, isLoadingModels, modelsError]);

	return {
		searchText,
		setSearchText,
		targetLang,
		setTargetLang,
		result,
		isLoading,
		isLoadingModels,
		modelsError,
		models,
		selectedModel,
		setSelectedModel,
		handleClear,
		handleSwapLanguages,
		languageLabel,
		ollamaStatus,
	};
}
