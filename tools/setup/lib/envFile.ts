/**
 * Shared helpers for reading and updating the repository `.env` file.
 *
 * Setup scripts must not import `src/config.ts`, because that module throws
 * while the configuration is still incomplete — which is exactly the situation
 * these scripts exist to fix.
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

export const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
export const envPath = join(repoRoot, ".env");
export const envExamplePath = join(repoRoot, ".env.example");

export function parseEnvText(text: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;

    const [, key, rawValue] = match;
    values[key!] = unquote(rawValue!.trim());
  }
  return values;
}

export function readEnvFile(path = envPath): Record<string, string> {
  if (!existsSync(path)) return {};
  return parseEnvText(readFileSync(path, "utf-8"));
}

/**
 * Make `.env` values visible to scripts regardless of the current working
 * directory. Bun only auto-loads `.env` from the directory it was started in.
 * Existing `process.env` values always win, so a caller can override anything.
 */
export function loadEnvIntoProcess(path = envPath): Record<string, string> {
  const values = readEnvFile(path);
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return values;
}

export function ensureEnvFile(path = envPath): { created: boolean } {
  if (existsSync(path)) return { created: false };

  const seed = existsSync(envExamplePath) ? readFileSync(envExamplePath, "utf-8") : "";
  writeFileSync(path, seed, { mode: 0o600 });
  return { created: true };
}

export interface EnvUpdateResult {
  path: string;
  created: boolean;
  backupPath?: string;
  changed: Record<string, { from?: string; to: string }>;
  unchanged: string[];
}

/**
 * Write `updates` into `.env`, preserving comments, ordering and unrelated keys.
 *
 * - An active `KEY=...` line is edited in place.
 * - A commented-out `# KEY=...` line is replaced by the active assignment, so
 *   the optional keys documented in `.env.example` land in the right section.
 * - Anything else is appended at the end of the file.
 */
export function updateEnvFile(
  updates: Record<string, string | undefined>,
  path = envPath
): EnvUpdateResult {
  const { created } = ensureEnvFile(path);
  const original = readFileSync(path, "utf-8");
  const current = parseEnvText(original);

  const pending: Record<string, string> = {};
  const changed: EnvUpdateResult["changed"] = {};
  const unchanged: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined || value === "") continue;
    if (current[key] === value) {
      unchanged.push(key);
      continue;
    }
    pending[key] = value;
    changed[key] = { from: current[key], to: value };
  }

  if (Object.keys(pending).length === 0) {
    return { path, created, changed, unchanged };
  }

  let backupPath: string | undefined;
  if (!created) {
    backupPath = `${path}.bak`;
    copyFileSync(path, backupPath);
  }

  const lines = original.split("\n");
  const written = new Set<string>();

  const replaceLine = (index: number, key: string) => {
    lines[index] = `${key}=${formatValue(pending[key]!)}`;
    written.add(key);
  };

  for (const [key] of Object.entries(pending)) {
    const activeIndex = lines.findIndex((line) =>
      new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line)
    );
    if (activeIndex !== -1) {
      replaceLine(activeIndex, key);
      continue;
    }

    const commentedIndex = lines.findIndex((line) =>
      new RegExp(`^\\s*#\\s*(?:export\\s+)?${key}\\s*=`).test(line)
    );
    if (commentedIndex !== -1) {
      replaceLine(commentedIndex, key);
    }
  }

  const appended = Object.keys(pending).filter((key) => !written.has(key));
  if (appended.length > 0) {
    if (lines.length > 0 && lines[lines.length - 1]!.trim() !== "") lines.push("");
    lines.push("# Added by tools/setup");
    for (const key of appended) {
      lines.push(`${key}=${formatValue(pending[key]!)}`);
    }
    lines.push("");
  }

  writeFileSync(path, lines.join("\n"), { mode: 0o600 });
  return { path, created, backupPath, changed, unchanged };
}

export function maskSecret(value: string | undefined): string {
  if (!value) return "(unset)";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)} (${value.length} chars)`;
}

function formatValue(value: string): string {
  return /[\s"'#]/.test(value) ? JSON.stringify(value) : value;
}

function unquote(value: string): string {
  const withoutComment = value.startsWith('"') || value.startsWith("'")
    ? value
    : value.replace(/\s+#.*$/, "");
  const trimmed = withoutComment.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"') && trimmed.length > 1) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'") && trimmed.length > 1)
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}
