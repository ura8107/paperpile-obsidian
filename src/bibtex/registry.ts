import { mkdirSync, existsSync } from "fs";
import { dirname } from "path";
import type { ProcessedRegistry, ProcessedEntry } from "../types.ts";
import { config } from "../config.ts";

let registry: ProcessedRegistry = {};
let loaded = false;

function ensureDir(filePath: string) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

export async function loadRegistry(): Promise<void> {
  ensureDir(config.registryPath);
  const file = Bun.file(config.registryPath);
  if (await file.exists()) {
    registry = await file.json() as ProcessedRegistry;
  }
  loaded = true;
}

export function getProcessedKeys(): Set<string> {
  if (!loaded) throw new Error("Registry not loaded. Call loadRegistry() first.");
  return new Set(Object.keys(registry));
}

export async function markProcessed(
  citekey: string,
  vaultPath: string,
  updates: Partial<ProcessedEntry> = {}
): Promise<void> {
  if (!loaded) throw new Error("Registry not loaded.");
  registry[citekey] = {
    ...registry[citekey],
    processedAt: new Date().toISOString(),
    vaultPath,
    ...updates,
  };
  await Bun.write(config.registryPath, JSON.stringify(registry, null, 2));
}

export async function markSynced(
  citekey: string,
  vaultPath: string,
  updates: Partial<ProcessedEntry>
): Promise<void> {
  if (!loaded) throw new Error("Registry not loaded.");
  registry[citekey] = {
    ...registry[citekey],
    processedAt: registry[citekey]?.processedAt ?? new Date().toISOString(),
    vaultPath,
    ...updates,
    syncedAt: new Date().toISOString(),
  };
  await Bun.write(config.registryPath, JSON.stringify(registry, null, 2));
}

export function getEntry(citekey: string): ProcessedEntry | undefined {
  return registry[citekey];
}

export function getAllEntries(): ProcessedRegistry {
  return { ...registry };
}
