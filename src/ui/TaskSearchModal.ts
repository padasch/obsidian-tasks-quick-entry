import { MarkdownView, Modal, Notice, TFile, type App } from "obsidian";
import { TaskSearchIndex } from "../search/TaskSearchIndex.ts";
import type { TaskSearchResult } from "../search/taskSearchCore.ts";

export class TaskSearchModal extends Modal {
  private inputEl!: HTMLInputElement;
  private statusEl!: HTMLElement;
  private resultsEl!: HTMLElement;
  private results: TaskSearchResult[] = [];
  private selectedIndex = 0;
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
    this.modalEl.addClass("tasks-task-search-shell");
    this.modalEl.setAttr("aria-label", "Find task");
    contentEl.addClass("tasks-task-search-modal");

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

    this.results = this.index.search(this.inputEl.value);
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

    if (this.index.count === 0) {
      this.statusEl.setText("No tasks found in Markdown files.");
      return;
    }

    if (this.results.length === 0) {
      this.statusEl.setText(query.length === 0 ? "No tasks to show." : "No matching tasks.");
      return;
    }

    this.statusEl.setText(query.length === 0
      ? `Showing ${this.results.length} of ${this.index.count} tasks`
      : `Showing ${this.results.length} matching tasks`);

    for (const [index, result] of this.results.entries()) {
      const row = this.resultsEl.createEl("button", {
        cls: `tasks-task-search-result${index === this.selectedIndex ? " is-selected" : ""}`,
      });
      row.type = "button";
      row.addEventListener("mouseenter", () => {
        this.selectedIndex = index;
        this.renderResults();
      });
      row.addEventListener("click", () => {
        void this.openResult(result);
      });

      const main = row.createDiv({ cls: "tasks-task-search-result-main" });
      main.createEl("span", {
        cls: `tasks-task-search-result-status${result.completed ? " is-completed" : ""}`,
        text: formatStatus(result.status),
      });
      main.createEl("span", {
        cls: "tasks-task-search-result-text",
        text: result.taskText.length > 0 ? result.taskText : "(empty task)",
      });

      const meta = row.createDiv({ cls: "tasks-task-search-result-meta" });
      meta.createEl("span", { text: `${result.filePath}:${result.line + 1}` });
      if (result.heading) {
        meta.createEl("span", { text: result.heading });
      }
      if (result.tags.length > 0) {
        meta.createEl("span", { text: result.tags.join(" ") });
      }
    }
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
    this.renderResults();
    this.resultsEl.children[this.selectedIndex]?.scrollIntoView({ block: "nearest" });
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
    editor.setCursor({ line, ch });
    editor.scrollIntoView({
      from: { line, ch: 0 },
      to: { line, ch: lineText.length },
    }, true);
  }
}

function formatStatus(status: string): string {
  return `[${status}]`;
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
