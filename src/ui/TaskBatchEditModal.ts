import { Modal, Notice, TFile, type App } from "obsidian";
import {
  PRIORITY_LEVELS,
  priorityFromLevel,
  type PriorityLevel,
} from "../parser/priorityParser.ts";
import { TaskSearchIndex } from "../search/TaskSearchIndex.ts";
import type {
  TaskCompletionFilter,
  TaskDueDateFilter,
  TaskPriorityFilter,
  TaskSearchFilters,
  TaskSearchResult,
  TaskSearchSort,
} from "../search/taskSearchCore.ts";
import {
  applyBatchTaskLineEdits,
  type BatchPriorityChange,
  type BatchTaskChanges,
  type BatchTaskStatusChange,
} from "../writer/batchEditTaskLines.ts";

type StatusAction = "leave" | BatchTaskStatusChange;
type PriorityAction = "leave" | BatchPriorityChange;
type DueDateAction = "leave" | "set" | "clear";

const BATCH_RESULT_LIMIT = 500;
const SETTABLE_PRIORITY_LEVELS = PRIORITY_LEVELS.filter((level) => level !== "normal");

export class TaskBatchEditModal extends Modal {
  private queryInputEl!: HTMLInputElement;
  private tagInputEl!: HTMLInputElement;
  private fileInputEl!: HTMLInputElement;
  private statusEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private selectionControlsEl!: HTMLElement;
  private statusActionEl!: HTMLSelectElement;
  private priorityActionEl!: HTMLSelectElement;
  private dueDateActionEl!: HTMLSelectElement;
  private dueDateInputEl!: HTMLInputElement;
  private addTagsInputEl!: HTMLInputElement;
  private removeTagsInputEl!: HTMLInputElement;
  private applyButtonEl!: HTMLButtonElement;
  private completionFilter: TaskCompletionFilter = "open";
  private dueDateFilter: TaskDueDateFilter = "any";
  private priorityFilter: TaskPriorityFilter = "any";
  private sort: TaskSearchSort = "file";
  private results: TaskSearchResult[] = [];
  private readonly selectedTasks = new Map<string, TaskSearchResult>();
  private ready = false;

  constructor(
    app: App,
    private readonly index: TaskSearchIndex,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("tasks-batch-edit-shell");
    this.modalEl.setAttr("aria-label", "Batch edit tasks");
    contentEl.addClass("tasks-batch-edit-modal");

    contentEl.createEl("h2", {
      cls: "tasks-batch-edit-title",
      text: "Batch edit tasks",
    });

    this.queryInputEl = contentEl.createEl("input", {
      cls: "tasks-batch-edit-input",
      attr: {
        "aria-label": "Search tasks",
        "autocomplete": "off",
        "spellcheck": "true",
        placeholder: "Search tasks by text, tag, heading, or file...",
      },
    });
    this.queryInputEl.type = "text";
    this.queryInputEl.addEventListener("input", () => this.updateResults());

    this.renderFilters(contentEl);

    const statusRowEl = contentEl.createDiv({ cls: "tasks-batch-edit-status-row" });
    this.statusEl = statusRowEl.createDiv({ cls: "tasks-batch-edit-status" });
    this.selectionControlsEl = statusRowEl.createDiv({ cls: "tasks-batch-edit-selection-actions" });
    this.renderSelectionControls();

    this.resultsEl = contentEl.createDiv({ cls: "tasks-batch-edit-results" });
    this.renderActions(contentEl);

    this.renderLoading();
    void this.loadIndex();
    window.requestAnimationFrame(() => this.queryInputEl.focus());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async loadIndex(): Promise<void> {
    try {
      await this.index.build();
      this.ready = true;
      this.updateResults();
    } catch (error) {
      this.statusEl.setText(error instanceof Error ? error.message : "Could not index tasks.");
      new Notice("Could not index tasks.");
    }
  }

  private renderFilters(containerEl: HTMLElement): void {
    const filtersEl = containerEl.createDiv({ cls: "tasks-batch-edit-filters" });

    const completionSelectEl = this.createFilterSelect(
      filtersEl,
      "Status",
      [
        ["open", "Open"],
        ["completed", "Done"],
        ["all", "All"],
      ],
      this.completionFilter,
    );
    completionSelectEl.addEventListener("change", () => {
      this.completionFilter = completionSelectEl.value as TaskCompletionFilter;
      this.updateResults();
    });

    const dueDateSelectEl = this.createFilterSelect(
      filtersEl,
      "Due",
      [
        ["any", "Any due"],
        ["with-due", "With due"],
        ["without-due", "Without due"],
      ],
      this.dueDateFilter,
    );
    dueDateSelectEl.addEventListener("change", () => {
      this.dueDateFilter = dueDateSelectEl.value as TaskDueDateFilter;
      this.updateResults();
    });

    const prioritySelectEl = this.createFilterSelect(
      filtersEl,
      "Priority",
      [
        ["any", "Any priority"],
        ["none", "No priority"],
        ...SETTABLE_PRIORITY_LEVELS.map((level): [PriorityLevel, string] => [level, priorityFromLevel(level).label]),
      ],
      this.priorityFilter,
    );
    prioritySelectEl.addEventListener("change", () => {
      this.priorityFilter = prioritySelectEl.value as TaskPriorityFilter;
      this.updateResults();
    });

    this.tagInputEl = this.createFilterInput(filtersEl, "Tag", "Tag contains...");
    this.tagInputEl.addEventListener("input", () => this.updateResults());

    this.fileInputEl = this.createFilterInput(filtersEl, "File", "File or heading...");
    this.fileInputEl.addEventListener("input", () => this.updateResults());

    const sortSelectEl = this.createFilterSelect(
      filtersEl,
      "Sort",
      [
        ["file", "File"],
        ["due", "Due"],
        ["priority", "Priority"],
        ["tag", "Tag"],
        ["text", "Text"],
        ["relevance", "Relevance"],
      ],
      this.sort,
    );
    sortSelectEl.addEventListener("change", () => {
      this.sort = sortSelectEl.value as TaskSearchSort;
      this.updateResults();
    });
  }

  private renderSelectionControls(): void {
    this.selectionControlsEl.empty();

    const selectVisibleButton = this.selectionControlsEl.createEl("button", {
      cls: "tasks-batch-edit-mini-button",
      text: "Select visible",
    });
    selectVisibleButton.type = "button";
    selectVisibleButton.addEventListener("click", () => {
      for (const result of this.results) {
        this.selectedTasks.set(result.id, result);
      }
      this.renderResults();
    });

    const clearButton = this.selectionControlsEl.createEl("button", {
      cls: "tasks-batch-edit-mini-button",
      text: "Clear",
    });
    clearButton.type = "button";
    clearButton.addEventListener("click", () => {
      this.selectedTasks.clear();
      this.renderResults();
    });
  }

  private renderActions(containerEl: HTMLElement): void {
    const actionsEl = containerEl.createDiv({ cls: "tasks-batch-edit-actions" });
    const gridEl = actionsEl.createDiv({ cls: "tasks-batch-edit-action-grid" });

    this.statusActionEl = this.createActionSelect(
      gridEl,
      "Status",
      [
        ["leave", "Leave"],
        ["open", "Set open"],
        ["done", "Set done"],
      ],
      "leave",
    );

    this.priorityActionEl = this.createActionSelect(
      gridEl,
      "Priority",
      [
        ["leave", "Leave"],
        ["none", "Clear"],
        ...SETTABLE_PRIORITY_LEVELS.map((level): [PriorityLevel, string] => [level, priorityFromLevel(level).label]),
      ],
      "leave",
    );

    const dueDateActionLabel = gridEl.createEl("label", { cls: "tasks-batch-edit-action-control" });
    dueDateActionLabel.createEl("span", { text: "Due date" });
    const dueDateControlEl = dueDateActionLabel.createDiv({ cls: "tasks-batch-edit-date-action" });
    this.dueDateActionEl = dueDateControlEl.createEl("select", {
      attr: { "aria-label": "Due date batch action" },
    });
    addSelectOptions(this.dueDateActionEl, [
      ["leave", "Leave"],
      ["set", "Set"],
      ["clear", "Clear"],
    ]);
    this.dueDateActionEl.value = "leave";
    this.dueDateInputEl = dueDateControlEl.createEl("input", {
      attr: { "aria-label": "Batch due date" },
    });
    this.dueDateInputEl.type = "date";
    this.dueDateInputEl.disabled = true;
    this.dueDateActionEl.addEventListener("change", () => {
      this.dueDateInputEl.disabled = this.dueDateActionEl.value !== "set";
    });

    this.addTagsInputEl = this.createActionInput(gridEl, "Add tags", "#work #next");
    this.removeTagsInputEl = this.createActionInput(gridEl, "Remove tags", "#old");

    const footerEl = actionsEl.createDiv({ cls: "tasks-batch-edit-footer" });
    this.applyButtonEl = footerEl.createEl("button", {
      cls: "mod-cta tasks-batch-edit-apply",
      text: "Apply",
    });
    this.applyButtonEl.type = "button";
    this.applyButtonEl.addEventListener("click", () => {
      void this.applyBatchEdit();
    });
  }

  private updateResults(): void {
    if (!this.ready) {
      return;
    }

    const filters = this.getFilters();
    this.results = this.index.search(this.queryInputEl.value, filters, {
      maxResults: BATCH_RESULT_LIMIT,
      sort: this.sort,
    });
    this.renderResults();
  }

  private renderLoading(): void {
    this.statusEl.setText("Indexing tasks...");
    this.resultsEl.empty();
  }

  private renderResults(): void {
    this.resultsEl.empty();
    const filters = this.getFilters();
    const filteredCount = this.index.getCount(filters);
    const visibleSelectedCount = this.results.filter((result) => this.selectedTasks.has(result.id)).length;

    this.statusEl.setText(this.getStatusText(filteredCount, visibleSelectedCount));
    this.applyButtonEl.disabled = this.selectedTasks.size === 0;

    if (this.index.count === 0) {
      this.resultsEl.createDiv({
        cls: "tasks-batch-edit-empty",
        text: "No tasks found in Markdown files.",
      });
      return;
    }

    if (filteredCount === 0) {
      this.resultsEl.createDiv({
        cls: "tasks-batch-edit-empty",
        text: "No tasks match the active filters.",
      });
      return;
    }

    if (this.results.length === 0) {
      this.resultsEl.createDiv({
        cls: "tasks-batch-edit-empty",
        text: this.queryInputEl.value.trim().length === 0 ? "No tasks to show." : "No matching tasks.",
      });
      return;
    }

    for (const result of this.results) {
      const row = this.resultsEl.createEl("label", {
        cls: `tasks-batch-edit-result${this.selectedTasks.has(result.id) ? " is-selected" : ""}`,
      });

      const checkboxEl = row.createEl("input", {
        attr: { "aria-label": `Select task on line ${result.line + 1}` },
      });
      checkboxEl.type = "checkbox";
      checkboxEl.checked = this.selectedTasks.has(result.id);
      checkboxEl.addEventListener("change", () => {
        if (checkboxEl.checked) {
          this.selectedTasks.set(result.id, result);
        } else {
          this.selectedTasks.delete(result.id);
        }
        row.toggleClass("is-selected", checkboxEl.checked);
        this.updateSelectionState();
      });

      const bodyEl = row.createDiv({ cls: "tasks-batch-edit-result-body" });
      const lineEl = bodyEl.createDiv({ cls: "tasks-batch-edit-result-line" });
      lineEl.createEl("span", {
        cls: `tasks-batch-edit-result-status${result.completed ? " is-completed" : ""}`,
        text: formatStatus(result.status),
      });
      lineEl.createEl("span", {
        cls: "tasks-batch-edit-result-text",
        text: formatTaskText(result.taskText),
      });
      bodyEl.createDiv({
        cls: "tasks-batch-edit-result-meta",
        text: formatMetadata(result),
      });
    }
  }

  private updateSelectionState(): void {
    const filters = this.getFilters();
    const visibleSelectedCount = this.results.filter((result) => this.selectedTasks.has(result.id)).length;
    this.statusEl.setText(this.getStatusText(this.index.getCount(filters), visibleSelectedCount));
    this.applyButtonEl.disabled = this.selectedTasks.size === 0;
  }

  private async applyBatchEdit(): Promise<void> {
    if (this.selectedTasks.size === 0) {
      new Notice("No tasks selected.");
      return;
    }

    const changes = this.getBatchChanges();
    if (changes === null) {
      return;
    }

    this.applyButtonEl.disabled = true;
    let changed = 0;
    let skipped = 0;
    const refreshedFiles: TFile[] = [];

    try {
      for (const [filePath, tasks] of groupTasksByFile(Array.from(this.selectedTasks.values()))) {
        const file = this.app.vault.getAbstractFileByPath(filePath);
        if (!(file instanceof TFile)) {
          skipped += tasks.length;
          continue;
        }

        await this.app.vault.process(file, (content) => {
          const result = applyBatchTaskLineEdits(
            content,
            tasks.map((task) => ({ line: task.line })),
            changes,
          );
          changed += result.changed;
          skipped += result.skipped;
          return result.content;
        });
        refreshedFiles.push(file);
      }

      await Promise.all(refreshedFiles.map((file) => this.index.refreshFile(file)));
      this.selectedTasks.clear();
      this.updateResults();
      new Notice(formatBatchNotice(changed, skipped));
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not batch edit tasks.");
      this.updateSelectionState();
    }
  }

  private getBatchChanges(): BatchTaskChanges | null {
    const changes: BatchTaskChanges = {};
    const statusAction = this.statusActionEl.value as StatusAction;
    const priorityAction = this.priorityActionEl.value as PriorityAction;
    const dueDateAction = this.dueDateActionEl.value as DueDateAction;
    const addTags = parseTagInput(this.addTagsInputEl.value);
    const removeTags = parseTagInput(this.removeTagsInputEl.value);

    if (statusAction !== "leave") {
      changes.status = statusAction;
    }

    if (priorityAction !== "leave") {
      changes.priority = priorityAction;
    }

    if (dueDateAction === "clear") {
      changes.dueDate = null;
    } else if (dueDateAction === "set") {
      const date = this.dueDateInputEl.value.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        new Notice("Enter a due date as YYYY-MM-DD.");
        return null;
      }
      changes.dueDate = date;
    }

    if (addTags.length > 0) {
      changes.addTags = addTags;
    }
    if (removeTags.length > 0) {
      changes.removeTags = removeTags;
    }

    if (!hasBatchChanges(changes)) {
      new Notice("Choose at least one batch edit.");
      return null;
    }

    return changes;
  }

  private getFilters(): TaskSearchFilters {
    return {
      completion: this.completionFilter,
      dueDate: this.dueDateFilter,
      priority: this.priorityFilter,
      tagQuery: this.tagInputEl.value,
      fileQuery: this.fileInputEl.value,
    };
  }

  private getStatusText(filteredCount: number, visibleSelectedCount: number): string {
    const shownText = filteredCount > this.results.length
      ? `Showing ${this.results.length} of ${filteredCount}`
      : `Showing ${this.results.length}`;
    const selectedText = visibleSelectedCount === this.selectedTasks.size
      ? `${this.selectedTasks.size} selected`
      : `${this.selectedTasks.size} selected, ${visibleSelectedCount} visible`;
    return `${shownText} tasks - ${selectedText}`;
  }

  private createFilterSelect(
    containerEl: HTMLElement,
    label: string,
    options: Array<[string, string]>,
    value: string,
  ): HTMLSelectElement {
    const labelEl = containerEl.createEl("label", { cls: "tasks-batch-edit-filter" });
    labelEl.createEl("span", { text: label });
    const selectEl = labelEl.createEl("select", {
      attr: { "aria-label": `${label} filter` },
    });
    addSelectOptions(selectEl, options);
    selectEl.value = value;
    return selectEl;
  }

  private createFilterInput(containerEl: HTMLElement, label: string, placeholder: string): HTMLInputElement {
    const labelEl = containerEl.createEl("label", { cls: "tasks-batch-edit-filter" });
    labelEl.createEl("span", { text: label });
    const inputEl = labelEl.createEl("input", {
      attr: {
        "aria-label": `${label} filter`,
        placeholder,
      },
    });
    inputEl.type = "text";
    return inputEl;
  }

  private createActionSelect(
    containerEl: HTMLElement,
    label: string,
    options: Array<[string, string]>,
    value: string,
  ): HTMLSelectElement {
    const labelEl = containerEl.createEl("label", { cls: "tasks-batch-edit-action-control" });
    labelEl.createEl("span", { text: label });
    const selectEl = labelEl.createEl("select", {
      attr: { "aria-label": `${label} batch action` },
    });
    addSelectOptions(selectEl, options);
    selectEl.value = value;
    return selectEl;
  }

  private createActionInput(containerEl: HTMLElement, label: string, placeholder: string): HTMLInputElement {
    const labelEl = containerEl.createEl("label", { cls: "tasks-batch-edit-action-control" });
    labelEl.createEl("span", { text: label });
    const inputEl = labelEl.createEl("input", {
      attr: {
        "aria-label": `${label} batch action`,
        placeholder,
      },
    });
    inputEl.type = "text";
    return inputEl;
  }
}

const TASK_TEXT_MAX_LENGTH = 110;

function addSelectOptions(selectEl: HTMLSelectElement, options: Array<[string, string]>): void {
  for (const [value, label] of options) {
    selectEl.createEl("option", {
      value,
      text: label,
    });
  }
}

function formatStatus(status: string): string {
  return `[${status}]`;
}

function formatTaskText(taskText: string): string {
  const normalized = taskText.trim().length > 0 ? taskText.trim() : "(empty task)";
  if (normalized.length <= TASK_TEXT_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, TASK_TEXT_MAX_LENGTH - 3).trimEnd()}...`;
}

function formatMetadata(result: TaskSearchResult): string {
  return [
    `${result.filePath}:${result.line + 1}`,
    result.heading,
    result.dueDate === null ? null : `Due ${result.dueDate}`,
    result.priority === null ? null : `Priority ${priorityFromLevel(result.priority).label}`,
    result.tags.length > 0 ? result.tags.join(" ") : null,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" | ");
}

function parseTagInput(input: string): string[] {
  return Array.from(new Set(
    input
      .split(/[\s,]+/)
      .map((tag) => tag.trim())
      .filter((tag) => tag.length > 0)
      .map((tag) => tag.startsWith("#") ? tag : `#${tag}`),
  ));
}

function hasBatchChanges(changes: BatchTaskChanges): boolean {
  return changes.status !== undefined
    || changes.priority !== undefined
    || changes.dueDate !== undefined
    || (changes.addTags?.length ?? 0) > 0
    || (changes.removeTags?.length ?? 0) > 0;
}

function groupTasksByFile(tasks: TaskSearchResult[]): Map<string, TaskSearchResult[]> {
  const grouped = new Map<string, TaskSearchResult[]>();
  for (const task of tasks) {
    const existing = grouped.get(task.filePath);
    if (existing === undefined) {
      grouped.set(task.filePath, [task]);
    } else {
      existing.push(task);
    }
  }

  return grouped;
}

function formatBatchNotice(changed: number, skipped: number): string {
  const base = changed === 0
    ? "No tasks changed"
    : `Updated ${changed} task${changed === 1 ? "" : "s"}`;
  return skipped === 0 ? base : `${base}; skipped ${skipped}`;
}
