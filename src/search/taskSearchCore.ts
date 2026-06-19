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
  listItems?: TaskSearchListItem[];
  headings?: TaskSearchHeading[];
}

export interface SearchTaskResultsOptions {
  maxResults?: number;
}

const TASK_LINE_PATTERN = /^\s*(?:[-*+]|\d+[.)])\s+\[([^\]\r\n])\]\s*(.*)$/;
const TAG_PATTERN = /(^|\s)#[^ !@#$%^&*(),.?":{}|<>\[\]]+/g;

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

  if (normalizedQuery.length === 0) {
    return sortDefaultResults(tasks).slice(0, maxResults);
  }

  return tasks
    .map((task) => ({ task, score: scoreTaskResult(task, normalizedQuery) }))
    .filter((entry): entry is { task: TaskSearchResult; score: number } => entry.score !== null)
    .sort((a, b) => {
      return b.score - a.score
        || Number(a.task.completed) - Number(b.task.completed)
        || a.task.filePath.localeCompare(b.task.filePath)
        || a.task.line - b.task.line;
    })
    .map((entry) => entry.task)
    .slice(0, maxResults);
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

function sortDefaultResults(tasks: TaskSearchResult[]): TaskSearchResult[] {
  return tasks
    .slice()
    .sort((a, b) => {
      return Number(a.completed) - Number(b.completed)
        || a.filePath.localeCompare(b.filePath)
        || a.line - b.line;
    });
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

function splitLines(content: string): string[] {
  return content.split(/\r?\n/);
}

function getBasename(filePath: string): string {
  const fileName = filePath.split("/").pop() ?? filePath;
  return fileName.endsWith(".md") ? fileName.slice(0, -3) : fileName;
}
