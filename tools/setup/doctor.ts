#!/usr/bin/env bun
/**
 * End-to-end configuration check with an actionable fix for every failure.
 *
 * Run:
 *   bun run doctor
 *   bun run doctor --json    Machine-readable, for an AI assistant
 *
 * Exit code is 1 when any required check fails, so it can gate the setup flow.
 */
import { accessSync, constants, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { google } from "googleapis";
import { loadEnvIntoProcess, readEnvFile, repoRoot } from "./lib/envFile.ts";
import { isPlaceholder } from "./detect.ts";
import { parseBibTeX } from "../../src/bibtex/parser.ts";

loadEnvIntoProcess();

const asJson = process.argv.includes("--json");
const env = readEnvFile();

type Status = "ok" | "warn" | "fail";

interface Check {
  name: string;
  status: Status;
  detail: string;
  fix?: string;
}

const checks: Check[] = [];

function record(name: string, status: Status, detail: string, fix?: string): Check {
  const check: Check = { name, status, detail, fix };
  checks.push(check);
  return check;
}

function value(key: string): string | undefined {
  const raw = env[key] ?? process.env[key];
  if (!raw || isPlaceholder(raw)) return undefined;
  return raw;
}

function expandTilde(path: string): string {
  return path.startsWith("~/") ? resolve(homedir(), path.slice(2)) : resolve(path);
}

// 1. Toolchain -------------------------------------------------------------
const bunPath = Bun.which("bun");
record(
  "bun",
  bunPath ? "ok" : "fail",
  bunPath ? `${bunPath} (${Bun.version})` : "not found on PATH",
  "Install Bun: https://bun.sh"
);

record(
  "dependencies",
  existsSync(join(repoRoot, "node_modules")) ? "ok" : "fail",
  existsSync(join(repoRoot, "node_modules")) ? "node_modules present" : "node_modules missing",
  "bun install"
);

// 2. .env ------------------------------------------------------------------
const requiredKeys = [
  "OBSIDIAN_VAULT_PATH",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "DRIVE_PAPERPILE_FOLDER_ID",
  "DRIVE_BIB_FILE_ID",
];
const missing = requiredKeys.filter((key) => !value(key));
record(
  ".env",
  missing.length === 0 ? "ok" : "fail",
  missing.length === 0 ? "all required keys set" : `missing or placeholder: ${missing.join(", ")}`,
  "bun run setup:detect   (shows the next command for the missing values)"
);

// 3. Vault -----------------------------------------------------------------
const vaultRaw = value("OBSIDIAN_VAULT_PATH");
if (!vaultRaw) {
  record("vault", "fail", "OBSIDIAN_VAULT_PATH is not set", "bun run setup:env --vault <path>");
} else {
  const vaultPath = expandTilde(vaultRaw);
  const papersFolder = value("OBSIDIAN_PAPERS_FOLDER") ?? "Papers";
  if (!existsSync(vaultPath)) {
    record("vault", "fail", `does not exist: ${vaultPath}`, "bun run setup:env --vault <path>");
  } else if (!statSync(vaultPath).isDirectory()) {
    record("vault", "fail", `not a directory: ${vaultPath}`, "bun run setup:env --vault <path>");
  } else {
    try {
      accessSync(vaultPath, constants.W_OK);
      const obsidianMarker = existsSync(join(vaultPath, ".obsidian"));
      record(
        "vault",
        obsidianMarker ? "ok" : "warn",
        `${vaultPath} (papers folder: ${papersFolder})${obsidianMarker ? "" : " — no .obsidian/ found; confirm this is the vault you open in Obsidian"}`
      );
    } catch {
      record("vault", "fail", `not writable: ${vaultPath}`, "Grant write access or choose another vault");
    }
  }
}

// 4. markitdown ------------------------------------------------------------
const markitdownBin = value("MARKITDOWN_BIN") ?? join(repoRoot, ".venv/bin/markitdown");
if (!existsSync(expandTilde(markitdownBin))) {
  record(
    "markitdown",
    "fail",
    `not found: ${markitdownBin}`,
    "./tools/install-markitdown.sh && bun run setup:env"
  );
} else {
  const proc = Bun.spawn([expandTilde(markitdownBin), "--help"], { stdout: "pipe", stderr: "pipe" });
  const exitCode = await proc.exited;
  record(
    "markitdown",
    exitCode === 0 ? "ok" : "fail",
    exitCode === 0 ? expandTilde(markitdownBin) : `${markitdownBin} exited with ${exitCode}`,
    "rm -rf .venv && ./tools/install-markitdown.sh"
  );
}

// 5. Registry path ---------------------------------------------------------
const registryPath = expandTilde(value("REGISTRY_PATH") ?? "~/.paperpile-obsidian/processed.json");
try {
  mkdirSync(dirname(registryPath), { recursive: true });
  record("registry", "ok", registryPath);
} catch (err) {
  record("registry", "fail", `cannot create ${dirname(registryPath)}: ${(err as Error).message}`);
}

// 6. Google Drive ----------------------------------------------------------
const clientId = value("GOOGLE_CLIENT_ID");
const clientSecret = value("GOOGLE_CLIENT_SECRET");
const refreshToken = value("GOOGLE_REFRESH_TOKEN");
let bibEntryCount: number | undefined;

if (!clientId || !clientSecret || !refreshToken) {
  record(
    "google auth",
    "fail",
    "Google credentials incomplete",
    "bun run setup:google-client && bun run oauth"
  );
} else {
  const auth = new google.auth.OAuth2(clientId, clientSecret);
  auth.setCredentials({ refresh_token: refreshToken });
  const drive = google.drive({ version: "v3", auth });

  try {
    await auth.getAccessToken();
    record("google auth", "ok", "refresh token exchanged for an access token");

    const folderId = value("DRIVE_PAPERPILE_FOLDER_ID");
    if (folderId) {
      try {
        const res = await drive.files.get({ fileId: folderId, fields: "id, name, mimeType" });
        const isFolder = res.data.mimeType === "application/vnd.google-apps.folder";
        record(
          "drive folder",
          isFolder ? "ok" : "fail",
          `${res.data.name} (${res.data.mimeType})`,
          isFolder ? undefined : "bun run setup:drive-ids --write-env"
        );
      } catch (err) {
        record(
          "drive folder",
          "fail",
          `cannot read DRIVE_PAPERPILE_FOLDER_ID: ${(err as Error).message}`,
          "bun run setup:drive-ids --write-env"
        );
      }
    }

    const bibId = value("DRIVE_BIB_FILE_ID");
    if (bibId) {
      try {
        const res = await drive.files.get({ fileId: bibId, alt: "media" }, { responseType: "text" });
        const text = String(res.data);
        bibEntryCount = parseBibTeX(text).length;
        record(
          "paperpile.bib",
          bibEntryCount > 0 ? "ok" : "warn",
          `${bibEntryCount} entries parsed (${text.length} chars)`,
          bibEntryCount > 0 ? undefined : "Check that this file is your Paperpile BibTeX export"
        );
      } catch (err) {
        record(
          "paperpile.bib",
          "fail",
          `cannot download DRIVE_BIB_FILE_ID: ${(err as Error).message}`,
          "bun run setup:drive-ids --write-env"
        );
      }
    }

    const jsonId = value("DRIVE_JSON_FILE_ID");
    const jsonPath = value("PAPERPILE_JSON_PATH");
    if (jsonPath) {
      record(
        "paperpile json",
        existsSync(expandTilde(jsonPath)) ? "ok" : "fail",
        `local export: ${expandTilde(jsonPath)}`,
        "bun run setup:env --paperpile-json <path>"
      );
    } else if (jsonId) {
      try {
        const res = await drive.files.get({ fileId: jsonId, fields: "id, name, size" });
        record("paperpile json", "ok", `Drive export: ${res.data.name}`);
      } catch (err) {
        record(
          "paperpile json",
          "warn",
          `cannot read DRIVE_JSON_FILE_ID: ${(err as Error).message}`,
          "Remove DRIVE_JSON_FILE_ID or re-run bun run setup:drive-ids"
        );
      }
    } else {
      record(
        "paperpile json",
        "warn",
        "not configured — Paperpile folders/labels will not appear in Obsidian frontmatter",
        "Optional: bun run setup:drive-ids --write-env, or bun run setup:env --paperpile-json <path>"
      );
    }
  } catch (err) {
    record(
      "google auth",
      "fail",
      `token exchange failed: ${(err as Error).message}`,
      "bun run oauth   (re-authorize; the refresh token may be revoked or from another account)"
    );
  }
}

// Report -------------------------------------------------------------------
const failed = checks.filter((check) => check.status === "fail");
const warned = checks.filter((check) => check.status === "warn");

if (asJson) {
  console.log(
    JSON.stringify(
      { ok: failed.length === 0, checks, bibEntryCount, failed: failed.length, warnings: warned.length },
      null,
      2
    )
  );
} else {
  console.log("\n=== paperpile-obsidian doctor ===");
  for (const check of checks) {
    const icon = check.status === "ok" ? "OK  " : check.status === "warn" ? "WARN" : "FAIL";
    console.log(`[${icon}] ${check.name}: ${check.detail}`);
    if (check.status !== "ok" && check.fix) console.log(`       fix: ${check.fix}`);
  }
  console.log("");
  if (failed.length === 0) {
    console.log("Configuration looks good.");
    console.log("Next: bun run status, then process one paper:");
    console.log("  bun run src/index.ts sync --incomplete-only --limit 1");
  } else {
    console.log(`${failed.length} check(s) failed. Fix them in the order listed above.`);
  }
}

process.exit(failed.length === 0 ? 0 : 1);
