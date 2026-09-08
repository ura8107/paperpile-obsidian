/**
 * Filesystem discovery helpers used by the guided setup.
 *
 * The goal is to find every value the setup normally asks a human to type —
 * Obsidian vault paths, binaries, the downloaded Google OAuth client file — so
 * the human only has to confirm a choice instead of hunting for paths.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

export interface VaultCandidate {
  path: string;
  source: "obsidian-config" | "filesystem" | "repo";
  lastOpenedAt?: string;
  isOpen?: boolean;
  exists: boolean;
}

export interface BinaryInfo {
  name: string;
  path?: string;
  version?: string;
  found: boolean;
}

export function obsidianConfigPath(): string | undefined {
  const home = homedir();
  const candidates =
    platform() === "darwin"
      ? [join(home, "Library/Application Support/obsidian/obsidian.json")]
      : platform() === "win32"
        ? [join(process.env.APPDATA ?? join(home, "AppData/Roaming"), "obsidian/obsidian.json")]
        : [
            join(process.env.XDG_CONFIG_HOME ?? join(home, ".config"), "obsidian/obsidian.json"),
            join(home, ".var/app/md.obsidian.Obsidian/config/obsidian/obsidian.json"),
          ];

  return candidates.find((candidate) => existsSync(candidate));
}

/** Vaults Obsidian itself knows about. This is the most reliable source. */
export function vaultsFromObsidianConfig(): VaultCandidate[] {
  const configPath = obsidianConfigPath();
  if (!configPath) return [];

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf-8")) as {
      vaults?: Record<string, { path?: string; ts?: number; open?: boolean }>;
    };
    return Object.values(parsed.vaults ?? {})
      .filter((vault): vault is { path: string; ts?: number; open?: boolean } => Boolean(vault.path))
      .map((vault) => ({
        path: vault.path,
        source: "obsidian-config" as const,
        lastOpenedAt: vault.ts ? new Date(vault.ts).toISOString() : undefined,
        isOpen: vault.open,
        exists: existsSync(vault.path),
      }))
      .sort((a, b) => (b.lastOpenedAt ?? "").localeCompare(a.lastOpenedAt ?? ""));
  } catch {
    return [];
  }
}

/** Fallback scan for `.obsidian/` directories under the usual document roots. */
export function vaultsFromFilesystem(maxDepth = 4): VaultCandidate[] {
  const home = homedir();
  const roots = [
    home,
    join(home, "Documents"),
    join(home, "Library/Mobile Documents/iCloud~md~obsidian/Documents"),
    join(home, "Dropbox"),
    join(home, "Library/CloudStorage"),
  ].filter((root) => existsSync(root));

  const found = new Set<string>();
  const skipDirs = new Set([
    "node_modules",
    ".git",
    ".venv",
    "Library",
    "Applications",
    ".Trash",
    ".cache",
    ".npm",
    ".bun",
  ]);

  const walk = (dir: string, depth: number) => {
    if (depth > maxDepth) return;

    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    if (entries.some((entry) => entry.isDirectory() && entry.name === ".obsidian")) {
      found.add(dir);
      return; // vaults are not nested inside each other
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".") && entry.name !== ".obsidian") continue;
      if (skipDirs.has(entry.name)) continue;
      walk(join(dir, entry.name), depth + 1);
    }
  };

  for (const root of roots) {
    // Allow one extra level inside CloudStorage/Mobile Documents wrappers.
    walk(root, root === home ? 1 : 0);
  }

  return [...found].map((path) => ({
    path,
    source: "filesystem" as const,
    exists: true,
  }));
}

export function findVaultCandidates(repoRoot: string): VaultCandidate[] {
  const byPath = new Map<string, VaultCandidate>();

  for (const candidate of [...vaultsFromObsidianConfig(), ...vaultsFromFilesystem()]) {
    const key = resolve(candidate.path);
    if (!byPath.has(key)) byPath.set(key, { ...candidate, path: key });
  }

  // Storing notes inside this repository is always an option (README default).
  if (!byPath.has(resolve(repoRoot))) {
    byPath.set(resolve(repoRoot), {
      path: resolve(repoRoot),
      source: "repo",
      exists: true,
    });
  }

  return [...byPath.values()];
}

export async function detectBinary(name: string, extraPaths: string[] = []): Promise<BinaryInfo> {
  const fromPath = Bun.which(name) ?? extraPaths.find((candidate) => isExecutable(candidate));
  if (!fromPath) return { name, found: false };

  let version: string | undefined;
  try {
    const proc = Bun.spawn([fromPath, "--version"], { stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    await proc.exited;
    version = (stdout.trim() || stderr.trim()).split("\n")[0];
  } catch {
    version = undefined;
  }

  return { name, path: fromPath, version, found: true };
}

export function isExecutable(path: string): boolean {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Locate `client_secret_*.json` files downloaded from Google Cloud Console.
 */
export function findGoogleClientSecretFiles(repoRoot: string): string[] {
  const home = homedir();
  const searchDirs = [join(home, "Downloads"), home, repoRoot, join(repoRoot, "secrets")];
  const results: { path: string; mtimeMs: number }[] = [];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isFile()) continue;
      if (!/^client_secret.*\.json$/i.test(entry.name)) continue;
      const path = join(dir, entry.name);
      try {
        results.push({ path, mtimeMs: statSync(path).mtimeMs });
      } catch {
        // ignore unreadable entries
      }
    }
  }

  return results.sort((a, b) => b.mtimeMs - a.mtimeMs).map((entry) => entry.path);
}

export interface GoogleClientCredentials {
  clientId: string;
  clientSecret: string;
  clientType: "installed" | "web";
}

export function readGoogleClientSecretFile(path: string): GoogleClientCredentials {
  const parsed = JSON.parse(readFileSync(path, "utf-8")) as Record<
    string,
    { client_id?: string; client_secret?: string } | undefined
  >;

  for (const clientType of ["installed", "web"] as const) {
    const section = parsed[clientType];
    if (section?.client_id && section.client_secret) {
      return {
        clientId: section.client_id,
        clientSecret: section.client_secret,
        clientType,
      };
    }
  }

  throw new Error(
    `${path} does not look like a Google OAuth client file (no "installed" or "web" section).`
  );
}

/** Local Paperpile JSON exports, used for folder/label sync. */
export function findPaperpileJsonExports(repoRoot: string): string[] {
  const home = homedir();
  const searchDirs = [join(home, "Downloads"), repoRoot, join(home, "Documents")];
  const results: { path: string; mtimeMs: number }[] = [];

  for (const dir of searchDirs) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".json")) continue;
      if (!/paperpile/i.test(entry.name)) continue;
      const path = join(dir, entry.name);
      try {
        results.push({ path, mtimeMs: statSync(path).mtimeMs });
      } catch {
        // ignore
      }
    }
  }

  return results.sort((a, b) => b.mtimeMs - a.mtimeMs).map((entry) => entry.path);
}
