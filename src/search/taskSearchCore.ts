import type { PriorityLevel } from "../parser/priorityParser.ts";
import { fuzzyMatchScore } from "./fuzzySort.ts";

export interface TaskSearchResult {
  id: string;
  filePath: string;
  basename: string;
  line: number;
  taskText: string;
  status: string;
  completed: boolean;
  heading?: string;
  tags: string[];
  links: string[];
  dueDate: string | null;
  priority: PriorityLevel | null;
  fileModifiedTime: number;
  hasDueDate: boolean;
}

export interface TaskSearchListItem {
  line: number;
  status: string;
}

export interface TaskSearchHeading {
  line: number;
  heading: string;
}

export interface ExtractTaskSearchResultsOptions {
  filePath: string;
  content: string;
  fileModifiedTime?: number;
  listItems?: TaskSearchListItem[];
  headings?: TaskSearchHeading[];
}

export interface SearchTaskResultsOptions {
  maxResults?: number;
  filters?: TaskSearchFilters;
  sort?: TaskSearchSort;
}

export type TaskCompletionFilter = "open" | "completed" | "all";
export type TaskDueDateFilter = "any" | "with-due" | "without-due";
export type TaskPriorityFilter = "any" | "none" | PriorityLevel;
export type TaskSearchSort = "relevance" | "file" | "text" | "due" | "priority" | "tag";

export interface TaskSearchFilters {
  completion?: TaskCompletionFilter;
  dueDate?: TaskDueDateFilter;
  priority?: TaskPriorityFilter;
  tagQuery?: string;
  fileQuery?: string;
  fileModifiedBefore?: number;
  hasTag?: boolean;
  hasLink?: boolean;
  noDueDate?: boolean;
}

const TASK_LINE_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\r\n])\]\s*(.*)$/;
const TAG_PATTERN = /(^|\s)#[^ !@#$%^&*(),.?":{}|<>\[\]]+/g;
const WIKILINK_PATTERN = /\[\[([^\]\r\n]+)\]\]/g;
const DUE_DATE_PATTERN = /(?:📅|due(?: date)?[:：])\s*(\d{4}-\d{2}-\d{2})/i;
const PRIORITY_MARKER_PATTERN = /(^|\s)(🔺|⏫|🔼|🔽|⏬)(?=$|\s)/;
const PRIORITY_RANK: Record<PriorityLevel, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  normal: 3,
  low: 4,
  lowest: 5,
};
const PRIORITY_MARKERS: Record<string, PriorityLevel> = {
  "🔺": "highest",
  "⏫": "high",
  "🔼": "medium",
  "🔽": "low",
  "⏬": "lowest",
};

export function extractTaskSearchResults(options: ExtractTaskSearchResultsOptions): TaskSearchResult[] {
  const lines = splitLines(options.content);
  const listItems = options.listItems ?? extractTaskListItems(lines);
  const headings = (options.headings ?? extractHeadings(lines))
    .filter((heading) => heading.heading.trim().length > 0)
    .sort((a, b) => a.line - b.line);
  const basename = getBasename(options.filePath);

  return listItems
    .slice()
    .sort((a, b) => a.line - b.line)
    .flatMap((item) => {
      const lineText = lines[item.line] ?? "";
      const taskLine = parseMarkdownTaskLine(lineText, item.status);
      if (taskLine === null) {
        return [];
      }

      const taskText = taskLine.taskText.trim();
      const dueDate = extractDueDate(taskText);
      return [{
        id: `${options.filePath}:${item.line}`,
        filePath: options.filePath,
        basename,
        line: item.line,
        taskText,
        status: taskLine.status,
        completed: taskLine.status !== " ",
        heading: findNearestHeading(headings, item.line),
        tags: extractTags(taskText),
        links: extractLinks(taskText),
        dueDate,
        priority: extractPriority(taskText),
        fileModifiedTime: options.fileModifiedTime ?? 0,
        hasDueDate: dueDate !== null,
      }];
    });
}

export function searchTaskResults(
  tasks: TaskSearchResult[],
  query: string,
  options: SearchTaskResultsOptions = {},
): TaskSearchResult[] {
  const maxResults = options.maxResults ?? 50;
  const normalizedQuery = query.trim();
  const filteredTasks = filterTaskResults(tasks, options.filters);
  const sort = options.sort ?? "relevance";

  if (normalizedQuery.length === 0) {
    return sortTaskResults(filteredTasks, sort).slice(0, maxResults);
  }

  return filteredTasks
    .map((task) => ({ task, score: scoreTaskResult(task, normalizedQuery) }))
    .filter((entry): entry is { task: TaskSearchResult; score: number } => entry.score !== null)
    .sort((a, b) => {
      if (sort !== "relevance") {
        return compareTaskResults(a.task, b.task, sort)
          || b.score - a.score
          || compareTaskResults(a.task, b.task, "file");
      }

      return b.score - a.score
        || Number(a.task.completed) - Number(b.task.completed)
        || a.task.filePath.localeCompare(b.task.filePath)
        || a.task.line - b.task.line;
    })
    .map((entry) => entry.task)
    .slice(0, maxResults);
}

export function filterTaskResults(tasks: TaskSearchResult[], filters: TaskSearchFilters = {}): TaskSearchResult[] {
  const completion = filters.completion ?? "all";
  const dueDate = filters.dueDate ?? (filters.noDueDate ? "without-due" : "any");
  const priority = filters.priority ?? "any";
  const tagQuery = normalizeFilterQuery(filters.tagQuery);
  const fileQuery = normalizeFilterQuery(filters.fileQuery);

  return tasks.filter((task) => {
    if (completion === "open" && task.completed) {
      return false;
    }
    if (completion === "completed" && !task.completed) {
      return false;
    }
    if (filters.hasTag && task.tags.length === 0) {
      return false;
    }
    if (filters.hasLink && task.links.length === 0) {
      return false;
    }
    if (dueDate === "with-due" && !task.hasDueDate) {
      return false;
    }
    if (dueDate === "without-due" && task.hasDueDate) {
      return false;
    }
    if (priority === "none" && task.priority !== null) {
      return false;
    }
    if (priority !== "any" && priority !== "none" && task.priority !== priority) {
      return false;
    }
    if (tagQuery.length > 0 && !task.tags.some((tag) => tag.toLowerCase().includes(tagQuery))) {
      return false;
    }
    if (
      fileQuery.length > 0
      && !task.filePath.toLowerCase().includes(fileQuery)
      && !task.basename.toLowerCase().includes(fileQuery)
      && !(task.heading ?? "").toLowerCase().includes(fileQuery)
    ) {
      return false;
    }
    if (
      filters.fileModifiedBefore !== undefined
      && (task.fileModifiedTime <= 0 || task.fileModifiedTime > filters.fileModifiedBefore)
    ) {
      return false;
    }

    return true;
  });
}

export function parseMarkdownTaskLine(lineText: string, statusOverride?: string): { status: string; taskText: string } | null {
  const match = TASK_LINE_PATTERN.exec(lineText);
  if (match === null) {
    return null;
  }

  return {
    status: statusOverride ?? match[1],
    taskText: match[2].trim(),
  };
}

function scoreTaskResult(task: TaskSearchResult, query: string): number | null {
  const scores = [
    weightedScore(task.taskText, query, 4),
    weightedScore(task.tags.join(" "), query, 2.5),
    weightedScore(task.links.join(" "), query, 2.25),
    weightedScore(task.heading ?? "", query, 2),
    weightedScore(task.filePath, query, 1),
    weightedScore(`${task.taskText} ${task.tags.join(" ")} ${task.heading ?? ""} ${task.filePath}`, query, 0.75),
  ].filter((score): score is number => score !== null);

  return scores.length === 0 ? null : Math.max(...scores);
}

function weightedScore(text: string, query: string, weight: number): number | null {
  const score = fuzzyMatchScore(text, query);
  return score === null ? null : score * weight;
}

function sortTaskResults(tasks: TaskSearchResult[], sort: TaskSearchSort): TaskSearchResult[] {
  return tasks
    .slice()
    .sort((a, b) => compareTaskResults(a, b, sort));
}

function compareTaskResults(a: TaskSearchResult, b: TaskSearchResult, sort: TaskSearchSort): number {
  switch (sort) {
    case "text":
      return a.taskText.localeCompare(b.taskText)
        || compareTaskResults(a, b, "file");
    case "due":
      return compareNullableText(a.dueDate, b.dueDate)
        || compareTaskResults(a, b, "priority")
        || compareTaskResults(a, b, "file");
    case "priority":
      return getPriorityRank(a.priority) - getPriorityRank(b.priority)
        || compareNullableText(a.dueDate, b.dueDate)
        || compareTaskResults(a, b, "file");
    case "tag":
      return compareNullableText(a.tags[0] ?? null, b.tags[0] ?? null)
        || compareTaskResults(a, b, "file");
    case "file":
    case "relevance":
      return Number(a.completed) - Number(b.completed)
        || a.filePath.localeCompare(b.filePath)
        || a.line - b.line;
  }
}

function compareNullableText(a: string | null, b: string | null): number {
  if (a === null && b === null) {
    return 0;
  }
  if (a === null) {
    return 1;
  }
  if (b === null) {
    return -1;
  }

  return a.localeCompare(b);
}

function getPriorityRank(priority: PriorityLevel | null): number {
  return priority === null ? 99 : PRIORITY_RANK[priority];
}

function extractTaskListItems(lines: string[]): TaskSearchListItem[] {
  return lines.flatMap((lineText, line) => {
    const taskLine = parseMarkdownTaskLine(lineText);
    return taskLine === null ? [] : [{ line, status: taskLine.status }];
  });
}

function extractHeadings(lines: string[]): TaskSearchHeading[] {
  return lines.flatMap((lineText, line) => {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(lineText);
    return match === null ? [] : [{ line, heading: match[2].trim() }];
  });
}

function findNearestHeading(headings: TaskSearchHeading[], line: number): string | undefined {
  let nearest: string | undefined;

  for (const heading of headings) {
    if (heading.line >= line) {
      break;
    }
    nearest = heading.heading;
  }

  return nearest;
}

function extractTags(input: string): string[] {
  return input.match(TAG_PATTERN)?.map((tag) => tag.trim()) ?? [];
}

function extractLinks(input: string): string[] {
  return Array.from(input.matchAll(WIKILINK_PATTERN), (match) => match[1].trim())
    .filter((link) => link.length > 0);
}

function extractDueDate(input: string): string | null {
  return DUE_DATE_PATTERN.exec(input)?.[1] ?? null;
}

function extractPriority(input: string): PriorityLevel | null {
  const marker = PRIORITY_MARKER_PATTERN.exec(input)?.[2];
  return marker === undefined ? null : PRIORITY_MARKERS[marker] ?? null;
}

function normalizeFilterQuery(query: string | undefined): string {
  return (query ?? "").trim().toLowerCase();
}

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

function getBasename(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath;
  return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}
