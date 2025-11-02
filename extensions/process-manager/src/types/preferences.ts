/**
 * Centralized preference types for the application
 * This ensures consistency across all components and hooks
 */

export interface PreferenceValues {
  'refresh-interval': string;
  'sort-by-memory': boolean;
  'show-system-processes': boolean;
  'show-pid': boolean;
  'show-path': boolean;
  'search-in-paths': boolean;
  'search-in-pid': boolean;
  'close-window-after-kill': boolean;
  'clear-search-after-kill': boolean;
  'process-limit': string;
}
