import { PluginSettingTab, Setting } from "obsidian";
import type TasksQuickAddPlugin from "../main.ts";
import {
  COMMAND_PRESET_DATE_MODES,
  DATE_TYPES,
  DEFAULT_SETTINGS,
  TASK_INSERT_POSITIONS,
  TASK_INSERT_TARGETS,
  TASK_LINE_TOKENS,
  createCommandPreset,
  formatTaskTokenOrder,
  normalizeTaskTokenOrder,
  type CommandPresetDateMode,
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

    const savingEl = this.createSettingsGroup(containerEl, "Saving a task");

    new Setting(savingEl)
      .setName("Task file path")
      .setDesc("The markdown file where new tasks are written.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.inboxPath)
        .setValue(this.plugin.settings.inboxPath)
        .onChange(async (value) => {
          this.plugin.settings.inboxPath = value.trim() || DEFAULT_SETTINGS.inboxPath;
          await this.plugin.saveSettings();
        }));

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
      new Setting(savingEl)
        .setName("Task heading")
        .setDesc("Heading under which tasks are inserted. Created at the top if missing.")
        .addText((text) => text
          .setPlaceholder(DEFAULT_SETTINGS.insertHeading)
          .setValue(this.plugin.settings.insertHeading)
          .onChange(async (value) => {
            this.plugin.settings.insertHeading = value.trim() || DEFAULT_SETTINGS.insertHeading;
            await this.plugin.saveSettings();
          }));
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
      .addText((text) => text
        .setPlaceholder("#inbox #task")
        .setValue(this.plugin.settings.defaultTags)
        .onChange(async (value) => {
          this.plugin.settings.defaultTags = value.trim();
          await this.plugin.saveSettings();
        }));

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

    this.renderCommandPresets(containerEl);
  }

  private createSettingsGroup(containerEl: HTMLElement, title: string): HTMLElement {
    const groupEl = containerEl.createDiv({ cls: "tasks-quick-add-settings-group" });
    groupEl.createEl("h3", { text: title });
    return groupEl;
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
      .addText((text) => text
        .setPlaceholder("#task/shopping")
        .setValue(preset.defaultTags)
        .onChange(async (value) => {
          preset.defaultTags = value.trim();
          summaryDescriptionEl.setText(this.describeCommandPreset(preset));
          await this.plugin.saveSettings();
        }));

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
      .addText((text) => text
        .setPlaceholder(this.plugin.settings.inboxPath || DEFAULT_SETTINGS.inboxPath)
        .setValue(preset.inboxPath ?? "")
        .onChange(async (value) => {
          preset.inboxPath = value.trim() || undefined;
          summaryDescriptionEl.setText(this.describeCommandPreset(preset));
          await this.plugin.saveSettings();
        }));

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

    new Setting(bodyEl)
      .setName("Task target heading")
      .setDesc("Heading for this command. If it does not exist in the target file, it is created at the top.")
      .addText((text) => text
        .setPlaceholder(this.plugin.settings.insertHeading || DEFAULT_SETTINGS.insertHeading)
        .setValue(preset.insertHeading ?? "")
        .onChange(async (value) => {
          preset.insertHeading = value.trim() || undefined;
          summaryDescriptionEl.setText(this.describeCommandPreset(preset));
          await this.plugin.saveSettings();
        }));

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
