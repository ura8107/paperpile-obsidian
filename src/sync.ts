import { createHash } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import { buildReferenceNote } from "./obsidian/referenceNote.ts";
import {
  getPaperPaths,
  writeBodyNote,
  writeReferenceNote,
} from "./obsidian/noteWriter.ts";
import { pdfToMarkdown } from "./pdf/converter.ts";
import { downloadPdfFile, resolvePdfFile } from "./drive/paperpileSync.ts";
import { getEntry, markSynced } from "./bibtex/registry.ts";
import type { DriveFile, PaperEntry, ProcessedEntry } from "./types.ts";

export interface SyncSummary {
  created: number;
  updatedMetadata: number;
  updatedBody: number;
  unchanged: number;
  failed: number;
}

export async function syncPaper(entry: PaperEntry): Promise<keyof SyncSummary> {
  const previous = getEntry(entry.citekey);
  const paths = getPaperPaths(entry);
  const bibtexHash = hashString(entry.rawBibtex);
  const pdfFile = await resolvePdfFile(entry);

  const referenceExists = existsSync(paths.referenceNotePath);
  const bodyExists = existsSync(paths.bodyNotePath);
  const inferredBodyStatus = bodyExists
    ? inferBodyStatus(await Bun.file(paths.bodyNotePath).text())
    : undefined;
  const isCreated = !previous || !referenceExists || !bodyExists;
  const metadataChanged = previous?.bibtexHash !== bibtexHash || !referenceExists;
  const bodyChanged = shouldUpdateBody(previous, pdfFile, bodyExists, inferredBodyStatus);

  let bodyStatus: ProcessedEntry["bodyStatus"] =
    previous?.bodyStatus ?? inferredBodyStatus ?? "missing";

  try {
    if (metadataChanged || isCreated) {
      await writeReferenceNote(entry, buildReferenceNote(entry));
    }

    if (bodyChanged || isCreated) {
      bodyStatus = await writeSyncedBody(entry, pdfFile);
    }

    await markSynced(entry.citekey, paths.vaultRelativePath, {
      bibtexHash,
      pdfDriveId: pdfFile?.id,
      pdfModifiedTime: pdfFile?.modifiedTime,
      bodyStatus,
    });

    if (isCreated) return "created";
    if (bodyChanged) return "updatedBody";
    if (metadataChanged) return "updatedMetadata";
    return "unchanged";
  } catch (err) {
    await markSynced(entry.citekey, paths.vaultRelativePath, {
      bibtexHash,
      pdfDriveId: pdfFile?.id,
      pdfModifiedTime: pdfFile?.modifiedTime,
      bodyStatus: "failed",
    });
    throw err;
  }
}

export function createSyncSummary(): SyncSummary {
  return {
    created: 0,
    updatedMetadata: 0,
    updatedBody: 0,
    unchanged: 0,
    failed: 0,
  };
}

function shouldUpdateBody(
  previous: ProcessedEntry | undefined,
  pdfFile: DriveFile | null,
  bodyExists: boolean,
  inferredBodyStatus: ProcessedEntry["bodyStatus"] | undefined
): boolean {
  if (!bodyExists) return true;
  const bodyStatus = previous?.bodyStatus ?? inferredBodyStatus;

  if (!pdfFile) return false;
  if (bodyStatus !== "converted") return true;
  if (!previous?.pdfDriveId && !previous?.pdfModifiedTime) return false;
  if (previous.pdfDriveId !== pdfFile.id) return true;
  return previous.pdfModifiedTime !== pdfFile.modifiedTime;
}

function inferBodyStatus(bodyNote: string): ProcessedEntry["bodyStatus"] {
  return bodyNote.includes("The PDF could not be retrieved or converted for this paper.")
    ? "missing"
    : "converted";
}

async function writeSyncedBody(
  entry: PaperEntry,
  pdfFile: DriveFile | null
): Promise<ProcessedEntry["bodyStatus"]> {
  if (!pdfFile) {
    await writeBodyNote(entry, null);
    return "missing";
  }

  let pdfPath: string | null = null;
  try {
    pdfPath = await downloadPdfFile(entry, pdfFile);
    const bodyMarkdown = await pdfToMarkdown(pdfPath);
    await writeBodyNote(entry, bodyMarkdown);
    return bodyMarkdown ? "converted" : "missing";
  } catch (err) {
    console.warn(`[sync] PDF body update failed for ${entry.citekey}: ${(err as Error).message}`);
    return "failed";
  } finally {
    if (pdfPath && existsSync(pdfPath)) {
      try {
        unlinkSync(pdfPath);
      } catch (err) {
        console.warn(`[sync] Temp PDF cleanup failed for ${pdfPath}: ${(err as Error).message}`);
      }
    }
  }
}

function hashString(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
