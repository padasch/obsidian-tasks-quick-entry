import { TFile, type App, type CachedMetadata, type ListItemCache } from "obsidian";
import {
  extractTaskSearchResults,
  searchTaskResults,
  type TaskSearchHeading,
  type TaskSearchListItem,
  type TaskSearchResult,
} from "./taskSearchCore.ts";

export class TaskSearchIndex {
  private readonly resultsByPath = new Map<string, TaskSearchResult[]>();
  private readonly pendingRefreshes = new Map<string, TFile>();
  private buildPromise: Promise<void> | null = null;
  private refreshTimer: number | null = null;
  private built = false;

  constructor(
    private readonly app: App,
    private readonly refreshDebounceMs = 150,
  ) {}

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

  search(query: string): TaskSearchResult[] {
    return searchTaskResults(this.getAllResults(), query);
  }

  async refreshFile(file: TFile): Promise<void> {
    if (file.extension !== "md") {
      this.removeFile(file.path);
      return;
    }

    const results = await this.readFileTasks(file);
    this.resultsByPath.set(file.path, results);
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
    }, this.refreshDebounceMs);
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
