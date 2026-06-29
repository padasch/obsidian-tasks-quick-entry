import {
  priorityFromLevel,
  type PriorityLevel,
} from "../parser/priorityParser.ts";

export type BatchTaskStatusChange = "open" | "done";
export type BatchPriorityChange = PriorityLevel | "none";

export interface BatchTaskChanges {
  status?: BatchTaskStatusChange;
  priority?: BatchPriorityChange;
  dueDate?: string | null;
  addTags?: string[];
  removeTags?: string[];
}

export interface BatchTaskLineTarget {
  line: number;
}

export interface BatchTaskEditResult {
  content: string;
  changed: number;
  skipped: number;
}

const TASK_LINE_CAPTURE = /^(\s*(?:[-*+]|\d+[.)])\s+\[)([^\]\r\n])(\]\s*)(.*)$/;
const PRIORITY_MARKER_PATTERN = /(^|\s)(?:🔺|⏫|🔼|🔽|⏬)(?=$|\s)/g;
const DUE_DATE_PATTERN = /\s*(?:📅|due(?: date)?[:：])\s*\d{4}-\d{2}-\d{2}/i;
const TRAILING_METADATA_PATTERN = /(?:^|\s)(🔁|⏳|🛫|📅|due(?: date)?[:：])(?=$|\s)/i;

export function applyBatchTaskLineEdits(
  content: string,
  targets: BatchTaskLineTarget[],
  changes: BatchTaskChanges,
): BatchTaskEditResult {
  const lineBreak = content.includes("\r\n") ? "\r\n" : "\n";
  const lines = content.split(/\r?\n/);
  const targetLines = new Set(targets.map((target) => target.line));
  let changed = 0;
  let skipped = 0;

  for (const line of targetLines) {
    if (line < 0 || line >= lines.length) {
      skipped += 1;
      continue;
    }

    const nextLine = applyTaskLineChanges(lines[line] ?? "", changes);
    if (nextLine === null) {
      skipped += 1;
      continue;
    }
    if (nextLine !== lines[line]) {
      lines[line] = nextLine;
      changed += 1;
    }
  }

  return {
    content: lines.join(lineBreak),
    changed,
    skipped,
  };
}

export function applyTaskLineChanges(lineText: string, changes: BatchTaskChanges): string | null {
  const match = TASK_LINE_CAPTURE.exec(lineText);
  if (match === null) {
    return null;
  }

  const [, prefix, currentStatus, suffix, originalBody] = match;
  const nextStatus = changes.status === "open"
    ? " "
    : changes.status === "done"
      ? "x"
      : currentStatus;
  let body = normalizeBody(originalBody);

  if (changes.priority !== undefined) {
    body = stripPriorityMarkers(body);
    if (changes.priority !== "none") {
      const priority = priorityFromLevel(changes.priority);
      if (priority.marker.length > 0) {
        body = appendBodyToken(body, priority.marker, "metadata-start");
      }
    }
  }

  if (changes.dueDate !== undefined) {
    body = stripDueDate(body);
    if (changes.dueDate !== null) {
      body = appendBodyToken(body, `📅 ${changes.dueDate}`, "end");
    }
  }

  for (const tag of normalizeTags(changes.removeTags)) {
    body = stripTag(body, tag);
  }

  for (const tag of normalizeTags(changes.addTags)) {
    if (!hasTag(body, tag)) {
      body = appendBodyToken(body, tag, "metadata-start");
    }
  }

  return `${prefix}${nextStatus}${suffix}${body}`;
}

function stripPriorityMarkers(input: string): string {
  return normalizeBody(input.replace(PRIORITY_MARKER_PATTERN, " "));
}

function stripDueDate(input: string): string {
  return normalizeBody(input.replace(DUE_DATE_PATTERN, " "));
}

function stripTag(input: string, tag: string): string {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=$|\\s)`, "gi");
  return normalizeBody(input.replace(pattern, " "));
}

function hasTag(input: string, tag: string): boolean {
  const pattern = new RegExp(`(^|\\s)${escapeRegExp(tag)}(?=$|\\s)`, "i");
  return pattern.test(input);
}

function appendBodyToken(input: string, token: string, position: "metadata-start" | "end"): string {
  const body = normalizeBody(input);
  if (body.length === 0) {
    return token;
  }

  if (position === "end") {
    return `${body} ${token}`;
  }

  const splitIndex = findTrailingMetadataStart(body);
  if (splitIndex === null) {
    return `${body} ${token}`;
  }

  const before = body.slice(0, splitIndex).trimEnd();
  const after = body.slice(splitIndex).trimStart();
  return normalizeBody(`${before} ${token} ${after}`);
}

function findTrailingMetadataStart(input: string): number | null {
  const match = TRAILING_METADATA_PATTERN.exec(input);
  if (match === null) {
    return null;
  }

  return match.index + (match[0].startsWith(" ") ? 1 : 0);
}

function normalizeTags(tags: string[] | undefined): string[] {
  if (tags === undefined) {
    return [];
  }

  return Array.from(new Set(
    tags
      .flatMap((tag) => tag.split(/[\s,]+/))
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => tag.startsWith("#") ? tag : `#${tag}`),
  ));
}

function normalizeBody(input: string): string {
  return input.replace(/\s+/g, " ").trim();
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
