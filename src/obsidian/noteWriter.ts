import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config.ts";
import type { PaperEntry } from "../types.ts";

export interface NoteWriteResult {
  referenceNotePath: string;
  bodyNotePath: string;
  summariesDirPath: string;
  vaultRelativePath: string;
}

const referenceFolderName = "References";
const bodyFolderName = "Bodies";
const summariesFolderName = "Summaries";

/**
 * Write output notes to the Obsidian vault.
 * Creates Papers/References, Papers/Bodies, and Papers/Summaries if needed.
 * Returns absolute paths to the written files.
 */
export async function writeNotes(
  entry: PaperEntry,
  referenceNote: string,
  bodyMarkdown: string | null
): Promise<NoteWriteResult> {
  ensurePaperLibraryDirs();
  await writeReferenceNote(entry, referenceNote);
  await writeBodyNote(entry, bodyMarkdown);
  return getPaperPaths(entry);
}

export async function writeReferenceNote(
  entry: PaperEntry,
  referenceNote: string
): Promise<string> {
  const { referenceNotePath } = getPaperPaths(entry);
  ensurePaperLibraryDirs();
  await Bun.write(referenceNotePath, await mergeReferenceNote(referenceNotePath, referenceNote));
  console.log(`[vault] Written: ${referenceNotePath}`);
  return referenceNotePath;
}

export async function writeBodyNote(
  entry: PaperEntry,
  bodyMarkdown: string | null
): Promise<string> {
  const { bodyNotePath } = getPaperPaths(entry);
  ensurePaperLibraryDirs();
  await Bun.write(bodyNotePath, buildBodyNote(entry, bodyMarkdown));
  console.log(`[vault] Written: ${bodyNotePath}`);
  return bodyNotePath;
}

export function getPaperVaultRelativePath(entry: PaperEntry): string {
  return join(config.obsidianPapersFolder, referenceFolderName, `${entry.citekey}.md`);
}

export function getPaperPaths(entry: PaperEntry): NoteWriteResult {
  const libraryDir = getPaperLibraryDir();
  const referenceDir = join(libraryDir, referenceFolderName);
  const bodyDir = join(libraryDir, bodyFolderName);
  const summariesDirPath = join(libraryDir, summariesFolderName);
  return {
    referenceNotePath: join(referenceDir, `${entry.citekey}.md`),
    bodyNotePath: join(bodyDir, `${entry.citekey}_body.md`),
    summariesDirPath,
    vaultRelativePath: getPaperVaultRelativePath(entry),
  };
}

function getPaperLibraryDir(): string {
  return join(config.vaultPath, config.obsidianPapersFolder);
}

function ensurePaperLibraryDirs(): void {
  for (const dir of [
    join(getPaperLibraryDir(), referenceFolderName),
    join(getPaperLibraryDir(), bodyFolderName),
    join(getPaperLibraryDir(), summariesFolderName),
  ]) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
      console.log(`[vault] Created directory: ${dir}`);
    }
  }
}

async function mergeReferenceNote(path: string, nextContent: string): Promise<string> {
  if (!existsSync(path)) return nextContent;

  const currentContent = await Bun.file(path).text();
  const currentNotes = extractSection(currentContent, "## Notes", "## BibTeX");
  if (!currentNotes) return nextContent;

  const defaultNotes = extractSection(nextContent, "## Notes", "## BibTeX");
  if (!defaultNotes || currentNotes.trim() === defaultNotes.trim()) return nextContent;

  return replaceSection(nextContent, "## Notes", "## BibTeX", currentNotes);
}

function extractSection(content: string, startHeading: string, endHeading: string): string | null {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1) return null;
  return content.slice(start + startHeading.length, end);
}

function replaceSection(
  content: string,
  startHeading: string,
  endHeading: string,
  replacement: string
): string {
  const start = content.indexOf(startHeading);
  const end = content.indexOf(endHeading, start + startHeading.length);
  if (start === -1 || end === -1) return content;
  return content.slice(0, start + startHeading.length) + replacement + content.slice(end);
}

function buildBodyNote(entry: PaperEntry, bodyMarkdown: string | null): string {
  if (!bodyMarkdown) {
    return `# ${entry.title} - Full Text

> [!warning] No PDF found
> The PDF could not be retrieved or converted for this paper.

[[${entry.citekey}|Back to Reference Note]]
`;
  }

  return buildBodyHeader(entry) + bodyMarkdown;
}

function buildBodyHeader(entry: PaperEntry): string {
  const venue = entry.journal ?? entry.booktitle ?? "";
  return `---
type: paper-body
citekey: "${entry.citekey}"
title: "${entry.title}"
---

# ${entry.title} - Full Text

> [!info] Metadata
> **Authors:** ${entry.authors.join("; ")}
> **Year:** ${entry.year}
> **Venue:** ${venue || "N/A"}
${entry.doi ? `> **DOI:** [${entry.doi}](https://doi.org/${entry.doi})\n` : ""}
[[${entry.citekey}|Reference Note]] | [[${entry.citekey}_summary|Summary / Custom Notes]]

---

`;
}
