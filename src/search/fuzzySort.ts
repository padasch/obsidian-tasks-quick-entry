export interface FuzzySortOptions {
  maxResults?: number;
  normalizeQuery?: (query: string) => string;
}

export function fuzzySort<T>(
  items: T[],
  query: string,
  getText: (item: T) => string,
  options: FuzzySortOptions = {},
): T[] {
  const normalizedQuery = options.normalizeQuery?.(query) ?? normalizeFuzzyText(query);
  const maxResults = options.maxResults ?? 30;

  if (normalizedQuery.length === 0) {
    return items.slice(0, maxResults);
  }

  return items
    .map((item) => ({ item, score: fuzzyMatchScore(getText(item), normalizedQuery) }))
    .filter((entry): entry is { item: T; score: number } => entry.score !== null)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item)
    .slice(0, maxResults);
}

export function fuzzyMatchScore(text: string, query: string): number | null {
  const normalizedText = normalizeFuzzyText(text);
  const normalizedQuery = normalizeFuzzyText(query);

  if (normalizedQuery.length === 0) {
    return 0;
  }

  const exactIndex = normalizedText.indexOf(normalizedQuery);
  if (exactIndex >= 0) {
    return 10000 + (normalizedQuery.length * 100) - (exactIndex * 2) - (normalizedText.length * 0.01);
  }

  let textIndex = -1;
  let streak = 0;
  let score = 1000;

  for (const char of normalizedQuery) {
    const nextIndex = normalizedText.indexOf(char, textIndex + 1);
    if (nextIndex < 0) {
      return null;
    }

    const gap = nextIndex - textIndex - 1;
    streak = gap === 0 ? streak + 1 : 1;
    score += 40 + (streak * 15);

    if (nextIndex === 0 || isBoundaryCharacter(normalizedText[nextIndex - 1] ?? "")) {
      score += 20;
    }

    score -= gap * 3;
    textIndex = nextIndex;
  }

  return score - (normalizedText.length * 0.01);
}

export function normalizeFuzzyText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function isBoundaryCharacter(char: string): boolean {
  return char === " "
    || char === "/"
    || char === "\\"
    || char === "#"
    || char === "-"
    || char === "_"
    || char === ":"
    || char === "("
    || char === "[";
}
