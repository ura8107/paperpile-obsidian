#!/usr/bin/env bun
/**
 * paperpile-obsidian CLI
 *
 * Usage:
 *   bun run src/index.ts daemon              — Start polling daemon (every N minutes)
 *   bun run src/index.ts process <citekey>   — Process one paper by citekey
 *   bun run src/index.ts process --bib <file> — Process all papers from a local .bib file
 *   bun run src/index.ts status              — Show processed/pending summary
 */

import { config } from "./config.ts";
import { loadRegistry, getProcessedKeys, getAllEntries } from "./bibtex/registry.ts";
import { fetchBibFile } from "./drive/paperpileSync.ts";
import { parseBibTeX, diffNewEntries } from "./bibtex/parser.ts";
import { processPaper } from "./pipeline.ts";
import { startPoller } from "./daemon/poller.ts";

const [, , command, ...args] = process.argv;

async function cmdDaemon() {
  startPoller();
}

async function cmdProcess() {
  await loadRegistry();

  if (args[0] === "--bib") {
    // Process from a local .bib file
    const bibPath = args[1];
    if (!bibPath) {
      console.error("Usage: bun run src/index.ts process --bib <path/to/file.bib>");
      process.exit(1);
    }
    const bibRaw = await Bun.file(bibPath).text();
    const entries = parseBibTeX(bibRaw);
    const processedKeys = getProcessedKeys();
    const newEntries = diffNewEntries(entries, processedKeys);
    console.log(`Found ${entries.length} entries, ${newEntries.length} new.`);
    for (const entry of newEntries) {
      await processPaper(entry);
    }
    return;
  }

  // Process by citekey from Google Drive
  const citekey = args[0];
  if (!citekey) {
    console.error("Usage: bun run src/index.ts process <citekey>");
    process.exit(1);
  }

  const bibRaw = await fetchBibFile();
  const entries = parseBibTeX(bibRaw);
  const entry = entries.find((e) => e.citekey === citekey);

  if (!entry) {
    console.error(`Citekey "${citekey}" not found in paperpile.bib`);
    process.exit(1);
  }

  const processedKeys = getProcessedKeys();
  if (processedKeys.has(citekey)) {
    console.log(`"${citekey}" is already processed. Use --force to reprocess.`);
    if (!args.includes("--force")) process.exit(0);
  }

  await processPaper(entry);
}

async function cmdStatus() {
  await loadRegistry();

  const registry = getAllEntries();
  const processedCount = Object.keys(registry).length;

  let bibRaw: string | null = null;
  let totalCount = 0;
  try {
    bibRaw = await fetchBibFile();
    totalCount = parseBibTeX(bibRaw).length;
  } catch (err) {
    console.warn(`Could not fetch BibTeX from Drive: ${(err as Error).message}`);
  }

  console.log("\n=== paperpile-obsidian status ===");
  console.log(`Vault:         ${config.vaultPath}`);
  console.log(`Papers folder: ${config.obsidianPapersFolder}`);
  console.log(`Registry:      ${config.registryPath}`);
  console.log(`Poll interval: ${config.pollIntervalMs / 60000} min`);
  console.log("");
  if (totalCount > 0) {
    console.log(`Total in Paperpile: ${totalCount}`);
    console.log(`Processed:          ${processedCount}`);
    console.log(`Pending:            ${totalCount - processedCount}`);
  } else {
    console.log(`Processed: ${processedCount}`);
  }

  const recent = Object.entries(registry)
    .sort((a, b) => b[1].processedAt.localeCompare(a[1].processedAt))
    .slice(0, 5);

  if (recent.length > 0) {
    console.log("\nRecently processed:");
    for (const [key, entry] of recent) {
      console.log(`  ${key} — ${entry.processedAt.split("T")[0]}`);
    }
  }
}

// Dispatch command
switch (command) {
  case "daemon":
    await cmdDaemon();
    break;
  case "process":
    await cmdProcess();
    break;
  case "status":
    await cmdStatus();
    break;
  default:
    console.log(`paperpile-obsidian — Paperpile to Obsidian PKM integration

Usage:
  bun run src/index.ts daemon               Start polling daemon
  bun run src/index.ts process <citekey>    Process one paper from Drive
  bun run src/index.ts process --bib <file> Process papers from local .bib file
  bun run src/index.ts status               Show processed/pending summary

Setup:
  1. Copy .env.example to .env and fill in all required values
  2. pip3 install markitdown[all]
  3. bun install
  4. bun run src/index.ts status   (verify config)
  5. bun run src/index.ts daemon   (start polling)
`);
}
