export type PriorityLevel = "lowest" | "low" | "normal" | "medium" | "high" | "highest";

export interface ParsedPriority {
  matchedText?: string;
  level: PriorityLevel;
  label: string;
  marker: string;
}

export interface PriorityParseMatch extends ParsedPriority {
  matchedText: string;
  start: number;
  end: number;
}

export const PRIORITY_LEVELS: PriorityLevel[] = ["highest", "high", "medium", "normal", "low", "lowest"];

const PRIORITY_DETAILS: Record<PriorityLevel, Omit<ParsedPriority, "token">> = {
  lowest: {
    level: "lowest",
    label: "Lowest",
    marker: "⏬",
  },
  low: {
    level: "low",
    label: "Low",
    marker: "🔽",
  },
  normal: {
    level: "normal",
    label: "Normal",
    marker: "",
  },
  medium: {
    level: "medium",
    label: "Medium",
    marker: "🔼",
  },
  high: {
    level: "high",
    label: "High",
    marker: "⏫",
  },
  highest: {
    level: "highest",
    label: "Highest",
    marker: "🔺",
  },
};

const PRIORITY_WORDS = "lowest|low|normal|medium|high|highest";

export interface PriorityParseResult {
  cleanedInput: string;
  priority: ParsedPriority | null;
  matches: PriorityParseMatch[];
}

export function priorityFromLevel(level: PriorityLevel): ParsedPriority {
  return { ...PRIORITY_DETAILS[level] };
}

export function extractPriority(input: string): PriorityParseResult {
  const matches: PriorityParseMatch[] = [];

  const priorityMatchPattern = new RegExp(
    `(^|\\s)(?:prio\\s+(${PRIORITY_WORDS}|!!|!)|(${PRIORITY_WORDS})|(!!|!))(?:$|(?=\\s))`,
    "gi",
  );
  const cleanedInput = input.replace(priorityMatchPattern, (match, leading: string, prefixedPriority: string | undefined, bareLevel: string | undefined, priorityMarker: string | undefined, offset: number) => {
    const rawPriority = priorityMarker ?? bareLevel ?? prefixedPriority;
    if (rawPriority === undefined) {
      return match;
    }

    const matchedLevel = normalizePriorityToken(rawPriority);
    const start = offset + leading.length;
    matches.push({
      ...priorityFromLevel(matchedLevel),
      matchedText: rawPriority,
      start,
      end: start + rawPriority.length,
    });

    return leading;
  }).replace(/\s+/g, " ").trim();

  matches.sort((a, b) => a.start - b.start);

  return {
    cleanedInput,
    priority: matches[0] ?? null,
    matches,
  };
}

function normalizePriorityToken(token: string): PriorityLevel {
  if (token === "!") {
    return "high";
  }

  if (token === "!!") {
    return "highest";
  }

  return token.toLowerCase() as PriorityLevel;
}
