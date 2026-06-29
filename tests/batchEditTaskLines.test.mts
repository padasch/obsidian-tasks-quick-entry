import assert from "node:assert/strict";
import test from "node:test";
import {
  applyBatchTaskLineEdits,
  applyTaskLineChanges,
} from "../src/writer/batchEditTaskLines.ts";

test("applies status, priority, due date, and tag batch edits to a task line", () => {
  assert.equal(
    applyTaskLineChanges("- [ ] Review draft 📅 2026-06-16", {
      status: "done",
      priority: "high",
      dueDate: "2026-06-20",
      addTags: ["work"],
    }),
    "- [x] Review draft ⏫ #work 📅 2026-06-20",
  );
});

test("clears priority and due date and removes tags", () => {
  assert.equal(
    applyTaskLineChanges("  - [x] Review draft #work ⏫ 📅 2026-06-16", {
      status: "open",
      priority: "none",
      dueDate: null,
      removeTags: ["#work"],
    }),
    "  - [ ] Review draft",
  );
});

test("edits selected task lines and skips stale targets", () => {
  const result = applyBatchTaskLineEdits([
    "- [ ] First task",
    "Not a task",
    "- [ ] Third task",
  ].join("\n"), [
    { line: 0 },
    { line: 1 },
    { line: 8 },
  ], {
    priority: "highest",
    addTags: ["#batch"],
  });

  assert.equal(result.changed, 1);
  assert.equal(result.skipped, 2);
  assert.equal(result.content, [
    "- [ ] First task 🔺 #batch",
    "Not a task",
    "- [ ] Third task",
  ].join("\n"));
});

test("keeps windows line endings when applying batch edits", () => {
  const result = applyBatchTaskLineEdits("- [ ] First\r\n- [ ] Second", [
    { line: 1 },
  ], {
    dueDate: "2026-06-20",
  });

  assert.equal(result.content, "- [ ] First\r\n- [ ] Second 📅 2026-06-20");
});
