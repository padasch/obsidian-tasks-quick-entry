export interface DateParseResult {
  date: string;
  matchedText: string;
  start: number;
  end: number;
}

export interface DateParseMatches {
  best: DateParseResult | null;
  matches: DateParseResult[];
}

interface DateCandidate extends DateParseResult {
  order: number;
}

const WEEKDAYS: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

export function extractDate(input: string, referenceDate = new Date()): DateParseResult | null {
  return extractDateMatches(input, referenceDate).best;
}

export function extractDateMatches(input: string, referenceDate = new Date()): DateParseMatches {
  const reference = startOfLocalDay(referenceDate);
  const candidates: DateCandidate[] = [];
  let order = 0;

  collectKeywordDates(input, reference, candidates, order);
  order += candidates.length;
  collectRelativeDates(input, reference, candidates, order);
  order += candidates.length;
  collectThisWeekdayDates(input, reference, candidates, order);
  order += candidates.length;
  collectNextWeekdayDates(input, reference, candidates, order);
  order += candidates.length;
  collectIsoDates(input, candidates, order);
  order += candidates.length;
  collectEuropeanDates(input, candidates, order);

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

export function removeDateMatch(input: string, match: DateParseResult): string {
  return `${input.slice(0, match.start)} ${input.slice(match.end)}`.replace(/\s+/g, " ").trim();
}

function collectKeywordDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\w#])(today|tod|tomorrow|tmr|tom|next\s+week|nw|weekend)(?=$|[^\w#])/gi;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const matchedText = match[2].toLowerCase();
    const date = matchedText === "today" || matchedText === "tod"
      ? reference
      : matchedText === "tomorrow" || matchedText === "tmr" || matchedText === "tom"
        ? addDays(reference, 1)
        : matchedText === "next week" || matchedText === "nw"
          ? nextWeekday(reference, 1, false)
          : nextWeekday(reference, 6, true);
    return formatLocalDate(date);
  });
}

function collectRelativeDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\w#])(in\s+(\d+)\s+(day|days|week|weeks|month|months))(?=$|[^\w#])/gi;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const amount = Number.parseInt(match[3], 10);
    const unit = match[4].toLowerCase();
    const date = unit.startsWith("day")
      ? addDays(reference, amount)
      : unit.startsWith("week")
        ? addDays(reference, amount * 7)
        : addMonths(reference, amount);
    return formatLocalDate(date);
  });
}

function collectNextWeekdayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\w#])(next\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat))(?=$|[^\w#])/gi;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const targetDay = WEEKDAYS[match[3].toLowerCase()];
    return formatLocalDate(addDays(nextWeekday(reference, targetDay, true), 7));
  });
}

function collectThisWeekdayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\w#])(this\s+(sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat))(?=$|[^\w#])/gi;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const targetDay = WEEKDAYS[match[3].toLowerCase()];
    return formatLocalDate(nextWeekday(reference, targetDay, true));
  });
}

function collectIsoDates(input: string, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\d#])((\d{4})-(\d{2})-(\d{2}))(?=$|[^\d])/g;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const year = Number.parseInt(match[3], 10);
    const month = Number.parseInt(match[4], 10);
    const day = Number.parseInt(match[5], 10);
    return isValidDateParts(year, month, day) ? formatDateParts(year, month, day) : null;
  });
}

function collectEuropeanDates(input: string, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\d#])((\d{1,2})\.(\d{1,2})\.(\d{4}))(?=$|[^\d])/g;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const day = Number.parseInt(match[3], 10);
    const month = Number.parseInt(match[4], 10);
    const year = Number.parseInt(match[5], 10);
    return isValidDateParts(year, month, day) ? formatDateParts(year, month, day) : null;
  });
}

function collectMatches(
  input: string,
  regex: RegExp,
  candidates: DateCandidate[],
  orderStart: number,
  toDate: (match: RegExpExecArray) => string | null,
): void {
  let match: RegExpExecArray | null;
  let order = orderStart;
  while ((match = regex.exec(input)) !== null) {
    const leading = match[1] ?? "";
    const matchedText = match[2];
    const date = toDate(match);

    if (date !== null) {
      const start = match.index + leading.length;
      candidates.push({
        date,
        matchedText,
        start,
        end: start + matchedText.length,
        order,
      });
    }
    order += 1;
  }
}

function compareCandidates(a: DateCandidate, b: DateCandidate): number {
  return a.start - b.start || b.matchedText.length - a.matchedText.length || a.order - b.order;
}

function removeOverlappingCandidates(candidates: DateCandidate[]): DateParseResult[] {
  const matches: DateParseResult[] = [];
  for (const candidate of candidates) {
    if (matches.some((match) => rangesOverlap(candidate, match))) {
      continue;
    }

    matches.push({
      date: candidate.date,
      matchedText: candidate.matchedText,
      start: candidate.start,
      end: candidate.end,
    });
  }

  return matches;
}

function rangesOverlap(a: DateParseResult, b: DateParseResult): boolean {
  return a.start < b.end && b.start < a.end;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

function nextWeekday(reference: Date, targetDay: number, includeToday: boolean): Date {
  const currentDay = reference.getDay();
  let daysUntil = (targetDay - currentDay + 7) % 7;
  if (!includeToday && daysUntil === 0) {
    daysUntil = 7;
  }
  return addDays(reference, daysUntil);
}

function formatLocalDate(date: Date): string {
  return formatDateParts(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

function formatDateParts(year: number, month: number, day: number): string {
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function isValidDateParts(year: number, month: number, day: number): boolean {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}
