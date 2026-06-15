export const DATE_TYPES = ["due", "scheduled", "start"] as const;
export const METADATA_PLACEMENTS = ["first", "where-entered", "last"] as const;
export const TASK_INSERT_POSITIONS = ["first-line", "last-line"] as const;
export const TASK_INSERT_TARGETS = ["file", "heading"] as const;
export const COMMAND_PRESET_DATE_MODES = ["none", "today", "tomorrow", "next-week", "weekend"] as const;

export type DateType = (typeof DATE_TYPES)[number];
export type MetadataPlacement = (typeof METADATA_PLACEMENTS)[number];
export type TaskInsertPosition = (typeof TASK_INSERT_POSITIONS)[number];
export type TaskInsertTarget = (typeof TASK_INSERT_TARGETS)[number];
export type CommandPresetDateMode = (typeof COMMAND_PRESET_DATE_MODES)[number];

export interface QuickAddCommandPreset {
  id: string;
  name: string;
  dateMode: CommandPresetDateMode;
  dateType: DateType;
  defaultTags: string;
  inboxPath?: string;
  insertPosition?: TaskInsertPosition;
  insertTarget?: TaskInsertTarget;
  insertHeading?: string;
}

export interface QuickAddTasksSettings {
  inboxPath: string;
  defaultDateType: DateType;
  removeParsedDateText: boolean;
  createInboxFile: boolean;
  defaultTags: string;
  tagPlacement: MetadataPlacement;
  priorityPlacement: MetadataPlacement;
  insertPosition: TaskInsertPosition;
  insertTarget: TaskInsertTarget;
  insertHeading: string;
  commandPresets: QuickAddCommandPreset[];
}

export const DEFAULT_COMMAND_PRESETS: QuickAddCommandPreset[] = [
  {
    id: "today",
    name: "Add task for today",
    dateMode: "today",
    dateType: "due",
    defaultTags: "",
  },
  {
    id: "shopping",
    name: "Add task to shopping",
    dateMode: "none",
    dateType: "due",
    defaultTags: "#task/shopping",
  },
];

export const DEFAULT_SETTINGS: QuickAddTasksSettings = {
  inboxPath: "Tasks/Inbox.md",
  defaultDateType: "due",
  removeParsedDateText: true,
  createInboxFile: true,
  defaultTags: "",
  tagPlacement: "last",
  priorityPlacement: "first",
  insertPosition: "last-line",
  insertTarget: "file",
  insertHeading: "Tasks",
  commandPresets: DEFAULT_COMMAND_PRESETS.map((preset) => ({ ...preset })),
};

export function isDateType(value: unknown): value is DateType {
  return typeof value === "string" && DATE_TYPES.includes(value as DateType);
}

export function isMetadataPlacement(value: unknown): value is MetadataPlacement {
  return typeof value === "string" && METADATA_PLACEMENTS.includes(value as MetadataPlacement);
}

export function isTaskInsertPosition(value: unknown): value is TaskInsertPosition {
  return typeof value === "string" && TASK_INSERT_POSITIONS.includes(value as TaskInsertPosition);
}

export function isTaskInsertTarget(value: unknown): value is TaskInsertTarget {
  return typeof value === "string" && TASK_INSERT_TARGETS.includes(value as TaskInsertTarget);
}

export function isCommandPresetDateMode(value: unknown): value is CommandPresetDateMode {
  return typeof value === "string" && COMMAND_PRESET_DATE_MODES.includes(value as CommandPresetDateMode);
}

export function normalizeSettings(data: unknown): QuickAddTasksSettings {
  const incoming = data && typeof data === "object" ? data as Partial<QuickAddTasksSettings> : {};
  return {
    inboxPath: typeof incoming.inboxPath === "string" && incoming.inboxPath.trim().length > 0
      ? incoming.inboxPath.trim()
      : DEFAULT_SETTINGS.inboxPath,
    defaultDateType: isDateType(incoming.defaultDateType)
      ? incoming.defaultDateType
      : DEFAULT_SETTINGS.defaultDateType,
    removeParsedDateText: typeof incoming.removeParsedDateText === "boolean"
      ? incoming.removeParsedDateText
      : DEFAULT_SETTINGS.removeParsedDateText,
    createInboxFile: typeof incoming.createInboxFile === "boolean"
      ? incoming.createInboxFile
      : DEFAULT_SETTINGS.createInboxFile,
    defaultTags: typeof incoming.defaultTags === "string" ? incoming.defaultTags.trim() : DEFAULT_SETTINGS.defaultTags,
    tagPlacement: isMetadataPlacement(incoming.tagPlacement)
      ? incoming.tagPlacement
      : DEFAULT_SETTINGS.tagPlacement,
    priorityPlacement: isMetadataPlacement(incoming.priorityPlacement)
      ? incoming.priorityPlacement
      : DEFAULT_SETTINGS.priorityPlacement,
    insertPosition: isTaskInsertPosition(incoming.insertPosition)
      ? incoming.insertPosition
      : DEFAULT_SETTINGS.insertPosition,
    insertTarget: isTaskInsertTarget(incoming.insertTarget)
      ? incoming.insertTarget
      : DEFAULT_SETTINGS.insertTarget,
    insertHeading: typeof incoming.insertHeading === "string" && incoming.insertHeading.trim().length > 0
      ? incoming.insertHeading.trim()
      : DEFAULT_SETTINGS.insertHeading,
    commandPresets: Array.isArray(incoming.commandPresets)
      ? normalizeCommandPresets(incoming.commandPresets)
      : DEFAULT_COMMAND_PRESETS.map((preset) => ({ ...preset })),
  };
}

export function createCommandPreset(overrides: Partial<QuickAddCommandPreset> = {}): QuickAddCommandPreset {
  return {
    id: overrides.id ?? `preset-${Date.now().toString(36)}`,
    name: overrides.name ?? "New task command",
    dateMode: overrides.dateMode ?? "none",
    dateType: overrides.dateType ?? "due",
    defaultTags: overrides.defaultTags ?? "",
    inboxPath: normalizeOptionalText(overrides.inboxPath),
    insertPosition: isTaskInsertPosition(overrides.insertPosition) ? overrides.insertPosition : undefined,
    insertTarget: isTaskInsertTarget(overrides.insertTarget) ? overrides.insertTarget : undefined,
    insertHeading: normalizeOptionalText(overrides.insertHeading),
  };
}

export function parseDefaultTags(defaultTags: string | string[] | undefined): string[] {
  const values = Array.isArray(defaultTags)
    ? defaultTags
    : (defaultTags ?? "").split(/[\s,]+/);

  const normalized = values
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0)
    .map((tag) => tag.startsWith("#") ? tag : `#${tag}`);

  return Array.from(new Set(normalized));
}

function normalizeCommandPresets(presets: unknown[]): QuickAddCommandPreset[] {
  const usedIds = new Set<string>();

  return presets
    .map((preset, index) => normalizeCommandPreset(preset, index, usedIds))
    .filter((preset): preset is QuickAddCommandPreset => preset !== null);
}

function normalizeCommandPreset(
  preset: unknown,
  index: number,
  usedIds: Set<string>,
): QuickAddCommandPreset | null {
  if (preset === null || typeof preset !== "object") {
    return null;
  }

  const incoming = preset as Partial<QuickAddCommandPreset>;
  const name = typeof incoming.name === "string" && incoming.name.trim().length > 0
    ? incoming.name.trim()
    : `Task command ${index + 1}`;
  const id = uniquePresetId(
    typeof incoming.id === "string" ? incoming.id : name,
    index,
    usedIds,
  );

  return {
    id,
    name,
    dateMode: isCommandPresetDateMode(incoming.dateMode) ? incoming.dateMode : "none",
    dateType: isDateType(incoming.dateType) ? incoming.dateType : "due",
    defaultTags: typeof incoming.defaultTags === "string" ? incoming.defaultTags.trim() : "",
    inboxPath: normalizeOptionalText(incoming.inboxPath),
    insertPosition: isTaskInsertPosition(incoming.insertPosition) ? incoming.insertPosition : undefined,
    insertTarget: isTaskInsertTarget(incoming.insertTarget) ? incoming.insertTarget : undefined,
    insertHeading: normalizeOptionalText(incoming.insertHeading),
  };
}

function normalizeOptionalText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function uniquePresetId(value: string, index: number, usedIds: Set<string>): string {
  const base = value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || `preset-${index + 1}`;
  let candidate = base;
  let suffix = 2;

  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(candidate);
  return candidate;
}
