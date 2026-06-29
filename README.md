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

## Quick Example

Type:

```text
Review draft [[Project Note]] tom prio high #writing
```

Tasks Quick Entry can write:

```text
- [ ] Review draft ⏫ #writing 📅 2026-06-16
```

If routed to `Project Note`, the `[[Project Note]]` link is removed from the task text.

## Features

- Open a single-line task entry modal from the command palette or ribbon icon.
- Search existing tasks and batch edit selected results from command palette modals.
- Show recently edited tasks in the Search task modal so accidental edits are easy
  to revisit.
- Preview the parsed task text, detected metadata, and final Markdown while typing.
- Parse dates such as `today`, `tomorrow`, `yesterday`, `tonight`, `at noon`,
  `Monday`, `Mon`, `next Friday`, `in 2 weeks`, `2 weeks from now`,
  `within 2 weeks`, `2 days ago`, `three months`, `next month`, `end of month`,
  `last day of next month`, `mid July`, `June 20`, `first of July`, `15th`,
  `YYYY-MM-DD`, and `DD.MM.YYYY`.
- Parse short date aliases: `tod`, `td`, `tom`, `tm`, `tmr`, `yd`, `nw`, and
  `weekend`.
- Distinguish `this Friday` from `next Friday`.
- Parse priority with `prio highest`, `prio high`, `prio medium`, `prio normal`,
  `prio low`, `prio lowest`, `!`, and `!!`.
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
  tags, recent edit count, and final task line order.
- Use collapsed editing controls for priority, recurrence, due date, scheduled date,
  and start date.

### Global Task Capture

Tasks Quick Entry pairs well with a global hotkey plugin for Obsidian. A global hotkey
can be bound to the `Tasks Quick Entry: New task` command, letting you bring up the
task entry field from anywhere on your system and quickly capture a task into your
vault.

This is especially useful with command presets: for example, one global shortcut can
open a general inbox capture command, while another can open a shopping or research
capture command with preset tags, dates, and target locations.

## Command Presets

Command presets add extra Obsidian command palette entries for common capture flows.
Each preset can define:

- Command name
- Automatic date: none, today, tomorrow, next week, or weekend
- Date type: due, scheduled, or start
- Preset tags, such as `#task/shopping`
- Optional task file
- Optional insert position: first line or last line
- Optional insert target: whole file or heading
- Optional heading name

The plugin starts with two editable examples:

- `Add task for today`: adds a due date for today
- `Add task to shopping`: adds `#task/shopping`

Preset task targets are useful when different capture commands should write to
different notes. For example, a shopping preset can write to `Lists/Shopping.md`, while
a research preset can write under a `## Capture` heading in a project note.

If the task input contains a detected file link and the linked-file routing toggle is
enabled, that detected file target takes priority over the command preset target.

## Tasks Output

Tasks Quick Entry writes standard Markdown task lines intended for Obsidian Tasks.

Date markers:

- Due: `📅 YYYY-MM-DD`
- Scheduled: `⏳ YYYY-MM-DD`
- Start: `🛫 YYYY-MM-DD`

Priority mapping:

- `prio highest` -> `🔺`
- `prio high` -> `⏫`
- `!!` -> `🔺`
- `!` -> `⏫`
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
- Settings fields for default and preset tags use fuzzy suggestions from existing vault
  tags.
- Duplicate tags are collapsed to the first occurrence and shown as a warning.

File and note handling:

- Wiki links such as `[[Project Note]]` are detected as file references.
- Detected files can be used as the task target instead of the default task file.
- Settings fields for task target files use fuzzy suggestions from existing notes.
- Heading settings suggest headings from the selected target note and show whether the
  entered heading already exists.
- When routing to a detected file, the matching note link is removed from the written
  task text.
- Duplicate file references are collapsed to the first occurrence and shown as a
  warning.

Task line order:

- The final Markdown order is configurable with tokens.
- Supported tokens are `priority`, `text`, `notes`, `tags`, `recurrence`, and `dates`.
- Aliases such as `prio`, `tag`, `note`, and `date` are accepted in settings.

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
