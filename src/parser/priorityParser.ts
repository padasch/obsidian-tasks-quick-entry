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

  const cleanedInput = input.replace(/(^|\s)(prio\s+(lowest|normal|medium|highest|high|low))(?=$|\s)/gi, (match, leading: string, found: string, level: string, offset: number) => {
    const start = offset + leading.length;
    matches.push({
      ...priorityFromLevel(level.toLowerCase() as PriorityLevel),
      matchedText: found,
      start,
      end: start + found.length,
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
