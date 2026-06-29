import type { App, CachedMetadata, ListItemCache, TFile } from "obsidian";
import {
  extractTaskSearchResults,
  filterTaskResults,
  searchTaskResults,
  type SearchTaskResultsOptions,
  type TaskSearchHeading,
  type TaskSearchFilters,
  type TaskSearchListItem,
  type TaskSearchResult,
} from "./taskSearchCore.ts";

export interface TaskSearchIndexOptions {
  onTaskEdited?: (task: TaskSearchResult) => void;
  refreshDebounceMs?: number;
}

const DEFAULT_REFRESH_DEBOUNCE_MS = 150;

export class TaskSearchIndex {
  private readonly app: App;
  private readonly options: TaskSearchIndexOptions;
  private readonly resultsByPath = new Map<string, TaskSearchResult[]>();
  private readonly pendingRefreshes = new Map<string, TFile>();
  private buildPromise: Promise<void> | null = null;
  private refreshTimer: number | null = null;
  private built = false;

  constructor(app: App, options: TaskSearchIndexOptions = {}) {
    this.app = app;
    this.options = options;
  }

  get count(): number {
    return this.getAllResults().length;
  }

  build(): Promise<void> {
    if (this.built) {
      return Promise.resolve();
    }

    if (this.buildPromise !== null) {
      return this.buildPromise;
    }

    this.buildPromise = this.buildFreshIndex()
      .finally(() => {
        this.buildPromise = null;
      });

    return this.buildPromise;
  }

  getCount(filters?: TaskSearchFilters): number {
    return filterTaskResults(this.getAllResults(), filters).length;
  }

  search(
    query: string,
    filters?: TaskSearchFilters,
    options: Omit<SearchTaskResultsOptions, "filters"> = {},
  ): TaskSearchResult[] {
    return searchTaskResults(this.getAllResults(), query, { ...options, filters });
  }

  async refreshFile(file: TFile): Promise<void> {
    if (file.extension !== "md") {
      this.removeFile(file.path);
      return;
    }

    const previousResults = this.resultsByPath.get(file.path) ?? [];
    const results = await this.readFileTasks(file);
    this.resultsByPath.set(file.path, results);
    this.reportEditedTasks(previousResults, results);
  }

  queueRefresh(file: TFile): void {
    if (file.extension !== "md") {
      this.removeFile(file.path);
      return;
    }

    this.pendingRefreshes.set(file.path, file);
    if (this.refreshTimer !== null) {
      window.clearTimeout(this.refreshTimer);
    }

    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      void this.flushRefreshes();
    }, this.options.refreshDebounceMs ?? DEFAULT_REFRESH_DEBOUNCE_MS);
  }

  removeFile(path: string): void {
    this.resultsByPath.delete(path);
    this.pendingRefreshes.delete(path);
  }

  private async buildFreshIndex(): Promise<void> {
    const nextResults = new Map<string, TaskSearchResult[]>();

    await Promise.all(this.app.vault.getMarkdownFiles().map(async (file) => {
      nextResults.set(file.path, await this.readFileTasks(file));
    }));

    this.resultsByPath.clear();
    for (const [path, results] of nextResults) {
      this.resultsByPath.set(path, results);
    }
    this.built = true;
  }

  private async flushRefreshes(): Promise<void> {
    const files = Array.from(this.pendingRefreshes.values());
    this.pendingRefreshes.clear();
    await Promise.all(files.map((file) => this.refreshFile(file)));
  }

  private async readFileTasks(file: TFile): Promise<TaskSearchResult[]> {
    try {
      const content = await this.app.vault.cachedRead(file);
      const cache = this.app.metadataCache.getFileCache(file);
      return extractTaskSearchResults({
        filePath: file.path,
        content,
        listItems: getTaskListItems(cache),
        headings: getHeadings(cache),
      });
    } catch (error) {
      console.warn(`Tasks Quick Entry: could not index ${file.path}`, error);
      return [];
    }
  }

  private getAllResults(): TaskSearchResult[] {
    return Array.from(this.resultsByPath.values()).flat();
  }

  private reportEditedTasks(previousResults: TaskSearchResult[], nextResults: TaskSearchResult[]): void {
    if (previousResults.length === 0 || this.options.onTaskEdited === undefined) {
      return;
    }

    const previousById = new Map(previousResults.map((task) => [task.id, task]));
    const previousFingerprints = new Set(previousResults.map(taskEditFingerprint));
    const nextFingerprints = new Set(nextResults.map(taskEditFingerprint));

    for (const nextTask of nextResults) {
      const previousTask = previousById.get(nextTask.id);
      if (previousTask === undefined) {
        continue;
      }

      const previousFingerprint = taskEditFingerprint(previousTask);
      const nextFingerprint = taskEditFingerprint(nextTask);
      if (
        previousFingerprint === nextFingerprint
        || previousFingerprints.has(nextFingerprint)
        || nextFingerprints.has(previousFingerprint)
      ) {
        continue;
      }

      this.options.onTaskEdited(nextTask);
    }
  }
}

function taskEditFingerprint(task: TaskSearchResult): string {
  return `${task.status}\u0000${task.taskText}`;
}

function getTaskListItems(cache: CachedMetadata | null): TaskSearchListItem[] | undefined {
  if (cache?.listItems === undefined) {
    return undefined;
  }

  return cache.listItems
    .filter((item): item is ListItemCache & { task: string } => item.task !== undefined)
    .map((item) => ({
      line: item.position.start.line,
      status: item.task,
    }));
}

function getHeadings(cache: CachedMetadata | null): TaskSearchHeading[] | undefined {
  return cache?.headings?.map((heading) => ({
    line: heading.position.start.line,
    heading: heading.heading,
  }));
}
