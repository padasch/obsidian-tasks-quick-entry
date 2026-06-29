import assert from "node:assert/strict";
import test from "node:test";
import type { App, TFile } from "obsidian";
import { TaskSearchIndex } from "../src/search/TaskSearchIndex.ts";
import {
  extractTaskSearchResults,
  searchTaskResults,
  type TaskSearchResult,
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

test("extracts links, due dates, and priority markers", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: "- [ ] Review [[Project Note|project]] #work ⏫ 📅 2026-06-22",
  });

  assert.deepEqual(tasks[0]?.links, ["Project Note|project"]);
  assert.equal(tasks[0]?.dueDate, "2026-06-22");
  assert.equal(tasks[0]?.hasDueDate, true);
  assert.equal(tasks[0]?.priority, "high");
});

test("filters by completion, tags, links, due date, priority, tag query, and file query", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Projects/Tasks.md",
    content: [
      "- [ ] Open with tag #work",
      "- [x] Done with tag #work",
      "- [ ] Open with link [[Project]]",
      "- [ ] Open with due ⏫ 📅 2026-06-22",
    ].join("\n"),
  });

  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { completion: "open" } }).map((task) => task.taskText),
    ["Open with tag #work", "Open with link [[Project]]", "Open with due ⏫ 📅 2026-06-22"],
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
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { dueDate: "with-due" } }).map((task) => task.taskText),
    ["Open with due ⏫ 📅 2026-06-22"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { priority: "high" } }).map((task) => task.taskText),
    ["Open with due ⏫ 📅 2026-06-22"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { priority: "none" } }).map((task) => task.taskText),
    ["Open with tag #work", "Open with link [[Project]]", "Done with tag #work"],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { filters: { tagQuery: "wor" } }).map((task) => task.taskText),
    ["Open with tag #work", "Done with tag #work"],
  );
  assert.equal(
    searchTaskResults(tasks, "", { filters: { fileQuery: "projects" } }).length,
    4,
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

test("sorts task results by due date, priority, tag, and text", () => {
  const tasks = extractTaskSearchResults({
    filePath: "Tasks.md",
    content: [
      "- [ ] Zebra #later 🔽 📅 2026-06-25",
      "- [ ] Alpha #alpha 🔺 📅 2026-06-20",
      "- [ ] Middle #beta ⏫",
    ].join("\n"),
  });

  assert.deepEqual(
    searchTaskResults(tasks, "", { sort: "due" }).map((task) => task.taskText),
    [
      "Alpha #alpha 🔺 📅 2026-06-20",
      "Zebra #later 🔽 📅 2026-06-25",
      "Middle #beta ⏫",
    ],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { sort: "priority" }).map((task) => task.taskText),
    [
      "Alpha #alpha 🔺 📅 2026-06-20",
      "Middle #beta ⏫",
      "Zebra #later 🔽 📅 2026-06-25",
    ],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { sort: "tag" }).map((task) => task.taskText),
    [
      "Alpha #alpha 🔺 📅 2026-06-20",
      "Middle #beta ⏫",
      "Zebra #later 🔽 📅 2026-06-25",
    ],
  );
  assert.deepEqual(
    searchTaskResults(tasks, "", { sort: "text" }).map((task) => task.taskText),
    [
      "Alpha #alpha 🔺 📅 2026-06-20",
      "Middle #beta ⏫",
      "Zebra #later 🔽 📅 2026-06-25",
    ],
  );
});

test("filters tasks by source file modified time", () => {
  const oldTasks = extractTaskSearchResults({
    filePath: "Projects/Old.md",
    fileModifiedTime: 10,
    content: "- [ ] Old file task",
  });
  const recentTasks = extractTaskSearchResults({
    filePath: "Projects/Recent.md",
    fileModifiedTime: 50,
    content: "- [ ] Recent file task",
  });

  assert.deepEqual(
    searchTaskResults(oldTasks.concat(recentTasks), "", { filters: { fileModifiedBefore: 30 } })
      .map((task) => task.taskText),
    ["Old file task"],
  );
});

test("task search index reports edited existing tasks", async () => {
  const fixture = createTaskSearchIndexFixture("- [ ] Review draft 📅 2026-06-16");
  const editedTasks: TaskSearchResult[] = [];
  const index = new TaskSearchIndex(fixture.app, {
    onTaskEdited: (task) => editedTasks.push(task),
  });

  await index.refreshFile(fixture.file);
  fixture.setContent("- [x] Review draft 📅 2026-06-20");
  await index.refreshFile(fixture.file);

  assert.equal(editedTasks.length, 1);
  assert.equal(editedTasks[0]?.completed, true);
  assert.equal(editedTasks[0]?.dueDate, "2026-06-20");
});

test("task search index ignores inserted tasks that only move existing lines", async () => {
  const fixture = createTaskSearchIndexFixture([
    "- [ ] First task",
    "- [ ] Second task",
  ].join("\n"));
  const editedTasks: TaskSearchResult[] = [];
  const index = new TaskSearchIndex(fixture.app, {
    onTaskEdited: (task) => editedTasks.push(task),
  });

  await index.refreshFile(fixture.file);
  fixture.setContent([
    "- [ ] New task",
    "- [ ] First task",
    "- [ ] Second task",
  ].join("\n"));
  await index.refreshFile(fixture.file);

  assert.deepEqual(editedTasks, []);
});

function createTaskSearchIndexFixture(initialContent: string): {
  app: App;
  file: TFile;
  setContent: (content: string) => void;
} {
  let content = initialContent;
  return {
    app: {
      vault: {
        cachedRead: async () => content,
        getMarkdownFiles: () => [],
      },
      metadataCache: {
        getFileCache: () => null,
      },
    } as unknown as App,
    file: {
      path: "Tasks.md",
      extension: "md",
      stat: {
        mtime: 123,
      },
    } as TFile,
    setContent: (nextContent: string) => {
      content = nextContent;
    },
  };
}
