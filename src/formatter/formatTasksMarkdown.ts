import type { DateType, MetadataPlacement } from "../settings.ts";
import type { ParsedTaskInput } from "../parser/parseTaskInput.ts";

export const DATE_MARKERS: Record<DateType, string> = {
  due: "📅",
  scheduled: "⏳",
  start: "🛫",
};

export const RECURRENCE_MARKER = "🔁";

const DATE_OUTPUT_ORDER: DateType[] = ["due", "scheduled", "start"];

export interface FormatTasksMarkdownOptions {
  tagPlacement?: MetadataPlacement;
  priorityPlacement?: MetadataPlacement;
}

export function formatTasksMarkdown(parsed: ParsedTaskInput, options: FormatTasksMarkdownOptions = {}): string {
  const tagPlacement = options.tagPlacement ?? "last";
  const priorityPlacement = options.priorityPlacement ?? "first";
  const title = tagPlacement === "where-entered" ? parsed.title : parsed.titleWithoutTags;
  const parts: string[] = [];

  if (priorityPlacement === "first" && parsed.priority?.marker) {
    parts.push(parsed.priority.marker);
  }

  if (tagPlacement === "first") {
    parts.push(...parsed.tags);
  }

  if (title.length > 0) {
    parts.push(title);
  }

  if (tagPlacement === "last") {
    parts.push(...parsed.tags);
  }

  if ((priorityPlacement === "where-entered" || priorityPlacement === "last") && parsed.priority?.marker) {
    parts.push(parsed.priority.marker);
  }

  if (parsed.recurrence !== null) {
    parts.push(`${RECURRENCE_MARKER} ${parsed.recurrence.rule}`);
  }

  const dates = parsed.dates ?? (parsed.date === null ? {} : { [parsed.date.type]: parsed.date.date });
  for (const dateType of DATE_OUTPUT_ORDER) {
    const date = dates[dateType];
    if (date) {
      parts.push(`${DATE_MARKERS[dateType]} ${date}`);
    }
  }

  return `- [ ] ${parts.join(" ")}`;
}
