import { config } from "./config.ts";
import { loadRegistry, getProcessedKeys, getAllEntries } from "./bibtex/registry.ts";
import { fetchBibFile } from "./drive/paperpileSync.ts";
import { parseBibTeX, diffNewEntries } from "./bibtex/parser.ts";
import { processPaper } from "./pipeline.ts";
import { startPoller } from "./daemon/poller.ts";
import { createSyncSummary, syncPaper } from "./sync.ts";
import { migratePaperFolders } from "./migration.ts";

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...args] = argv;

  switch (command) {
    case "daemon":
      startPoller();
      break;
    case "process":
      await cmdProcess(args);
      break;
    case "sync":
      await cmdSync(args);
      break;
    case "migrate-folders":
      await cmdMigrateFolders(args);
      break;
    case "status":
      await cmdStatus();
      break;
    default:
      printUsage();
  }
}

async function cmdMigrateFolders(args: string[]): Promise<void> {
  await loadRegistry();

  const dryRun = args.includes("--dry-run");
  const summary = await migratePaperFolders({ dryRun });

  console.log("\n=== migration summary ===");
  console.log(`Moved:            ${summary.moved}`);
  console.log(`Conflicts:        ${summary.conflicts}`);
  console.log(`Empty dirs:       ${summary.skipped}`);
  console.log(`Registry updated: ${summary.registryUpdated}`);
  if (dryRun) {
    console.log("Dry run only. Re-run without --dry-run to apply.");
  }
}

async function cmdSync(args: string[]): Promise<void> {
  await loadRegistry();

  const limit = parseLimit(args);
  const delayMs = parseDelayMs(args);
  const pendingOnly = args.includes("--pending-only");
  const bibRaw = await fetchBibFile();
  const allEntries = parseBibTeX(bibRaw);
  const candidateEntries = pendingOnly
    ? allEntries.filter((entry) => !getProcessedKeys().has(entry.citekey))
    : allEntries;
  const entries = limit ? candidateEntries.slice(0, limit) : candidateEntries;
  const summary = createSyncSummary();
  const failedCitekeys: string[] = [];

  console.log(`[sync] Found ${allEntries.length} entries in Paperpile.`);
  if (pendingOnly) {
    console.log(`[sync] Processing ${candidateEntries.length} pending entries only.`);
  }
  if (limit) {
    console.log(`[sync] Limiting this run to ${limit} entries.`);
  }
  if (delayMs > 0) {
    console.log(`[sync] Waiting ${delayMs}ms between entries.`);
  }

  for (const [index, entry] of entries.entries()) {
    console.log(`[sync] [${index + 1}/${entries.length}] ${entry.citekey}`);
    try {
      const result = await syncPaper(entry);
      summary[result]++;
      if (result !== "unchanged") {
        console.log(`[sync] ${result}: ${entry.citekey}`);
      }
    } catch (err) {
      summary.failed++;
      failedCitekeys.push(entry.citekey);
      console.error(`[sync] Failed: ${entry.citekey}: ${(err as Error).message}`);
    }

    if (delayMs > 0 && index < entries.length - 1) {
      await sleep(delayMs);
    }
  }

  console.log("\n=== sync summary ===");
  console.log(`Created:          ${summary.created}`);
  console.log(`Updated metadata: ${summary.updatedMetadata}`);
  console.log(`Updated body:     ${summary.updatedBody}`);
  console.log(`Unchanged:        ${summary.unchanged}`);
  console.log(`Failed:           ${summary.failed}`);
  if (failedCitekeys.length > 0) {
    console.log(`Failed citekeys:  ${failedCitekeys.join(", ")}`);
  }
}

async function cmdProcess(args: string[]): Promise<void> {
  await loadRegistry();

  if (args[0] === "--bib") {
    await processLocalBib(args);
    return;
  }

  await processDriveEntry(args);
}

async function processLocalBib(args: string[]): Promise<void> {
  const bibPath = args[1];
  if (!bibPath) {
    fail("Usage: bun run src/index.ts process --bib <path/to/file.bib>");
  }

  const bibRaw = await Bun.file(bibPath).text();
  const entries = parseBibTeX(bibRaw);
  const newEntries = diffNewEntries(entries, getProcessedKeys());

  console.log(`Found ${entries.length} entries, ${newEntries.length} new.`);
  for (const entry of newEntries) {
    await processPaper(entry);
  }
}

async function processDriveEntry(args: string[]): Promise<void> {
  const citekey = args[0];
  if (!citekey) {
    fail("Usage: bun run src/index.ts process <citekey>");
  }

  const bibRaw = await fetchBibFile();
  const entries = parseBibTeX(bibRaw);
  const entry = entries.find((e) => e.citekey === citekey);

  if (!entry) {
    fail(`Citekey "${citekey}" not found in paperpile.bib`);
  }

  if (getProcessedKeys().has(citekey) && !args.includes("--force")) {
    console.log(`"${citekey}" is already processed. Use --force to reprocess.`);
    return;
  }

  await processPaper(entry);
}

async function cmdStatus(): Promise<void> {
  await loadRegistry();

  const registry = getAllEntries();
  const processedCount = Object.keys(registry).length;
  const totalCount = await getPaperpileEntryCount();

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

  printRecentlyProcessed(registry);
}

async function getPaperpileEntryCount(): Promise<number> {
  try {
    const bibRaw = await fetchBibFile();
    return parseBibTeX(bibRaw).length;
  } catch (err) {
    console.warn(`Could not fetch BibTeX from Drive: ${(err as Error).message}`);
    return 0;
  }
}

function printRecentlyProcessed(registry: ReturnType<typeof getAllEntries>): void {
  const recent = Object.entries(registry)
    .sort((a, b) => b[1].processedAt.localeCompare(a[1].processedAt))
    .slice(0, 5);

  if (recent.length === 0) return;

  console.log("\nRecently processed:");
  for (const [key, entry] of recent) {
    console.log(`  ${key} - ${entry.processedAt.split("T")[0]}`);
  }
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function parseLimit(args: string[]): number | undefined {
  const index = args.indexOf("--limit");
  if (index === -1) return undefined;

  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    fail("Usage: bun run src/index.ts sync [--limit <count>] [--pending-only]");
  }
  return value;
}

function parseDelayMs(args: string[]): number {
  const index = args.indexOf("--delay-ms");
  if (index === -1) return 0;

  const value = Number(args[index + 1]);
  if (!Number.isInteger(value) || value < 1) {
    fail("Usage: bun run src/index.ts sync [--limit <count>] [--delay-ms <milliseconds>] [--pending-only]");
  }
  return value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printUsage(): void {
  console.log(`paperpile-obsidian - Paperpile to Obsidian PKM integration

Usage:
  bun run src/index.ts daemon               Start polling daemon
  bun run src/index.ts process <citekey>    Process one paper from Drive
  bun run src/index.ts process --bib <file> Process papers from local .bib file
  bun run src/index.ts sync                 Create/update all papers from Drive
  bun run src/index.ts sync --limit <count> Sync only the first N entries
  bun run src/index.ts sync --pending-only  Sync only entries missing from the registry
  bun run src/index.ts sync --delay-ms 5000 Sync all entries with a delay between papers
  bun run src/index.ts migrate-folders      Move legacy paper folders into library folders
  bun run src/index.ts migrate-folders --dry-run
  bun run src/index.ts status               Show processed/pending summary

Setup:
  1. Copy .env.example to .env and fill in all required values
  2. pip3 install markitdown[all]
  3. bun install
  4. bun run src/index.ts status   (verify config)
  5. bun run src/index.ts daemon   (start polling)
`);
}
