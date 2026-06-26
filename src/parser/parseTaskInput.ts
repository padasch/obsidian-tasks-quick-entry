import { DATE_TYPES, parseDefaultTags, type DateType } from "../settings.ts";
import { extractDateMatches, type DateParseResult } from "./dateParser.ts";
import { extractPriority, type ParsedPriority, type PriorityParseMatch } from "./priorityParser.ts";
import { extractRecurrenceMatches, type ParsedRecurrence } from "./recurrenceParser.ts";

export interface ParseTaskInputOptions {
  defaultDateType?: DateType;
  removeParsedDateText?: boolean;
  defaultTags?: string | string[];
  presetDates?: ParsedTaskDates;
  presetDateTexts?: ParsedTaskDateTexts;
  referenceDate?: Date;
}

export interface ParsedTaskDate {
  type: DateType;
  date: string;
  matchedText: string;
}

export type ParsedTaskDates = Partial<Record<DateType, string>>;
export type ParsedTaskDateTexts = Partial<Record<DateType, string>>;

export interface ParsedTaskInput {
  rawInput: string;
  title: string;
  titleWithoutTags: string;
  description?: string;
  date: ParsedTaskDate | null;
  dates: ParsedTaskDates;
  dateTexts: ParsedTaskDateTexts;
  recurrence: ParsedRecurrence | null;
  dateMatches: DateParseResult[];
  recurrenceMatches: ParsedRecurrence[];
  priorityMatches: PriorityParseMatch[];
  priority: ParsedPriority | null;
  conflicts: ParsedMetadataConflict[];
  links: string[];
  tags: string[];
}

export interface ParsedMetadataConflict {
  kind: "date" | "recurrence" | "priority" | "file" | "tag";
  label: string;
  used: string;
  ignored: string[];
}

export function parseTaskInput(input: string, options: ParseTaskInputOptions = {}): ParsedTaskInput {
  const rawInput = input;
  const normalizedInput = normalizeWhitespace(input);

  if (normalizedInput.length === 0) {
    throw new Error("Enter a task before adding.");
  }

  const priorityResult = extractPriority(normalizedInput);
  const recurrenceResult = extractRecurrenceMatches(priorityResult.cleanedInput, options.referenceDate);
  const recurrenceMatch = recurrenceResult.best;
  const inputWithoutRecurrence = recurrenceResult.matches.length === 0
    ? priorityResult.cleanedInput
    : removeMetadataMatches(priorityResult.cleanedInput, recurrenceResult.matches);
  const dateResult = extractDateMatches(inputWithoutRecurrence, options.referenceDate);
  const dateMatch = dateResult.best;
  const shouldRemoveDate = options.removeParsedDateText ?? true;
  const titleWithoutMetadata = dateMatch !== null && shouldRemoveDate
    ? removeMetadataMatches(inputWithoutRecurrence, [dateMatch])
    : inputWithoutRecurrence;

  const normalizedTitle = normalizeRepeatedInlineMetadata(
    appendDefaultTags(titleWithoutMetadata, parseDefaultTags(options.defaultTags)),
  );
  const title = normalizedTitle.title;

  if (title.length === 0) {
    throw new Error("Task title is empty after parsing.");
  }

  const defaultDateType = options.defaultDateType ?? "due";
  const parsedDate = dateMatch === null
    ? recurrenceMatch === null
      ? null
      : {
          type: defaultDateType,
          date: recurrenceMatch.inferredDate,
          matchedText: "inferred from recurrence",
        }
    : {
        type: defaultDateType,
        date: dateMatch.date,
        matchedText: dateMatch.matchedText,
      };
  const dates: ParsedTaskDates = { ...(options.presetDates ?? {}) };
  const dateTexts: ParsedTaskDateTexts = { ...(options.presetDateTexts ?? {}) };

  if (parsedDate !== null) {
    dates[parsedDate.type] = parsedDate.date;
    dateTexts[parsedDate.type] = parsedDate.matchedText;
  }

  const firstDateType = DATE_TYPES.find((dateType) => Boolean(dates[dateType]));
  const date = firstDateType === undefined
    ? null
    : {
        type: firstDateType,
        date: dates[firstDateType]!,
        matchedText: dateTexts[firstDateType] ?? "preset",
      };

  return {
    rawInput,
    title,
    description: undefined,
    titleWithoutTags: removeTags(title),
    date,
    dates,
    dateTexts,
    dateMatches: dateResult.matches,
    recurrenceMatches: recurrenceResult.matches,
    priorityMatches: priorityResult.matches,
    recurrence: recurrenceMatch,
    priority: priorityResult.priority,
    conflicts: [
      ...getMetadataConflicts(priorityResult.matches, recurrenceResult.matches, dateResult.matches),
      ...normalizedTitle.conflicts,
    ],
    links: extractLinks(title),
    tags: extractTags(title),
  };
}

function getMetadataConflicts(
  priorityMatches: PriorityParseMatch[],
  recurrenceMatches: ParsedRecurrence[],
  dateMatches: DateParseResult[],
): ParsedMetadataConflict[] {
  return [
    getDateConflict(dateMatches),
    getRecurrenceConflict(recurrenceMatches),
    getPriorityConflict(priorityMatches),
  ].filter((conflict): conflict is ParsedMetadataConflict => conflict !== null);
}

function getPriorityConflict(matches: PriorityParseMatch[]): ParsedMetadataConflict | null {
  if (matches.length < 2) {
    return null;
  }

  return {
    kind: "priority",
    label: "Duplicated Priority",
    used: formatPriorityMatch(matches[0]),
    ignored: matches.slice(1).map(formatPriorityMatch),
  };
}

function getRecurrenceConflict(matches: ParsedRecurrence[]): ParsedMetadataConflict | null {
  if (matches.length < 2) {
    return null;
  }

  return {
    kind: "recurrence",
    label: "Duplicated Recurrence",
    used: matches[0].rule,
    ignored: matches.slice(1).map((match) => match.rule),
  };
}

function getDateConflict(matches: DateParseResult[]): ParsedMetadataConflict | null {
  if (matches.length < 2) {
    return null;
  }

  return {
    kind: "date",
    label: "Duplicated Date",
    used: matches[0].date,
    ignored: matches.slice(1).map((match) => match.date),
  };
}

function normalizeRepeatedInlineMetadata(input: string): { title: string; conflicts: ParsedMetadataConflict[] } {
  const links = normalizeRepeatedLinks(input);
  const tags = normalizeRepeatedTags(links.title);
  return {
    title: tags.title,
    conflicts: [...links.conflicts, ...tags.conflicts],
  };
}

function normalizeRepeatedLinks(input: string): { title: string; conflicts: ParsedMetadataConflict[] } {
  const groups = new Map<string, { used: string; ignored: string[]; order: number }>();
  let order = 0;

  const title = input.replace(/\[\[([^\]\n]+)\]\]/g, (match: string, linkText: string) => {
    const display = formatLinkDisplay(linkText);
    const key = normalizeLinkKey(linkText);
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, { used: display, ignored: [], order });
      order += 1;
      return match;
    }

    group.ignored.push(display);
    return " ";
  }).replace(/\s+/g, " ").trim();

  return {
    title,
    conflicts: Array.from(groups.values())
      .filter((group) => group.ignored.length > 0)
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        kind: "file",
        label: "Duplicated File",
        used: group.used,
        ignored: group.ignored,
      })),
  };
}

function normalizeRepeatedTags(input: string): { title: string; conflicts: ParsedMetadataConflict[] } {
  const groups = new Map<string, { used: string; ignored: string[]; order: number }>();
  let order = 0;

  const title = input.replace(/(^|\s)(#[^ !@#$%^&*(),.?":{}|<>]+)/g, (match: string, leading: string, tag: string) => {
    const key = tag.toLowerCase();
    const group = groups.get(key);

    if (group === undefined) {
      groups.set(key, { used: tag, ignored: [], order });
      order += 1;
      return match;
    }

    group.ignored.push(tag);
    return leading;
  }).replace(/\s+/g, " ").trim();

  return {
    title,
    conflicts: Array.from(groups.values())
      .filter((group) => group.ignored.length > 0)
      .sort((a, b) => a.order - b.order)
      .map((group) => ({
        kind: "tag",
        label: "Duplicated Tag",
        used: group.used,
        ignored: group.ignored,
      })),
  };
}

function normalizeLinkKey(linkText: string): string {
  return linkText.split("|", 1)[0].trim().replace(/\s+/g, " ").toLowerCase();
}

function formatLinkDisplay(linkText: string): string {
  return linkText.split("|", 1)[0].trim().replace(/\s+/g, " ");
}

function formatPriorityMatch(match: PriorityParseMatch): string {
  return `${match.label}${match.marker ? ` ${match.marker}` : ""}`;
}

function removeMetadataMatches(input: string, matches: Array<{ start: number; end: number }>): string {
  return matches
    .slice()
    .sort((a, b) => b.start - a.start)
    .reduce((output, match) => `${output.slice(0, match.start)} ${output.slice(match.end)}`, input)
    .replace(/\s+/g, " ")
    .trim();
}

function appendDefaultTags(title: string, defaultTags: string[]): string {
  if (defaultTags.length === 0) {
    return normalizeWhitespace(title);
  }

  const existingTags = new Set(extractTags(title));
  const tagsToAdd = defaultTags.filter((tag) => !existingTags.has(tag));
  return normalizeWhitespace([title, ...tagsToAdd].filter((part) => part.length > 0).join(" "));
}

function extractTags(input: string): string[] {
  return input.match(/(^|\s)#[^ !@#$%^&*(),.?":{}|<>]+/g)?.map((tag) => tag.trim()) ?? [];
}

function removeTags(input: string): string {
  return input.replace(/(^|\s)#[^ !@#$%^&*(),.?":{}|<>]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractLinks(input: string): string[] {
  return Array.from(input.matchAll(/\[\[([^\]]+)\]\]/g), (match) => match[1].trim()).filter((link) => link.length > 0);
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
