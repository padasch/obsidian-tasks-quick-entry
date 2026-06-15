import type { QuickAddTasksSettings } from "../settings.ts";

export function insertTaskLine(existingContent: string, markdownLine: string, settings: QuickAddTasksSettings): string {
  if (settings.insertTarget === "heading") {
    return insertUnderHeading(existingContent, markdownLine, normalizeHeadingText(settings.insertHeading), settings.insertPosition);
  }

  if (settings.insertPosition === "first-line") {
    return prependLine(existingContent, markdownLine);
  }

  return appendLine(existingContent, markdownLine);
}

function prependLine(existingContent: string, markdownLine: string): string {
  if (existingContent.length === 0) {
    return `${markdownLine}\n`;
  }

  return existingContent.startsWith("\n")
    ? `${markdownLine}${existingContent}`
    : `${markdownLine}\n${existingContent}`;
}

function appendLine(existingContent: string, markdownLine: string): string {
  if (existingContent.length === 0) {
    return `${markdownLine}\n`;
  }

  return existingContent.endsWith("\n")
    ? `${existingContent}${markdownLine}\n`
    : `${existingContent}\n${markdownLine}\n`;
}

function insertUnderHeading(
  existingContent: string,
  markdownLine: string,
  headingText: string,
  insertPosition: QuickAddTasksSettings["insertPosition"],
): string {
  const heading = findHeading(existingContent, headingText);
  if (heading === null) {
    const section = `## ${headingText}\n${markdownLine}\n`;
    return existingContent.length === 0
      ? section
      : `${section}\n${existingContent}`;
  }

  const beforeSection = existingContent.slice(0, heading.contentStart);
  const sectionContent = existingContent.slice(heading.contentStart, heading.contentEnd);
  const afterSection = existingContent.slice(heading.contentEnd);
  const updatedSection = insertPosition === "first-line"
    ? prependLine(sectionContent, markdownLine)
    : appendLine(sectionContent, markdownLine);

  return `${beforeSection}${updatedSection}${afterSection}`;
}

function findHeading(content: string, headingText: string): { contentStart: number; contentEnd: number } | null {
  const headingRegex = /^(#{1,6})\s+(.+?)\s*#*\s*$/gm;
  let match: RegExpExecArray | null;

  while ((match = headingRegex.exec(content)) !== null) {
    const level = match[1].length;
    const text = match[2].trim();
    if (text.toLowerCase() !== headingText.toLowerCase()) {
      continue;
    }

    let contentStart = headingRegex.lastIndex;
    if (content.slice(contentStart, contentStart + 2) === "\r\n") {
      contentStart += 2;
    } else if (content[contentStart] === "\n") {
      contentStart += 1;
    }
    const nextHeadingRegex = new RegExp(`^#{1,${level}}\\s+.+$`, "gm");
    nextHeadingRegex.lastIndex = contentStart;
    const nextHeading = nextHeadingRegex.exec(content);
    return {
      contentStart,
      contentEnd: nextHeading?.index ?? content.length,
    };
  }

  return null;
}

function normalizeHeadingText(headingText: string): string {
  return headingText.replace(/^#+\s*/, "").trim() || "Tasks";
}
