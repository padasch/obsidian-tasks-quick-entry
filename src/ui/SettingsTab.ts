import {
  AbstractInputSuggest,
  getAllTags,
  normalizePath,
  PluginSettingTab,
  prepareFuzzySearch,
  Setting,
  TFile,
  type App,
} from "obsidian";
import type TasksQuickAddPlugin from "../main.ts";
import {
  COMMAND_PRESET_DATE_MODES,
  DATE_TYPES,
  DETECTED_SUMMARY_LAYOUTS,
  DESCRIPTION_FIELD_LOCATIONS,
  MARKDOWN_OUTPUT_LOCATIONS,
  DEFAULT_SETTINGS,
  TASK_INSERT_POSITIONS,
  TASK_INSERT_TARGETS,
  TASK_LINE_TOKENS,
  createCommandPreset,
  formatTaskTokenOrder,
  normalizeTaskTokenOrder,
  type CommandPresetDateMode,
  type DetectedSummaryLayout,
  type DescriptionFieldLocation,
  type MarkdownOutputLocation,
  type QuickAddCommandPreset,
  type TaskInsertPosition,
  type TaskInsertTarget,
} from "../settings.ts";

export class TasksQuickAddSettingTab extends PluginSettingTab {
  plugin: TasksQuickAddPlugin;
  private openPresetIds = new Set<string>();

  constructor(plugin: TasksQuickAddPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    let updateSavingHeadingStatus: (() => void) | null = null;

    const savingEl = this.createSettingsGroup(containerEl, "Saving a task");

    new Setting(savingEl)
      .setName("Task file path")
      .setDesc("The markdown file where new tasks are written.")
      .addText((text) => {
        text
          .setPlaceholder(DEFAULT_SETTINGS.inboxPath)
          .setValue(this.plugin.settings.inboxPath)
          .onChange(async (value) => {
            this.plugin.settings.inboxPath = value.trim() || DEFAULT_SETTINGS.inboxPath;
            updateSavingHeadingStatus?.();
            await this.plugin.saveSettings();
          });
        this.attachFileSuggest(text.inputEl, async (value) => {
          this.plugin.settings.inboxPath = value.trim() || DEFAULT_SETTINGS.inboxPath;
          updateSavingHeadingStatus?.();
          await this.plugin.saveSettings();
        });
      });

    new Setting(savingEl)
      .setName("Create task file if missing")
      .setDesc("Create the task note and parent folders when they do not exist.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.createInboxFile)
        .onChange(async (value) => {
          this.plugin.settings.createInboxFile = value;
          await this.plugin.saveSettings();
        }));

    new Setting(savingEl)
      .setName("Task insert target")
      .setDesc("Insert into the whole file, or under a heading inside the file.")
      .addDropdown((dropdown) => {
        dropdown.addOption("file", "file");
        dropdown.addOption("heading", "heading");

        dropdown
          .setValue(this.plugin.settings.insertTarget)
          .onChange(async (value) => {
            if (TASK_INSERT_TARGETS.includes(value as TaskInsertTarget)) {
              this.plugin.settings.insertTarget = value as TaskInsertTarget;
              await this.plugin.saveSettings();
              this.display();
            }
          });
      });

    new Setting(savingEl)
      .setName("Task insert position")
      .setDesc("Whether new tasks are inserted at the first or last line of the selected target.")
      .addDropdown((dropdown) => {
        dropdown.addOption("first-line", "first line");
        dropdown.addOption("last-line", "last line");

        dropdown
          .setValue(this.plugin.settings.insertPosition)
          .onChange(async (value) => {
            if (TASK_INSERT_POSITIONS.includes(value as TaskInsertPosition)) {
              this.plugin.settings.insertPosition = value as TaskInsertPosition;
              await this.plugin.saveSettings();
            }
          });
      });

    if (this.plugin.settings.insertTarget === "heading") {
      const headingSetting = new Setting(savingEl)
        .setName("Task heading")
        .setDesc("Heading under which tasks are inserted. Created at the top if missing.")
        .addText((text) => {
          text
            .setPlaceholder(DEFAULT_SETTINGS.insertHeading)
            .setValue(this.plugin.settings.insertHeading)
            .onChange(async (value) => {
              this.plugin.settings.insertHeading = value.trim() || DEFAULT_SETTINGS.insertHeading;
              updateSavingHeadingStatus?.();
              await this.plugin.saveSettings();
            });
          this.attachHeadingSuggest(text.inputEl, () => this.plugin.settings.inboxPath, async (value) => {
            this.plugin.settings.insertHeading = value.trim() || DEFAULT_SETTINGS.insertHeading;
            updateSavingHeadingStatus?.();
            await this.plugin.saveSettings();
          });
        });
      updateSavingHeadingStatus = this.attachHeadingStatus(
        headingSetting,
        () => this.plugin.settings.inboxPath,
        () => this.plugin.settings.insertHeading,
      );
    }

    const defaultsEl = this.createSettingsGroup(containerEl, "Defaults");

    new Setting(defaultsEl)
      .setName("Default date type")
      .setDesc("Which Tasks date marker to use when natural-language input contains a date.")
      .addDropdown((dropdown) => {
        for (const dateType of DATE_TYPES) {
          dropdown.addOption(dateType, dateType);
        }

        dropdown
          .setValue(this.plugin.settings.defaultDateType)
          .onChange(async (value) => {
            if (DATE_TYPES.includes(value as typeof DATE_TYPES[number])) {
              this.plugin.settings.defaultDateType = value as typeof DATE_TYPES[number];
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(defaultsEl)
      .setName("Default tags")
      .setDesc("Optional tags to append to every created task, separated by spaces or commas.")
      .addText((text) => {
        text
          .setPlaceholder("#inbox #task")
          .setValue(this.plugin.settings.defaultTags)
          .onChange(async (value) => {
            this.plugin.settings.defaultTags = value.trim();
            await this.plugin.saveSettings();
          });
        this.attachTagSuggest(text.inputEl, async (value) => {
          this.plugin.settings.defaultTags = value.trim();
          await this.plugin.saveSettings();
        });
      });

    const parsingEl = this.createSettingsGroup(containerEl, "Parsing");

    new Setting(parsingEl)
      .setName("Remove parsed date text")
      .setDesc("Remove phrases like tomorrow or next Friday from the visible task text.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.removeParsedDateText)
        .onChange(async (value) => {
          this.plugin.settings.removeParsedDateText = value;
          await this.plugin.saveSettings();
        }));

    new Setting(parsingEl)
      .setName("Task line order")
      .setDesc(`Controls final Markdown order. Use each token once: ${TASK_LINE_TOKENS.join(", ")}. Aliases like tag, date, note, and prio are accepted.`)
      .addText((text) => text
        .setPlaceholder(formatTaskTokenOrder(DEFAULT_SETTINGS.taskTokenOrder))
        .setValue(formatTaskTokenOrder(this.plugin.settings.taskTokenOrder))
        .onChange(async (value) => {
          this.plugin.settings.taskTokenOrder = normalizeTaskTokenOrder(value);
          await this.plugin.saveSettings();
        }));

    new Setting(parsingEl)
      .setName("Completion trigger length")
      .setDesc("Minimum characters required before completion popups appear for date, priority, and recurrence.")
      .addText((text) => text
        .setPlaceholder(String(DEFAULT_SETTINGS.completionTriggerLength))
        .setValue(String(this.plugin.settings.completionTriggerLength))
        .onChange(async (value) => {
          const parsed = Number.parseInt(value, 10);
          const clamped = Number.isNaN(parsed)
            ? DEFAULT_SETTINGS.completionTriggerLength
            : Math.min(10, Math.max(1, parsed));
          this.plugin.settings.completionTriggerLength = clamped;
          text.setValue(String(clamped));
          await this.plugin.saveSettings();
        }));

    new Setting(parsingEl)
      .setName("Detected summary layout")
      .setDesc("Choose how detected metadata is shown in the modal preview.")
      .addDropdown((dropdown) => {
        for (const layout of DETECTED_SUMMARY_LAYOUTS) {
          dropdown.addOption(layout, layout === "chips" ? "Chips" : "Rows");
        }

        dropdown
          .setValue(this.plugin.settings.detectedSummaryLayout)
          .onChange(async (value) => {
            if (DETECTED_SUMMARY_LAYOUTS.includes(value as DetectedSummaryLayout)) {
              this.plugin.settings.detectedSummaryLayout = value as DetectedSummaryLayout;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(parsingEl)
      .setName("Markdown preview location")
      .setDesc("Choose where to show the generated task Markdown preview.")
      .addDropdown((dropdown) => {
        dropdown.addOption("result-area", "Result area");
        dropdown.addOption("edit-section", "Edit section");

        dropdown
          .setValue(this.plugin.settings.markdownOutputLocation)
          .onChange(async (value) => {
            if (MARKDOWN_OUTPUT_LOCATIONS.includes(value as MarkdownOutputLocation)) {
              this.plugin.settings.markdownOutputLocation = value as MarkdownOutputLocation;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(parsingEl)
      .setName("Description field location")
      .setDesc("Choose whether the optional description field is shown below the task entry or inside Edit Task.")
      .addDropdown((dropdown) => {
        dropdown.addOption("entry-area", "Below task entry");
        dropdown.addOption("edit-section", "Edit Task section");

        dropdown
          .setValue(this.plugin.settings.descriptionFieldLocation)
          .onChange(async (value) => {
            if (DESCRIPTION_FIELD_LOCATIONS.includes(value as DescriptionFieldLocation)) {
              this.plugin.settings.descriptionFieldLocation = value as DescriptionFieldLocation;
              await this.plugin.saveSettings();
            }
          });
      });

    this.renderCommandPresets(containerEl);
  }

  private createSettingsGroup(containerEl: HTMLElement, title: string): HTMLElement {
    const groupEl = containerEl.createDiv({ cls: "tasks-quick-add-settings-group" });
    groupEl.createEl("h3", { text: title });
    return groupEl;
  }

  private attachTagSuggest(inputEl: HTMLInputElement, onSelect: SuggestSelectHandler): void {
    new TagInputSuggest(this.plugin.app, inputEl, onSelect);
  }

  private attachFileSuggest(inputEl: HTMLInputElement, onSelect: SuggestSelectHandler): void {
    new MarkdownFileInputSuggest(this.plugin.app, inputEl, onSelect);
  }

  private attachHeadingSuggest(
    inputEl: HTMLInputElement,
    getFilePath: () => string,
    onSelect: SuggestSelectHandler,
  ): void {
    new HeadingInputSuggest(this.plugin.app, inputEl, getFilePath, onSelect);
  }

  private attachHeadingStatus(
    setting: Setting,
    getFilePath: () => string,
    getHeading: () => string,
  ): () => void {
    const statusEl = setting.descEl.createDiv({ cls: "tasks-quick-add-settings-heading-status" });
    const update = (): void => {
      const filePath = getFilePath().trim();
      const heading = getHeading().trim();
      const file = resolveMarkdownFile(this.plugin.app, filePath);

      statusEl.removeClass("is-success");
      statusEl.removeClass("is-warning");
      statusEl.removeClass("is-muted");

      if (heading.length === 0) {
        statusEl.setText("Enter a heading to check whether it already exists.");
        statusEl.addClass("is-muted");
        return;
      }

      if (file === null) {
        statusEl.setText(`Target file not found: ${filePath || "global task file"}. The heading will be created with the file.`);
        statusEl.addClass("is-warning");
        return;
      }

      if (getHeadingNames(this.plugin.app, file).some((candidate) => candidate.toLowerCase() === heading.toLowerCase())) {
        statusEl.setText(`Heading exists in ${file.path}.`);
        statusEl.addClass("is-success");
        return;
      }

      statusEl.setText(`Heading not found in ${file.path}. It will be created at the top when needed.`);
      statusEl.addClass("is-warning");
    };

    update();
    return update;
  }

  private renderCommandPresets(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Command presets" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Each preset adds another command palette command with optional automatic date, tags, and task target.",
    });

    for (const [index, preset] of this.plugin.settings.commandPresets.entries()) {
      this.renderCommandPreset(containerEl, preset, index);
    }

    new Setting(containerEl)
      .setName("Add command preset")
      .setDesc("Create another task entry command type.")
      .addButton((button) => button
        .setButtonText("Add preset")
        .onClick(async () => {
          const preset = createCommandPreset();
          this.plugin.settings.commandPresets.push(preset);
          this.openPresetIds.add(preset.id);
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  private renderCommandPreset(containerEl: HTMLElement, preset: QuickAddCommandPreset, index: number): void {
    const presetEl = containerEl.createEl("details", {
      cls: "tasks-quick-add-settings-command-preset",
    }) as HTMLDetailsElement;
    presetEl.open = this.openPresetIds.has(preset.id);
    presetEl.addEventListener("toggle", () => {
      if (presetEl.open) {
        this.openPresetIds.add(preset.id);
      } else {
        this.openPresetIds.delete(preset.id);
      }
    });

    const summaryEl = presetEl.createEl("summary", {
      cls: "tasks-quick-add-settings-command-preset-summary",
    });
    const summaryContentEl = summaryEl.createSpan({
      cls: "tasks-quick-add-settings-command-preset-summary-content",
    });
    const summaryTitleEl = summaryContentEl.createSpan({
      cls: "tasks-quick-add-settings-command-preset-title",
      text: preset.name,
    });
    const summaryDescriptionEl = summaryContentEl.createSpan({
      cls: "tasks-quick-add-settings-command-preset-description",
      text: this.describeCommandPreset(preset),
    });
    const bodyEl = presetEl.createDiv({ cls: "tasks-quick-add-settings-command-preset-body" });
    let updatePresetHeadingStatus: (() => void) | null = null;

    new Setting(bodyEl)
      .setName("Command name")
      .setDesc("Name shown in the Obsidian command palette.")
      .addText((text) => text
        .setValue(preset.name)
        .onChange(async (value) => {
          preset.name = value.trim() || `Task command ${index + 1}`;
          summaryTitleEl.setText(preset.name);
          summaryDescriptionEl.setText(this.describeCommandPreset(preset));
          await this.plugin.saveSettings();
        }));

    new Setting(bodyEl)
      .setName("Automatic date")
      .setDesc("Optional date applied when this command opens the task entry modal.")
      .addDropdown((dropdown) => {
        dropdown.addOption("none", "none");
        dropdown.addOption("today", "today");
        dropdown.addOption("tomorrow", "tomorrow");
        dropdown.addOption("next-week", "next week");
        dropdown.addOption("weekend", "weekend");

        dropdown
          .setValue(preset.dateMode)
          .onChange(async (value) => {
            if (COMMAND_PRESET_DATE_MODES.includes(value as CommandPresetDateMode)) {
              preset.dateMode = value as CommandPresetDateMode;
              await this.plugin.saveSettings();
              this.display();
            }
          });
      });

    if (preset.dateMode !== "none") {
      new Setting(bodyEl)
        .setName("Automatic date type")
        .setDesc("Which Tasks date marker receives the automatic date.")
        .addDropdown((dropdown) => {
          for (const dateType of DATE_TYPES) {
            dropdown.addOption(dateType, dateType);
          }

          dropdown
            .setValue(preset.dateType)
            .onChange(async (value) => {
              if (DATE_TYPES.includes(value as typeof DATE_TYPES[number])) {
                preset.dateType = value as typeof DATE_TYPES[number];
                summaryDescriptionEl.setText(this.describeCommandPreset(preset));
                await this.plugin.saveSettings();
              }
            });
        });
    }

    new Setting(bodyEl)
      .setName("Preset tags")
      .setDesc("Tags added by this command, separated by spaces or commas.")
      .addText((text) => {
        text
          .setPlaceholder("#task/shopping")
          .setValue(preset.defaultTags)
          .onChange(async (value) => {
            preset.defaultTags = value.trim();
            summaryDescriptionEl.setText(this.describeCommandPreset(preset));
            await this.plugin.saveSettings();
          });
        this.attachTagSuggest(text.inputEl, async (value) => {
          preset.defaultTags = value.trim();
          summaryDescriptionEl.setText(this.describeCommandPreset(preset));
          await this.plugin.saveSettings();
        });
      });

    bodyEl.createEl("h4", {
      cls: "tasks-quick-add-settings-command-preset-section",
      text: "Task target",
    });
    bodyEl.createEl("p", {
      cls: "setting-item-description tasks-quick-add-settings-command-preset-section-description",
      text: "Choose where tasks created by this command are saved. A file link typed in the task input can still override this target.",
    });

    new Setting(bodyEl)
      .setName("Task target file")
      .setDesc("Markdown file where this command writes tasks. Leave empty to use the global task file.")
      .addText((text) => {
        text
          .setPlaceholder(this.plugin.settings.inboxPath || DEFAULT_SETTINGS.inboxPath)
          .setValue(preset.inboxPath ?? "")
          .onChange(async (value) => {
            preset.inboxPath = value.trim() || undefined;
            summaryDescriptionEl.setText(this.describeCommandPreset(preset));
            updatePresetHeadingStatus?.();
            await this.plugin.saveSettings();
          });
        this.attachFileSuggest(text.inputEl, async (value) => {
          preset.inboxPath = value.trim() || undefined;
          summaryDescriptionEl.setText(this.describeCommandPreset(preset));
          updatePresetHeadingStatus?.();
          await this.plugin.saveSettings();
        });
      });

    new Setting(bodyEl)
      .setName("Task target position")
      .setDesc("Where tasks are inserted in the selected file or heading.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "use global");
        dropdown.addOption("first-line", "first line");
        dropdown.addOption("last-line", "last line");

        dropdown
          .setValue(preset.insertPosition ?? "")
          .onChange(async (value) => {
            preset.insertPosition = TASK_INSERT_POSITIONS.includes(value as TaskInsertPosition)
              ? value as TaskInsertPosition
              : undefined;
            summaryDescriptionEl.setText(this.describeCommandPreset(preset));
            await this.plugin.saveSettings();
          });
      });

    new Setting(bodyEl)
      .setName("Task target scope")
      .setDesc("Write to the whole file or under a specific heading.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "use global");
        dropdown.addOption("file", "file");
        dropdown.addOption("heading", "heading");

        dropdown
          .setValue(preset.insertTarget ?? "")
          .onChange(async (value) => {
            preset.insertTarget = TASK_INSERT_TARGETS.includes(value as TaskInsertTarget)
              ? value as TaskInsertTarget
              : undefined;
            await this.plugin.saveSettings();
            this.display();
          });
      });

    const presetHeadingSetting = new Setting(bodyEl)
      .setName("Task target heading")
      .setDesc("Heading for this command. If it does not exist in the target file, it is created at the top.")
      .addText((text) => {
        text
          .setPlaceholder(this.plugin.settings.insertHeading || DEFAULT_SETTINGS.insertHeading)
          .setValue(preset.insertHeading ?? "")
          .onChange(async (value) => {
            preset.insertHeading = value.trim() || undefined;
            summaryDescriptionEl.setText(this.describeCommandPreset(preset));
            updatePresetHeadingStatus?.();
            await this.plugin.saveSettings();
          });
        this.attachHeadingSuggest(
          text.inputEl,
          () => preset.inboxPath?.trim() || this.plugin.settings.inboxPath,
          async (value) => {
            preset.insertHeading = value.trim() || undefined;
            summaryDescriptionEl.setText(this.describeCommandPreset(preset));
            updatePresetHeadingStatus?.();
            await this.plugin.saveSettings();
          },
        );
      });
    updatePresetHeadingStatus = this.attachHeadingStatus(
      presetHeadingSetting,
      () => preset.inboxPath?.trim() || this.plugin.settings.inboxPath,
      () => preset.insertHeading?.trim() || "",
    );

    new Setting(bodyEl)
      .setName("Remove preset")
      .setDesc("Delete this extra command type.")
      .addButton((button) => button
        .setWarning()
        .setButtonText("Remove")
        .onClick(async () => {
          this.plugin.settings.commandPresets.splice(index, 1);
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  private describeCommandPreset(preset: QuickAddCommandPreset): string {
    const parts: string[] = [];

    if (preset.dateMode !== "none") {
      parts.push(`${this.formatDateMode(preset.dateMode)} ${preset.dateType}`);
    }

    if (preset.defaultTags.trim().length > 0) {
      parts.push(preset.defaultTags.trim());
    }

    parts.push(this.describePresetTarget(preset));

    return parts.join(" - ");
  }

  private describePresetTarget(preset: QuickAddCommandPreset): string {
    const targetParts = [preset.inboxPath?.trim() || "global task file"];
    const heading = preset.insertHeading?.trim();

    if (preset.insertTarget === "heading" || heading) {
      targetParts.push(heading ? `# ${heading}` : "heading");
    } else if (preset.insertTarget === "file") {
      targetParts.push("file");
    }

    if (preset.insertPosition) {
      targetParts.push(preset.insertPosition === "first-line" ? "first line" : "last line");
    }

    return `Target: ${targetParts.join(" / ")}`;
  }

  private formatDateMode(dateMode: CommandPresetDateMode): string {
    switch (dateMode) {
      case "today":
        return "today";
      case "tomorrow":
        return "tomorrow";
      case "next-week":
        return "next week";
      case "weekend":
        return "weekend";
      case "none":
        return "no date";
    }
  }
}

type SuggestSelectHandler = (value: string) => void | Promise<void>;

interface FileSuggestion {
  path: string;
  display: string;
}

class TagInputSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    private readonly inputEl: HTMLInputElement,
    private readonly onValueSelected: SuggestSelectHandler,
  ) {
    super(app, inputEl);
    this.limit = 30;
  }

  protected getSuggestions(): string[] {
    const query = getCurrentToken(this.inputEl).token.replace(/^#/, "");
    return fuzzySort(getExistingTags(this.app), query, (tag) => tag.replace(/^#/, ""));
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.createEl("div", { text: value });
  }

  selectSuggestion(value: string): void {
    const nextValue = replaceCurrentToken(this.inputEl, value, " ");
    this.setValue(nextValue);
    void this.onValueSelected(nextValue);
    this.close();
  }
}

class MarkdownFileInputSuggest extends AbstractInputSuggest<FileSuggestion> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly onValueSelected: SuggestSelectHandler,
  ) {
    super(app, inputEl);
    this.limit = 30;
  }

  protected getSuggestions(query: string): FileSuggestion[] {
    const files = this.app.vault.getMarkdownFiles().map((file) => ({
      path: file.path,
      display: this.app.metadataCache.fileToLinktext(file, "", true),
    }));

    return fuzzySort(files, query, (file) => `${file.display} ${file.path}`);
  }

  renderSuggestion(value: FileSuggestion, el: HTMLElement): void {
    el.createEl("div", { text: value.display });
    el.createEl("small", { text: value.path });
  }

  selectSuggestion(value: FileSuggestion): void {
    this.setValue(value.path);
    void this.onValueSelected(value.path);
    this.close();
  }
}

class HeadingInputSuggest extends AbstractInputSuggest<string> {
  constructor(
    app: App,
    inputEl: HTMLInputElement,
    private readonly getFilePath: () => string,
    private readonly onValueSelected: SuggestSelectHandler,
  ) {
    super(app, inputEl);
    this.limit = 30;
  }

  protected getSuggestions(query: string): string[] {
    const file = resolveMarkdownFile(this.app, this.getFilePath());
    if (file === null) {
      return [];
    }

    return fuzzySort(getHeadingNames(this.app, file), query, (heading) => heading);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.createEl("div", { text: value });
  }

  selectSuggestion(value: string): void {
    this.setValue(value);
    void this.onValueSelected(value);
    this.close();
  }
}

function getExistingTags(app: App): string[] {
  const tags = new Set<string>();

  for (const file of app.vault.getMarkdownFiles()) {
    const cache = app.metadataCache.getFileCache(file);
    if (cache === null) {
      continue;
    }

    for (const tag of getAllTags(cache) ?? []) {
      tags.add(tag);
    }
  }

  return Array.from(tags).sort((a, b) => a.localeCompare(b));
}

function resolveMarkdownFile(app: App, filePath: string): TFile | null {
  const normalized = normalizePath(filePath.trim());
  if (normalized.length === 0) {
    return null;
  }

  const direct = app.vault.getAbstractFileByPath(normalized);
  if (direct instanceof TFile && direct.extension === "md") {
    return direct;
  }

  const withExtension = normalized.endsWith(".md") ? normalized : `${normalized}.md`;
  const withExtensionFile = app.vault.getAbstractFileByPath(withExtension);
  if (withExtensionFile instanceof TFile && withExtensionFile.extension === "md") {
    return withExtensionFile;
  }

  const lowered = withoutMarkdownExtension(normalized).toLowerCase();
  return app.vault.getMarkdownFiles().find((file) => {
    return withoutMarkdownExtension(file.path).toLowerCase() === lowered
      || file.basename.toLowerCase() === lowered;
  }) ?? null;
}

function getHeadingNames(app: App, file: TFile): string[] {
  const headings = app.metadataCache.getFileCache(file)?.headings ?? [];
  const seen = new Set<string>();
  const names: string[] = [];

  for (const heading of headings) {
    const name = heading.heading.trim();
    const key = name.toLowerCase();
    if (name.length === 0 || seen.has(key)) {
      continue;
    }

    seen.add(key);
    names.push(name);
  }

  return names;
}

function fuzzySort<T>(items: T[], query: string, getText: (item: T) => string): T[] {
  const normalizedQuery = query.trim().replace(/^#/, "");
  if (normalizedQuery.length === 0) {
    return items.slice(0, 30);
  }

  const search = prepareFuzzySearch(normalizedQuery);
  return items
    .map((item) => ({ item, match: search(getText(item)) }))
    .filter((entry): entry is { item: T; match: NonNullable<typeof entry.match> } => entry.match !== null)
    .sort((a, b) => b.match.score - a.match.score)
    .map((entry) => entry.item)
    .slice(0, 30);
}

function getCurrentToken(inputEl: HTMLInputElement): { start: number; end: number; token: string } {
  const value = inputEl.value;
  const cursor = inputEl.selectionStart ?? value.length;
  let start = cursor;
  let end = cursor;

  while (start > 0 && !/[\s,]/.test(value[start - 1] ?? "")) {
    start -= 1;
  }

  while (end < value.length && !/[\s,]/.test(value[end] ?? "")) {
    end += 1;
  }

  return { start, end, token: value.slice(start, end) };
}

function replaceCurrentToken(inputEl: HTMLInputElement, replacement: string, suffix: string): string {
  const { start, end } = getCurrentToken(inputEl);
  const value = inputEl.value;
  const prefix = value.slice(0, start);
  const rest = value.slice(end).replace(/^\s*/, "");
  const nextValue = `${prefix}${replacement}${suffix}${rest}`.trimStart();
  const cursor = Math.min(prefix.length + replacement.length + suffix.length, nextValue.length);

  window.requestAnimationFrame(() => {
    inputEl.setSelectionRange(cursor, cursor);
  });

  return nextValue;
}

function withoutMarkdownExtension(path: string): string {
  return path.endsWith(".md") ? path.slice(0, -3) : path;
}
