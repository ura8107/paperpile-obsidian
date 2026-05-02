import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config.ts";
import type { PaperEntry } from "../types.ts";

export interface NoteWriteResult {
  referenceNotePath: string;
  bodyNotePath: string;
  summaryNotePath: string;
  vaultRelativePath: string;
}

/**
 * Write output notes to the Obsidian vault.
 * Creates the directory Papers/<citekey>/ if it doesn't exist.
 * Returns absolute paths to the written files.
 */
export async function writeNotes(
  entry: PaperEntry,
  referenceNote: string,
  bodyMarkdown: string | null
): Promise<NoteWriteResult> {
  const paperDir = join(
    config.vaultPath,
    config.obsidianPapersFolder,
    entry.citekey
  );

  if (!existsSync(paperDir)) {
    mkdirSync(paperDir, { recursive: true });
    console.log(`[vault] Created directory: ${paperDir}`);
  }

  const referenceNotePath = join(paperDir, `${entry.citekey}.md`);
  const bodyNotePath = join(paperDir, `${entry.citekey}_body.md`);
  const summaryNotePath = join(paperDir, `${entry.citekey}_summary.md`);

  await Bun.write(referenceNotePath, referenceNote);
  console.log(`[vault] Written: ${referenceNotePath}`);

  await Bun.write(bodyNotePath, buildBodyNote(entry, bodyMarkdown));
  console.log(`[vault] Written: ${bodyNotePath}`);

  await Bun.write(summaryNotePath, buildSummaryPlaceholder(entry));
  console.log(`[vault] Written: ${summaryNotePath}`);

  const vaultRelativePath = join(config.obsidianPapersFolder, entry.citekey);
  return { referenceNotePath, bodyNotePath, summaryNotePath, vaultRelativePath };
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

function buildSummaryPlaceholder(entry: PaperEntry): string {
  return `# ${entry.title} - Summary

> [!note] Summary not generated
> Generate this note on demand with /summarize-paper ${entry.citekey}.

[[${entry.citekey}|Back to Reference Note]]
`;
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
[[${entry.citekey}|Reference Note]] | [[${entry.citekey}_summary|Summary]]

---

`;
}
