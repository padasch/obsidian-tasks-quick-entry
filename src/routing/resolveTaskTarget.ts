import type { QuickAddTasksSettings } from "../settings.ts";

export function resolveTaskTarget(settings: QuickAddTasksSettings): string {
  return settings.inboxPath;
}
