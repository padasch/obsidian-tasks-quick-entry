import assert from "node:assert/strict";
import test from "node:test";
import { formatDetectedDateText } from "../src/ui/formatDetectedDateText.ts";

test("shows weekday before ISO date in detected date display", () => {
  assert.equal(formatDetectedDateText(undefined, "2026-06-16"), "Tuesday 2026-06-16");
  assert.equal(formatDetectedDateText("tom", "2026-06-16"), "Tomorrow (Tuesday 2026-06-16)");
  assert.equal(formatDetectedDateText("manual", "2026-06-15"), "Manual (Monday 2026-06-15)");
});

test("leaves non-ISO or invalid detected date values unchanged", () => {
  assert.equal(formatDetectedDateText(undefined, "not-a-date"), "not-a-date");
  assert.equal(formatDetectedDateText("tom", "2026-02-31"), "Tomorrow (2026-02-31)");
});
