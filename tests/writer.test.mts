import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS } from "../src/settings.ts";
import { insertTaskLine } from "../src/writer/insertTaskLine.ts";

test("inserts at the first line of the file", () => {
  const result = insertTaskLine("Existing\n", "- [ ] New", {
    ...DEFAULT_SETTINGS,
    insertPosition: "first-line",
    insertTarget: "file",
  });

  assert.equal(result, "- [ ] New\nExisting\n");
});

test("inserts at the last line of the file", () => {
  const result = insertTaskLine("Existing", "- [ ] New", {
    ...DEFAULT_SETTINGS,
    insertPosition: "last-line",
    insertTarget: "file",
  });

  assert.equal(result, "Existing\n- [ ] New\n");
});

test("creates missing heading at the top", () => {
  const result = insertTaskLine("Intro\n", "- [ ] New", {
    ...DEFAULT_SETTINGS,
    insertPosition: "last-line",
    insertTarget: "heading",
    insertHeading: "Inbox",
  });

  assert.equal(result, "## Inbox\n- [ ] New\n\nIntro\n");
});

test("inserts first under an existing heading", () => {
  const result = insertTaskLine("Before\n## Inbox\n- [ ] Old\n## Later\nText\n", "- [ ] New", {
    ...DEFAULT_SETTINGS,
    insertPosition: "first-line",
    insertTarget: "heading",
    insertHeading: "Inbox",
  });

  assert.equal(result, "Before\n## Inbox\n- [ ] New\n- [ ] Old\n## Later\nText\n");
});

test("inserts last under an existing heading", () => {
  const result = insertTaskLine("## Inbox\n- [ ] Old\n## Later\nText\n", "- [ ] New", {
    ...DEFAULT_SETTINGS,
    insertPosition: "last-line",
    insertTarget: "heading",
    insertHeading: "Inbox",
  });

  assert.equal(result, "## Inbox\n- [ ] Old\n- [ ] New\n## Later\nText\n");
});
