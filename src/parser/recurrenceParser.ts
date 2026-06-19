export interface ParsedRecurrence {
  rule: string;
  matchedText: string;
  inferredDate: string;
  start: number;
  end: number;
}

export interface RecurrenceParseMatches {
  best: ParsedRecurrence | null;
  matches: ParsedRecurrence[];
}

interface RecurrenceCandidate extends ParsedRecurrence {
  order: number;
}

type RecurrenceBuilder = (match: RegExpExecArray, reference: Date) => Omit<ParsedRecurrence, "matchedText" | "start" | "end"> | null;

type OrdinalWeekday = number | "last" | "2nd last";
type OrdinalDay = number | "last";

const WEEKDAY_ALIASES: Record<string, { index: number; name: string }> = {
  sunday: { index: 0, name: "Sunday" },
  sun: { index: 0, name: "Sunday" },
  monday: { index: 1, name: "Monday" },
  mon: { index: 1, name: "Monday" },
  tuesday: { index: 2, name: "Tuesday" },
  tue: { index: 2, name: "Tuesday" },
  tues: { index: 2, name: "Tuesday" },
  wednesday: { index: 3, name: "Wednesday" },
  wed: { index: 3, name: "Wednesday" },
  thursday: { index: 4, name: "Thursday" },
  thu: { index: 4, name: "Thursday" },
  thur: { index: 4, name: "Thursday" },
  thurs: { index: 4, name: "Thursday" },
  friday: { index: 5, name: "Friday" },
  fri: { index: 5, name: "Friday" },
  saturday: { index: 6, name: "Saturday" },
  sat: { index: 6, name: "Saturday" },
};

const WEEKDAY_PATTERN = "sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat";
const WEEKDAY_LIST_PATTERN = `(?:${WEEKDAY_PATTERN})(?:\\s*(?:,|and)\\s*(?:${WEEKDAY_PATTERN}))*`;
const ORDINAL_WEEKDAY_PATTERN = "second\\s+last|2nd\\s+last|last|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th";
const ORDINAL_DAY_PATTERN = "last|first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|[1-9]|[12][0-9]|3[01]|[1-9](?:st|nd|rd|th)|[12][0-9](?:st|nd|rd|th)|3[01](?:st|nd|rd|th)";
const EVERY_PREFIX = "(?:🔁\\s*)?every";

export function extractRecurrence(input: string, referenceDate = new Date()): ParsedRecurrence | null {
  return extractRecurrenceMatches(input, referenceDate).best;
}

export function extractRecurrenceMatches(input: string, referenceDate = new Date()): RecurrenceParseMatches {
  const reference = startOfLocalDay(referenceDate);
  const candidates: RecurrenceCandidate[] = [];
  let order = 0;

  collectCandidates(input, monthlyOrdinalWeekdayNaturalRegex(), reference, candidates, order, buildMonthlyOrdinalWeekdayNatural);
  order += candidates.length;
  collectCandidates(input, monthlyOrdinalWeekdayRegex(), reference, candidates, order, buildMonthlyOrdinalWeekday);
  order += candidates.length;
  collectCandidates(input, monthlyOrdinalDayNaturalRegex(), reference, candidates, order, buildMonthlyOrdinalDayNatural);
  order += candidates.length;
  collectCandidates(input, monthlyOrdinalDayRegex(), reference, candidates, order, buildMonthlyOrdinalDay);
  order += candidates.length;
  collectCandidates(input, weeklyOnRegex(), reference, candidates, order, buildWeeklyOn);
  order += candidates.length;
  collectCandidates(input, everyOtherWeekdayRegex(), reference, candidates, order, buildEveryOtherWeekday);
  order += candidates.length;
  collectCandidates(input, everyWeekdayRegex(), reference, candidates, order, buildEveryWeekday);
  order += candidates.length;
  collectCandidates(input, simpleWeekdayRegex(), reference, candidates, order, buildSimpleWeekday);
  order += candidates.length;
  collectCandidates(input, intervalRegex(), reference, candidates, order, buildInterval);

  if (candidates.length === 0) {
    return {
      best: null,
      matches: [],
    };
  }

  const matches = removeOverlappingCandidates(candidates.sort(compareCandidates));
  const best = matches[0];
  return {
    best: best ?? null,
    matches,
  };
}

export function parseRecurrenceRuleText(input: string, referenceDate = new Date()): ParsedRecurrence | null {
  const normalizedInput = normalizeWhitespace(input);
  if (normalizedInput.length === 0) {
    return null;
  }

  const parsed = extractRecurrence(normalizedInput, referenceDate);
  if (parsed !== null && parsed.start === 0 && parsed.end === normalizedInput.length) {
    return parsed;
  }

  const rawRule = stripRecurrenceMarker(normalizedInput);
  if (/^every\b/i.test(rawRule) && /^[a-zA-Z0-9, !]+$/.test(rawRule)) {
    return {
      rule: normalizeEveryKeyword(rawRule),
      matchedText: normalizedInput,
      inferredDate: formatLocalDate(startOfLocalDay(referenceDate)),
      start: 0,
      end: normalizedInput.length,
    };
  }

  return null;
}

export function removeRecurrenceMatch(input: string, match: ParsedRecurrence): string {
  return `${input.slice(0, match.start)} ${input.slice(match.end)}`.replace(/\s+/g, " ").trim();
}

function monthlyOrdinalWeekdayNaturalRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+(?<ordinal>${ORDINAL_WEEKDAY_PATTERN})\\s+(?<weekday>${WEEKDAY_PATTERN})\\s+(?:of|in)\\s+(?:the\\s+)?month(?:\\s+(?<whenDone>when\\s+done))?`);
}

function monthlyOrdinalWeekdayRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+(?:(?<interval>\\d+)\\s+)?months?\\s+on\\s+the\\s+(?<ordinal>${ORDINAL_WEEKDAY_PATTERN})\\s+(?<weekday>${WEEKDAY_PATTERN})(?:\\s+(?<whenDone>when\\s+done))?`);
}

function monthlyOrdinalDayNaturalRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+(?<ordinal>${ORDINAL_DAY_PATTERN})\\s+(?:day\\s+)?(?:of|in)\\s+(?:the\\s+)?month(?:\\s+(?<whenDone>when\\s+done))?`);
}

function monthlyOrdinalDayRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+(?:(?<interval>\\d+)\\s+)?months?\\s+on\\s+the\\s+(?<ordinal>${ORDINAL_DAY_PATTERN})(?:\\s+(?<whenDone>when\\s+done))?`);
}

function weeklyOnRegex(): RegExp {
  return buildRegex(`(?:(?:${EVERY_PREFIX}\\s+(?:(?<interval>\\d+)\\s+)?weeks?)|weekly)\\s+on\\s+(?<weekdays>${WEEKDAY_LIST_PATTERN})(?:\\s+(?<whenDone>when\\s+done))?`);
}

function everyOtherWeekdayRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+other\\s+(?<weekday>${WEEKDAY_PATTERN})(?:\\s+(?<whenDone>when\\s+done))?`);
}

function everyWeekdayRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+weekdays?(?:\\s+(?<whenDone>when\\s+done))?`);
}

function simpleWeekdayRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+(?<weekdays>${WEEKDAY_LIST_PATTERN})(?:\\s+(?<whenDone>when\\s+done))?`);
}

function intervalRegex(): RegExp {
  return buildRegex(`${EVERY_PREFIX}\\s+(?:(?<interval>\\d+)\\s+)?(?<unit>days?|weeks?|months?|years?)(?:\\s+(?<whenDone>when\\s+done))?`);
}

function buildRegex(pattern: string): RegExp {
  return new RegExp(`(^|[^\\w#])(?<phrase>${pattern})(?=$|[^\\w#])`, "gi");
}

function buildMonthlyOrdinalWeekdayNatural(match: RegExpExecArray, reference: Date) {
  const ordinal = normalizeWeekdayOrdinal(match.groups?.ordinal ?? "");
  const weekday = normalizeWeekday(match.groups?.weekday ?? "");
  if (ordinal === null || weekday === null) {
    return null;
  }

  return {
    rule: withWhenDone(`every month on the ${ordinal.label} ${weekday.name}`, match),
    inferredDate: nextMonthlyOrdinalWeekday(reference, ordinal.value, weekday.index),
  };
}

function buildMonthlyOrdinalWeekday(match: RegExpExecArray, reference: Date) {
  const ordinal = normalizeWeekdayOrdinal(match.groups?.ordinal ?? "");
  const weekday = normalizeWeekday(match.groups?.weekday ?? "");
  if (ordinal === null || weekday === null) {
    return null;
  }

  return {
    rule: withWhenDone(`${monthlyRulePrefix(match.groups?.interval)} on the ${ordinal.label} ${weekday.name}`, match),
    inferredDate: nextMonthlyOrdinalWeekday(reference, ordinal.value, weekday.index),
  };
}

function buildMonthlyOrdinalDayNatural(match: RegExpExecArray, reference: Date) {
  const ordinal = normalizeDayOrdinal(match.groups?.ordinal ?? "");
  if (ordinal === null) {
    return null;
  }

  return {
    rule: withWhenDone(`every month on the ${ordinal.label}`, match),
    inferredDate: nextMonthlyOrdinalDay(reference, ordinal.value),
  };
}

function buildMonthlyOrdinalDay(match: RegExpExecArray, reference: Date) {
  const ordinal = normalizeDayOrdinal(match.groups?.ordinal ?? "");
  if (ordinal === null) {
    return null;
  }

  return {
    rule: withWhenDone(`${monthlyRulePrefix(match.groups?.interval)} on the ${ordinal.label}`, match),
    inferredDate: nextMonthlyOrdinalDay(reference, ordinal.value),
  };
}

function buildWeeklyOn(match: RegExpExecArray, reference: Date) {
  const weekdays = parseWeekdayList(match.groups?.weekdays ?? "");
  if (weekdays.length === 0) {
    return null;
  }

  const prefix = weeklyRulePrefix(match.groups?.interval);
  return {
    rule: withWhenDone(`${prefix} on ${weekdays.map((weekday) => weekday.name).join(", ")}`, match),
    inferredDate: nextWeekdayInList(reference, weekdays.map((weekday) => weekday.index)),
  };
}

function buildEveryOtherWeekday(match: RegExpExecArray, reference: Date) {
  const weekday = normalizeWeekday(match.groups?.weekday ?? "");
  if (weekday === null) {
    return null;
  }

  return {
    rule: withWhenDone(`every 2 weeks on ${weekday.name}`, match),
    inferredDate: nextWeekdayInList(reference, [weekday.index]),
  };
}

function buildEveryWeekday(match: RegExpExecArray, reference: Date) {
  return {
    rule: withWhenDone("every weekday", match),
    inferredDate: nextWeekdayInList(reference, [1, 2, 3, 4, 5]),
  };
}

function buildSimpleWeekday(match: RegExpExecArray, reference: Date) {
  const weekdays = parseWeekdayList(match.groups?.weekdays ?? "");
  if (weekdays.length === 0) {
    return null;
  }

  return {
    rule: withWhenDone(`every week on ${weekdays.map((weekday) => weekday.name).join(", ")}`, match),
    inferredDate: nextWeekdayInList(reference, weekdays.map((weekday) => weekday.index)),
  };
}

function buildInterval(match: RegExpExecArray, reference: Date) {
  const interval = match.groups?.interval;
  const unit = normalizeIntervalUnit(match.groups?.unit ?? "", interval);
  if (unit === null) {
    return null;
  }

  const rule = interval === undefined
    ? `every ${unit.singular}`
    : `every ${interval} ${unit.plural}`;

  return {
    rule: withWhenDone(rule, match),
    inferredDate: formatLocalDate(reference),
  };
}

function collectCandidates(
  input: string,
  regex: RegExp,
  reference: Date,
  candidates: RecurrenceCandidate[],
  orderStart: number,
  builder: RecurrenceBuilder,
): void {
  let match: RegExpExecArray | null;
  let order = orderStart;
  while ((match = regex.exec(input)) !== null) {
    const built = builder(match, reference);
    if (built !== null) {
      const leading = match[1] ?? "";
      const matchedText = match.groups?.phrase ?? "";
      const start = match.index + leading.length;
      candidates.push({
        ...built,
        matchedText,
        start,
        end: start + matchedText.length,
        order,
      });
    }
    order += 1;
  }
}

function compareCandidates(a: RecurrenceCandidate, b: RecurrenceCandidate): number {
  return a.start - b.start || b.matchedText.length - a.matchedText.length || a.order - b.order;
}

function removeOverlappingCandidates(candidates: RecurrenceCandidate[]): ParsedRecurrence[] {
  const matches: ParsedRecurrence[] = [];
  for (const candidate of candidates) {
    if (matches.some((match) => rangesOverlap(candidate, match))) {
      continue;
    }

    matches.push({
      rule: candidate.rule,
      matchedText: candidate.matchedText,
      inferredDate: candidate.inferredDate,
      start: candidate.start,
      end: candidate.end,
    });
  }

  return matches;
}

function rangesOverlap(a: ParsedRecurrence, b: ParsedRecurrence): boolean {
  return a.start < b.end && b.start < a.end;
}

function withWhenDone(rule: string, match: RegExpExecArray): string {
  return match.groups?.whenDone ? `${rule} when done` : rule;
}

function monthlyRulePrefix(interval: string | undefined): string {
  if (!interval || interval === "1") {
    return "every month";
  }

  return `every ${interval} months`;
}

function weeklyRulePrefix(interval: string | undefined): string {
  if (!interval || interval === "1") {
    return "every week";
  }

  return `every ${interval} weeks`;
}

function normalizeIntervalUnit(unit: string, interval: string | undefined): { singular: string; plural: string } | null {
  const normalized = unit.toLowerCase();
  if (normalized.startsWith("day")) {
    return { singular: "day", plural: "days" };
  }
  if (normalized.startsWith("week")) {
    return { singular: "week", plural: "weeks" };
  }
  if (normalized.startsWith("month")) {
    return { singular: "month", plural: "months" };
  }
  if (normalized.startsWith("year")) {
    return { singular: "year", plural: "years" };
  }

  return interval === undefined ? null : { singular: normalized, plural: normalized };
}

function normalizeWeekday(value: string): { index: number; name: string } | null {
  return WEEKDAY_ALIASES[value.toLowerCase()] ?? null;
}

function parseWeekdayList(value: string): { index: number; name: string }[] {
  return value
    .split(/\s*(?:,|and)\s*/i)
    .map((weekday) => normalizeWeekday(weekday))
    .filter((weekday): weekday is { index: number; name: string } => weekday !== null);
}

function normalizeWeekdayOrdinal(value: string): { value: OrdinalWeekday; label: string } | null {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  switch (normalized) {
    case "first":
    case "1st":
      return { value: 1, label: "1st" };
    case "second":
    case "2nd":
      return { value: 2, label: "2nd" };
    case "third":
    case "3rd":
      return { value: 3, label: "3rd" };
    case "fourth":
    case "4th":
      return { value: 4, label: "4th" };
    case "fifth":
    case "5th":
      return { value: 5, label: "5th" };
    case "last":
      return { value: "last", label: "last" };
    case "second last":
    case "2nd last":
      return { value: "2nd last", label: "2nd last" };
    default:
      return null;
  }
}

function normalizeDayOrdinal(value: string): { value: OrdinalDay; label: string } | null {
  const normalized = value.toLowerCase().replace(/\s+/g, " ").trim();
  if (normalized === "last") {
    return { value: "last", label: "last" };
  }

  const weekdayOrdinal = normalizeWeekdayOrdinal(normalized);
  if (weekdayOrdinal !== null && typeof weekdayOrdinal.value === "number") {
    return {
      value: weekdayOrdinal.value,
      label: weekdayOrdinal.label,
    };
  }

  const day = Number.parseInt(normalized.replace(/(?:st|nd|rd|th)$/i, ""), 10);
  if (Number.isInteger(day) && day >= 1 && day <= 31) {
    return { value: day, label: ordinalLabel(day) };
  }

  return null;
}

function nextWeekdayInList(reference: Date, weekdayIndexes: number[]): string {
  for (let offset = 0; offset <= 7; offset += 1) {
    const date = addDays(reference, offset);
    if (weekdayIndexes.includes(date.getDay())) {
      return formatLocalDate(date);
    }
  }

  return formatLocalDate(reference);
}

function nextMonthlyOrdinalWeekday(reference: Date, ordinal: OrdinalWeekday, weekdayIndex: number): string {
  for (let monthOffset = 0; monthOffset < 36; monthOffset += 1) {
    const date = getMonthlyOrdinalWeekday(reference.getFullYear(), reference.getMonth() + monthOffset, ordinal, weekdayIndex);
    if (date !== null && date.getTime() >= reference.getTime()) {
      return formatLocalDate(date);
    }
  }

  return formatLocalDate(reference);
}

function getMonthlyOrdinalWeekday(year: number, monthIndex: number, ordinal: OrdinalWeekday, weekdayIndex: number): Date | null {
  const firstOfMonth = new Date(year, monthIndex, 1);
  const month = firstOfMonth.getMonth();
  const matches: Date[] = [];

  for (let day = 1; day <= 31; day += 1) {
    const date = new Date(firstOfMonth.getFullYear(), month, day);
    if (date.getMonth() !== month) {
      break;
    }

    if (date.getDay() === weekdayIndex) {
      matches.push(date);
    }
  }

  if (ordinal === "last") {
    return matches[matches.length - 1] ?? null;
  }

  if (ordinal === "2nd last") {
    return matches[matches.length - 2] ?? null;
  }

  return matches[ordinal - 1] ?? null;
}

function nextMonthlyOrdinalDay(reference: Date, ordinal: OrdinalDay): string {
  for (let monthOffset = 0; monthOffset < 36; monthOffset += 1) {
    const date = getMonthlyOrdinalDay(reference.getFullYear(), reference.getMonth() + monthOffset, ordinal);
    if (date !== null && date.getTime() >= reference.getTime()) {
      return formatLocalDate(date);
    }
  }

  return formatLocalDate(reference);
}

function getMonthlyOrdinalDay(year: number, monthIndex: number, ordinal: OrdinalDay): Date | null {
  if (ordinal === "last") {
    return new Date(year, monthIndex + 1, 0);
  }

  const date = new Date(year, monthIndex, ordinal);
  return date.getMonth() === new Date(year, monthIndex, 1).getMonth() ? date : null;
}

function stripRecurrenceMarker(input: string): string {
  return normalizeWhitespace(input.replace(/^🔁\s*/u, ""));
}

function normalizeEveryKeyword(input: string): string {
  return input.replace(/^every\b/i, "every");
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function formatLocalDate(date: Date): string {
  return `${date.getFullYear().toString().padStart(4, "0")}-${(date.getMonth() + 1).toString().padStart(2, "0")}-${date.getDate().toString().padStart(2, "0")}`;
}

function ordinalLabel(day: number): string {
  const lastTwoDigits = day % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) {
    return `${day}th`;
  }

  switch (day % 10) {
    case 1:
      return `${day}st`;
    case 2:
      return `${day}nd`;
    case 3:
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}
