import { config } from "../config.ts";
import { fetchBibFile } from "../drive/paperpileSync.ts";
import { parseBibTeX, diffNewEntries } from "../bibtex/parser.ts";
import { loadRegistry, getProcessedKeys } from "../bibtex/registry.ts";
import { processPaper } from "../pipeline.ts";
import type { PaperEntry } from "../types.ts";

let isRunning = false;

export async function tick(): Promise<void> {
  if (isRunning) {
    console.log("[poller] Tick skipped — previous run still in progress");
    return;
  }

  isRunning = true;
  try {
    await loadRegistry();

    const bibRaw = await fetchBibFile();
    const allEntries = parseBibTeX(bibRaw);
    console.log(`[poller] Found ${allEntries.length} total entries in BibTeX`);

    const processedKeys = getProcessedKeys();
    const newEntries = diffNewEntries(allEntries, processedKeys);

    if (newEntries.length === 0) {
      console.log("[poller] No new entries.");
      return;
    }

    console.log(`[poller] ${newEntries.length} new entries to process`);

    // Process sequentially to respect API rate limits
    for (const entry of newEntries) {
      try {
        await processPaper(entry);
      } catch (err) {
        console.error(`[poller] Failed to process ${entry.citekey}: ${(err as Error).message}`);
        // Continue with next entry — don't let one failure block others
      }
    }

    console.log("[poller] Tick complete.");
  } catch (err) {
    console.error(`[poller] Tick error: ${(err as Error).message}`);
  } finally {
    isRunning = false;
  }
}

export function startPoller(): void {
  const intervalMs = config.pollIntervalMs;
  console.log(`[poller] Starting. Poll interval: ${intervalMs / 1000}s (${intervalMs / 60000} min)`);

  // Run immediately on start
  tick().catch(console.error);

  setInterval(() => {
    tick().catch(console.error);
  }, intervalMs);

  // Keep process alive
  process.on("SIGINT", () => {
    console.log("\n[poller] Shutting down gracefully...");
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    console.log("\n[poller] Received SIGTERM. Shutting down...");
    process.exit(0);
  });
}
