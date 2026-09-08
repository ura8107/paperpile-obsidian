#!/usr/bin/env bun
/**
 * Import Google OAuth client credentials from the JSON file that Google Cloud
 * Console hands out ("Download JSON" on the OAuth client), so nobody has to
 * copy a client ID and secret by hand.
 *
 * Run:
 *   bun run setup:google-client                     Auto-detect and write .env
 *   bun run setup:google-client --list              Only list candidate files
 *   bun run setup:google-client <path/to/file.json> Use a specific file
 */
import { maskSecret, updateEnvFile, repoRoot } from "./lib/envFile.ts";
import { findGoogleClientSecretFiles, readGoogleClientSecretFile } from "./lib/discover.ts";

const args = process.argv.slice(2);
const listOnly = args.includes("--list");
const asJson = args.includes("--json");
const explicitPath = args.find((arg) => !arg.startsWith("--"));

const candidates = explicitPath ? [explicitPath] : findGoogleClientSecretFiles(repoRoot);

if (listOnly || asJson) {
  const output = { candidates };
  console.log(asJson ? JSON.stringify(output, null, 2) : candidates.join("\n") || "(none found)");
  process.exit(0);
}

if (candidates.length === 0) {
  console.error(
    [
      "No client_secret_*.json found in ~/Downloads, your home directory, or this repository.",
      "",
      "In Google Cloud Console:",
      "  1. Create (or open) a project",
      "  2. APIs & Services > Library > enable 'Google Drive API'",
      "  3. APIs & Services > Credentials > Create credentials > OAuth client ID",
      "  4. Application type: Desktop app",
      "  5. Download JSON, then re-run this command",
      "",
      "Or pass the client ID and secret directly:",
      "  bun run setup:env --set GOOGLE_CLIENT_ID=... --set GOOGLE_CLIENT_SECRET=...",
    ].join("\n")
  );
  process.exit(1);
}

if (candidates.length > 1 && !explicitPath) {
  console.error("Multiple OAuth client files found. Re-run with the one you want:");
  for (const candidate of candidates) console.error(`  bun run setup:google-client ${candidate}`);
  process.exit(1);
}

const path = candidates[0]!;
const credentials = readGoogleClientSecretFile(path);

if (credentials.clientType === "web") {
  console.warn(
    "[warn] This is a 'web' OAuth client. `bun run oauth` expects a 'Desktop app' client and may be rejected with redirect_uri_mismatch."
  );
}

const result = updateEnvFile({
  GOOGLE_CLIENT_ID: credentials.clientId,
  GOOGLE_CLIENT_SECRET: credentials.clientSecret,
});

console.log(`Imported OAuth client from ${path}`);
if (result.backupPath) console.log(`Backup written to ${result.backupPath}`);
console.log(`  GOOGLE_CLIENT_ID=${credentials.clientId}`);
console.log(`  GOOGLE_CLIENT_SECRET=${maskSecret(credentials.clientSecret)}`);
console.log("\nNext: bun run oauth --write-env");
