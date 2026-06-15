import { App, normalizePath, TFile } from "obsidian";
import type { QuickAddTasksSettings, TaskInsertPosition, TaskInsertTarget } from "../settings.ts";
import { resolveTaskTarget } from "../routing/resolveTaskTarget.ts";
import { insertTaskLine } from "./insertTaskLine.ts";

export interface TaskWriteTarget {
  filePath: string;
  insertPosition: TaskInsertPosition;
  insertTarget: TaskInsertTarget;
  insertHeading?: string;
  createInboxFile?: boolean;
}

export async function appendTaskToInbox(
  app: App,
  settings: QuickAddTasksSettings,
  markdownLine: string,
  target?: TaskWriteTarget | null,
): Promise<string> {
  const targetSettings = getTargetSettings(settings, target);
  const inboxPath = normalizePath(resolveTaskTarget(targetSettings));
  const existing = app.vault.getAbstractFileByPath(inboxPath);

  if (existing instanceof TFile) {
    await app.vault.process(existing, (data) => insertTaskLine(data, markdownLine, targetSettings));
    return inboxPath;
  }

  if (existing !== null) {
    throw new Error(`Task path exists but is not a file: ${inboxPath}`);
  }

  if (!targetSettings.createInboxFile) {
    throw new Error(`Task file does not exist: ${inboxPath}`);
  }

  await ensureParentFolders(app, inboxPath);
  await app.vault.create(inboxPath, insertTaskLine("", markdownLine, targetSettings));
  return inboxPath;
}

function getTargetSettings(settings: QuickAddTasksSettings, target?: TaskWriteTarget | null): QuickAddTasksSettings {
  if (!target) {
    return settings;
  }

  return {
    ...settings,
    inboxPath: target.filePath,
    insertPosition: target.insertPosition,
    insertTarget: target.insertTarget,
    insertHeading: target.insertHeading ?? settings.insertHeading,
    createInboxFile: target.createInboxFile ?? false,
  };
}

async function ensureParentFolders(app: App, filePath: string): Promise<void> {
  const parts = filePath.split("/");
  parts.pop();

  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath.length === 0 ? part : `${currentPath}/${part}`;
    const existing = app.vault.getAbstractFileByPath(currentPath);
    if (existing instanceof TFile) {
      throw new Error(`Cannot create task folder because a file exists at: ${currentPath}`);
    }
    if (existing === null) {
      await app.vault.createFolder(currentPath);
    }
  }
}
