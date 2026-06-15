# Tasks Quick Entry

Tasks Quick Entry is an Obsidian plugin for quickly creating Markdown tasks for the
[Obsidian Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) plugin.

It opens a focused task entry field, parses short natural-language input, and turns
detected task metadata into Tasks-compatible syntax. The goal is to make capture fast
while still showing how the input will be interpreted before the task is written.

> [!CAUTION]
> This plugin was written with substantial AI assistance and should be used cautiously.
> Keep regular backups of your vault, and make a backup before installing or using this
> plugin on important notes.

## Features

- Open a single-line task entry modal from the command palette or ribbon icon.
- Preview the parsed task text, detected metadata, and final Markdown while typing.
- Parse dates such as `today`, `tomorrow`, `next Friday`, `in 2 weeks`, `YYYY-MM-DD`,
  and `DD.MM.YYYY`.
- Parse short date aliases: `tod`, `tom`, `tmr`, `nw`, and `weekend`.
- Distinguish `this Friday` from `next Friday`.
- Parse priority with `prio highest`, `prio high`, `prio medium`, `prio normal`,
  `prio low`, and `prio lowest`.
- Parse common recurrence phrases such as `every Monday`, `every weekday`, and
  `every second Monday of the month`.
- Suggest priorities after `prio`, existing tags after `#`, and existing notes after
  `[[`.
- Show duplicate metadata warnings, for example when two priorities or two dates are
  entered.
- Route a task to a detected `[[linked file]]`, optionally choosing first line, last
  line, or an existing heading in that file.
- Remove the target note link from the task text when the task is routed into that
  same note.
- Configure the default task file, insertion location, default date type, default
  tags, tag placement, and priority placement.
- Use collapsed editing controls for priority, recurrence, due date, scheduled date,
  and start date.

## Command Presets

Command presets add extra Obsidian command palette entries for common capture flows.
Each preset can define:

- Command name
- Automatic date: none, today, tomorrow, next week, or weekend
- Date type: due, scheduled, or start
- Preset tags, such as `#task/shopping`

The plugin starts with two editable examples:

- `Add task for today`: adds a due date for today
- `Add task to shopping`: adds `#task/shopping`

## Tasks Output

Tasks Quick Entry writes standard Markdown task lines intended for Obsidian Tasks.

Date markers:

- Due: `📅 YYYY-MM-DD`
- Scheduled: `⏳ YYYY-MM-DD`
- Start: `🛫 YYYY-MM-DD`

Priority mapping:

- `prio highest` -> `🔺`
- `prio high` -> `⏫`
- `prio medium` -> `🔼`
- `prio normal` -> no marker
- `prio low` -> `🔽`
- `prio lowest` -> `⏬`

Recurrence output:

- `every Monday` -> `🔁 every week on Monday`
- `every weekday` -> `🔁 every weekday`
- `every second Monday of the month` -> `🔁 every month on the 2nd Monday`

Tag handling:

- Existing tags can be typed directly, for example `#work`.
- Default tags can be configured globally or per command preset.
- Tag placement can be configured as first, where entered, or last.
- Duplicate tags are collapsed to the first occurrence and shown as a warning.

File and note handling:

- Wiki links such as `[[Project Note]]` are detected as file references.
- Detected files can be used as the task target instead of the default task file.
- When routing to a detected file, the matching note link is removed from the written
  task text.
- Duplicate file references are collapsed to the first occurrence and shown as a
  warning.

Example:

```text
Review draft [[Project Note]] tom prio high #writing
```

Can become:

```text
- [ ] ⏫ Review draft #writing 📅 2026-06-16
```

If routed to `Project Note`, the `[[Project Note]]` link is removed from the task text.

## Mobile Shortcuts

Mobile shortcut support is experimental and currently untested.

The plugin registers an Obsidian URL handler:

```text
obsidian://tasks-quick-entry
obsidian://tasks-quick-entry?preset=shopping
obsidian://tasks-quick-entry?preset=shopping&text=Buy%20milk
```

If `text`, `task`, or `input` is provided, the task is created directly. Without text,
the task entry modal opens.

Android quick-settings tiles require native Android app code, so a normal Obsidian
plugin cannot add a tile by itself. The URL handler is only a plugin-side bridge for
shortcut or automation tools that can launch an `obsidian://` URL.

## Development

Install dependencies:

```bash
npm install
```

Build the plugin:

```bash
npm run build
```

Run parser, preset, and writer tests:

```bash
npm test
```

Run TypeScript checks:

```bash
npm run check
```

Create a drag-and-drop plugin folder:

```bash
npm run package
```

This writes the installable plugin folder to:

```text
dist/tasks-quick-entry/
```

For manual installation, copy that whole folder into:

```text
<vault>/.obsidian/plugins/
```

The release assets for Obsidian are:

- `manifest.json`
- `main.js`
- `styles.css`
