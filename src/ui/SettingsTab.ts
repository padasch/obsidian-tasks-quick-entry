import { PluginSettingTab, Setting } from "obsidian";
import type TasksQuickAddPlugin from "../main.ts";
import {
  COMMAND_PRESET_DATE_MODES,
  DATE_TYPES,
  DEFAULT_SETTINGS,
  METADATA_PLACEMENTS,
  TASK_INSERT_POSITIONS,
  TASK_INSERT_TARGETS,
  createCommandPreset,
  type CommandPresetDateMode,
  type MetadataPlacement,
  type QuickAddCommandPreset,
  type TaskInsertPosition,
  type TaskInsertTarget,
} from "../settings.ts";

export class TasksQuickAddSettingTab extends PluginSettingTab {
  plugin: TasksQuickAddPlugin;

  constructor(plugin: TasksQuickAddPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Task file path")
      .setDesc("The markdown file where new tasks are written.")
      .addText((text) => text
        .setPlaceholder(DEFAULT_SETTINGS.inboxPath)
        .setValue(this.plugin.settings.inboxPath)
        .onChange(async (value) => {
          this.plugin.settings.inboxPath = value.trim() || DEFAULT_SETTINGS.inboxPath;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Remove parsed date text")
      .setDesc("Remove phrases like tomorrow or next Friday from the visible task title.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.removeParsedDateText)
        .onChange(async (value) => {
          this.plugin.settings.removeParsedDateText = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Create task file if missing")
      .setDesc("Create the task note and parent folders when they do not exist.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.createInboxFile)
        .onChange(async (value) => {
          this.plugin.settings.createInboxFile = value;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
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

    new Setting(containerEl)
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

    if (this.plugin.settings.insertTarget === "heading") {
      new Setting(containerEl)
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

    new Setting(containerEl)
      .setName("Default tags")
      .setDesc("Optional tags to append to every created task, separated by spaces or commas.")
      .addText((text) => text
        .setPlaceholder("#inbox #task")
        .setValue(this.plugin.settings.defaultTags)
        .onChange(async (value) => {
          this.plugin.settings.defaultTags = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName("Tag placement")
      .setDesc("Where tags should be written in the final task line.")
      .addDropdown((dropdown) => {
        for (const placement of METADATA_PLACEMENTS) {
          dropdown.addOption(placement, placement);
        }

        dropdown
          .setValue(this.plugin.settings.tagPlacement)
          .onChange(async (value) => {
            if (METADATA_PLACEMENTS.includes(value as MetadataPlacement)) {
              this.plugin.settings.tagPlacement = value as MetadataPlacement;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl)
      .setName("Priority placement")
      .setDesc("Where priority markers should be written in the final task line.")
      .addDropdown((dropdown) => {
        for (const placement of METADATA_PLACEMENTS) {
          dropdown.addOption(placement, placement);
        }

        dropdown
          .setValue(this.plugin.settings.priorityPlacement)
          .onChange(async (value) => {
            if (METADATA_PLACEMENTS.includes(value as MetadataPlacement)) {
              this.plugin.settings.priorityPlacement = value as MetadataPlacement;
              await this.plugin.saveSettings();
            }
          });
      });

    this.renderCommandPresets(containerEl);
  }

  private renderCommandPresets(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Command presets" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "Each preset adds another command palette command with optional automatic date and tags.",
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
          this.plugin.settings.commandPresets.push(createCommandPreset());
          await this.plugin.saveSettings();
          this.display();
        }));
  }

  private renderCommandPreset(containerEl: HTMLElement, preset: QuickAddCommandPreset, index: number): void {
    const presetEl = containerEl.createDiv({ cls: "tasks-quick-add-settings-command-preset" });
    presetEl.createEl("strong", { text: preset.name });

    new Setting(presetEl)
      .setName("Command name")
      .setDesc("Name shown in the Obsidian command palette.")
      .addText((text) => text
        .setValue(preset.name)
        .onChange(async (value) => {
          preset.name = value.trim() || `Task command ${index + 1}`;
          await this.plugin.saveSettings();
        }));

    new Setting(presetEl)
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
      new Setting(presetEl)
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
                await this.plugin.saveSettings();
              }
            });
        });
    }

    new Setting(presetEl)
      .setName("Preset tags")
      .setDesc("Tags added by this command, separated by spaces or commas.")
      .addText((text) => text
        .setPlaceholder("#task/shopping")
        .setValue(preset.defaultTags)
        .onChange(async (value) => {
          preset.defaultTags = value.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(presetEl)
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
}
