import { Notice, Plugin, TFile, type ObsidianProtocolData, type TAbstractFile } from "obsidian";
import { formatTasksMarkdown } from "./formatter/formatTasksMarkdown.ts";
import { parseTaskInput, type ParsedTaskInput, type ParseTaskInputOptions } from "./parser/parseTaskInput.ts";
import { getCommandPresetDateOptions } from "./presets/commandPresetDates.ts";
import { TaskSearchIndex } from "./search/TaskSearchIndex.ts";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type QuickAddCommandPreset,
  type QuickAddTasksSettings,
} from "./settings.ts";
import { QuickAddModal } from "./ui/QuickAddModal.ts";
import { TasksQuickAddSettingTab } from "./ui/SettingsTab.ts";
import { TaskSearchModal } from "./ui/TaskSearchModal.ts";
import { appendTaskToInbox, type TaskWriteTarget } from "./writer/taskWriter.ts";

export default class TasksQuickAddPlugin extends Plugin {
  settings: QuickAddTasksSettings = DEFAULT_SETTINGS;
  private presetCommandIds = new Set<string>();
  private taskSearchIndex!: TaskSearchIndex;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.taskSearchIndex = new TaskSearchIndex(this.app);
    void this.taskSearchIndex.build();
    this.registerTaskSearchEvents();

    this.addCommand({
      id: "new-task",
      name: "New task",
      callback: () => this.openQuickAddModal(),
    });
    this.addCommand({
      id: "find-task",
      name: "Find task",
      callback: () => this.openTaskSearchModal(),
    });

    this.registerObsidianProtocolHandler("tasks-quick-entry", (params) => {
      void this.handleProtocolRequest(params);
    });
    this.registerObsidianProtocolHandler("task-quick-add", (params) => {
      void this.handleProtocolRequest(params);
    });
    this.refreshPresetCommands();
    this.addRibbonIcon("plus-circle", "New task", () => this.openQuickAddModal());
    this.addRibbonIcon("search", "Find task", () => this.openTaskSearchModal());
    this.addSettingTab(new TasksQuickAddSettingTab(this));
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.refreshPresetCommands();
  }

  openQuickAddModal(preset: QuickAddCommandPreset | null = null): void {
    new QuickAddModal(
      this.app,
      this.getParseOptions(preset),
      {
        taskTokenOrder: this.settings.taskTokenOrder,
      },
      preset?.name ?? "New task",
      this.settings.completionTriggerLength,
      this.settings.detectedSummaryLayout,
      this.settings.markdownOutputLocation,
      this.settings.descriptionFieldLocation,
      async (draft, target) => {
        await this.addParsedTask(draft, target ?? this.getPresetWriteTarget(preset));
      },
    ).open();
  }

  openTaskSearchModal(): void {
    new TaskSearchModal(this.app, this.taskSearchIndex).open();
  }

  async addTaskFromInput(input: string, preset: QuickAddCommandPreset | null = null): Promise<void> {
    const parsed = parseTaskInput(input, this.getParseOptions(preset));
    await this.addParsedTask(parsed, this.getPresetWriteTarget(preset));
  }

  async addParsedTask(parsed: ParsedTaskInput, target?: TaskWriteTarget | null): Promise<void> {
    const markdownLine = formatTasksMarkdown(parsed, {
      taskTokenOrder: this.settings.taskTokenOrder,
    });
    const inboxPath = await appendTaskToInbox(this.app, this.settings, markdownLine, target);
    new Notice(`Added task to ${inboxPath}`);
  }

  private async handleProtocolRequest(params: ObsidianProtocolData): Promise<void> {
    const preset = this.findPreset(this.getProtocolString(params, "preset"));
    const input = this.getProtocolString(params, "text")
      ?? this.getProtocolString(params, "task")
      ?? this.getProtocolString(params, "input");

    try {
      if (input && input.trim().length > 0) {
        await this.addTaskFromInput(input, preset);
        return;
      }

      this.openQuickAddModal(preset);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : "Could not handle task entry URL.");
    }
  }

  private refreshPresetCommands(): void {
    for (const commandId of this.presetCommandIds) {
      this.removeCommand(commandId);
    }

    this.presetCommandIds = new Set();

    for (const preset of this.settings.commandPresets) {
      const commandId = `task-entry-preset-${preset.id}`;
      this.addCommand({
        id: commandId,
        name: preset.name,
        callback: () => this.openQuickAddModal(preset),
      });
      this.presetCommandIds.add(commandId);
    }
  }

  private getParseOptions(preset: QuickAddCommandPreset | null): ParseTaskInputOptions {
    const presetDateOptions = getCommandPresetDateOptions(preset);
    const defaultTags = [this.settings.defaultTags, preset?.defaultTags ?? ""]
      .map((tags) => tags.trim())
      .filter((tags) => tags.length > 0)
      .join(" ");

    return {
      defaultDateType: this.settings.defaultDateType,
      removeParsedDateText: this.settings.removeParsedDateText,
      defaultTags,
      ...presetDateOptions,
    };
  }

  private getPresetWriteTarget(preset: QuickAddCommandPreset | null): TaskWriteTarget | null {
    if (preset === null) {
      return null;
    }

    const hasTargetOverride = Boolean(
      preset.inboxPath
      || preset.insertPosition
      || preset.insertTarget
      || preset.insertHeading,
    );
    if (!hasTargetOverride) {
      return null;
    }

    const presetHeading = preset.insertHeading?.trim();
    return {
      filePath: preset.inboxPath?.trim() || this.settings.inboxPath,
      insertPosition: preset.insertPosition ?? this.settings.insertPosition,
      insertTarget: preset.insertTarget ?? (presetHeading ? "heading" : this.settings.insertTarget),
      insertHeading: presetHeading || this.settings.insertHeading,
      createInboxFile: this.settings.createInboxFile,
    };
  }

  private findPreset(value: string | undefined): QuickAddCommandPreset | null {
    if (!value) {
      return null;
    }

    const normalized = normalizePresetLookup(value);
    return this.settings.commandPresets.find((preset) => {
      return normalizePresetLookup(preset.id) === normalized
        || normalizePresetLookup(preset.name) === normalized;
    }) ?? null;
  }

  private getProtocolString(params: ObsidianProtocolData, key: string): string | undefined {
    const value = params[key];
    return typeof value === "string" && value !== "true" ? value : undefined;
  }

  private registerTaskSearchEvents(): void {
    this.registerEvent(this.app.vault.on("create", (file) => this.queueTaskSearchRefresh(file)));
    this.registerEvent(this.app.vault.on("modify", (file) => this.queueTaskSearchRefresh(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => this.taskSearchIndex.removeFile(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      this.taskSearchIndex.removeFile(oldPath);
      this.queueTaskSearchRefresh(file);
    }));
  }

  private queueTaskSearchRefresh(file: TAbstractFile): void {
    if (file instanceof TFile) {
      this.taskSearchIndex.queueRefresh(file);
    }
  }
}

function normalizePresetLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
