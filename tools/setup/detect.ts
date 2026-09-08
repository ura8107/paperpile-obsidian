#!/usr/bin/env bun
/**
 * Report everything the guided setup can discover without human input.
 *
 * Run: bun run setup:detect          (human-readable)
 *      bun run setup:detect --json   (machine-readable, for an AI assistant)
 */
import { existsSync } from "node:fs";
import { homedir, platform, release } from "node:os";
import { join } from "node:path";
import { loadEnvIntoProcess, maskSecret, readEnvFile, repoRoot, envPath } from "./lib/envFile.ts";
import {
  detectBinary,
  findGoogleClientSecretFiles,
  findPaperpileJsonExports,
  findVaultCandidates,
  obsidianConfigPath,
} from "./lib/discover.ts";

const REQUIRED_ENV_KEYS = [
  "OBSIDIAN_VAULT_PATH",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "GOOGLE_REFRESH_TOKEN",
  "DRIVE_PAPERPILE_FOLDER_ID",
  "DRIVE_BIB_FILE_ID",
] as const;

const SECRET_ENV_KEYS = new Set(["GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN"]);

export async function collectDetection() {
  loadEnvIntoProcess();
  const env = readEnvFile();

  const venvMarkitdown = join(repoRoot, ".venv/bin/markitdown");
  const [bun, python3, git, markitdown] = await Promise.all([
    detectBinary("bun", [join(homedir(), ".bun/bin/bun"), "/opt/homebrew/bin/bun"]),
    detectBinary("python3"),
    detectBinary("git"),
    detectBinary("markitdown", [venvMarkitdown]),
  ]);

  const vaultCandidates = findVaultCandidates(repoRoot);
  const clientSecretFiles = findGoogleClientSecretFiles(repoRoot);
  const paperpileJsonFiles = findPaperpileJsonExports(repoRoot);

  const missingEnvKeys = REQUIRED_ENV_KEYS.filter((key) => !env[key] || isPlaceholder(env[key]!));

  return {
    platform: { os: platform(), release: release(), home: homedir() },
    repoRoot,
    env: {
      path: envPath,
      exists: existsSync(envPath),
      values: Object.fromEntries(
        Object.entries(env).map(([key, value]) => [
          key,
          SECRET_ENV_KEYS.has(key) ? maskSecret(value) : value,
        ])
      ),
      missingRequiredKeys: missingEnvKeys,
      complete: missingEnvKeys.length === 0,
    },
    binaries: { bun, python3, git, markitdown },
    installState: {
      nodeModules: existsSync(join(repoRoot, "node_modules")),
      venv: existsSync(join(repoRoot, ".venv")),
      venvMarkitdown: existsSync(venvMarkitdown) ? venvMarkitdown : undefined,
    },
    obsidian: {
      configPath: obsidianConfigPath(),
      vaultCandidates,
      recommendedVault:
        vaultCandidates.find((candidate) => candidate.source === "obsidian-config" && candidate.exists)?.path ??
        vaultCandidates.find((candidate) => candidate.exists)?.path,
    },
    google: {
      clientSecretFiles,
      hasClientCredentials: Boolean(
        env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && !isPlaceholder(env.GOOGLE_CLIENT_ID)
      ),
      hasRefreshToken: Boolean(env.GOOGLE_REFRESH_TOKEN && !isPlaceholder(env.GOOGLE_REFRESH_TOKEN)),
    },
    paperpile: {
      localJsonExports: paperpileJsonFiles,
      driveFolderId: env.DRIVE_PAPERPILE_FOLDER_ID,
      driveBibFileId: env.DRIVE_BIB_FILE_ID,
      driveJsonFileId: env.DRIVE_JSON_FILE_ID,
      jsonPath: env.PAPERPILE_JSON_PATH,
    },
    nextStep: suggestNextStep({
      bunFound: bun.found,
      nodeModules: existsSync(join(repoRoot, "node_modules")),
      venvMarkitdown: existsSync(venvMarkitdown),
      env,
    }),
  };
}

export function isPlaceholder(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed === "" ||
    trimmed.startsWith("...") ||
    trimmed.endsWith("...") ||
    trimmed.includes("path/to/") ||
    trimmed === "1abc..." ||
    trimmed === "1def..."
  );
}

function suggestNextStep(state: {
  bunFound: boolean;
  nodeModules: boolean;
  venvMarkitdown: boolean;
  env: Record<string, string>;
}): string {
  const { env } = state;
  if (!state.bunFound) return "Install Bun: https://bun.sh";
  if (!state.nodeModules) return "bun install";
  if (!state.venvMarkitdown) return "./tools/install-markitdown.sh";
  if (!env.OBSIDIAN_VAULT_PATH || isPlaceholder(env.OBSIDIAN_VAULT_PATH))
    return "Choose a vault, then: bun run setup:env --vault <path>";
  if (!env.GOOGLE_CLIENT_ID || isPlaceholder(env.GOOGLE_CLIENT_ID))
    return "bun run setup:google-client (imports client_secret_*.json from Google Cloud Console)";
  if (!env.GOOGLE_REFRESH_TOKEN || isPlaceholder(env.GOOGLE_REFRESH_TOKEN))
    return "bun run oauth --write-env";
  if (!env.DRIVE_BIB_FILE_ID || isPlaceholder(env.DRIVE_BIB_FILE_ID))
    return "bun run setup:drive-ids --write-env";
  return "bun run doctor";
}

if (import.meta.main) {
  const detection = await collectDetection();

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(detection, null, 2));
  } else {
    printHuman(detection);
  }
}

function printHuman(detection: Awaited<ReturnType<typeof collectDetection>>): void {
  const yesNo = (value: unknown) => (value ? "yes" : "no");

  console.log("\n=== paperpile-obsidian setup detection ===");
  console.log(`Repo:      ${detection.repoRoot}`);
  console.log(`Platform:  ${detection.platform.os}`);
  console.log("");

  console.log("Tools:");
  for (const info of Object.values(detection.binaries)) {
    console.log(
      `  ${info.name.padEnd(11)} ${info.found ? `${info.path} (${info.version ?? "?"})` : "not found"}`
    );
  }
  console.log(`  node_modules ${yesNo(detection.installState.nodeModules)}`);
  console.log(`  .venv        ${yesNo(detection.installState.venv)}`);
  console.log("");

  console.log("Obsidian vault candidates:");
  if (detection.obsidian.vaultCandidates.length === 0) {
    console.log("  (none found)");
  }
  for (const candidate of detection.obsidian.vaultCandidates) {
    const marker = candidate.path === detection.obsidian.recommendedVault ? "*" : " ";
    const opened = candidate.lastOpenedAt ? ` last opened ${candidate.lastOpenedAt.slice(0, 10)}` : "";
    console.log(`  ${marker} ${candidate.path}  [${candidate.source}]${opened}`);
  }
  console.log("");

  console.log("Google OAuth:");
  console.log(`  client credentials in .env: ${yesNo(detection.google.hasClientCredentials)}`);
  console.log(`  refresh token in .env:      ${yesNo(detection.google.hasRefreshToken)}`);
  console.log(
    `  downloaded client files:    ${
      detection.google.clientSecretFiles.length > 0
        ? detection.google.clientSecretFiles.join(", ")
        : "(none found)"
    }`
  );
  console.log("");

  console.log(".env:");
  console.log(`  path:    ${detection.env.path}`);
  console.log(`  exists:  ${yesNo(detection.env.exists)}`);
  console.log(
    `  missing: ${
      detection.env.missingRequiredKeys.length > 0
        ? detection.env.missingRequiredKeys.join(", ")
        : "(nothing required)"
    }`
  );
  console.log("");
  console.log(`Next step: ${detection.nextStep}`);
}
