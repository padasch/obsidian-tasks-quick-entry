import { Notice, Plugin, type ObsidianProtocolData } from "obsidian";
import { formatTasksMarkdown } from "./formatter/formatTasksMarkdown.ts";
import { parseTaskInput, type ParsedTaskInput, type ParseTaskInputOptions } from "./parser/parseTaskInput.ts";
import { getCommandPresetDateOptions } from "./presets/commandPresetDates.ts";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  type QuickAddCommandPreset,
  type QuickAddTasksSettings,
} from "./settings.ts";
import { QuickAddModal } from "./ui/QuickAddModal.ts";
import { TasksQuickAddSettingTab } from "./ui/SettingsTab.ts";
import { appendTaskToInbox, type TaskWriteTarget } from "./writer/taskWriter.ts";

export default class TasksQuickAddPlugin extends Plugin {
  settings: QuickAddTasksSettings = DEFAULT_SETTINGS;
  private presetCommandIds = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "new-task",
      name: "New task",
      callback: () => this.openQuickAddModal(),
    });

    this.registerObsidianProtocolHandler("tasks-quick-entry", (params) => {
      void this.handleProtocolRequest(params);
    });
    this.registerObsidianProtocolHandler("task-quick-add", (params) => {
      void this.handleProtocolRequest(params);
    });
    this.refreshPresetCommands();
    this.addRibbonIcon("plus-circle", "New task", () => this.openQuickAddModal());
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
        tagPlacement: this.settings.tagPlacement,
        priorityPlacement: this.settings.priorityPlacement,
      },
      preset?.name ?? "New task",
      async (draft, target) => {
        await this.addParsedTask(draft, target);
      },
    ).open();
  }

  async addTaskFromInput(input: string, preset: QuickAddCommandPreset | null = null): Promise<void> {
    const parsed = parseTaskInput(input, this.getParseOptions(preset));
    await this.addParsedTask(parsed);
  }

  async addParsedTask(parsed: ParsedTaskInput, target?: TaskWriteTarget | null): Promise<void> {
    const markdownLine = formatTasksMarkdown(parsed, {
      tagPlacement: this.settings.tagPlacement,
      priorityPlacement: this.settings.priorityPlacement,
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
}

function normalizePresetLookup(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}
