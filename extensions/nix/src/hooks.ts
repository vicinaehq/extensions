import { useState, useCallback, useRef, useEffect } from "react";
import { showToast, Toast } from "@vicinae/api";
import { getNixpkgsPullRequest } from "./api";
import type { GitHubPullRequest } from "./types";

export function useSearch<T>(searchFunction: (query: string) => Promise<T[]>, errorMessage: string = "Search failed") {
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchText, setSearchText] = useState("");
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const performSearch = useCallback(
    async (query: string) => {
      if (!query.trim()) {
        setItems([]);
        return;
      }

      setIsLoading(true);
      try {
        const results = await searchFunction(query);
        setItems(results);
      } catch (err) {
        showToast({
          style: Toast.Style.Failure,
          title: `Search failed: ${err}`,
          message: errorMessage,
        });
        setItems([]);
      } finally {
        setIsLoading(false);
      }
    },
    [searchFunction, errorMessage],
  );

  const handleSearchTextChange = useCallback(
    (text: string) => {
      setSearchText(text);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        performSearch(text);
        timeoutRef.current = null;
      }, 500);
    },
    [performSearch],
  );

  return {
    items,
    isLoading,
    searchText,
    handleSearchTextChange,
  };
}

export function useGithubPullRequestDetail(prNumber: number, githubToken?: string) {
  const [pr, setPr] = useState<GitHubPullRequest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!githubToken) {
      setLoading(false);
      return;
    }

    const fetchPullRequest = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await getNixpkgsPullRequest(prNumber);
        setPr(data);
      } catch (e) {
        console.error(e);
        setError("Failed to load pull request details. Please check your GitHub token and try again.");
      } finally {
        setLoading(false);
      }
    };

    fetchPullRequest();
  }, [prNumber, githubToken]);

  return { pr, loading, error };
}
