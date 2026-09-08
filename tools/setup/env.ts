#!/usr/bin/env bun
/**
 * Write local configuration into `.env` without hand-editing the file.
 *
 * Run:
 *   bun run setup:env --vault ~/Documents/MyVault
 *   bun run setup:env --vault . --papers-folder paperpile-data
 *   bun run setup:env --paperpile-json ~/Downloads/paperpile.json
 *   bun run setup:env --set POLL_INTERVAL_MS=900000
 *
 * `--markitdown-bin` defaults to this repository's `.venv/bin/markitdown`
 * whenever that file exists, so nobody has to type an absolute path.
 */
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { maskSecret, repoRoot, updateEnvFile } from "./lib/envFile.ts";

interface Options {
  updates: Record<string, string>;
  warnings: string[];
  dryRun: boolean;
}

function expandPath(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/")) return join(homedir(), value.slice(2));
  return resolve(value);
}

function takeValue(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    console.error(`${flag} requires a value.`);
    process.exit(1);
  }
  return value;
}

function parseArgs(args: string[]): Options {
  const updates: Record<string, string> = {};
  const warnings: string[] = [];
  let dryRun = false;
  let markitdownExplicit = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    switch (arg) {
      case "--vault": {
        const vaultPath = expandPath(takeValue(args, i++, arg));
        if (!existsSync(vaultPath)) warnings.push(`Vault path does not exist yet: ${vaultPath}`);
        else if (!existsSync(join(vaultPath, ".obsidian")))
          warnings.push(
            `No .obsidian/ directory in ${vaultPath}. That is fine for a new vault, but confirm it is the intended one.`
          );
        updates.OBSIDIAN_VAULT_PATH = vaultPath;
        break;
      }
      case "--papers-folder":
        updates.OBSIDIAN_PAPERS_FOLDER = takeValue(args, i++, arg);
        break;
      case "--markitdown-bin":
        updates.MARKITDOWN_BIN = expandPath(takeValue(args, i++, arg));
        markitdownExplicit = true;
        break;
      case "--paperpile-json":
        updates.PAPERPILE_JSON_PATH = expandPath(takeValue(args, i++, arg));
        if (!existsSync(updates.PAPERPILE_JSON_PATH))
          warnings.push(`Paperpile JSON export not found: ${updates.PAPERPILE_JSON_PATH}`);
        break;
      case "--drive-folder-id":
        updates.DRIVE_PAPERPILE_FOLDER_ID = takeValue(args, i++, arg);
        break;
      case "--drive-bib-id":
        updates.DRIVE_BIB_FILE_ID = takeValue(args, i++, arg);
        break;
      case "--drive-json-id":
        updates.DRIVE_JSON_FILE_ID = takeValue(args, i++, arg);
        break;
      case "--set": {
        const pair = takeValue(args, i++, arg);
        const eq = pair.indexOf("=");
        if (eq < 1) {
          console.error(`--set expects KEY=VALUE, got: ${pair}`);
          process.exit(1);
        }
        updates[pair.slice(0, eq)] = pair.slice(eq + 1);
        break;
      }
      case "--dry-run":
        dryRun = true;
        break;
      case "--help":
      case "-h":
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown argument: ${arg}`);
        printUsage();
        process.exit(1);
    }
  }

  const venvMarkitdown = join(repoRoot, ".venv/bin/markitdown");
  if (!markitdownExplicit && existsSync(venvMarkitdown)) {
    updates.MARKITDOWN_BIN = venvMarkitdown;
  }

  return { updates, warnings, dryRun };
}

function printUsage(): void {
  console.log(`Usage: bun run setup:env [options]

  --vault <path>            Obsidian vault root (OBSIDIAN_VAULT_PATH)
  --papers-folder <name>    Folder inside the vault (OBSIDIAN_PAPERS_FOLDER)
  --markitdown-bin <path>   markitdown binary; defaults to ./.venv/bin/markitdown
  --paperpile-json <path>   Local Paperpile JSON export (PAPERPILE_JSON_PATH)
  --drive-folder-id <id>    DRIVE_PAPERPILE_FOLDER_ID
  --drive-bib-id <id>       DRIVE_BIB_FILE_ID
  --drive-json-id <id>      DRIVE_JSON_FILE_ID
  --set KEY=VALUE           Any other .env key
  --dry-run                 Show the planned changes without writing
`);
}

const { updates, warnings, dryRun } = parseArgs(process.argv.slice(2));

if (Object.keys(updates).length === 0) {
  printUsage();
  process.exit(0);
}

for (const warning of warnings) {
  console.warn(`[warn] ${warning}`);
}

if (dryRun) {
  console.log("Planned .env changes (dry run):");
  for (const [key, value] of Object.entries(updates)) {
    console.log(`  ${key}=${value}`);
  }
  process.exit(0);
}

const result = updateEnvFile(updates);

if (result.created) console.log(`Created ${result.path} from .env.example`);
if (result.backupPath) console.log(`Backup written to ${result.backupPath}`);

const changedKeys = Object.keys(result.changed);
if (changedKeys.length === 0) {
  console.log("No changes: .env already had these values.");
} else {
  console.log("Updated .env:");
  for (const key of changedKeys) {
    const value = result.changed[key]!.to;
    console.log(`  ${key}=${/SECRET|TOKEN/.test(key) ? maskSecret(value) : value}`);
  }
}
if (result.unchanged.length > 0) {
  console.log(`Already set: ${result.unchanged.join(", ")}`);
}
