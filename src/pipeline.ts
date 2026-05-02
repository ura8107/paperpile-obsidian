import { fetchPdf } from "./drive/paperpileSync.ts";
import { pdfToMarkdown } from "./pdf/converter.ts";
import { buildReferenceNote } from "./obsidian/referenceNote.ts";
import { writeNotes } from "./obsidian/noteWriter.ts";
import { markProcessed } from "./bibtex/registry.ts";
import { unlinkSync, existsSync } from "fs";
import type { PaperEntry } from "./types.ts";

/**
 * Run the automatic pipeline for a single paper entry:
 *  1. Download PDF from Google Drive
 *  2. Convert PDF to Markdown (markitdown → pypdf fallback)
 *  3. Build reference note from metadata
 *  4. Write reference note + body to Obsidian vault
 *  5. Mark as processed in registry
 *
 * Note: LLM summary is NOT generated here — use the /summarize-paper
 * Claude Code skill on demand when you want a summary.
 */
export async function processPaper(entry: PaperEntry): Promise<void> {
  console.log(`\n[pipeline] Processing: ${entry.citekey} — "${entry.title}"`);

  let pdfPath: string | null = null;
  let bodyMarkdown: string | null = null;

  try {
    // Step 1: Download PDF
    try {
      pdfPath = await fetchPdf(entry);
    } catch (err) {
      console.warn(`[pipeline] PDF download failed for ${entry.citekey}: ${(err as Error).message}`);
    }

    // Step 2: Convert PDF to Markdown
    if (pdfPath) {
      try {
        bodyMarkdown = await pdfToMarkdown(pdfPath);
      } catch (err) {
        console.warn(`[pipeline] PDF conversion failed for ${entry.citekey}: ${(err as Error).message}`);
      }
    }

    // Step 3+4: Build and write reference note, body, and summary placeholder
    const referenceNote = buildReferenceNote(entry);
    const result = await writeNotes(entry, referenceNote, bodyMarkdown);

    // Step 5: Mark as processed
    await markProcessed(entry.citekey, result.vaultRelativePath);
    console.log(`[pipeline] Done: ${entry.citekey} -> ${result.vaultRelativePath}`);
    console.log(`[pipeline] To generate a summary: use /summarize-paper ${entry.citekey} in Claude Code`);
  } finally {
    cleanupTempPdf(pdfPath);
  }
}

function cleanupTempPdf(pdfPath: string | null): void {
  if (pdfPath && existsSync(pdfPath)) {
    try {
      unlinkSync(pdfPath);
    } catch (err) {
      console.warn(`[pipeline] Temp PDF cleanup failed for ${pdfPath}: ${(err as Error).message}`);
    }
  }
}
