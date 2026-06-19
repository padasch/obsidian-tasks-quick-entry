import {
  getLegacyTaskTokenOrder,
  normalizeTaskTokenOrder,
  type DateType,
  type MetadataPlacement,
  type TaskLineToken,
} from "../settings.ts";
import type { ParsedTaskInput } from "../parser/parseTaskInput.ts";

export const DATE_MARKERS: Record<DateType, string> = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
};

export const RECURRENCE_MARKER = "🔁";

const DATE_OUTPUT_ORDER: DateType[] = ["due", "scheduled", "start"];

export interface FormatTasksMarkdownOptions {
  taskTokenOrder?: TaskLineToken[];
  tagPlacement?: MetadataPlacement;
  priorityPlacement?: MetadataPlacement;
}

export function formatTasksMarkdown(parsed: ParsedTaskInput, options: FormatTasksMarkdownOptions = {}): string {
  const tokenOrder = normalizeTaskTokenOrder(
    options.taskTokenOrder,
    getLegacyTaskTokenOrder(options.tagPlacement, options.priorityPlacement),
  );
  const titleWithoutTags = parsed.titleWithoutTags;
  const text = removeMarkdownLinks(titleWithoutTags);
  const notes = extractMarkdownLinks(titleWithoutTags);
  const parts: string[] = [];

  const dates = parsed.dates ?? (parsed.date === null ? {} : { [parsed.date.type]: parsed.date.date });
  for (const token of tokenOrder) {
    switch (token) {
      case "priority":
        if (parsed.priority?.marker) {
          parts.push(parsed.priority.marker);
        }
        break;
      case "text":
        if (text.length > 0) {
          parts.push(text);
        }
        break;
      case "notes":
        parts.push(...notes);
        break;
      case "tags":
        parts.push(...parsed.tags);
        break;
      case "recurrence":
        if (parsed.recurrence !== null) {
          parts.push(`${RECURRENCE_MARKER} ${parsed.recurrence.rule}`);
        }
        break;
      case "dates":
        parts.push(...formatDates(dates));
        break;
    }
  }

  const taskLine = `- [ ] ${parts.join(" ")}`;
  const description = normalizeDescription(parsed.description);
  if (description.length === 0) {
    return taskLine;
  }

  return `${taskLine}\n    - ${description}`;
}

function normalizeDescription(description: string | undefined): string {
  return (description ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDates(dates: Partial<Record<DateType, string>>): string[] {
  const parts: string[] = [];

  for (const dateType of DATE_OUTPUT_ORDER) {
    const date = dates[dateType];
    if (date) {
      parts.push(`${DATE_MARKERS[dateType]} ${date}`);
    }
  }

  return parts;
}

function extractMarkdownLinks(input: string): string[] {
  return Array.from(input.matchAll(/\[\[[^\]\n]+\]\]/g), (match) => match[0]);
}

function removeMarkdownLinks(input: string): string {
  return input.replace(/\[\[[^\]\n]+\]\]/g, " ").replace(/\s+/g, " ").trim();
}
