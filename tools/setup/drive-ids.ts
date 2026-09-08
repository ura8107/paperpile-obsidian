#!/usr/bin/env bun
/**
 * Find the Paperpile Google Drive sync folder, `paperpile.bib`, and an optional
 * full-library JSON export via the Drive API, so the IDs never have to be
 * copied out of browser URLs.
 *
 * Run:
 *   bun run setup:drive-ids                Show what was found
 *   bun run setup:drive-ids --write-env    Write confident matches into .env
 *   bun run setup:drive-ids --json         Machine-readable output
 *
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN.
 */
import { google, type drive_v3 } from "googleapis";
import { loadEnvIntoProcess, updateEnvFile } from "./lib/envFile.ts";

loadEnvIntoProcess();

const args = process.argv.slice(2);
const writeEnv = args.includes("--write-env");
const asJson = args.includes("--json");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

if (!clientId || !clientSecret || !refreshToken) {
  fail(
    "Missing Google credentials in .env. Run `bun run setup:google-client` and then `bun run oauth` first."
  );
}

const auth = new google.auth.OAuth2(clientId, clientSecret);
auth.setCredentials({ refresh_token: refreshToken });
const drive = google.drive({ version: "v3", auth });

const FILE_FIELDS = "files(id, name, mimeType, modifiedTime, parents, size)";

export interface FolderCandidate {
  id: string;
  name: string;
  score: number;
  reasons: string[];
  bibFileId?: string;
  bibFileName?: string;
  jsonFileId?: string;
  jsonFileName?: string;
  pdfCount?: number;
}

const bibFiles = await listFiles("name = 'paperpile.bib' and trashed = false");
const namedFolders = await listFiles(
  "mimeType = 'application/vnd.google-apps.folder' and name contains 'Paperpile' and trashed = false"
);

const folderIds = new Set<string>();
for (const file of [...bibFiles.flatMap((f) => f.parents ?? []), ...namedFolders.map((f) => f.id!)]) {
  if (file) folderIds.add(file);
}

const candidates: FolderCandidate[] = [];
for (const folderId of folderIds) {
  const candidate = await inspectFolder(folderId, bibFiles);
  if (candidate) candidates.push(candidate);
}
candidates.sort((a, b) => b.score - a.score);

const best = candidates[0];
const ambiguous =
  candidates.length > 1 && candidates[1] !== undefined && candidates[1].score === best?.score;

const result = {
  candidates,
  best: best ?? null,
  ambiguous,
  confident: Boolean(best && best.bibFileId && !ambiguous),
};

if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  printHuman();
}

if (writeEnv) {
  if (!result.confident || !best) {
    fail(
      "Not confident enough to write .env. Pick one and run:\n" +
        "  bun run setup:env --drive-folder-id <id> --drive-bib-id <id>"
    );
  }

  const update = updateEnvFile({
    DRIVE_PAPERPILE_FOLDER_ID: best.id,
    DRIVE_BIB_FILE_ID: best.bibFileId,
    DRIVE_JSON_FILE_ID: best.jsonFileId,
  });

  console.log(`\nUpdated ${update.path}:`);
  for (const [key, change] of Object.entries(update.changed)) {
    console.log(`  ${key}=${change.to}`);
  }
  if (update.unchanged.length > 0) console.log(`  (already set: ${update.unchanged.join(", ")})`);
  if (update.backupPath) console.log(`  backup: ${update.backupPath}`);
  console.log("\nNext: bun run doctor");
}

function printHuman(): void {
  console.log("\n=== Paperpile Drive discovery ===");
  if (candidates.length === 0) {
    console.log("No Paperpile folder found in this Google Drive account.");
    console.log("Check that Paperpile > Settings > Google Drive sync is enabled,");
    console.log("and that you authorized the same Google account in `bun run oauth`.");
    return;
  }

  for (const [index, candidate] of candidates.entries()) {
    const marker = index === 0 ? "*" : " ";
    console.log(`\n${marker} ${candidate.name}  (score ${candidate.score})`);
    console.log(`    folder id: ${candidate.id}`);
    console.log(`    bib:       ${candidate.bibFileId ?? "(not found)"} ${candidate.bibFileName ?? ""}`);
    console.log(`    json:      ${candidate.jsonFileId ?? "(none)"} ${candidate.jsonFileName ?? ""}`);
    console.log(`    pdfs seen: ${candidate.pdfCount ?? 0}`);
    console.log(`    signals:   ${candidate.reasons.join(", ")}`);
  }

  if (ambiguous) {
    console.log("\nSeveral folders scored the same. Choose one, then run:");
    console.log("  bun run setup:env --drive-folder-id <id> --drive-bib-id <id>");
  } else if (result.confident && !writeEnv) {
    console.log("\nLooks unambiguous. Write it with:");
    console.log("  bun run setup:drive-ids --write-env");
  }
}

async function inspectFolder(
  folderId: string,
  knownBibFiles: drive_v3.Schema$File[]
): Promise<FolderCandidate | null> {
  let folder: drive_v3.Schema$File;
  try {
    const res = await drive.files.get({ fileId: folderId, fields: "id, name, mimeType" });
    folder = res.data;
  } catch {
    return null;
  }
  if (folder.mimeType !== "application/vnd.google-apps.folder") return null;

  const children = await listFiles(`'${folderId}' in parents and trashed = false`);
  const reasons: string[] = [];
  let score = 0;

  if (/^paperpile$/i.test(folder.name ?? "")) {
    score += 3;
    reasons.push("folder named Paperpile");
  } else if (/paperpile/i.test(folder.name ?? "")) {
    score += 1;
    reasons.push("folder name contains Paperpile");
  }

  const bibChild =
    children.find((child) => child.name === "paperpile.bib") ??
    knownBibFiles.find((file) => (file.parents ?? []).includes(folderId));
  if (bibChild) {
    score += 4;
    reasons.push("contains paperpile.bib");
  }

  const allPapers = children.find(
    (child) =>
      child.mimeType === "application/vnd.google-apps.folder" && /^all papers$/i.test(child.name ?? "")
  );
  if (allPapers) {
    score += 3;
    reasons.push("contains 'All Papers'");
  }

  const jsonChild = children
    .filter((child) => (child.name ?? "").toLowerCase().endsWith(".json"))
    .sort((a, b) => (b.modifiedTime ?? "").localeCompare(a.modifiedTime ?? ""))[0];
  if (jsonChild) {
    score += 1;
    reasons.push("contains a JSON export");
  }

  let pdfCount = children.filter((child) => child.mimeType === "application/pdf").length;
  if (allPapers?.id) {
    const pdfs = await listFiles(
      `'${allPapers.id}' in parents and mimeType = 'application/pdf' and trashed = false`,
      200
    );
    pdfCount += pdfs.length;
  }
  if (pdfCount > 0) {
    score += 2;
    reasons.push(`${pdfCount} PDFs visible`);
  }

  return {
    id: folderId,
    name: folder.name ?? "(unnamed)",
    score,
    reasons,
    bibFileId: bibChild?.id ?? undefined,
    bibFileName: bibChild?.name ?? undefined,
    jsonFileId: jsonChild?.id ?? undefined,
    jsonFileName: jsonChild?.name ?? undefined,
    pdfCount,
  };
}

async function listFiles(q: string, maxResults = 1000): Promise<drive_v3.Schema$File[]> {
  const files: drive_v3.Schema$File[] = [];
  let pageToken: string | undefined;

  do {
    let res;
    try {
      res = await drive.files.list({
        q,
        fields: `nextPageToken, ${FILE_FIELDS}`,
        pageSize: Math.min(1000, maxResults),
        pageToken,
      });
    } catch (err) {
      fail(driveErrorMessage(err));
    }
    files.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken && files.length < maxResults);

  return files.slice(0, maxResults);
}

function driveErrorMessage(err: unknown): string {
  const message = (err as Error).message ?? String(err);

  if (/invalid_grant/i.test(message)) {
    return `Google rejected the refresh token (${message}).\nRe-authorize with: bun run oauth`;
  }
  if (/invalid_client|unauthorized_client/i.test(message)) {
    return `Google rejected the OAuth client (${message}).\nRe-import the client file with: bun run setup:google-client`;
  }
  if (/insufficient|forbidden|403/i.test(message)) {
    return `Google Drive denied the request (${message}).\nMake sure the Drive API is enabled in the same Google Cloud project, then re-run: bun run oauth`;
  }
  return `Google Drive API error: ${message}`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}
