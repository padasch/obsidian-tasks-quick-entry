import type { ParsedTaskDateTexts, ParsedTaskDates } from "../parser/parseTaskInput.ts";
import { extractDate } from "../parser/dateParser.ts";
import type { QuickAddCommandPreset } from "../settings.ts";

export interface CommandPresetDateOptions {
  presetDates?: ParsedTaskDates;
  presetDateTexts?: ParsedTaskDateTexts;
}

const DATE_MODE_TEXT: Record<Exclude<QuickAddCommandPreset["dateMode"], "none">, string> = {
  today: "today",
  tomorrow: "tomorrow",
  "next-week": "next week",
  weekend: "weekend",
};

export function getCommandPresetDateOptions(
  preset: QuickAddCommandPreset | null | undefined,
  referenceDate = new Date(),
): CommandPresetDateOptions {
  if (!preset || preset.dateMode === "none") {
    return {};
  }

  const dateText = DATE_MODE_TEXT[preset.dateMode];
  const parsedDate = extractDate(dateText, referenceDate);
  if (parsedDate === null) {
    return {};
  }

  return {
    presetDates: { [preset.dateType]: parsedDate.date },
    presetDateTexts: { [preset.dateType]: parsedDate.matchedText },
  };
}
