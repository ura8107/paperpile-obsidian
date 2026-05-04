import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmdirSync,
  statSync,
} from "fs";
import { join } from "path";
import { config } from "./config.ts";
import { getAllEntries, markSynced } from "./bibtex/registry.ts";

const referenceFolderName = "References";
const bodyFolderName = "Bodies";
const summariesFolderName = "Summaries";
const libraryFolderNames = new Set([
  referenceFolderName,
  bodyFolderName,
  summariesFolderName,
]);

export interface MigrationSummary {
  moved: number;
  skipped: number;
  conflicts: number;
  registryUpdated: number;
}

interface PlannedMove {
  citekey: string;
  sourcePath: string;
  destinationPath: string;
  kind: "reference" | "body" | "summary";
}

export async function migratePaperFolders(options: { dryRun: boolean }): Promise<MigrationSummary> {
  const papersDir = join(config.vaultPath, config.obsidianPapersFolder);
  const summary: MigrationSummary = {
    moved: 0,
    skipped: 0,
    conflicts: 0,
    registryUpdated: 0,
  };

  ensureLibraryDirs(papersDir, options.dryRun);

  const moves = collectMoves(papersDir);
  for (const move of moves) {
    if (existsSync(move.destinationPath)) {
      console.warn(`[migrate] Conflict, destination exists: ${move.destinationPath}`);
      summary.conflicts++;
      continue;
    }

    console.log(`[migrate] ${options.dryRun ? "Would move" : "Moving"} ${move.sourcePath} -> ${move.destinationPath}`);
    if (!options.dryRun) {
      renameSync(move.sourcePath, move.destinationPath);
    }
    summary.moved++;
  }

  summary.skipped = removeEmptyLegacyDirs(papersDir, options.dryRun);
  summary.registryUpdated = await updateRegistryPaths(options.dryRun);
  return summary;
}

function ensureLibraryDirs(papersDir: string, dryRun: boolean): void {
  for (const name of libraryFolderNames) {
    const dir = join(papersDir, name);
    if (existsSync(dir)) continue;

    console.log(`[migrate] ${dryRun ? "Would create" : "Creating"} ${dir}`);
    if (!dryRun) {
      mkdirSync(dir, { recursive: true });
    }
  }
}

function collectMoves(papersDir: string): PlannedMove[] {
  if (!existsSync(papersDir)) {
    throw new Error(`Papers folder does not exist: ${papersDir}`);
  }

  const moves: PlannedMove[] = [];
  for (const name of readdirSync(papersDir)) {
    const paperDir = join(papersDir, name);
    if (libraryFolderNames.has(name) || !statSync(paperDir).isDirectory()) continue;

    moves.push(...collectPaperDirMoves(papersDir, name, paperDir));
  }
  return moves;
}

function collectPaperDirMoves(
  papersDir: string,
  citekey: string,
  paperDir: string
): PlannedMove[] {
  const candidates: Array<[string, PlannedMove["kind"], string]> = [
    [`${citekey}.md`, "reference", referenceFolderName],
    [`${citekey}_body.md`, "body", bodyFolderName],
    [`${citekey}_summary.md`, "summary", summariesFolderName],
  ];

  return candidates
    .map(([fileName, kind, folderName]) => ({
      citekey,
      sourcePath: join(paperDir, fileName),
      destinationPath: join(papersDir, folderName, fileName),
      kind,
    }))
    .filter((move) => existsSync(move.sourcePath));
}

function removeEmptyLegacyDirs(papersDir: string, dryRun: boolean): number {
  let removed = 0;
  for (const name of readdirSync(papersDir)) {
    const paperDir = join(papersDir, name);
    if (libraryFolderNames.has(name) || !statSync(paperDir).isDirectory()) continue;
    if (readdirSync(paperDir).length > 0) continue;

    console.log(`[migrate] ${dryRun ? "Would remove empty directory" : "Removing empty directory"} ${paperDir}`);
    if (!dryRun) {
      rmdirSync(paperDir);
    }
    removed++;
  }
  return removed;
}

async function updateRegistryPaths(dryRun: boolean): Promise<number> {
  let updated = 0;
  for (const [citekey, entry] of Object.entries(getAllEntries())) {
    const nextVaultPath = join(
      config.obsidianPapersFolder,
      referenceFolderName,
      `${citekey}.md`
    );
    if (entry.vaultPath === nextVaultPath) continue;

    console.log(`[migrate] ${dryRun ? "Would update" : "Updating"} registry path for ${citekey}: ${nextVaultPath}`);
    if (!dryRun) {
      await markSynced(citekey, nextVaultPath, {
        bibtexHash: entry.bibtexHash,
        pdfDriveId: entry.pdfDriveId,
        pdfModifiedTime: entry.pdfModifiedTime,
        bodyStatus: entry.bodyStatus,
      });
    }
    updated++;
  }
  return updated;
}
