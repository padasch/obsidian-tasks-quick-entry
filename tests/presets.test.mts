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
