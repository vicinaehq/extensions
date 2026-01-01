/**
 * Utility functions for formatting and display
 */

/**
 * Format timestamp for display
 */
export function formatTimestamp(date: Date): string {
    return date.toLocaleTimeString();
}

/**
 * Format character count message
 */
export function formatCharacterCount(count: number): string {
    return `${count} character${count !== 1 ? "s" : ""}`;
}
