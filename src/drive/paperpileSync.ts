import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config.ts";
import { downloadFileAsText, downloadFileToDisk, listFolder } from "./driveClient.ts";
import type { DriveFile, PaperEntry } from "../types.ts";

export async function fetchBibFile(): Promise<string> {
  console.log("[drive] Downloading paperpile.bib...");
  const text = await downloadFileAsText(config.driveBibFileId);
  console.log(`[drive] Downloaded BibTeX (${text.length} chars)`);
  return text;
}

/**
 * Download a paper's PDF from Google Drive to a temp file.
 * Returns the local path where the PDF was saved.
 */
export async function fetchPdf(entry: PaperEntry): Promise<string | null> {
  if (!existsSync(config.pdfTempDir)) {
    mkdirSync(config.pdfTempDir, { recursive: true });
  }

  const destPath = join(config.pdfTempDir, `${entry.citekey}.pdf`);

  // If PDF Drive ID was resolved during bibtex parsing (from url field), use it directly
  if (entry.pdfDriveId) {
    console.log(`[drive] Downloading PDF for ${entry.citekey} (id: ${entry.pdfDriveId})`);
    await downloadFileToDisk(entry.pdfDriveId, destPath);
    return destPath;
  }

  // Otherwise, search the Paperpile folder for a matching PDF
  const pdfFile = await findPdfInDrive(entry);
  if (!pdfFile) {
    console.warn(`[drive] No PDF found in Drive for ${entry.citekey}`);
    return null;
  }

  console.log(`[drive] Downloading PDF "${pdfFile.name}" for ${entry.citekey}`);
  await downloadFileToDisk(pdfFile.id, destPath);
  return destPath;
}

/**
 * Find a PDF in the Paperpile Drive folder by fuzzy-matching on author + year.
 * Paperpile names PDFs as "Author Year - Title.pdf" or similar.
 */
async function findPdfInDrive(entry: PaperEntry): Promise<DriveFile | null> {
  const pdfFiles = await listFolder(
    config.drivePaperpileFolderId,
    `mimeType = 'application/pdf'`
  );

  // Build candidate keywords from first author last name + year
  const firstAuthorLastName = entry.authors[0]
    ?.split(",")[0]
    ?.split(" ")
    .pop()
    ?.toLowerCase() ?? "";
  const year = entry.year;

  // Score each file by keyword matches
  const scored = pdfFiles.map((f) => {
    const lower = f.name.toLowerCase();
    let score = 0;
    if (firstAuthorLastName && lower.includes(firstAuthorLastName)) score += 2;
    if (year && lower.includes(year)) score += 2;
    // Also check title words
    const titleWords = entry.title.toLowerCase().split(/\s+/).filter((w) => w.length > 4);
    for (const word of titleWords.slice(0, 5)) {
      if (lower.includes(word)) score += 1;
    }
    return { file: f, score };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 2) return null;
  return best.file;
}
