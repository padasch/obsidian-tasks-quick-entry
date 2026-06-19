import { MarkdownView, Modal, Notice, TFile, type App } from "obsidian";
import { TaskSearchIndex } from "../search/TaskSearchIndex.ts";
import type {
  TaskCompletionFilter,
  TaskSearchFilters,
  TaskSearchResult,
} from "../search/taskSearchCore.ts";

export class TaskSearchModal extends Modal {
  private inputEl!: HTMLInputElement;
  private statusEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private results: TaskSearchResult[] = [];
  private selectedIndex = 0;
  private ready = false;
  private completionFilter: TaskCompletionFilter = "open";
  private hasTagFilter = false;
  private hasLinkFilter = false;
  private noDueDateFilter = false;

  constructor(
    app: App,
    private readonly index: TaskSearchIndex,
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("tasks-task-search-shell");
    this.modalEl.setAttr("aria-label", "Find task");
    contentEl.addClass("tasks-task-search-modal");

    contentEl.createEl("h2", {
      cls: "tasks-task-search-title",
      text: "Find task",
    });

    this.inputEl = contentEl.createEl("input", {
      cls: "tasks-task-search-input",
      attr: {
        "aria-label": "Search tasks",
        "autocomplete": "off",
        "spellcheck": "true",
        placeholder: "Search tasks by text, tag, heading, or file...",
      },
    });
    this.inputEl.type = "text";

    this.renderFilters(contentEl);
    this.statusEl = contentEl.createDiv({ cls: "tasks-task-search-status" });
    this.resultsEl = contentEl.createDiv({ cls: "tasks-task-search-results" });

    this.inputEl.addEventListener("input", () => {
      this.selectedIndex = 0;
      this.updateResults();
    });
    this.inputEl.addEventListener("keydown", (event) => {
      void this.handleKeydown(event);
    });

    this.renderLoading();
    void this.loadIndex();
    window.requestAnimationFrame(() => this.inputEl.focus());
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

  private updateResults(): void {
    if (!this.ready) {
      return;
    }

    this.results = this.index.search(this.inputEl.value, this.getFilters());
    if (this.selectedIndex >= this.results.length) {
      this.selectedIndex = Math.max(0, this.results.length - 1);
    }

    this.renderResults();
  }

  private renderLoading(): void {
    this.statusEl.setText("Indexing tasks...");
    this.resultsEl.empty();
  }

  private renderResults(): void {
    this.resultsEl.empty();
    const query = this.inputEl.value.trim();
    const filters = this.getFilters();
    const filteredCount = this.index.getCount(filters);

    if (this.index.count === 0) {
      this.statusEl.setText("No tasks found in Markdown files.");
      return;
    }

    if (filteredCount === 0) {
      this.statusEl.setText("No tasks match the active filters.");
      return;
    }

    if (this.results.length === 0) {
      this.statusEl.setText(query.length === 0 ? "No tasks to show." : "No matching tasks.");
      return;
    }

    this.statusEl.setText(query.length === 0
      ? `Showing ${this.results.length} of ${filteredCount} tasks`
      : `Showing ${this.results.length} matching tasks`);

    for (const [index, result] of this.results.entries()) {
      const row = this.resultsEl.createEl("button", {
        cls: `tasks-task-search-result${index === this.selectedIndex ? " is-selected" : ""}`,
      });
      row.type = "button";
      row.title = result.taskText;
      row.addEventListener("mouseenter", () => this.setSelectedIndex(index));
      row.addEventListener("click", () => {
        void this.openResult(result);
      });

      const resultLine = row.createDiv({ cls: "tasks-task-search-result-line" });
      resultLine.createEl("span", {
        cls: `tasks-task-search-result-status${result.completed ? " is-completed" : ""}`,
        text: formatStatus(result.status),
      });
      resultLine.createEl("span", {
        cls: "tasks-task-search-result-text",
        text: formatTaskText(result.taskText),
      });
      resultLine.createEl("span", {
        cls: "tasks-task-search-result-separator",
        text: "|",
      });
      resultLine.createEl("span", {
        cls: "tasks-task-search-result-meta",
        text: formatMetadata(result),
      });
    }
  }

  private renderFilters(containerEl: HTMLElement): void {
    const filtersEl = containerEl.createDiv({ cls: "tasks-task-search-filters" });

    const completionLabel = filtersEl.createEl("label", { cls: "tasks-task-search-filter" });
    completionLabel.createEl("span", { text: "Status" });
    const completionFilterEl = completionLabel.createEl("select", {
      attr: { "aria-label": "Task status filter" },
    });
    addSelectOption(completionFilterEl, "open", "Open");
    addSelectOption(completionFilterEl, "completed", "Done");
    addSelectOption(completionFilterEl, "all", "All");
    completionFilterEl.value = this.completionFilter;
    completionFilterEl.addEventListener("change", () => {
      this.completionFilter = completionFilterEl.value as TaskCompletionFilter;
      this.selectedIndex = 0;
      this.updateResults();
    });

    this.renderCheckboxFilter(filtersEl, "Has tag", (checked) => {
      this.hasTagFilter = checked;
    });
    this.renderCheckboxFilter(filtersEl, "Has link", (checked) => {
      this.hasLinkFilter = checked;
    });
    this.renderCheckboxFilter(filtersEl, "No due date", (checked) => {
      this.noDueDateFilter = checked;
    });
  }

  private renderCheckboxFilter(
    containerEl: HTMLElement,
    label: string,
    onChange: (checked: boolean) => void,
  ): HTMLInputElement {
    const filterLabel = containerEl.createEl("label", { cls: "tasks-task-search-check-filter" });
    const input = filterLabel.createEl("input", { attr: { "aria-label": label } });
    input.type = "checkbox";
    input.addEventListener("change", () => {
      onChange(input.checked);
      this.selectedIndex = 0;
      this.updateResults();
    });
    filterLabel.createEl("span", { text: label });
    return input;
  }

  private getFilters(): TaskSearchFilters {
    return {
      completion: this.completionFilter,
      hasTag: this.hasTagFilter,
      hasLink: this.hasLinkFilter,
      noDueDate: this.noDueDateFilter,
    };
  }

  private async handleKeydown(event: KeyboardEvent): Promise<void> {
    if (!this.ready) {
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.moveSelection(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        this.moveSelection(-1);
        break;
      case "Enter":
        event.preventDefault();
        if (this.results[this.selectedIndex]) {
          await this.openResult(this.results[this.selectedIndex]);
        }
        break;
    }
  }

  private moveSelection(delta: number): void {
    if (this.results.length === 0) {
      return;
    }

    this.selectedIndex = (this.selectedIndex + delta + this.results.length) % this.results.length;
    this.setSelectedIndex(this.selectedIndex);
    this.resultsEl.children[this.selectedIndex]?.scrollIntoView({ block: "nearest" });
  }

  private setSelectedIndex(index: number): void {
    if (index < 0 || index >= this.results.length) {
      return;
    }

    this.selectedIndex = index;
    for (const [childIndex, child] of Array.from(this.resultsEl.children).entries()) {
      child.classList.toggle("is-selected", childIndex === this.selectedIndex);
    }
  }

  private async openResult(result: TaskSearchResult): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(result.filePath);
    if (!(file instanceof TFile)) {
      new Notice(`Task file not found: ${result.filePath}`);
      return;
    }

    this.close();

    const leaf = this.app.workspace.getLeaf(false);
    await leaf.openFile(file, {
      active: true,
      state: { mode: "source" },
    });
    await nextAnimationFrame();

    const view = leaf.view instanceof MarkdownView
      ? leaf.view
      : this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!(view instanceof MarkdownView) || view.file?.path !== file.path) {
      return;
    }

    const editor = view.editor;
    const line = Math.min(result.line, Math.max(0, editor.lineCount() - 1));
    const lineText = editor.getLine(line);
    const ch = getTaskCursorColumn(lineText);
    editor.setSelection({ line, ch: 0 }, { line, ch: lineText.length });
    editor.scrollIntoView({
      from: { line, ch: 0 },
      to: { line, ch: lineText.length },
    }, true);
    window.setTimeout(() => {
      if (view.file?.path === file.path && editor.getSelection() === lineText) {
        editor.setCursor({ line, ch });
      }
    }, 700);
  }
}

const TASK_TEXT_MAX_LENGTH = 88;

function addSelectOption(selectEl: HTMLSelectElement, value: TaskCompletionFilter, label: string): void {
  selectEl.createEl("option", {
    text: label,
    value,
  });
}

function formatStatus(status: string): string {
  return `[${status}]`;
}

function formatTaskText(taskText: string): string {
  const normalized = taskText.trim().length > 0 ? taskText.trim() : "(empty task)";
  if (normalized.length <= TASK_TEXT_MAX_LENGTH) {
    return normalized;
  }

  return `${normalized.slice(0, TASK_TEXT_MAX_LENGTH - 1).trimEnd()}…`;
}

function formatMetadata(result: TaskSearchResult): string {
  return [
    `${result.filePath}:${result.line + 1}`,
    result.heading,
    result.tags.length > 0 ? result.tags.join(" ") : null,
    result.links.length > 0 ? result.links.map((link) => `[[${link}]]`).join(" ") : null,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .join(" | ");
}

function getTaskCursorColumn(lineText: string): number {
  const match = /^(\s*(?:[-*+]|\d+[.)])\s+\[[^\]]\]\s*)/.exec(lineText);
  return match?.[1].length ?? 0;
}

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => resolve());
  });
}
