/**
 * Shared search utilities
 *
 * Fuzzy matching for search/filter across the application.
 */

/**
 * Fuzzy search within a string.
 * First tries a simple substring match, then falls back to
 * ordered-character fuzzy matching.
 */
export function fuzzyMatch(text: string, query: string): boolean {
  const lowerText = text.toLowerCase();
  const lowerQuery = query.toLowerCase();

  // Simple substring match first
  if (lowerText.includes(lowerQuery)) return true;

  // Fuzzy match: all query chars in order
  let queryIndex = 0;
  for (const char of lowerText) {
    if (char === lowerQuery[queryIndex]) {
      queryIndex++;
      if (queryIndex === lowerQuery.length) return true;
    }
  }

  return false;
}
