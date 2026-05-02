import { z } from "zod";
import { resolve } from "path";
import type { AppConfig } from "./types.ts";

const configFileDefaults = JSON.parse(
  await Bun.file(new URL("../config.json", import.meta.url).pathname).text()
);

const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1),
  OBSIDIAN_VAULT_PATH: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REFRESH_TOKEN: z.string().min(1),
  DRIVE_PAPERPILE_FOLDER_ID: z.string().min(1),
  DRIVE_BIB_FILE_ID: z.string().min(1),
  ANTHROPIC_MODEL: z.string().optional(),
  POLL_INTERVAL_MS: z.string().optional(),
  REGISTRY_PATH: z.string().optional(),
  OBSIDIAN_PAPERS_FOLDER: z.string().optional(),
  PDF_TEMP_DIR: z.string().optional(),
});

function parseEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const missing = result.error.issues
      .map((i) => i.path.join("."))
      .join(", ");
    throw new Error(`Missing required environment variables: ${missing}\nCopy .env.example to .env and fill in all required values.`);
  }
  return result.data;
}

function expandTilde(p: string): string {
  if (p.startsWith("~/")) {
    return resolve(process.env.HOME ?? "/tmp", p.slice(2));
  }
  return resolve(p);
}

export function loadConfig(): AppConfig {
  const env = parseEnv();

  return {
    vaultPath: expandTilde(env.OBSIDIAN_VAULT_PATH),
    drivePaperpileFolderId: env.DRIVE_PAPERPILE_FOLDER_ID,
    driveBibFileId: env.DRIVE_BIB_FILE_ID,
    pollIntervalMs: env.POLL_INTERVAL_MS
      ? parseInt(env.POLL_INTERVAL_MS, 10)
      : configFileDefaults.pollIntervalMs,
    anthropicModel: env.ANTHROPIC_MODEL ?? configFileDefaults.anthropicModel,
    obsidianPapersFolder: env.OBSIDIAN_PAPERS_FOLDER ?? configFileDefaults.obsidianPapersFolder,
    registryPath: expandTilde(env.REGISTRY_PATH ?? configFileDefaults.registryPath),
    pdfTempDir: expandTilde(env.PDF_TEMP_DIR ?? configFileDefaults.pdfTempDir),
    maxBodyChars: configFileDefaults.maxBodyChars,
    concurrency: configFileDefaults.concurrency,
  };
}

// Singleton — loaded once, exported for all modules
export const config = loadConfig();
