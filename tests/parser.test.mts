import assert from "node:assert/strict";
import test from "node:test";
import { formatTasksMarkdown } from "../src/formatter/formatTasksMarkdown.ts";
import { parseTaskInput } from "../src/parser/parseTaskInput.ts";
import { priorityFromLevel } from "../src/parser/priorityParser.ts";

const referenceDate = new Date(2026, 5, 15);

test("parses tomorrow, prio highest, and preserves tags", () => {
  const parsed = parseTaskInput("Review manuscript tomorrow #PhD prio highest", {
    referenceDate,
    defaultDateType: "due",
    removeParsedDateText: true,
  });

  assert.equal(parsed.title, "Review manuscript #PhD");
  assert.equal(parsed.titleWithoutTags, "Review manuscript");
  assert.equal(parsed.date?.date, "2026-06-16");
  assert.equal(parsed.dates.due, "2026-06-16");
  assert.equal(parsed.priority?.level, "highest");
  assert.equal(parsed.priority?.marker, "🔺");
  assert.deepEqual(parsed.tags, ["#PhD"]);
  assert.equal(formatTasksMarkdown(parsed), "- [ ] 🔺 Review manuscript #PhD 📅 2026-06-16");
});

test("supports scheduled dates", () => {
  const parsed = parseTaskInput("Draft outline today prio high", {
    referenceDate,
    defaultDateType: "scheduled",
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] ⏫ Draft outline ⏳ 2026-06-15");
});

test("supports start dates", () => {
  const parsed = parseTaskInput("Start grant next Friday prio medium", {
    referenceDate,
    defaultDateType: "start",
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] 🔼 Start grant 🛫 2026-06-26");
});

test("supports relative week dates", () => {
  const parsed = parseTaskInput("Check results in 2 weeks", {
    referenceDate,
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] Check results 📅 2026-06-29");
});

test("supports ISO dates", () => {
  const parsed = parseTaskInput("Submit report 2026-07-01", {
    referenceDate,
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] Submit report 📅 2026-07-01");
});

test("supports European dates", () => {
  const parsed = parseTaskInput("Call supervisor 15.06.2026", {
    referenceDate,
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] Call supervisor 📅 2026-06-15");
});

test("can keep parsed date text in title", () => {
  const parsed = parseTaskInput("Review manuscript tomorrow prio highest", {
    referenceDate,
    removeParsedDateText: false,
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] 🔺 Review manuscript tomorrow 📅 2026-06-16");
});

test("does not parse p4 as a priority marker", () => {
  const parsed = parseTaskInput("Triage inbox p4 tomorrow", {
    referenceDate,
  });

  assert.equal(parsed.priority, null);
  assert.equal(formatTasksMarkdown(parsed), "- [ ] Triage inbox p4 📅 2026-06-16");
});

test("formats manual low and lowest priorities", () => {
  const parsed = parseTaskInput("Review manuscript tomorrow", {
    referenceDate,
  });

  assert.equal(formatTasksMarkdown({ ...parsed, priority: priorityFromLevel("low") }), "- [ ] 🔽 Review manuscript 📅 2026-06-16");
  assert.equal(formatTasksMarkdown({ ...parsed, priority: priorityFromLevel("lowest") }), "- [ ] ⏬ Review manuscript 📅 2026-06-16");
});

test("formats multiple task dates", () => {
  const parsed = parseTaskInput("Review manuscript prio high", {
    referenceDate,
  });

  assert.equal(
    formatTasksMarkdown({
      ...parsed,
      dates: {
        due: "2026-06-20",
        scheduled: "2026-06-16",
        start: "2026-06-15",
      },
    }),
    "- [ ] ⏫ Review manuscript 📅 2026-06-20 ⏳ 2026-06-16 🛫 2026-06-15",
  );
});

test("supports short date aliases", () => {
  assert.equal(parseTaskInput("Do it tod", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it td", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it tmr", { referenceDate }).dates.due, "2026-06-16");
  assert.equal(parseTaskInput("Do it tom", { referenceDate }).dates.due, "2026-06-16");
  assert.equal(parseTaskInput("Do it tm", { referenceDate }).dates.due, "2026-06-16");
  assert.equal(parseTaskInput("Do it yd", { referenceDate }).dates.due, "2026-06-14");
  assert.equal(parseTaskInput("Do it nw", { referenceDate }).dates.due, "2026-06-22");
  assert.equal(parseTaskInput("Do it weekend", { referenceDate }).dates.due, "2026-06-20");
});

test("differentiates this weekday from next weekday", () => {
  assert.equal(parseTaskInput("Do it this Friday", { referenceDate }).dates.due, "2026-06-19");
  assert.equal(parseTaskInput("Do it next Friday", { referenceDate }).dates.due, "2026-06-26");
  assert.equal(parseTaskInput("Do it Monday", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it Mon", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it Tue", { referenceDate }).dates.due, "2026-06-16");
  assert.equal(parseTaskInput("Do it next Monday", { referenceDate }).dates.due, "2026-06-22");
});

test("supports relative day, week, month, and year dates", () => {
  assert.equal(parseTaskInput("Do it in 1 day", { referenceDate }).dates.due, "2026-06-16");
  assert.equal(parseTaskInput("Do it 2 weeks", { referenceDate }).dates.due, "2026-06-29");
  assert.equal(parseTaskInput("Do it 2 weeks from now", { referenceDate }).dates.due, "2026-06-29");
  assert.equal(parseTaskInput("Do it 2 weeks later", { referenceDate }).dates.due, "2026-06-29");
  assert.equal(parseTaskInput("Do it within 2 weeks", { referenceDate }).dates.due, "2026-06-29");
  assert.equal(parseTaskInput("Do it in a week", { referenceDate }).dates.due, "2026-06-22");
  assert.equal(parseTaskInput("Do it in a month", { referenceDate }).dates.due, "2026-07-15");
  assert.equal(parseTaskInput("Do it 2 days ago", { referenceDate }).dates.due, "2026-06-13");
  assert.equal(parseTaskInput("Do it a month ago", { referenceDate }).dates.due, "2026-05-15");
  assert.equal(parseTaskInput("Do it in three months", { referenceDate }).dates.due, "2026-09-15");
  assert.equal(parseTaskInput("Do it in one year", { referenceDate }).dates.due, "2027-06-15");
  assert.equal(parseTaskInput("Do it next month", { referenceDate }).dates.due, "2026-07-01");
  assert.equal(parseTaskInput("Do it next year", { referenceDate }).dates.due, "2027-01-01");
});

test("supports month-name dates", () => {
  assert.equal(parseTaskInput("Do it June 20", { referenceDate }).dates.due, "2026-06-20");
  assert.equal(parseTaskInput("Do it 20 June", { referenceDate }).dates.due, "2026-06-20");
  assert.equal(parseTaskInput("Do it Jun 20", { referenceDate }).dates.due, "2026-06-20");
  assert.equal(parseTaskInput("Do it September 3 2026", { referenceDate }).dates.due, "2026-09-03");
  assert.equal(parseTaskInput("Do it May 5", { referenceDate }).dates.due, "2027-05-05");
});

test("supports period boundary dates", () => {
  assert.equal(parseTaskInput("Do it end of week", { referenceDate }).dates.due, "2026-06-21");
  assert.equal(parseTaskInput("Do it end of month", { referenceDate }).dates.due, "2026-06-30");
  assert.equal(parseTaskInput("Do it start of next month", { referenceDate }).dates.due, "2026-07-01");
  assert.equal(parseTaskInput("Do it end of next month", { referenceDate }).dates.due, "2026-07-31");
  assert.equal(parseTaskInput("Do it last day of next month", { referenceDate }).dates.due, "2026-07-31");
  assert.equal(parseTaskInput("Do it last day of June", { referenceDate }).dates.due, "2026-06-30");
  assert.equal(parseTaskInput("Do it mid July", { referenceDate }).dates.due, "2026-07-15");
});

test("supports casual day and time-of-day words as date-only inputs", () => {
  assert.equal(parseTaskInput("Do it yesterday", { referenceDate }).dates.due, "2026-06-14");
  assert.equal(parseTaskInput("Do it tonight", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it at noon", { referenceDate }).dates.due, "2026-06-15");

  const tomorrowEvening = parseTaskInput("Do it tomorrow evening", { referenceDate });
  assert.equal(tomorrowEvening.dates.due, "2026-06-16");
  assert.equal(tomorrowEvening.title, "Do it");

  const noonTomorrow = parseTaskInput("Do it at noon tomorrow", { referenceDate });
  assert.equal(noonTomorrow.dates.due, "2026-06-16");
  assert.equal(noonTomorrow.title, "Do it");
});

test("supports ordinal dates", () => {
  assert.equal(parseTaskInput("Do it on the 15th", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it 15th", { referenceDate }).dates.due, "2026-06-15");
  assert.equal(parseTaskInput("Do it first of July", { referenceDate }).dates.due, "2026-07-01");
  assert.equal(parseTaskInput("Do it second of next month", { referenceDate }).dates.due, "2026-07-02");
});

test("supports tag and priority placement options", () => {
  const parsed = parseTaskInput("Review #PhD tomorrow prio high", {
    referenceDate,
  });

  assert.equal(
    formatTasksMarkdown(parsed, { tagPlacement: "where-entered", priorityPlacement: "last" }),
    "- [ ] Review #PhD ⏫ 📅 2026-06-16",
  );
  assert.equal(
    formatTasksMarkdown(parsed, { tagPlacement: "first", priorityPlacement: "last" }),
    "- [ ] #PhD Review ⏫ 📅 2026-06-16",
  );
});

test("supports explicit task token order", () => {
  const parsed = parseTaskInput("Read [[Paper Notes]] tomorrow #reading prio high", {
    referenceDate,
  });

  assert.equal(
    formatTasksMarkdown(parsed, {
      taskTokenOrder: ["tags", "dates", "text", "priority", "notes", "recurrence"],
    }),
    "- [ ] #reading 📅 2026-06-16 Read ⏫ [[Paper Notes]]",
  );
});

test("keeps detected date wording and file links for modal display", () => {
  const parsed = parseTaskInput("Read [[Paper Notes]] tom #reading", {
    referenceDate,
  });

  assert.equal(parsed.dateTexts.due, "tom");
  assert.deepEqual(parsed.links, ["Paper Notes"]);
});

test("warns when multiple dates are detected and uses the first", () => {
  const parsed = parseTaskInput("Review draft tom next week", {
    referenceDate,
  });

  assert.equal(parsed.title, "Review draft");
  assert.equal(parsed.dates.due, "2026-06-16");
  assert.deepEqual(parsed.conflicts, [
    {
      kind: "date",
      label: "Duplicated Date",
      used: "2026-06-16",
      ignored: ["2026-06-22"],
    },
  ]);
});

test("warns when multiple priorities are detected and uses the first", () => {
  const parsed = parseTaskInput("Review draft prio high prio low", {
    referenceDate,
  });

  assert.equal(parsed.title, "Review draft");
  assert.equal(parsed.priority?.level, "high");
  assert.deepEqual(parsed.conflicts, [
    {
      kind: "priority",
      label: "Duplicated Priority",
      used: "High ⏫",
      ignored: ["Low 🔽"],
    },
  ]);
});

test("warns when multiple recurrence rules are detected and uses the first", () => {
  const parsed = parseTaskInput("Review draft every monday every friday", {
    referenceDate,
  });

  assert.equal(parsed.title, "Review draft");
  assert.equal(parsed.recurrence?.rule, "every week on Monday");
  assert.equal(parsed.dates.due, "2026-06-15");
  assert.deepEqual(parsed.conflicts, [
    {
      kind: "recurrence",
      label: "Duplicated Recurrence",
      used: "every week on Monday",
      ignored: ["every week on Friday"],
    },
  ]);
});

test("warns when duplicate tags and file links are detected", () => {
  const parsed = parseTaskInput("Review [[Inbox]] [[Inbox|inbox note]] #work #phd #Work", {
    referenceDate,
  });

  assert.equal(parsed.title, "Review [[Inbox]] #work #phd");
  assert.deepEqual(parsed.links, ["Inbox"]);
  assert.deepEqual(parsed.tags, ["#work", "#phd"]);
  assert.deepEqual(parsed.conflicts, [
    {
      kind: "file",
      label: "Duplicated File",
      used: "Inbox",
      ignored: ["Inbox"],
    },
    {
      kind: "tag",
      label: "Duplicated Tag",
      used: "#work",
      ignored: ["#Work"],
    },
  ]);
});

test("parses simple weekday recurrence and infers a date", () => {
  const parsed = parseTaskInput("Water plants every monday #home", {
    referenceDate,
  });

  assert.equal(parsed.title, "Water plants #home");
  assert.equal(parsed.recurrence?.rule, "every week on Monday");
  assert.equal(parsed.dates.due, "2026-06-15");
  assert.equal(formatTasksMarkdown(parsed), "- [ ] Water plants #home 🔁 every week on Monday 📅 2026-06-15");
});

test("normalizes ordinal monthly weekday recurrence", () => {
  const parsed = parseTaskInput("Plan agenda every second monday of the month", {
    referenceDate,
  });

  assert.equal(parsed.title, "Plan agenda");
  assert.equal(parsed.recurrence?.rule, "every month on the 2nd Monday");
  assert.equal(parsed.dates.due, "2026-07-13");
  assert.equal(formatTasksMarkdown(parsed), "- [ ] Plan agenda 🔁 every month on the 2nd Monday 📅 2026-07-13");
});

test("normalizes last weekday monthly recurrence", () => {
  const parsed = parseTaskInput("Send report every last friday of the month", {
    referenceDate,
  });

  assert.equal(parsed.recurrence?.rule, "every month on the last Friday");
  assert.equal(parsed.dates.due, "2026-06-26");
});

test("keeps explicit dates over recurrence-inferred dates", () => {
  const parsed = parseTaskInput("Standup tomorrow every weekday", {
    referenceDate,
  });

  assert.equal(parsed.recurrence?.rule, "every weekday");
  assert.equal(parsed.dates.due, "2026-06-16");
  assert.equal(formatTasksMarkdown(parsed), "- [ ] Standup 🔁 every weekday 📅 2026-06-16");
});

test("normalizes every other weekday recurrence with when done", () => {
  const parsed = parseTaskInput("Run review every other friday when done", {
    referenceDate,
  });

  assert.equal(parsed.recurrence?.rule, "every 2 weeks on Friday when done");
  assert.equal(parsed.dates.due, "2026-06-19");
});

test("does not treat hashtag p1 as priority", () => {
  const parsed = parseTaskInput("Review #p1 tomorrow", {
    referenceDate,
  });

  assert.equal(formatTasksMarkdown(parsed), "- [ ] Review #p1 📅 2026-06-16");
});

test("appends default tags without duplicating existing tags", () => {
  const parsed = parseTaskInput("Review #PhD tomorrow", {
    referenceDate,
    defaultTags: "#PhD admin",
  });

  assert.equal(parsed.title, "Review #PhD #admin");
  assert.deepEqual(parsed.tags, ["#PhD", "#admin"]);
});

test("applies preset dates and allows typed dates to override them", () => {
  const parsed = parseTaskInput("Review manuscript", {
    referenceDate,
    defaultTags: "#task/shopping",
    presetDates: { due: "2026-06-15" },
    presetDateTexts: { due: "today" },
  });

  assert.equal(parsed.dates.due, "2026-06-15");
  assert.equal(parsed.dateTexts.due, "today");
  assert.equal(formatTasksMarkdown(parsed), "- [ ] Review manuscript #task/shopping 📅 2026-06-15");

  const overridden = parseTaskInput("Review manuscript tom", {
    referenceDate,
    presetDates: { due: "2026-06-15" },
    presetDateTexts: { due: "today" },
  });

  assert.equal(overridden.dates.due, "2026-06-16");
  assert.equal(overridden.dateTexts.due, "tom");
});

test("throws on empty input", () => {
  assert.throws(() => parseTaskInput("   "), /Enter a task before adding/);
});
