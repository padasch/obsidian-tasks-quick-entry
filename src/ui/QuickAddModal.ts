import { App, getAllTags, Modal, normalizePath, Notice, parseLinktext, Platform, TFile } from "obsidian";
import { formatTasksMarkdown, type FormatTasksMarkdownOptions } from "../formatter/formatTasksMarkdown.ts";
import {
  parseTaskInput,
  type ParsedMetadataConflict,
  type ParsedTaskInput,
  type ParseTaskInputOptions,
} from "../parser/parseTaskInput.ts";
import { extractDate } from "../parser/dateParser.ts";
import {
  PRIORITY_LEVELS,
  priorityFromLevel,
  type PriorityLevel,
} from "../parser/priorityParser.ts";
import { parseRecurrenceRuleText } from "../parser/recurrenceParser.ts";
import {
  DATE_TYPES,
  type DateType,
  type DetectedSummaryLayout,
  type MarkdownOutputLocation,
} from "../settings.ts";
import type { TaskWriteTarget } from "../writer/taskWriter.ts";

interface CompletionTrigger {
  kind: "tag" | "note" | "priority" | "date" | "recurrence";
  start: number;
  end: number;
  query: string;
}

interface CompletionSuggestion {
  kind: "tag" | "note" | "priority" | "date" | "recurrence";
  label: string;
  detail: string;
  insertText: string;
}

interface LinkedTaskFileTarget {
  linkText: string;
  filePath: string;
  displayName: string;
  headings: string[];
  linkedHeading: string | null;
}

const EMPTY_DATES: Record<DateType, string> = {
  due: "",
  scheduled: "",
  start: "",
};

const DATE_LABELS: Record<DateType, string> = {
  due: "Due",
  scheduled: "Scheduled",
  start: "Start",
};

const DATE_PLACEHOLDERS: Record<DateType, string> = {
  due: "yyyy-mm-dd",
  scheduled: "yyyy-mm-dd",
  start: "yyyy-mm-dd",
};

interface ParsedSummaryTokens {
  dateMatches: Array<{ matchedText: string }>;
  recurrenceMatches: Array<{ matchedText: string }>;
  priorityMatches: Array<{ matchedText: string }>;
  links: string[];
  tags: string[];
}

interface SummarySection {
  title: string;
  details: Array<{ label: string; value: string }>;
  parsedTokens: ParsedSummaryTokens;
}

const WEEKDAY_COMPLETIONS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

const DATE_COMPLETION_PHRASES = [
  "today",
  "tomorrow",
  "yesterday",
  "tonight",
  "at noon",
  "weekend",
  "next week",
  "next month",
  "next year",
  "end of week",
  "end of month",
  "start of next month",
  "end of next month",
  "last day of month",
  "mid month",
  ...WEEKDAY_COMPLETIONS,
];

const DATE_ALIAS_COMPLETIONS: Record<string, string> = {
  td: "today",
  tod: "today",
  tm: "tomorrow",
  tom: "tomorrow",
  tmr: "tomorrow",
  yd: "yesterday",
  nw: "next week",
};

const RECURRENCE_COMPLETION_PHRASES = [
  "every day",
  "every weekday",
  "every week",
  "every 2 weeks",
  "every month",
  "every 3 months",
  "every year",
  "every monday",
  "every tuesday",
  "every wednesday",
  "every thursday",
  "every friday",
  "every saturday",
  "every sunday",
  "every other monday",
  "every other friday",
  "every 2 weeks on friday",
  "every month on the second monday",
  "every last friday of the month",
  "every week on monday",
  "every week on friday",
];

const RECURRENCE_PLACEHOLDER = "every week on Monday";
const SUGGESTION_PAGE_SIZE = 5;

export class QuickAddModal extends Modal {
  private readonly parseOptions: ParseTaskInputOptions;
  private readonly formatOptions: FormatTasksMarkdownOptions;
  private readonly completionTriggerLength: number;
  private readonly detectedSummaryLayout: DetectedSummaryLayout;
  private readonly markdownOutputLocation: MarkdownOutputLocation;
  private readonly onSubmitTask: (draft: ParsedTaskInput, target?: TaskWriteTarget | null) => Promise<void>;
  private summaryHeaderEl!: HTMLElement;
  private inputEl!: HTMLInputElement;
  private submitButtonEl!: HTMLButtonElement;
  private parsedResultEl!: HTMLElement;
  private parsedOutputEl!: HTMLElement;
  private linkedTargetEl!: HTMLElement;
  private suggestionsEl!: HTMLElement;
  private priorityInputs: HTMLInputElement[] = [];
  private recurrenceInputEl!: HTMLInputElement;
  private descriptionInputEl!: HTMLInputElement;
  private editOutputEl!: HTMLElement;
  private dateInputs: Partial<Record<DateType, HTMLInputElement>> = {};
  private manualPriorityLevel: PriorityLevel | null = null;
  private manualRecurrenceRule = "";
  private manualRecurrenceTouched = false;
  private manualDescription = "";
  private manualDescriptionTouched = false;
  private manualDates: Record<DateType, string> = { ...EMPTY_DATES };
  private manualDateTouched: Record<DateType, boolean> = {
    due: false,
    scheduled: false,
    start: false,
  };
  private suggestions: CompletionSuggestion[] = [];
  private activeTrigger: CompletionTrigger | null = null;
  private selectedSuggestionIndex = 0;
  private linkedTargetEnabled = false;
  private linkedTargetFilePath = "";
  private linkedTargetLocation = "last-line";

  constructor(
    app: App,
    parseOptions: ParseTaskInputOptions,
    formatOptions: FormatTasksMarkdownOptions,
    private readonly modalTitle: string,
    completionTriggerLength: number,
    detectedSummaryLayout: DetectedSummaryLayout,
    markdownOutputLocation: MarkdownOutputLocation,
    onSubmitTask: (draft: ParsedTaskInput, target?: TaskWriteTarget | null) => Promise<void>,
  ) {
    super(app);
    this.parseOptions = parseOptions;
    this.formatOptions = formatOptions;
    this.completionTriggerLength = completionTriggerLength;
    this.detectedSummaryLayout = detectedSummaryLayout;
    this.markdownOutputLocation = markdownOutputLocation;
    this.onSubmitTask = onSubmitTask;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    this.modalEl.addClass("tasks-quick-add-shell");
    contentEl.addClass("tasks-quick-add-modal");
    contentEl.createEl("h2", { text: this.modalTitle });

    this.summaryHeaderEl = contentEl.createDiv({ cls: "tasks-quick-add-parse-summary" });

    const form = contentEl.createEl("form", { cls: "tasks-quick-add-form" });
    const inputWrap = form.createDiv({ cls: "tasks-quick-add-input-wrap" });
    this.inputEl = inputWrap.createEl("input", {
      cls: "tasks-quick-add-input",
      attr: {
        "aria-label": "Task",
        "autocomplete": "off",
        "spellcheck": "true",
        placeholder: `${this.modalTitle} - Type a task to see detected date, recurrence, priority, files, and tags...`,
      },
    });
    this.inputEl.type = "text";
    this.inputEl.enterKeyHint = "done";

    this.suggestionsEl = inputWrap.createDiv({ cls: "tasks-quick-add-suggestions" });
    this.suggestionsEl.hide();

    this.submitButtonEl = form.createEl("button", {
      text: "Add",
      cls: "mod-cta tasks-quick-add-submit",
    });
    this.submitButtonEl.type = "submit";

    this.parsedResultEl = contentEl.createDiv({ cls: "tasks-quick-add-result" });
    this.parsedOutputEl = this.parsedResultEl.createDiv({ cls: "tasks-quick-add-output-container" });
    this.linkedTargetEl = contentEl.createDiv({ cls: "tasks-quick-add-linked-target" });
    this.renderEditingDetails(contentEl);

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      await this.submitDraft();
    });

    this.inputEl.addEventListener("input", () => {
      this.updatePreview();
      this.updateSuggestions();
    });

    this.inputEl.addEventListener("click", () => this.updateSuggestions());
    this.inputEl.addEventListener("blur", () => {
      window.setTimeout(() => this.hideSuggestions(), 120);
    });

    this.inputEl.addEventListener("keydown", (event) => this.handleInputKeydown(event));

    this.updatePreview();
    window.requestAnimationFrame(() => this.inputEl.focus());
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderEditingDetails(containerEl: HTMLElement): void {
    const details = containerEl.createEl("details", { cls: "tasks-quick-add-details" });
    details.createEl("summary", { text: "Edit Task" });

    const body = details.createDiv({ cls: "tasks-quick-add-details-body" });
    const tableGrid = body.createDiv({ cls: "tasks-quick-add-edit-grid" });

    const priorityField = tableGrid.createDiv({ cls: "tasks-quick-add-edit-row" });
    priorityField.createEl("div", { cls: "tasks-quick-add-edit-label", text: "Priority" });
    const priorityCell = priorityField.createDiv({ cls: "tasks-quick-add-edit-cell" });
    priorityCell.createDiv({ cls: "tasks-quick-add-priority" });

    for (const level of PRIORITY_LEVELS) {
      const priority = priorityFromLevel(level);
      const label = priorityCell.createEl("label", { cls: "tasks-quick-add-radio" });
      const radio = label.createEl("input");
      radio.type = "radio";
      radio.name = "tasks-quick-add-priority";
      radio.value = level;
      radio.addEventListener("change", () => {
        this.manualPriorityLevel = level;
        this.updatePreview();
      });
      this.priorityInputs.push(radio);

      label.createEl("span", {
        text: priority.marker ? `${priority.label} ${priority.marker}` : priority.label,
      });
    }

    const recurrenceRow = tableGrid.createDiv({ cls: "tasks-quick-add-edit-row" });
    recurrenceRow.createEl("label", {
      text: "Recurs",
      attr: { for: "tasks-quick-add-recurrence" },
    });
    const recurrenceInputs = recurrenceRow.createDiv({ cls: "tasks-quick-add-edit-cell" });
    this.recurrenceInputEl = recurrenceInputs.createEl("input", {
      attr: {
        id: "tasks-quick-add-recurrence",
        "aria-label": "Recurrence rule",
        placeholder: RECURRENCE_PLACEHOLDER,
      },
    });
    this.recurrenceInputEl.type = "text";
    this.recurrenceInputEl.addEventListener("input", () => {
      this.manualRecurrenceTouched = true;
      this.manualRecurrenceRule = this.recurrenceInputEl.value;
      this.updatePreview();
    });

    const recurrenceClear = recurrenceInputs.createEl("button", { text: "Clear" });
    recurrenceClear.type = "button";
    recurrenceClear.addEventListener("click", () => {
      this.manualRecurrenceTouched = false;
      this.manualRecurrenceRule = "";
      this.syncEditingControls(null);
      this.updatePreview();
    });

    const descriptionRow = tableGrid.createDiv({ cls: "tasks-quick-add-edit-row" });
    descriptionRow.createEl("label", {
      text: "Description",
      attr: { for: "tasks-quick-add-description" },
    });
    const descriptionCell = descriptionRow.createDiv({ cls: "tasks-quick-add-edit-cell" });
    this.descriptionInputEl = descriptionCell.createEl("input", {
      attr: {
        id: "tasks-quick-add-description",
        "aria-label": "Description",
        placeholder: "Optional task description",
      },
    });
    this.descriptionInputEl.type = "text";
    this.descriptionInputEl.addEventListener("input", () => {
      this.manualDescription = this.descriptionInputEl.value;
      this.manualDescriptionTouched = true;
      this.updatePreview();
    });

    const datesSection = tableGrid.createDiv({ cls: "tasks-quick-add-edit-row tasks-quick-add-date-grid" });
    datesSection.createEl("div", {
      cls: "tasks-quick-add-edit-row-label",
      text: "Dates",
    });
    const datesCell = datesSection.createDiv({ cls: "tasks-quick-add-edit-cell" });

    for (const dateType of DATE_TYPES) {
      const row = datesCell.createDiv({ cls: "tasks-quick-add-date-row" });
      row.createEl("label", {
        text: DATE_LABELS[dateType],
        attr: { for: `tasks-quick-add-${dateType}-date` },
      });
      const input = row.createEl("input", {
        attr: {
          id: `tasks-quick-add-${dateType}-date`,
          "aria-label": `${DATE_LABELS[dateType]} date`,
          placeholder: DATE_PLACEHOLDERS[dateType],
        },
      });
      input.type = "date";
      input.addEventListener("input", () => {
        this.manualDateTouched[dateType] = true;
        this.manualDates[dateType] = input.value;
        this.updatePreview();
      });
      this.dateInputs[dateType] = input;
    }

    const actions = body.createDiv({ cls: "tasks-quick-add-edit-actions" });
    const resetButton = actions.createEl("button", { text: "Use parsed values" });
    resetButton.type = "button";
    resetButton.addEventListener("click", () => {
      this.manualPriorityLevel = null;
      this.manualRecurrenceRule = "";
      this.manualRecurrenceTouched = false;
      this.manualDescription = "";
      this.manualDescriptionTouched = false;
      this.manualDates = { ...EMPTY_DATES };
      this.manualDateTouched = {
        due: false,
        scheduled: false,
        start: false,
      };
      this.updatePreview();
    });

    this.editOutputEl = body.createDiv({ cls: "tasks-quick-add-edit-output" });
  }

  private async submitDraft(): Promise<void> {
    this.hideSuggestions();
    this.inputEl.disabled = true;
    this.submitButtonEl.disabled = true;

    try {
      const draft = this.getCurrentDraft();
      const target = this.getTaskWriteTarget();
      await this.onSubmitTask(this.removeLinkedTargetFromDraft(draft, target), target);
      this.close();
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not add task.");
      this.inputEl.disabled = false;
      this.submitButtonEl.disabled = false;
      this.inputEl.focus();
      this.updatePreview();
    }
  }

  private updatePreview(): void {
    this.parsedResultEl.empty();
    this.parsedOutputEl = this.parsedResultEl.createDiv({ cls: "tasks-quick-add-output-container" });

    if (this.inputEl.value.trim().length === 0) {
      this.summaryHeaderEl.empty();
      this.summaryHeaderEl.appendText(`${this.modalTitle} - waiting for input`);

      this.parsedOutputEl.createDiv({
        cls: "tasks-quick-add-empty",
        text: "Type a task to see detected text, dates, recurrence, priority, files, and tags.",
      });
      this.syncEditingControls(null);
      this.editOutputEl.empty();
      this.renderLinkedTargetControl(null);
      return;
    }

    try {
      const parsed = parseTaskInput(this.inputEl.value, this.parseOptions);
      const draft = this.applyManualEdits(parsed);
      this.renderSummaryHeader(draft, this.inputEl.value);
      this.syncEditingControls(draft);
      this.renderLinkedTargetControl(draft);
      this.renderParsedResult(draft, this.removeLinkedTargetFromDraft(draft, this.getTaskWriteTarget()));
    } catch (error) {
      this.renderSummaryError(this.inputEl.value);

      this.parsedOutputEl.createDiv({
        cls: "tasks-quick-add-error",
        text: error instanceof Error ? error.message : "Could not parse task.",
      });
      this.renderLinkedTargetControl(null);
      this.editOutputEl.empty();
    }
  }

  private renderParsedResult(draft: ParsedTaskInput, outputDraft: ParsedTaskInput = draft): void {
    const outputDraftText = formatTasksMarkdown(outputDraft, this.formatOptions);
    this.renderMetadataConflicts(this.parsedOutputEl, draft.conflicts);

    const titleRow = this.parsedOutputEl.createDiv({ cls: "tasks-quick-add-result-title" });
    titleRow.createEl("span", { cls: "tasks-quick-add-label", text: "Text" });
    titleRow.createEl("strong", { text: outputDraft.title });

    const detected = this.parsedOutputEl.createDiv({ cls: "tasks-quick-add-detected" });
    detected.createEl("span", { cls: "tasks-quick-add-label", text: "Detected" });

    if (this.detectedSummaryLayout === "lines") {
      this.renderDetectedRows(detected, draft);
    } else {
      const chipWrap = detected.createDiv({ cls: "tasks-quick-add-chips" });
      this.renderDetectedChips(chipWrap, draft);
    }

    const output = this.parsedOutputEl.createDiv({ cls: "tasks-quick-add-output" });
    output.createEl("span", { cls: "tasks-quick-add-label", text: "Markdown" });
    output.createEl("code", { text: outputDraftText });

    this.editOutputEl.empty();
    if (this.markdownOutputLocation === "edit-section") {
      this.editOutputEl.createEl("small", {
        cls: "tasks-quick-add-label",
        text: "Markdown",
      });
      this.editOutputEl.createEl("code", { text: outputDraftText, cls: "tasks-quick-add-output-code" });
      output.hide();
    }
  }

  private renderSummaryHeader(draft: ParsedTaskInput, rawInput: string): void {
    const sections = buildSummarySections(draft, rawInput);
    this.summaryHeaderEl.empty();

    const headerRow = this.summaryHeaderEl.createDiv({ cls: "tasks-quick-add-summary-header" });
    const commandCell = headerRow.createDiv({ cls: "tasks-quick-add-summary-command" });
    const detectedCell = headerRow.createDiv({ cls: "tasks-quick-add-summary-detected" });
    const displayTitle = `${this.modalTitle} · ${sections.title}`;
    commandCell.appendText(`${this.modalTitle} · `);
    renderHighlightedInput(commandCell, sections.title, displayTitle, getParsedTokenRanges(sections.title, sections.parsedTokens));

    if (sections.details.length === 0) {
      detectedCell.createEl("span", { cls: "tasks-quick-add-muted", text: "No detected metadata" });
      return;
    }

    const list = detectedCell.createDiv({ cls: "tasks-quick-add-summary-values" });
    for (const detail of sections.details) {
      const line = list.createDiv({ cls: "tasks-quick-add-summary-value" });
      line.createEl("strong", { text: `${detail.label}: ` });
      if (detail.value.length > 0) {
        line.createEl("span", { text: detail.value });
      } else {
        line.createEl("span", { cls: "tasks-quick-add-muted", text: "—" });
      }
    }
  }

  private renderSummaryError(rawInput: string): void {
    this.summaryHeaderEl.empty();
    const headerRow = this.summaryHeaderEl.createDiv({ cls: "tasks-quick-add-summary-header" });
    const commandCell = headerRow.createDiv({ cls: "tasks-quick-add-summary-command" });
    const detectedCell = headerRow.createDiv({ cls: "tasks-quick-add-summary-detected" });

    commandCell.createEl("span", {
      text: `${this.modalTitle} · ${rawInput}`,
      attr: { title: this.modalTitle },
    });
    detectedCell.createEl("span", {
      cls: "tasks-quick-add-label",
      text: "Could not parse input yet",
    });
  }

  private renderDetectedRows(containerEl: HTMLElement, draft: ParsedTaskInput): void {
    const rowGroup = containerEl.createDiv({ cls: "tasks-quick-add-detected-rows" });
    const rows: Array<{ key: string; value: string }> = [];

    if (draft.dates.due) {
      rows.push({
        key: "Due",
        value: formatDetectedDateText(draft.dateTexts.due, draft.dates.due),
      });
    }

    if (draft.recurrence !== null) {
      rows.push({ key: "Recurrence", value: draft.recurrence.rule });
    }

    if (draft.priority !== null) {
      rows.push({ key: "Priority", value: `${draft.priority.label}${draft.priority.marker ? ` ${draft.priority.marker}` : ""}` });
    }

    for (const link of draft.links) {
      rows.push({ key: "File", value: link });
    }

    for (const tag of draft.tags) {
      rows.push({ key: "Tag", value: tag });
    }

    for (const dateType of ["scheduled", "start"] as DateType[]) {
      const date = draft.dates[dateType];
      if (date) {
        rows.push({
          key: `Date (${DATE_LABELS[dateType]})`,
          value: formatDetectedDateText(draft.dateTexts[dateType], date),
        });
      }
    }

    if (rows.length === 0) {
      rowGroup.createEl("span", { cls: "tasks-quick-add-muted", text: "No metadata detected" });
      return;
    }

    for (const row of rows) {
      const rowEl = rowGroup.createDiv({ cls: "tasks-quick-add-detected-row" });
      rowEl.createEl("span", { cls: "tasks-quick-add-label", text: row.key });
      rowEl.createEl("span", { text: row.value });
    }
  }

  private renderDetectedChips(containerEl: HTMLElement, draft: ParsedTaskInput): void {
    let chipCount = 0;

    if (draft.dates.due) {
      this.renderChip(containerEl, `Due: ${formatDetectedDateText(draft.dateTexts.due, draft.dates.due)}`);
      chipCount += 1;
    }

    if (draft.recurrence !== null) {
      this.renderChip(containerEl, `Recurs: ${draft.recurrence.rule}`);
      chipCount += 1;
    }

    if (draft.priority !== null) {
      this.renderChip(containerEl, `Priority: ${draft.priority.label}${draft.priority.marker ? ` ${draft.priority.marker}` : ""}`);
      chipCount += 1;
    }

    for (const link of draft.links) {
      this.renderChip(containerEl, `File: ${link}`);
      chipCount += 1;
    }

    for (const tag of draft.tags) {
      this.renderChip(containerEl, tag);
      chipCount += 1;
    }

    if (draft.dates.scheduled) {
      this.renderChip(containerEl, `Scheduled: ${formatDetectedDateText(draft.dateTexts.scheduled, draft.dates.scheduled)}`);
      chipCount += 1;
    }

    if (draft.dates.start) {
      this.renderChip(containerEl, `Start: ${formatDetectedDateText(draft.dateTexts.start, draft.dates.start)}`);
      chipCount += 1;
    }

    if (chipCount === 0) {
      containerEl.createEl("span", { cls: "tasks-quick-add-muted", text: "No metadata detected" });
    }
  }

  private renderChip(containerEl: HTMLElement, text: string): void {
    containerEl.createEl("span", { cls: "tasks-quick-add-chip", text });
  }

  private renderMetadataConflicts(containerEl: HTMLElement, conflicts: ParsedMetadataConflict[]): void {
    if (conflicts.length === 0) {
      return;
    }

    const list = containerEl.createDiv({ cls: "tasks-quick-add-conflicts" });
    for (const conflict of conflicts) {
      const item = list.createDiv({ cls: "tasks-quick-add-conflict" });
      item.setText(`${conflict.label}: Using "${conflict.used}" (ignoring ${formatQuotedList(conflict.ignored)})`);
    }
  }

  private renderLinkedTargetControl(draft: ParsedTaskInput | null): void {
    this.linkedTargetEl.empty();

    if (draft === null) {
      return;
    }

    const linkedFiles = this.getResolvedLinkedFiles(draft.links);
    if (linkedFiles.length === 0) {
      this.linkedTargetEnabled = false;
      this.linkedTargetFilePath = "";
      this.linkedTargetLocation = "last-line";
      return;
    }

    if (!linkedFiles.some((file) => file.filePath === this.linkedTargetFilePath)) {
      this.linkedTargetFilePath = linkedFiles[0].filePath;
      this.linkedTargetLocation = this.getDefaultLinkedTargetLocation(linkedFiles[0]);
      this.linkedTargetEnabled = true;
    }

    const selectedFile = linkedFiles.find((file) => file.filePath === this.linkedTargetFilePath) ?? linkedFiles[0];
    if (!this.isValidLinkedTargetLocation(selectedFile, this.linkedTargetLocation)) {
      this.linkedTargetLocation = this.getDefaultLinkedTargetLocation(selectedFile);
    }

    const panel = this.linkedTargetEl.createDiv({ cls: "tasks-quick-add-linked-target-panel" });
    const label = panel.createEl("label", { cls: "tasks-quick-add-linked-target-toggle" });
    const checkbox = label.createEl("input");
    checkbox.type = "checkbox";
    checkbox.checked = this.linkedTargetEnabled;
    checkbox.addEventListener("change", () => {
      this.linkedTargetEnabled = checkbox.checked;
      this.updatePreview();
    });
    label.createEl("span", { text: `Add task to ${selectedFile.displayName}` });

    if (!this.linkedTargetEnabled) {
      panel.createEl("small", {
        cls: "tasks-quick-add-linked-target-hint",
        text: "Otherwise the configured task file is used.",
      });
      return;
    }

    const controls = panel.createDiv({ cls: "tasks-quick-add-linked-target-controls" });

    if (linkedFiles.length > 1) {
      const fileSelect = controls.createEl("select", { attr: { "aria-label": "Linked target file" } });
      for (const file of linkedFiles) {
        fileSelect.createEl("option", { value: file.filePath, text: file.displayName });
      }
      fileSelect.value = selectedFile.filePath;
      fileSelect.addEventListener("change", () => {
        const nextFile = linkedFiles.find((file) => file.filePath === fileSelect.value);
        if (nextFile === undefined) {
          return;
        }

        this.linkedTargetFilePath = nextFile.filePath;
        this.linkedTargetLocation = this.getDefaultLinkedTargetLocation(nextFile);
        this.updatePreview();
      });
    }

    const locationSelect = controls.createEl("select", { attr: { "aria-label": "Linked target location" } });
    locationSelect.createEl("option", { value: "first-line", text: "First line" });
    locationSelect.createEl("option", { value: "last-line", text: "Last line" });
    for (const heading of selectedFile.headings) {
      locationSelect.createEl("option", { value: `heading:${heading}`, text: `Heading: ${heading}` });
    }
    locationSelect.value = this.linkedTargetLocation;
    locationSelect.addEventListener("change", () => {
      this.linkedTargetLocation = locationSelect.value;
      this.updatePreview();
    });

    panel.createEl("small", {
      cls: "tasks-quick-add-linked-target-hint",
      text: selectedFile.filePath,
    });
  }

  private getResolvedLinkedFiles(links: string[]): LinkedTaskFileTarget[] {
    const files: LinkedTaskFileTarget[] = [];
    const seenPaths = new Set<string>();

    for (const linkText of links) {
      const linkTarget = stripLinkAlias(linkText);
      const parsedLink = parseLinktext(linkTarget);
      const file = this.resolveLinkedFile(parsedLink.path);
      if (file === null || seenPaths.has(file.path)) {
        continue;
      }

      seenPaths.add(file.path);
      files.push({
        linkText,
        filePath: file.path,
        displayName: this.app.metadataCache.fileToLinktext(file, "", true),
        headings: this.getFileHeadings(file),
        linkedHeading: getHeadingFromSubpath(parsedLink.subpath),
      });
    }

    return files;
  }

  private resolveLinkedFile(linkPath: string): TFile | null {
    const sourcePath = this.app.workspace.getActiveFile()?.path ?? "";
    const resolved = this.app.metadataCache.getFirstLinkpathDest(linkPath, sourcePath);
    if (isMarkdownFile(resolved)) {
      return resolved;
    }

    const normalizedPath = normalizePath(linkPath);
    const directPath = normalizedPath.endsWith(".md") ? normalizedPath : `${normalizedPath}.md`;
    const directFile = this.app.vault.getAbstractFileByPath(directPath);
    if (isMarkdownFile(directFile)) {
      return directFile;
    }

    const targetWithoutExtension = stripMarkdownExtension(normalizedPath).toLowerCase();
    return this.app.vault.getMarkdownFiles().find((file) => {
      const pathWithoutExtension = stripMarkdownExtension(file.path).toLowerCase();
      return pathWithoutExtension === targetWithoutExtension || file.basename.toLowerCase() === targetWithoutExtension;
    }) ?? null;
  }

  private getFileHeadings(file: TFile): string[] {
    const headings = this.app.metadataCache.getFileCache(file)?.headings ?? [];
    const seenHeadings = new Set<string>();
    const uniqueHeadings: string[] = [];

    for (const heading of headings) {
      const text = heading.heading.trim();
      const key = text.toLowerCase();
      if (text.length === 0 || seenHeadings.has(key)) {
        continue;
      }

      seenHeadings.add(key);
      uniqueHeadings.push(text);
    }

    return uniqueHeadings;
  }

  private getDefaultLinkedTargetLocation(file: LinkedTaskFileTarget): string {
    if (file.linkedHeading !== null) {
      const matchingHeading = file.headings.find((heading) => heading.toLowerCase() === file.linkedHeading?.toLowerCase());
      if (matchingHeading !== undefined) {
        return `heading:${matchingHeading}`;
      }
    }

    return "last-line";
  }

  private isValidLinkedTargetLocation(file: LinkedTaskFileTarget, location: string): boolean {
    if (location === "first-line" || location === "last-line") {
      return true;
    }

    if (!location.startsWith("heading:")) {
      return false;
    }

    const heading = location.slice("heading:".length);
    return file.headings.some((candidate) => candidate === heading);
  }

  private getTaskWriteTarget(): TaskWriteTarget | null {
    if (!this.linkedTargetEnabled || this.linkedTargetFilePath.length === 0) {
      return null;
    }

    if (this.linkedTargetLocation.startsWith("heading:")) {
      return {
        filePath: this.linkedTargetFilePath,
        insertPosition: "last-line",
        insertTarget: "heading",
        insertHeading: this.linkedTargetLocation.slice("heading:".length),
      };
    }

    return {
      filePath: this.linkedTargetFilePath,
      insertPosition: this.linkedTargetLocation === "first-line" ? "first-line" : "last-line",
      insertTarget: "file",
    };
  }

  private removeLinkedTargetFromDraft(draft: ParsedTaskInput, target: TaskWriteTarget | null): ParsedTaskInput {
    if (target === null) {
      return draft;
    }

    const linksToKeep = draft.links.filter((linkText) => !this.doesLinkPointToFile(linkText, target.filePath));
    if (linksToKeep.length === draft.links.length) {
      return draft;
    }

    return {
      ...draft,
      title: this.removeLinksToFile(draft.title, target.filePath),
      titleWithoutTags: this.removeLinksToFile(draft.titleWithoutTags, target.filePath),
      links: linksToKeep,
    };
  }

  private removeLinksToFile(input: string, filePath: string): string {
    return input
      .replace(/\[\[([^\]\n]+)\]\]/g, (match: string, linkText: string) => {
        return this.doesLinkPointToFile(linkText, filePath) ? " " : match;
      })
      .replace(/\s+/g, " ")
      .trim();
  }

  private doesLinkPointToFile(linkText: string, filePath: string): boolean {
    const linkTarget = stripLinkAlias(linkText);
    const parsedLink = parseLinktext(linkTarget);
    return this.resolveLinkedFile(parsedLink.path)?.path === filePath;
  }

  private getCurrentDraft(): ParsedTaskInput {
    const parsed = parseTaskInput(this.inputEl.value, this.parseOptions);
    return this.applyManualEdits(parsed);
  }

  private applyManualEdits(parsed: ParsedTaskInput): ParsedTaskInput {
    const dates = { ...parsed.dates };
    const dateTexts = { ...parsed.dateTexts };
    const recurrence = this.resolveRecurrence(parsed);

    for (const dateType of DATE_TYPES) {
      if (!this.manualDateTouched[dateType]) {
        continue;
      }

      const value = this.manualDates[dateType].trim();
      if (value.length === 0) {
        delete dates[dateType];
        delete dateTexts[dateType];
      } else {
        validateDateValue(dateType, value);
        dates[dateType] = value;
        dateTexts[dateType] = "manual";
      }
    }

    if (recurrence !== null && !DATE_TYPES.some((dateType) => Boolean(dates[dateType]))) {
      const dateType = this.parseOptions.defaultDateType ?? "due";
      dates[dateType] = recurrence.inferredDate;
      dateTexts[dateType] = "inferred from recurrence";
    }

    const firstDateType = DATE_TYPES.find((dateType) => Boolean(dates[dateType]));
    const date = firstDateType === undefined ? null : {
      type: firstDateType,
      date: dates[firstDateType]!,
      matchedText: parsed.date?.type === firstDateType ? parsed.date.matchedText : "manual",
    };

    return {
      ...parsed,
      date,
      dates,
      dateTexts,
      recurrence,
      priority: this.manualPriorityLevel === null ? parsed.priority : priorityFromLevel(this.manualPriorityLevel),
      description: this.manualDescriptionTouched ? this.manualDescription : parsed.description,
    };
  }

  private resolveRecurrence(parsed: ParsedTaskInput) {
    if (!this.manualRecurrenceTouched) {
      return parsed.recurrence;
    }

    const value = this.manualRecurrenceRule.trim();
    if (value.length === 0) {
      return null;
    }

    const recurrence = parseRecurrenceRuleText(value, this.parseOptions.referenceDate);
    if (recurrence === null) {
      throw new Error("Recurrence must start with a Tasks-compatible rule like every week on Monday.");
    }

    return recurrence;
  }

  private syncEditingControls(draft: ParsedTaskInput | null): void {
    const effectivePriority = this.manualPriorityLevel ?? draft?.priority?.level ?? "normal";
    for (const radio of this.priorityInputs) {
      radio.checked = radio.value === effectivePriority;
    }

    if (this.recurrenceInputEl && !this.manualRecurrenceTouched) {
      this.recurrenceInputEl.value = draft?.recurrence?.rule ?? "";
    }

    if (this.descriptionInputEl) {
      this.descriptionInputEl.value = this.manualDescriptionTouched ? this.manualDescription : (draft?.description ?? "");
    }

    for (const dateType of DATE_TYPES) {
      const input = this.dateInputs[dateType];
      if (!input || this.manualDateTouched[dateType]) {
        continue;
      }

      input.value = draft?.dates[dateType] ?? "";
    }
  }

  private handleInputKeydown(event: KeyboardEvent): void {
    if (this.suggestions.length > 0) {
      const shortcutIndex = this.getSuggestionShortcutIndex(event);
      if (shortcutIndex !== null) {
        event.preventDefault();
        this.insertSuggestion(shortcutIndex);
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.moveSuggestionSelection(1, true);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        this.moveSuggestionSelection(-1, true);
        return;
      }

      if (event.key === "Home") {
        event.preventDefault();
        this.setSuggestionSelection(0);
        return;
      }

      if (event.key === "End") {
        event.preventDefault();
        this.setSuggestionSelection(this.suggestions.length - 1);
        return;
      }

      if (event.key === "PageDown") {
        event.preventDefault();
        this.moveSuggestionSelection(SUGGESTION_PAGE_SIZE, false);
        return;
      }

      if (event.key === "PageUp") {
        event.preventDefault();
        this.moveSuggestionSelection(-SUGGESTION_PAGE_SIZE, false);
        return;
      }

      if (event.key === "Tab" || event.key === "Enter") {
        event.preventDefault();
        this.insertSuggestion(this.selectedSuggestionIndex);
        return;
      }

      if (event.key === "Escape") {
        event.preventDefault();
        this.hideSuggestions();
        return;
      }
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.close();
    }
  }

  private updateSuggestions(): void {
    const trigger = this.findCompletionTrigger();
    this.activeTrigger = trigger;

    if (trigger === null) {
      this.hideSuggestions();
      return;
    }

    this.suggestions = this.getSuggestionsForTrigger(trigger);
    this.selectedSuggestionIndex = 0;

    if (this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    this.renderSuggestions();
  }

  private findCompletionTrigger(): CompletionTrigger | null {
    const cursor = this.inputEl.selectionStart ?? this.inputEl.value.length;
    const beforeCursor = this.inputEl.value.slice(0, cursor);

    const noteMatch = beforeCursor.match(/\[\[([^\]\n]*)$/);
    if (noteMatch !== null) {
      return {
        kind: "note",
        start: cursor - noteMatch[0].length,
        end: cursor,
        query: noteMatch[1].toLowerCase(),
      };
    }

    const priorityMatch = beforeCursor.match(/(^|\s)(prio\s+)?([a-z]+)?$/i);
    if (priorityMatch !== null) {
      const isPrefixed = Boolean(priorityMatch[2]);
      const query = (priorityMatch[3] ?? "").toLowerCase();
      if ((isPrefixed && query.length >= this.completionTriggerLength) || this.isPriorityBareMatch(query)) {
        return {
          kind: "priority",
          start: cursor - query.length,
          end: cursor,
          query,
        };
      }
    }

    const recurrenceMatch = beforeCursor.match(/(^|\s)(every(?:\s+[a-z0-9]+){0,4})$/i);
    if (recurrenceMatch !== null) {
      const query = recurrenceMatch[2].trim().toLowerCase();
      if (query.length >= this.completionTriggerLength) {
        return {
          kind: "recurrence",
          start: cursor - query.length,
          end: cursor,
          query,
        };
      }
    }

    const dateTrigger = this.findDateCompletionTrigger(beforeCursor, cursor);
    if (dateTrigger !== null) {
      return dateTrigger;
    }

    const tagMatch = beforeCursor.match(/(^|\s)#([^\s#\[\]]*)$/);
    if (tagMatch !== null) {
      return {
        kind: "tag",
        start: cursor - tagMatch[0].length + tagMatch[1].length,
        end: cursor,
        query: tagMatch[2].toLowerCase(),
      };
    }

    return null;
  }

  private isPriorityBareMatch(query: string): boolean {
    return isPriorityTriggerMatch(query) && query.length >= this.completionTriggerLength;
  }

  private findDateCompletionTrigger(beforeCursor: string, cursor: number): CompletionTrigger | null {
    const phraseMatch = beforeCursor.match(/(^|\s)([a-z0-9]+(?:\s+[a-z0-9]+){0,3})$/i);
    if (phraseMatch === null) {
      return null;
    }

    const words = phraseMatch[2].trim().split(/\s+/);
    for (let wordCount = Math.min(words.length, 4); wordCount > 0; wordCount -= 1) {
      const query = words.slice(-wordCount).join(" ").toLowerCase();
      if (query.length < this.completionTriggerLength) {
        continue;
      }

      if (this.getDateSuggestions(query).length > 0) {
        return {
          kind: "date",
          start: cursor - query.length,
          end: cursor,
          query,
        };
      }
    }

    return null;
  }

  private getSuggestionsForTrigger(trigger: CompletionTrigger): CompletionSuggestion[] {
    switch (trigger.kind) {
      case "tag":
        return this.getTagSuggestions(trigger.query);
      case "priority":
        return this.getPrioritySuggestions(trigger.query);
      case "date":
        return this.getDateSuggestions(trigger.query);
      case "note":
        return this.getNoteSuggestions(trigger.query);
      case "recurrence":
        return this.getRecurrenceSuggestions(trigger.query);
      default:
        return [];
    }
  }

  private getRecurrenceSuggestions(query: string): CompletionSuggestion[] {
    const phrases = getRecurrenceCompletionPhrases(query);
    return phrases.map((phrase) => ({
      kind: "recurrence",
      label: phrase,
      detail: "Recurrence",
      insertText: `${phrase} `,
    }));
  }

  private getPrioritySuggestions(query: string): CompletionSuggestion[] {
    return fuzzyRank(
      PRIORITY_LEVELS.map((level) => priorityFromLevel(level)),
      query,
      (priority) => [priority.level, priority.label],
      8,
    )
      .map((priority) => ({
        kind: "priority",
        label: priority.marker ? `${priority.label} ${priority.marker}` : priority.label,
        detail: "Priority",
        insertText: `prio ${priority.level} `,
      }));
  }

  private getDateSuggestions(query: string): CompletionSuggestion[] {
    return getDateCompletionPhrases(query)
      .map((phrase) => ({
        kind: "date",
        label: phrase,
        detail: this.getDateSuggestionDetail(phrase),
        insertText: `${phrase} `,
      }));
  }

  private getDateSuggestionDetail(phrase: string): string {
    const parsed = extractDate(phrase, this.parseOptions.referenceDate);
    return parsed === null ? "Date" : parsed.date;
  }

  private getTagSuggestions(query: string): CompletionSuggestion[] {
    const tags = new Set<string>();
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file);
      if (cache === null) {
        continue;
      }

      for (const tag of getAllTags(cache) ?? []) {
        tags.add(tag);
      }
    }

    const sortedTags = Array.from(tags).sort((a, b) => a.localeCompare(b));
    return fuzzyRank(sortedTags, query, getTagSuggestionSearchText, 8)
      .map((tag) => ({
        kind: "tag",
        label: tag,
        detail: "Tag",
        insertText: `${tag} `,
      }));
  }

  private getNoteSuggestions(query: string): CompletionSuggestion[] {
    const notes = this.app.vault.getMarkdownFiles()
      .map((file) => ({
        file,
        linkText: this.app.metadataCache.fileToLinktext(file, "", true),
      }))
      .sort((a, b) => a.linkText.localeCompare(b.linkText));

    return fuzzyRank(
      notes,
      query,
      ({ linkText, file }) => [linkText, file.path],
      8,
    )
      .map(({ file, linkText }) => ({
        kind: "note",
        label: linkText,
        detail: file.path,
        insertText: `[[${linkText}]] `,
      }));
  }

  private renderSuggestions(): void {
    this.suggestionsEl.empty();
    let selectedItem: HTMLButtonElement | null = null;

    for (const [index, suggestion] of this.suggestions.entries()) {
      const isSelected = index === this.selectedSuggestionIndex;
      const item = this.suggestionsEl.createEl("button", {
        cls: `tasks-quick-add-suggestion${isSelected ? " is-selected" : ""}`,
      });
      if (isSelected) {
        selectedItem = item;
      }
      item.type = "button";
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.insertSuggestion(index);
      });
      const labelEl = item.createEl("span", { cls: "tasks-quick-add-suggestion-label" });
      if (!Platform.isMobile) {
        labelEl.createEl("kbd", {
          cls: "tasks-quick-add-suggestion-shortcut",
          text: formatSuggestionShortcut(index, this.activeTrigger?.query ?? ""),
        });
      }
      labelEl.createEl("span", { text: suggestion.label });
      item.createEl("small", { text: suggestion.detail });
    }

    this.suggestionsEl.show();
    selectedItem?.scrollIntoView({ block: "nearest" });
  }

  private hideSuggestions(): void {
    this.suggestions = [];
    this.activeTrigger = null;
    if (this.suggestionsEl) {
      this.suggestionsEl.empty();
      this.suggestionsEl.hide();
    }
  }

  private insertSuggestion(index: number): void {
    const trigger = this.activeTrigger;
    const suggestion = this.suggestions[index];
    if (trigger === null || suggestion === undefined) {
      return;
    }

    const before = this.inputEl.value.slice(0, trigger.start);
    const after = this.inputEl.value.slice(trigger.end);
    this.inputEl.value = `${before}${suggestion.insertText}${after}`;
    const cursor = before.length + suggestion.insertText.length;
    this.inputEl.setSelectionRange(cursor, cursor);
    this.hideSuggestions();
    this.updatePreview();
    this.inputEl.focus();
  }

  private getSuggestionShortcutIndex(event: KeyboardEvent): number | null {
    if (!/^[1-9]$/.test(event.key)) {
      return null;
    }

    const index = Number.parseInt(event.key, 10) - 1;
    if (index >= this.suggestions.length) {
      return null;
    }

    const canUsePlainNumber = (this.activeTrigger?.query ?? "").length === 0;
    return canUsePlainNumber || event.ctrlKey || event.metaKey ? index : null;
  }

  private moveSuggestionSelection(delta: number, wrap: boolean): void {
    if (this.suggestions.length === 0) {
      return;
    }

    const nextIndex = this.selectedSuggestionIndex + delta;
    if (wrap) {
      this.setSuggestionSelection((nextIndex + this.suggestions.length) % this.suggestions.length);
      return;
    }

    this.setSuggestionSelection(Math.min(Math.max(nextIndex, 0), this.suggestions.length - 1));
  }

  private setSuggestionSelection(index: number): void {
    this.selectedSuggestionIndex = Math.min(Math.max(index, 0), this.suggestions.length - 1);
    this.renderSuggestions();
  }
}

function getHeadingFromSubpath(subpath: string): string | null {
  const heading = subpath.replace(/^#+/, "").trim();
  return heading.length > 0 && !heading.startsWith("^") ? heading : null;
}

function stripLinkAlias(linkText: string): string {
  return linkText.split("|", 1)[0].trim();
}

function isMarkdownFile(file: unknown): file is TFile {
  return file instanceof TFile && file.extension === "md";
}

function stripMarkdownExtension(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -".md".length) : path;
}

function formatQuotedList(values: string[]): string {
  return values.map((value) => `"${value}"`).join(", ");
}

function formatSuggestionShortcut(index: number, _query: string): string {
  const number = `${index + 1}`;
  return Platform.isMacOS ? `⌘${number}` : `Ctrl+${number}`;
}

function fuzzyRank<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string | string[],
  limit: number,
): T[] {
  const normalizedQuery = normalizeFuzzyText(query);
  if (normalizedQuery.length === 0) {
    return items.slice(0, limit);
  }

  return items
    .map((item) => ({
      item,
      score: getBestFuzzyScore(normalizedQuery, getSearchText(item)),
    }))
    .filter((ranked): ranked is { item: T; score: number } => ranked.score !== null)
    .sort((a, b) => b.score - a.score || getFuzzySortText(getSearchText(a.item)).localeCompare(getFuzzySortText(getSearchText(b.item))))
    .slice(0, limit)
    .map((ranked) => ranked.item);
}

function getBestFuzzyScore(query: string, searchText: string | string[]): number | null {
  const values = Array.isArray(searchText) ? searchText : [searchText];
  let bestScore: number | null = null;

  for (const value of values) {
    const score = fuzzyScore(query, value);
    if (score !== null && (bestScore === null || score > bestScore)) {
      bestScore = score;
    }
  }

  return bestScore;
}

function fuzzyScore(normalizedQuery: string, candidate: string): number | null {
  const normalizedCandidate = normalizeFuzzyText(candidate);
  if (normalizedCandidate.length === 0) {
    return null;
  }

  if (normalizedCandidate === normalizedQuery) {
    return 1000 - normalizedCandidate.length;
  }

  if (normalizedCandidate.startsWith(normalizedQuery)) {
    return 900 - normalizedCandidate.length;
  }

  const wordStartIndex = normalizedCandidate
    .split(" ")
    .findIndex((word) => word.startsWith(normalizedQuery));
  if (wordStartIndex !== -1) {
    return 820 - wordStartIndex * 10 - normalizedCandidate.length;
  }

  const includesIndex = normalizedCandidate.indexOf(normalizedQuery);
  if (includesIndex !== -1) {
    return 720 - includesIndex - normalizedCandidate.length / 10;
  }

  const acronym = normalizedCandidate
    .split(" ")
    .filter((word) => word.length > 0)
    .map((word) => word[0])
    .join("");
  if (acronym.startsWith(normalizedQuery)) {
    return 680 - normalizedCandidate.length;
  }

  if (normalizedQuery.length < 3) {
    return null;
  }

  const positions = getSubsequencePositions(normalizedQuery, normalizedCandidate);
  if (positions === null) {
    return null;
  }

  const spread = positions[positions.length - 1] - positions[0];
  return 460 - spread * 2 - positions[0] - normalizedCandidate.length / 10;
}

function getSubsequencePositions(query: string, candidate: string): number[] | null {
  const positions: number[] = [];
  let candidateIndex = 0;

  for (const char of query) {
    const foundIndex = candidate.indexOf(char, candidateIndex);
    if (foundIndex === -1) {
      return null;
    }

    positions.push(foundIndex);
    candidateIndex = foundIndex + 1;
  }

  return positions;
}

function normalizeFuzzyText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getTagSuggestionSearchText(tag: string): string[] {
  const normalizedTag = tag.trim();
  if (normalizedTag.length === 0) {
    return [];
  }

  const tagWithoutHash = normalizedTag.startsWith("#") ? normalizedTag.slice(1) : normalizedTag;
  const parts = tagWithoutHash.split("/").filter((part) => part.length > 0);
  const searchTexts = new Set<string>();

  searchTexts.add(normalizedTag);
  searchTexts.add(tagWithoutHash);
  searchTexts.add(tagWithoutHash.replace("/", " "));
  searchTexts.add(parts.join(" "));
  for (let i = 0; i < parts.length; i += 1) {
    searchTexts.add(parts[i]);
  }

  return Array.from(searchTexts);
}

function getFuzzySortText(searchText: string | string[]): string {
  return Array.isArray(searchText) ? searchText[0] : searchText;
}

function getDateCompletionPhrases(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  const relativePhrases = getRelativeDateCompletionPhrases(normalized);
  const aliasPhrases = DATE_ALIAS_COMPLETIONS[normalized] === undefined ? [] : [DATE_ALIAS_COMPLETIONS[normalized]];
  const staticPhrases = fuzzyRank(DATE_COMPLETION_PHRASES, normalized, (phrase) => phrase, 8);
  const allPhrases = [...relativePhrases, ...aliasPhrases, ...staticPhrases];
  return Array.from(new Set(allPhrases)).slice(0, 8);
}

function getRecurrenceCompletionPhrases(query: string): string[] {
  const normalized = query.trim().toLowerCase();
  if (normalized.length === 0) {
    return [];
  }

  return fuzzyRank(RECURRENCE_COMPLETION_PHRASES, normalized, (phrase) => phrase, 8);
}

function getRelativeDateCompletionPhrases(query: string): string[] {
  const prefixedMatch = query.match(/^(in|within)\s+([a-z0-9]+)(?:\s*([a-z]*))?$/i);
  if (prefixedMatch !== null) {
    const prefix = prefixedMatch[1].toLowerCase();
    const amount = prefixedMatch[2].toLowerCase();
    const unitPrefix = (prefixedMatch[3] ?? "").toLowerCase();
    const phrases = getRelativeUnits(unitPrefix)
      .map((unit) => `${prefix} ${amount} ${unit}`);
    return fuzzyRank(phrases, query, (phrase) => phrase, 8);
  }

  const bareMatch = query.match(/^([0-9]+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s*([a-z]*))?$/i);
  if (bareMatch === null) {
    return [];
  }

  const amount = bareMatch[1].toLowerCase();
  const unitPrefix = (bareMatch[2] ?? "").toLowerCase();
  const phrases = getRelativeUnits(unitPrefix)
    .flatMap((unit) => [
      `${amount} ${unit}`,
      `${amount} ${unit} from now`,
      `${amount} ${unit} later`,
      `${amount} ${unit} ago`,
    ]);
  return fuzzyRank(phrases, query, (phrase) => phrase, 8);
}

function getRelativeUnits(query: string): string[] {
  return fuzzyRank(["days", "weeks", "months", "years"], query, (unit) => unit, 4);
}

function buildSummarySections(draft: ParsedTaskInput, rawInput: string): SummarySection {
  const title = rawInput.length > 0 ? rawInput : draft.title;
  const details: Array<{ label: string; value: string }> = [];

  const dueDate = draft.dates.due;

  if (dueDate) {
    details.push({ label: "Due", value: formatDetectedDateText(draft.dateTexts.due, dueDate) });
  }

  if (draft.recurrence !== null) {
    details.push({ label: "Recurrence", value: draft.recurrence.rule });
  }

  if (draft.priority !== null) {
    details.push({
      label: "Priority",
      value: `${draft.priority.label}${draft.priority.marker ? ` ${draft.priority.marker}` : ""}`,
    });
  }

  for (const link of draft.links) {
    details.push({ label: "File", value: link });
  }

  for (const tag of draft.tags) {
    details.push({ label: "Tag", value: tag });
  }

  if (draft.dates.scheduled) {
    details.push({ label: DATE_LABELS.scheduled, value: formatDetectedDateText(draft.dateTexts.scheduled, draft.dates.scheduled) });
  }

  if (draft.dates.start) {
    details.push({ label: DATE_LABELS.start, value: formatDetectedDateText(draft.dateTexts.start, draft.dates.start) });
  }

  const parsedTokens = {
    dateMatches: draft.dateMatches,
    recurrenceMatches: draft.recurrenceMatches,
    priorityMatches: draft.priorityMatches,
    links: draft.links,
    tags: draft.tags,
  };

  return { title, details, parsedTokens };
}

function getParsedTokenRanges(input: string, draftTokens: {
  dateMatches: Array<{ matchedText: string }>;
  recurrenceMatches: Array<{ matchedText: string }>;
  priorityMatches: Array<{ matchedText: string }>;
  links: string[];
  tags: string[];
}): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];
  const addRange = (range: { start: number; end: number } | null): void => {
    if (range === null) {
      return;
    }

    if (ranges.some((existing) => rangesOverlap(existing, range))) {
      return;
    }

    ranges.push(range);
  };

  for (const dateMatch of draftTokens.dateMatches) {
    addRange(findNonOverlappingTokenMatch(input, dateMatch.matchedText, ranges));
  }

  for (const recurrenceMatch of draftTokens.recurrenceMatches) {
    addRange(findNonOverlappingTokenMatch(input, recurrenceMatch.matchedText, ranges));
  }

  for (const priorityMatch of draftTokens.priorityMatches) {
    addRange(findNonOverlappingTokenMatch(input, priorityMatch.matchedText, ranges));
  }

  for (const link of parseLinkTargets(draftTokens.links)) {
    const linkRanges = findRawLinkMatches(input, link);
    for (const range of linkRanges) {
      addRange(range);
    }
  }

  const uniqueTags = Array.from(new Set(draftTokens.tags));
  for (const tag of uniqueTags) {
    addRange(findNonOverlappingTokenMatch(input, tag, ranges));
  }

  return ranges.sort((a, b) => a.start - b.start);
}

function findRawLinkMatches(input: string, linkText: string): Array<{ start: number; end: number }> {
  const matches: Array<{ start: number; end: number }> = [];
  const normalizedLink = normalizeLinkText(linkText);
  for (const match of input.matchAll(/\[\[([^\]\n]+)\]\]/g)) {
    const target = normalizeLinkText(match[1] ?? "");
    if (target.toLowerCase() !== normalizedLink.toLowerCase()) {
      continue;
    }

    const start = match.index ?? 0;
    const end = start + match[0].length;
    matches.push({ start, end });
  }

  return matches;
}

function parseLinkTargets(links: string[]): string[] {
  return links.map((link) => link.split("|")[0]?.trim() ?? "").filter((link) => link.length > 0);
}

function normalizeLinkText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function findNonOverlappingTokenMatch(
  input: string,
  token: string,
  ranges: Array<{ start: number; end: number }>,
): { start: number; end: number } | null {
  const normalizedToken = token.trim();
  if (normalizedToken.length === 0) {
    return null;
  }

  const lowerInput = input.toLowerCase();
  const lowerToken = normalizedToken.toLowerCase();
  let fromIndex = 0;

  while (fromIndex < lowerInput.length) {
    const index = lowerInput.indexOf(lowerToken, fromIndex);
    if (index === -1) {
      return null;
    }

    const candidate = { start: index, end: index + token.length };
    if (!ranges.some((existing) => rangesOverlap(existing, candidate))) {
      return candidate;
    }

    fromIndex = index + 1;
  }

  return null;
}

function rangesOverlap(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return Math.max(a.start, b.start) < Math.min(a.end, b.end);
}

function renderHighlightedInput(
  container: HTMLElement,
  rawInput: string,
  fallbackText: string,
  highlights: Array<{ start: number; end: number }>,
): void {
  const source = rawInput.length > 0 ? rawInput : fallbackText;
  if (highlights.length === 0) {
    container.appendText(source);
    return;
  }

  const ranges = highlights
    .filter((range) => range.start >= 0 && range.end >= range.start)
    .sort((a, b) => a.start - b.start);
  let position = 0;

  for (const range of ranges) {
    const safeStart = Math.max(0, Math.min(range.start, source.length));
    const safeEnd = Math.max(0, Math.min(range.end, source.length));

    if (safeStart > position) {
      container.appendText(source.slice(position, safeStart));
    }

    if (safeStart < safeEnd) {
      const strong = container.createEl("strong");
      strong.appendText(source.slice(safeStart, safeEnd));
      position = safeEnd;
    }
  }

  if (position < source.length) {
    container.appendText(source.slice(position));
  }
}

function isPriorityTriggerMatch(query: string): boolean {
  return query.length > 0 && PRIORITY_LEVELS.includes(query as PriorityLevel);
}

function formatDetectedDateText(dateText: string | undefined, date: string): string {
  if (!dateText) {
    return date;
  }

  return `${humanizeDateText(dateText)} (${date})`;
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

function validateDateValue(dateType: DateType, value: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${DATE_LABELS[dateType]} date must use YYYY-MM-DD.`);
  }

  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error(`${DATE_LABELS[dateType]} date is not a valid calendar date.`);
  }
}
