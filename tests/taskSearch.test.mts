import assert from "node:assert/strict";
import test from "node:test";
import {
  extractTaskSearchResults,
  searchTaskResults,
} from "../src/search/taskSearchCore.ts";

test("extracts incomplete, completed, custom status, and nested tasks", () => {
  const results = extractTaskSearchResults({
    filePath: "Projects/Alpha.md",
    content: [
      "# Project Alpha",
      "- [ ] Draft outline #writing",
      "- [x] Send update",
      "  - [/] Waiting on reply #blocked",
      "- normal list item",
    ].join("\n"),
  });

  assert.deepEqual(results.map((result) => ({
    line: result.line,
    taskText: result.taskText,
    status: result.status,
    completed: result.completed,
    heading: result.heading,
    tags: result.tags,
    links: result.links,
    hasDueDate: result.hasDueDate,
  })), [
    {
      line: 1,
      taskText: "Draft outline #writing",
      status: " ",
      completed: false,
      heading: "Project Alpha",
      tags: ["#writing"],
      links: [],
      hasDueDate: false,
    },
    {
      line: 2,
      taskText: "Send update",
      status: "x",
      completed: true,
      heading: "Project Alpha",
      tags: [],
      links: [],
      hasDueDate: false,
    },
    {
      line: 3,
      taskText: "Waiting on reply #blocked",
      status: "/",
      completed: true,
      heading: "Project Alpha",
      tags: ["#blocked"],
      links: [],
      hasDueDate: false,
    },
  ]);
});

test("uses metadata list item positions when provided", () => {
  const results = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: [
      "- [ ] Include this",
      "- [ ] Ignore this because metadata omitted it",
    ].join("\n"),
    listItems: [{ line: 0, status: " " }],
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.taskText, "Include this");
});

test("search ranking prefers task text matches over path-only matches", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Needle Folder/Reference.md",
    content: "- [ ] General cleanup",
  }).concat(extractTaskSearchResults({
    filePath: "Projects/Alpha.md",
    content: "- [ ] Find the needle in this task",
  }));

  const results = searchTaskResults(tasks, "needle");

  assert.equal(results[0]?.taskText, "Find the needle in this task");
});

test("search includes tags and headings", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: [
      "## Research",
      "- [ ] Read paper #phd",
      "## Admin",
      "- [ ] Renew license",
    ].join("\n"),
  });

  assert.equal(searchTaskResults(tasks, "phd")[0]?.taskText, "Read paper #phd");
  assert.equal(searchTaskResults(tasks, "admin")[0]?.taskText, "Renew license");
});

test("extracts links and due date presence", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: "- [ ] Review [[Project Note|project]] #work 📅 2026-06-22",
  });

  assert.deepEqual(tasks[0]?.links, ["Project Note|project"]);
  assert.equal(tasks[0]?.hasDueDate, true);
});

test("filters by completion, tags, links, and missing due date", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: [
      "- [ ] Open with tag #work",
      "- [x] Done with tag #work",
      "- [ ] Open with link [[Project]]",
      "- [ ] Open with due 📅 2026-06-22",
    ].join("\n"),
  });

  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { completion: "open" } }).map((task) => task.taskText),
    ["Open with tag #work", "Open with link [[Project]]", "Open with due 📅 2026-06-22"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { completion: "completed" } }).map((task) => task.taskText),
    ["Done with tag #work"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { hasTag: true } }).map((task) => task.taskText),
    ["Open with tag #work", "Done with tag #work"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { hasLink: true } }).map((task) => task.taskText),
    ["Open with link [[Project]]"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { noDueDate: true } }).map((task) => task.taskText),
    ["Open with tag #work", "Open with link [[Project]]", "Done with tag #work"],
  );
});

test("incomplete tasks sort before completed tasks when scores match", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: [
      "- [x] Same title",
      "- [ ] Same title",
    ].join("\n"),
  });

  const results = searchTaskResults(tasks, "same title");

  assert.equal(results[0]?.completed, false);
  assert.equal(results[0]?.line, 1);
});
