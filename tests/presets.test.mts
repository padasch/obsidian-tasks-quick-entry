import assert from "node:assert/strict";
import test from "node:test";
import { getCommandPresetDateOptions } from "../src/presets/commandPresetDates.ts";
import { normalizeSettings } from "../src/settings.ts";

const referenceDate = new Date(2026, 5, 15);

test("normalizes default command presets", () => {
  const settings = normalizeSettings({});

  assert.equal(settings.commandPresets[0]?.name, "Add task for today");
  assert.equal(settings.commandPresets[0]?.dateMode, "today");
  assert.equal(settings.commandPresets[1]?.defaultTags, "#task/shopping");
});

test("resolves command preset dates", () => {
  const options = getCommandPresetDateOptions({
    id: "today",
    name: "Add task for today",
    dateMode: "today",
    dateType: "due",
    defaultTags: "",
  }, referenceDate);

  assert.deepEqual(options.presetDates, { due: "2026-06-15" });
  assert.deepEqual(options.presetDateTexts, { due: "today" });
});

test("keeps empty custom command preset arrays empty", () => {
  const settings = normalizeSettings({ commandPresets: [] });

  assert.deepEqual(settings.commandPresets, []);
});

test("normalizes task line order aliases", () => {
  const settings = normalizeSettings({
    taskTokenOrder: "tag, date, text, prio, note",
  });

  assert.deepEqual(settings.taskTokenOrder, ["tags", "dates", "text", "priority", "notes", "recurrence"]);
});

test("migrates legacy placement settings to task line order", () => {
  const settings = normalizeSettings({
    tagPlacement: "first",
    priorityPlacement: "last",
  });

  assert.deepEqual(settings.taskTokenOrder, ["tags", "text", "notes", "priority", "recurrence", "dates"]);
});

test("normalizes command preset task targets", () => {
  const settings = normalizeSettings({
    commandPresets: [
      {
        name: "Research capture",
        dateMode: "none",
        dateType: "due",
        defaultTags: "#research",
        inboxPath: " Research/Tasks.md ",
        insertPosition: "first-line",
        insertTarget: "heading",
        insertHeading: " Capture ",
      },
    ],
  });

  assert.deepEqual(settings.commandPresets[0], {
    id: "research-capture",
    name: "Research capture",
    dateMode: "none",
    dateType: "due",
    defaultTags: "#research",
    inboxPath: "Research/Tasks.md",
    insertPosition: "first-line",
    insertTarget: "heading",
    insertHeading: "Capture",
  });
});
