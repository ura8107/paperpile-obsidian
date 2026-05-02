import { fetchPdf } from "./drive/paperpileSync.ts";
import { pdfToMarkdown } from "./pdf/converter.ts";
import { generateSummary } from "./llm/summarizer.ts";
import { buildReferenceNote } from "./obsidian/referenceNote.ts";
import { writeNotes } from "./obsidian/noteWriter.ts";
import { markProcessed } from "./bibtex/registry.ts";
import { unlinkSync, existsSync } from "fs";
import type { PaperEntry } from "./types.ts";

/**
 * Run the full pipeline for a single paper entry:
 *  1. Download PDF from Google Drive
 *  2. Convert PDF to Markdown (markitdown → pypdf fallback)
 *  3. Generate LLM structured summary
 *  4. Build reference note from metadata
 *  5. Write all three files to Obsidian vault
 *  6. Mark as processed in registry
 */
export async function processPaper(entry: PaperEntry): Promise<void> {
  console.log(`\n[pipeline] Processing: ${entry.citekey} — "${entry.title}"`);

  let pdfPath: string | null = null;
  let bodyMarkdown: string | null = null;
  let summaryMarkdown: string | null = null;

  // Step 1: Download PDF
  try {
    pdfPath = await fetchPdf(entry);
  } catch (err) {
    console.warn(`[pipeline] PDF download failed for ${entry.citekey}: ${(err as Error).message}`);
  }

  // Step 2: Convert PDF → Markdown
  if (pdfPath) {
    try {
      bodyMarkdown = await pdfToMarkdown(pdfPath);
    } catch (err) {
      console.warn(`[pipeline] PDF conversion failed for ${entry.citekey}: ${(err as Error).message}`);
    }
  }

  // Step 3: Generate LLM summary (requires body markdown)
  if (bodyMarkdown) {
    try {
      summaryMarkdown = await generateSummary(entry, bodyMarkdown);
    } catch (err) {
      console.warn(`[pipeline] LLM summary failed for ${entry.citekey}: ${(err as Error).message}`);
    }
  } else {
    console.warn(`[pipeline] Skipping LLM summary for ${entry.citekey} — no body text available`);
  }

  // Step 4+5: Build and write reference note (always succeeds)
  const referenceNote = buildReferenceNote(entry);
  const result = await writeNotes(entry, referenceNote, bodyMarkdown, summaryMarkdown);

  // Step 6: Mark as processed
  await markProcessed(entry.citekey, result.vaultRelativePath);
  console.log(`[pipeline] Done: ${entry.citekey} → ${result.vaultRelativePath}`);

  // Cleanup temp PDF
  if (pdfPath && existsSync(pdfPath)) {
    try {
      unlinkSync(pdfPath);
    } catch {
      // Non-fatal cleanup failure
    }
  }
}
