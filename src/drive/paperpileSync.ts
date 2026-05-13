import { mkdirSync, existsSync } from "fs";
import { join } from "path";
import { config } from "../config.ts";
import { downloadFileAsText, downloadFileToDisk, listFolder } from "./driveClient.ts";
import type { DriveFile, PaperEntry } from "../types.ts";

let pdfFileCache: DriveFile[] | null = null;

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
  const pdfFile = await resolvePdfFile(entry);
  if (!pdfFile) {
    console.warn(`[drive] No PDF found in Drive for ${entry.citekey}`);
    return null;
  }

  return downloadPdfFile(entry, pdfFile);
}

export async function resolvePdfFile(entry: PaperEntry): Promise<DriveFile | null> {
  if (entry.pdfDriveId) {
    return {
      id: entry.pdfDriveId,
      name: `${entry.citekey}.pdf`,
      mimeType: "application/pdf",
    };
  }

  return findPdfInDrive(entry);
}

export async function downloadPdfFile(
  entry: PaperEntry,
  pdfFile: DriveFile
): Promise<string> {
  if (!existsSync(config.pdfTempDir)) {
    mkdirSync(config.pdfTempDir, { recursive: true });
  }

  const destPath = join(config.pdfTempDir, `${entry.citekey}.pdf`);

  console.log(`[drive] Downloading PDF "${pdfFile.name}" for ${entry.citekey}`);
  await downloadFileToDisk(pdfFile.id, destPath);
  return destPath;
}

/**
 * Find a PDF in the Paperpile Drive folder by fuzzy-matching on author + year.
 * Paperpile names PDFs as "Author Year - Title.pdf" or similar.
 */
async function findPdfInDrive(entry: PaperEntry): Promise<DriveFile | null> {
  const pdfFiles = await listPaperpilePdfFiles();

  // Build candidate keywords from first author last name + year
  const firstAuthorLastName = entry.authors[0]
    ?.split(",")[0]
    ?.split(" ")
    .pop()
    ?.toLowerCase() ?? "";
  const year = entry.year;
  const titleWords = significantTitleWords(entry.title);

  // Score each file by keyword matches
  const scored = pdfFiles.map((f) => {
    const lower = f.name.toLowerCase();
    let score = 0;
    const authorMatched = Boolean(firstAuthorLastName && lower.includes(firstAuthorLastName));
    const yearMatched = Boolean(year && lower.includes(year));
    let titleMatches = 0;

    if (authorMatched) score += 3;
    if (yearMatched) score += 2;
    // Also check title words
    for (const word of titleWords.slice(0, 5)) {
      if (lower.includes(word)) {
        titleMatches++;
        score += 1;
      }
    }
    return { file: f, score, authorMatched, yearMatched, titleMatches };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  if (!best || best.score < 5) return null;
  if (!best.yearMatched) return null;
  if (!best.authorMatched && best.titleMatches < 2) return null;
  if (titleWords.length > 0 && best.titleMatches < Math.min(2, titleWords.length)) return null;
  return best.file;
}

function significantTitleWords(title: string): string[] {
  const stopwords = new Set([
    "about",
    "after",
    "against",
    "among",
    "between",
    "during",
    "from",
    "into",
    "more",
    "than",
    "that",
    "their",
    "them",
    "with",
    "within",
  ]);

  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .map((word) => word.replace(/^-+|-+$/g, ""))
    .filter((word) => word.length > 4 && !stopwords.has(word));
}

async function listPaperpilePdfFiles(): Promise<DriveFile[]> {
  if (pdfFileCache) return pdfFileCache;

  const rootPdfFiles = await listFolder(
    config.drivePaperpileFolderId,
    `mimeType = 'application/pdf'`
  );

  const childFolders = await listFolder(
    config.drivePaperpileFolderId,
    `mimeType = 'application/vnd.google-apps.folder'`
  );
  const allPapersFolder = childFolders.find((f) => f.name === "All Papers");
  if (!allPapersFolder) {
    pdfFileCache = rootPdfFiles;
    return pdfFileCache;
  }

  const allPapersPdfFiles = await listFolder(
    allPapersFolder.id,
    `mimeType = 'application/pdf'`
  );

  const byId = new Map<string, DriveFile>();
  for (const file of [...rootPdfFiles, ...allPapersPdfFiles]) {
    byId.set(file.id, file);
  }
  pdfFileCache = [...byId.values()];
  return pdfFileCache;
}
