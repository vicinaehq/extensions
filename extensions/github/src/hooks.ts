import React from "react";
import { useState, useEffect } from "react";
import { Cache } from "@vicinae/api";
import { Octokit } from "@octokit/rest";
import { getGitHubClient } from "./api/githubClient";
import type { GitHubPreferences, GitHubPreferencesMinimal } from "./types";

// Create a cache instance for GitHub API responses
const githubCache = new Cache({
  namespace: "github-api",
  capacity: 50 * 1024 * 1024, // 50 MB capacity
});

export function useGitHubSearch<T>(
  searchFunction: (octokit: Octokit, query: string, preferences: GitHubPreferences | GitHubPreferencesMinimal) => Promise<T[]>,
  query: string,
  preferences: GitHubPreferences | GitHubPreferencesMinimal,
  deps: React.DependencyList = []
) {
  const [data, setData] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      // Don't search if query is empty
      if (!query.trim()) {
        setData([]);
        setIsLoading(false);
        return;
      }

      // Create cache key from query and relevant preferences
      const cacheKey = `github-${query}-${JSON.stringify({ 
        token: preferences.personalAccessToken?.slice(-4), // Only use last 4 chars for cache key
        perPage: preferences.numberOfResults 
      })}`;

      // Check cache first
      if (githubCache.has(cacheKey)) {
        try {
          const cachedJson = githubCache.get(cacheKey);
          if (cachedJson) {
            const cachedData = JSON.parse(cachedJson);
            setData(cachedData);
            setIsLoading(false);
            return;
          }
        } catch {
          // If parsing fails, continue with API call
        }
      }

      setIsLoading(true);
      const { octokit } = getGitHubClient();

      const results = await searchFunction(octokit, query, preferences);
      
      // Cache the results (with TTL via LRU)
      try {
        githubCache.set(cacheKey, JSON.stringify(results));
      } catch {
        // Cache failure is not critical, continue
      }
      
      setData(results);
    }

    fetchData().finally(() => setIsLoading(false));
  }, [query, preferences, ...deps]);

  return { data, isLoading };
}

// Export cache for manual clearing if needed
export { githubCache };