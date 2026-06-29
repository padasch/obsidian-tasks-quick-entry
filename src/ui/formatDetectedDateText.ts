const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDetectedDateText(dateText: string | undefined, date: string): string {
  const displayDate = formatDateWithWeekday(date);
  if (!dateText) {
    return displayDate;
  }

  return `${humanizeDateText(dateText)} (${displayDate})`;
}

function formatDateWithWeekday(dateValue: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue);
  if (match === null) {
    return dateValue;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return dateValue;
  }

  return `${WEEKDAYS[date.getDay()]} ${dateValue}`;
}

function humanizeDateText(dateText: string): string {
  const normalized = dateText.trim().toLowerCase();
  const aliases: Record<string, string> = {
    tod: "Today",
    td: "Today",
    today: "Today",
    tmr: "Tomorrow",
    tom: "Tomorrow",
    tm: "Tomorrow",
    tomorrow: "Tomorrow",
    yd: "Yesterday",
    yesterday: "Yesterday",
    nw: "Next Week",
    "next week": "Next Week",
    weekend: "Weekend",
    manual: "Manual",
    "inferred from recurrence": "Inferred from recurrence",
    sun: "Sunday",
    sunday: "Sunday",
    mon: "Monday",
    monday: "Monday",
    tue: "Tuesday",
    tues: "Tuesday",
    tuesday: "Tuesday",
    wed: "Wednesday",
    wednesday: "Wednesday",
    thu: "Thursday",
    thur: "Thursday",
    thurs: "Thursday",
    thursday: "Thursday",
    fri: "Friday",
    friday: "Friday",
    sat: "Saturday",
    saturday: "Saturday",
  };

  return aliases[normalized] ?? dateText.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
