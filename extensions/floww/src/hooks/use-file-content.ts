import { readFile } from "node:fs/promises";
import { useCallback, useEffect, useState } from "react";
import { handleFileSystemError } from "../utils/error-handler";

export interface UseFileContentState {
  content: string;
  isLoading: boolean;
  error: string | null;
}

export interface UseFileContentActions {
  refresh: () => Promise<void>;
}

export function useFileContent(filePath: string): UseFileContentState & UseFileContentActions {
  const [content, setContent] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadFileContent = useCallback(async () => {
    if (!filePath) return;

    setIsLoading(true);
    setError(null);

    try {
      const fileContent = await readFile(filePath, "utf-8");
      setContent(fileContent);
    } catch (err) {
      const flowwError = handleFileSystemError(err, filePath);
      setError(flowwError.message);
      setContent("Error loading file content");
    } finally {
      setIsLoading(false);
    }
  }, [filePath]);

  const refresh = useCallback(async () => {
    await loadFileContent();
  }, [loadFileContent]);

  useEffect(() => {
    loadFileContent();
  }, [loadFileContent]);

  return {
    content,
    isLoading,
    error,
    refresh,
  };
}
