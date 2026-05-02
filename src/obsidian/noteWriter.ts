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
 * Write all three output notes to the Obsidian vault.
 * Creates the directory Papers/<citekey>/ if it doesn't exist.
 * Returns absolute paths to the written files.
 */
export async function writeNotes(
  entry: PaperEntry,
  referenceNote: string,
  bodyMarkdown: string | null,
  summaryMarkdown: string | null
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

  // Write reference note (always)
  await Bun.write(referenceNotePath, referenceNote);
  console.log(`[vault] Written: ${referenceNotePath}`);

  // Write body (if available)
  if (bodyMarkdown) {
    const bodyHeader = buildBodyHeader(entry);
    await Bun.write(bodyNotePath, bodyHeader + bodyMarkdown);
    console.log(`[vault] Written: ${bodyNotePath}`);
  } else {
    await Bun.write(
      bodyNotePath,
      `# ${entry.title} — Full Text\n\n> [!warning] No PDF found\n> The PDF could not be retrieved or converted for this paper.\n\n[[${entry.citekey}|← Back to Reference Note]]\n`
    );
  }

  // Write summary (if available)
  if (summaryMarkdown) {
    await Bun.write(summaryNotePath, summaryMarkdown);
    console.log(`[vault] Written: ${summaryNotePath}`);
  } else {
    await Bun.write(
      summaryNotePath,
      `# ${entry.title} — Summary\n\n> [!warning] Summary not generated\n> The LLM summary could not be generated (PDF may be unavailable).\n\n[[${entry.citekey}|← Back to Reference Note]]\n`
    );
  }

  const vaultRelativePath = join(config.obsidianPapersFolder, entry.citekey);
  return { referenceNotePath, bodyNotePath, summaryNotePath, vaultRelativePath };
}

function buildBodyHeader(entry: PaperEntry): string {
  const venue = entry.journal ?? entry.booktitle ?? "";
  return `---
type: paper-body
citekey: "${entry.citekey}"
title: "${entry.title}"
---

# ${entry.title} — Full Text

> [!info] Metadata
> **Authors:** ${entry.authors.join("; ")}
> **Year:** ${entry.year}
> **Venue:** ${venue || "N/A"}
${entry.doi ? `> **DOI:** [${entry.doi}](https://doi.org/${entry.doi})\n` : ""}
[[${entry.citekey}|← Reference Note]] | [[${entry.citekey}_summary|Summary →]]

---

`;
}
