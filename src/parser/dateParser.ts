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

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const NUMBER_PATTERN = "\\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve";
const WEEKDAY_PATTERN = "sunday|sun|monday|mon|tuesday|tue|tues|wednesday|wed|thursday|thu|thur|thurs|friday|fri|saturday|sat";
const MONTHS: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sept: 9,
  sep: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};
const ORDINAL_DAY_WORDS: Record<string, number> = {
  first: 1,
  second: 2,
  third: 3,
  fourth: 4,
  fifth: 5,
  sixth: 6,
  seventh: 7,
  eighth: 8,
  ninth: 9,
  tenth: 10,
  eleventh: 11,
  twelfth: 12,
  thirteenth: 13,
  fourteenth: 14,
  fifteenth: 15,
  sixteenth: 16,
  seventeenth: 17,
  eighteenth: 18,
  nineteenth: 19,
  twentieth: 20,
  "twenty first": 21,
  "twenty-first": 21,
  "twenty second": 22,
  "twenty-second": 22,
  "twenty third": 23,
  "twenty-third": 23,
  "twenty fourth": 24,
  "twenty-fourth": 24,
  "twenty fifth": 25,
  "twenty-fifth": 25,
  "twenty sixth": 26,
  "twenty-sixth": 26,
  "twenty seventh": 27,
  "twenty-seventh": 27,
  "twenty eighth": 28,
  "twenty-eighth": 28,
  "twenty ninth": 29,
  "twenty-ninth": 29,
  thirtieth: 30,
  "thirty first": 31,
  "thirty-first": 31,
};
const MONTH_PATTERN = "january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec";
const DAY_OF_MONTH_PATTERN = "\\d{1,2}(?:st|nd|rd|th)?";
const ORDINAL_DAY_PATTERN = `${DAY_OF_MONTH_PATTERN}|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth|twenty[-\\s]first|twenty[-\\s]second|twenty[-\\s]third|twenty[-\\s]fourth|twenty[-\\s]fifth|twenty[-\\s]sixth|twenty[-\\s]seventh|twenty[-\\s]eighth|twenty[-\\s]ninth|thirtieth|thirty[-\\s]first`;
const TIME_OF_DAY_SUFFIX_PATTERN = "(?:\\s+(?:(?:at\\s+)?(?:noon|midday|midnight)|morning|afternoon|evening|night))?";

export function extractDate(input: string, referenceDate = new Date()): DateParseResult | null {
  return extractDateMatches(input, referenceDate).best;
}

export function extractDateMatches(input: string, referenceDate = new Date()): DateParseMatches {
  const reference = startOfLocalDay(referenceDate);
  const candidates: DateCandidate[] = [];
  let order = 0;

  collectTimeBeforeDateDates(input, reference, candidates, order);
  order += candidates.length;
  collectKeywordDates(input, reference, candidates, order);
  order += candidates.length;
  collectTimeOfDayDates(input, reference, candidates, order);
  order += candidates.length;
  collectRelativeDates(input, reference, candidates, order);
  order += candidates.length;
  collectPrefixedDateStarts(input, reference, candidates, order);
  order += candidates.length;
  collectNamedMonthBoundaryDates(input, reference, candidates, order);
  order += candidates.length;
  collectPeriodBoundaryDates(input, reference, candidates, order);
  order += candidates.length;
  collectOrdinalMonthDates(input, reference, candidates, order);
  order += candidates.length;
  collectOrdinalDayDates(input, reference, candidates, order);
  order += candidates.length;
  collectMonthNameDates(input, reference, candidates, order);
  order += candidates.length;
  collectThisWeekdayDates(input, reference, candidates, order);
  order += candidates.length;
  collectNextWeekdayDates(input, reference, candidates, order);
  order += candidates.length;
  collectBareWeekdayDates(input, reference, candidates, order);
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
  const regex = new RegExp(`(^|[^\\w#])((?:today|tod|td|tomorrow|tmr|tom|tm|yesterday|yd|next\\s+week|nw|weekend|next\\s+month|next\\s+year)${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const matchedText = stripTimeOfDaySuffix(match[2].toLowerCase());
    const date = getKeywordDate(matchedText, reference);
    return formatLocalDate(date);
  });
}

function collectTimeBeforeDateDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:(?:at\\s+)?(?:noon|midday|midnight)|tonight|(?:this\\s+)?(?:morning|afternoon|evening|night))\\s+(today|tod|td|tomorrow|tmr|tom|tm|yesterday|yd|next\\s+week|nw|weekend|next\\s+month|next\\s+year|next\\s+(?:${WEEKDAY_PATTERN})|this\\s+(?:${WEEKDAY_PATTERN})|${WEEKDAY_PATTERN}))(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    return formatLocalDate(resolveDateCue(reference, match[3].toLowerCase()));
  });
}

function collectTimeOfDayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = /(^|[^\w#])((?:at\s+)?(?:noon|midday|midnight)|tonight|(?:this\s+)?(?:morning|afternoon|evening|night))(?=$|[^\w#])/gi;
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const leading = match[1] ?? "";
    const start = match.index + leading.length;
    if (hasAdjacentDateCue(input, start, start + match[2].length)) {
      return null;
    }

    return formatLocalDate(reference);
  });
}

function collectRelativeDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:(?:in|within)\\s+)?(${NUMBER_PATTERN})\\s+(day|days|week|weeks|month|months|year|years)(?:\\s+(from\\s+now|later|ago))?${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const amount = parseAmount(match[3]);
    if (amount === null) {
      return null;
    }

    const unit = match[4].toLowerCase();
    const direction = match[5]?.toLowerCase() === "ago" ? -1 : 1;
    const date = unit.startsWith("day")
      ? addDays(reference, direction * amount)
      : unit.startsWith("week")
        ? addDays(reference, direction * amount * 7)
        : unit.startsWith("month")
          ? addMonths(reference, direction * amount)
          : addYears(reference, direction * amount);
    return formatLocalDate(date);
  });
}

function collectPrefixedDateStarts(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const monthDayPattern = `(?:(?:${MONTH_PATTERN})\\s+${DAY_OF_MONTH_PATTERN}(?:,?\\s+\\d{4})?|${DAY_OF_MONTH_PATTERN}\\s+(?:${MONTH_PATTERN})(?:,?\\s+\\d{4})?)`;
  const monthDayRegex = new RegExp(`(^|[^\\w#])((?:in|by)\\s+(${monthDayPattern})${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, monthDayRegex, candidates, orderStart, (match) => {
    return parseMonthNameDate(match[3], reference);
  });

  const monthOnlyRegex = new RegExp(`(^|[^\\w#])((?:in|by)\\s+(${MONTH_PATTERN})(?!\\s+${DAY_OF_MONTH_PATTERN}(?=$|[^\\w#]))(?:,?\\s+(\\d{4}))?${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, monthOnlyRegex, candidates, orderStart + candidates.length, (match) => {
    const month = MONTHS[match[3].toLowerCase()];
    const year = match[4] === undefined ? reference.getFullYear() : Number.parseInt(match[4], 10);
    return isValidDateParts(year, month, 1) ? formatDateParts(year, month, 1) : null;
  });

  const yearOnlyRegex = new RegExp(`(^|[^\\w#])((?:in|by)\\s+(\\d{4})(?![-.\\d])${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, yearOnlyRegex, candidates, orderStart + candidates.length, (match) => {
    const year = Number.parseInt(match[3], 10);
    return isValidDateParts(year, 1, 1) ? formatDateParts(year, 1, 1) : null;
  });
}

function collectNamedMonthBoundaryDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((last\\s+day\\s+of|end\\s+of|mid(?:dle)?(?:\\s+of)?)\\s+(${MONTH_PATTERN})(?:,?\\s+(\\d{4}))?${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const boundary = match[3].toLowerCase();
    const month = MONTHS[match[4].toLowerCase()];
    const explicitYear = match[5] === undefined ? null : Number.parseInt(match[5], 10);
    const day = boundary.startsWith("last") || boundary.startsWith("end")
      ? lastDayOfMonth(resolveMonthYear(reference, month, explicitYear), month)
      : 15;
    const date = resolveMonthDay(reference, month, day, explicitYear);
    return date === null ? null : formatLocalDate(date);
  });
}

function collectPeriodBoundaryDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((start|beginning|end|last\\s+day)\\s+of\\s+(?:(this|next)\\s+)?(week|month|year)${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    return formatLocalDate(resolvePeriodBoundary(reference, match[3].toLowerCase(), match[4]?.toLowerCase() ?? "this", match[5].toLowerCase()));
  });
}

function collectOrdinalMonthDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:on\\s+)?(?:the\\s+)?(${ORDINAL_DAY_PATTERN})\\s+of\\s+(?:(this|next)\\s+month|(${MONTH_PATTERN})(?:,?\\s+(\\d{4}))?)${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const day = parseOrdinalDay(match[3]);
    if (day === null) {
      return null;
    }

    const relativeMonth = match[4]?.toLowerCase();
    if (relativeMonth === "this" || relativeMonth === "next") {
      const date = resolveRelativeMonthDay(reference, day, relativeMonth);
      return date === null ? null : formatLocalDate(date);
    }

    const month = MONTHS[match[5].toLowerCase()];
    const year = match[6] === undefined ? null : Number.parseInt(match[6], 10);
    const date = resolveMonthDay(reference, month, day, year);
    return date === null ? null : formatLocalDate(date);
  });
}

function collectOrdinalDayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:on\\s+)?(?:the\\s+)?(${DAY_OF_MONTH_PATTERN})${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    if (!/(?:st|nd|rd|th)$/i.test(match[3]) && !/^on\s+the\s+/i.test(match[2])) {
      return null;
    }

    const day = parseOrdinalDay(match[3]);
    if (day === null) {
      return null;
    }

    const date = nextDayOfMonth(reference, day);
    return date === null ? null : formatLocalDate(date);
  });
}

function collectMonthNameDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const monthFirstRegex = new RegExp(`(^|[^\\w#])((?:${MONTH_PATTERN})\\s+${DAY_OF_MONTH_PATTERN}(?:,?\\s+\\d{4})?${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, monthFirstRegex, candidates, orderStart, (match) => {
    return parseMonthNameDate(match[2], reference);
  });

  const dayFirstRegex = new RegExp(`(^|[^\\w#])(${DAY_OF_MONTH_PATTERN}\\s+(?:${MONTH_PATTERN})(?:,?\\s+\\d{4})?${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, dayFirstRegex, candidates, orderStart + candidates.length, (match) => {
    return parseMonthNameDate(match[2], reference);
  });
}

function collectNextWeekdayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:on\\s+)?next\\s+(${WEEKDAY_PATTERN})${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const targetDay = WEEKDAYS[match[3].toLowerCase()];
    return formatLocalDate(addDays(nextWeekday(reference, targetDay, true), 7));
  });
}

function collectThisWeekdayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:on\\s+)?this\\s+(${WEEKDAY_PATTERN})${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const targetDay = WEEKDAYS[match[3].toLowerCase()];
    return formatLocalDate(nextWeekday(reference, targetDay, true));
  });
}

function collectBareWeekdayDates(input: string, reference: Date, candidates: DateCandidate[], orderStart: number): void {
  const regex = new RegExp(`(^|[^\\w#])((?:on\\s+)?(?:${WEEKDAY_PATTERN})${TIME_OF_DAY_SUFFIX_PATTERN})(?=$|[^\\w#])`, "gi");
  collectMatches(input, regex, candidates, orderStart, (match) => {
    const targetDay = WEEKDAYS[stripDatePreposition(stripTimeOfDaySuffix(match[2].toLowerCase()))];
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

function getKeywordDate(matchedText: string, reference: Date): Date {
  if (matchedText === "today" || matchedText === "tod" || matchedText === "td") {
    return reference;
  }

  if (matchedText === "yesterday" || matchedText === "yd") {
    return addDays(reference, -1);
  }

  if (matchedText === "tomorrow" || matchedText === "tmr" || matchedText === "tom" || matchedText === "tm") {
    return addDays(reference, 1);
  }

  if (matchedText === "next week" || matchedText === "nw") {
    return nextWeekday(reference, 1, false);
  }

  if (matchedText === "next month") {
    return new Date(reference.getFullYear(), reference.getMonth() + 1, 1);
  }

  if (matchedText === "next year") {
    return new Date(reference.getFullYear() + 1, 0, 1);
  }

  return nextWeekday(reference, 6, true);
}

function resolveDateCue(reference: Date, cue: string): Date {
  const nextWeekdayMatch = cue.match(new RegExp(`^next\\s+(${WEEKDAY_PATTERN})$`, "i"));
  if (nextWeekdayMatch !== null) {
    return addDays(nextWeekday(reference, WEEKDAYS[nextWeekdayMatch[1].toLowerCase()], true), 7);
  }

  const thisWeekdayMatch = cue.match(new RegExp(`^this\\s+(${WEEKDAY_PATTERN})$`, "i"));
  if (thisWeekdayMatch !== null) {
    return nextWeekday(reference, WEEKDAYS[thisWeekdayMatch[1].toLowerCase()], true);
  }

  const weekday = WEEKDAYS[cue];
  if (weekday !== undefined) {
    return nextWeekday(reference, weekday, true);
  }

  return getKeywordDate(cue, reference);
}

function stripTimeOfDaySuffix(input: string): string {
  return input
    .replace(/\s+(?:(?:at\s+)?(?:noon|midday|midnight)|morning|afternoon|evening|night)$/i, "")
    .trim();
}

function stripDatePreposition(input: string): string {
  return input.replace(/^on\s+/i, "").trim();
}

function parseAmount(input: string): number | null {
  const normalized = input.toLowerCase();
  const amount = NUMBER_WORDS[normalized] ?? Number.parseInt(normalized, 10);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseOrdinalDay(input: string): number | null {
  const normalized = input.toLowerCase().replace(/(\d+)(st|nd|rd|th)$/, "$1");
  const day = ORDINAL_DAY_WORDS[normalized] ?? Number.parseInt(normalized, 10);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
}

function parseMonthNameDate(input: string, reference: Date): string | null {
  const cleaned = stripTimeOfDaySuffix(input).replace(",", "").trim();
  const monthFirst = cleaned.match(new RegExp(`^(${MONTH_PATTERN})\\s+(${DAY_OF_MONTH_PATTERN})(?:\\s+(\\d{4}))?$`, "i"));
  if (monthFirst !== null) {
    const month = MONTHS[monthFirst[1].toLowerCase()];
    const day = parseOrdinalDay(monthFirst[2]);
    const year = monthFirst[3] === undefined ? null : Number.parseInt(monthFirst[3], 10);
    const date = day === null ? null : resolveMonthDay(reference, month, day, year);
    return date === null ? null : formatLocalDate(date);
  }

  const dayFirst = cleaned.match(new RegExp(`^(${DAY_OF_MONTH_PATTERN})\\s+(${MONTH_PATTERN})(?:\\s+(\\d{4}))?$`, "i"));
  if (dayFirst !== null) {
    const day = parseOrdinalDay(dayFirst[1]);
    const month = MONTHS[dayFirst[2].toLowerCase()];
    const year = dayFirst[3] === undefined ? null : Number.parseInt(dayFirst[3], 10);
    const date = day === null ? null : resolveMonthDay(reference, month, day, year);
    return date === null ? null : formatLocalDate(date);
  }

  return null;
}

function resolveMonthDay(reference: Date, month: number, day: number, year: number | null): Date | null {
  if (year !== null) {
    return isValidDateParts(year, month, day) ? new Date(year, month - 1, day) : null;
  }

  const currentYear = reference.getFullYear();
  const currentYearDate = isValidDateParts(currentYear, month, day) ? new Date(currentYear, month - 1, day) : null;
  if (currentYearDate !== null && currentYearDate >= reference) {
    return currentYearDate;
  }

  const nextYear = currentYear + 1;
  return isValidDateParts(nextYear, month, day) ? new Date(nextYear, month - 1, day) : null;
}

function resolveMonthYear(reference: Date, month: number, year: number | null): number {
  if (year !== null) {
    return year;
  }

  return month - 1 < reference.getMonth() ? reference.getFullYear() + 1 : reference.getFullYear();
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function resolveRelativeMonthDay(reference: Date, day: number, relativeMonth: "this" | "next"): Date | null {
  const monthOffset = relativeMonth === "next" ? 1 : 0;
  const targetMonth = reference.getMonth() + monthOffset;
  const date = new Date(reference.getFullYear(), targetMonth, day);
  return date.getDate() === day ? date : null;
}

function nextDayOfMonth(reference: Date, day: number): Date | null {
  for (let monthOffset = 0; monthOffset < 24; monthOffset += 1) {
    const date = new Date(reference.getFullYear(), reference.getMonth() + monthOffset, day);
    if (date.getDate() === day && date >= reference) {
      return date;
    }
  }

  return null;
}

function resolvePeriodBoundary(reference: Date, boundary: string, modifier: string, period: string): Date {
  const isNext = modifier === "next";
  const isEnd = boundary === "end" || boundary === "last day";

  if (period === "week") {
    const weekStart = addDays(startOfWeek(reference), isNext ? 7 : 0);
    return isEnd ? addDays(weekStart, 6) : weekStart;
  }

  if (period === "month") {
    const targetMonth = reference.getMonth() + (isNext ? 1 : 0);
    return isEnd
      ? new Date(reference.getFullYear(), targetMonth + 1, 0)
      : new Date(reference.getFullYear(), targetMonth, 1);
  }

  const targetYear = reference.getFullYear() + (isNext ? 1 : 0);
  return isEnd ? new Date(targetYear, 11, 31) : new Date(targetYear, 0, 1);
}

function hasAdjacentDateCue(input: string, start: number, end: number): boolean {
  const before = input.slice(Math.max(0, start - 48), start).trim().toLowerCase();
  const after = input.slice(end, Math.min(input.length, end + 48)).trim().toLowerCase();
  return hasTrailingDateCue(before) || hasLeadingDateCue(after);
}

function hasTrailingDateCue(input: string): boolean {
  return new RegExp(`(?:today|tod|tomorrow|tmr|tom|yesterday|weekend|next\\s+(?:week|month|year|${WEEKDAY_PATTERN})|this\\s+(?:week|month|year|${WEEKDAY_PATTERN})|${WEEKDAY_PATTERN}|${MONTH_PATTERN}\\s+${DAY_OF_MONTH_PATTERN}|${DAY_OF_MONTH_PATTERN}\\s+${MONTH_PATTERN}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\.\\d{1,2}\\.\\d{4})$`, "i").test(input);
}

function hasLeadingDateCue(input: string): boolean {
  return new RegExp(`^(?:today|tod|tomorrow|tmr|tom|yesterday|weekend|next\\s+(?:week|month|year|${WEEKDAY_PATTERN})|this\\s+(?:week|month|year|${WEEKDAY_PATTERN})|${WEEKDAY_PATTERN}|${MONTH_PATTERN}\\s+${DAY_OF_MONTH_PATTERN}|${DAY_OF_MONTH_PATTERN}\\s+${MONTH_PATTERN}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}\\.\\d{1,2}\\.\\d{4})`, "i").test(input);
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

function startOfWeek(date: Date): Date {
  const day = date.getDay();
  const daysSinceMonday = day === 0 ? 6 : day - 1;
  return addDays(date, -daysSinceMonday);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  const targetMonth = date.getMonth() + months;
  const lastDay = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(date.getFullYear(), targetMonth, Math.min(date.getDate(), lastDay));
}

function addYears(date: Date, years: number): Date {
  const targetYear = date.getFullYear() + years;
  const lastDay = new Date(targetYear, date.getMonth() + 1, 0).getDate();
  return new Date(targetYear, date.getMonth(), Math.min(date.getDate(), lastDay));
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
