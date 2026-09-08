#!/usr/bin/env bun
/**
 * Generate (and optionally install) the macOS launchd agent that runs the
 * polling daemon, with this machine's real paths substituted in.
 *
 * Run:
 *   bun run setup:launchd              Print the generated plist
 *   bun run setup:launchd --install    Write it to ~/Library/LaunchAgents and load it
 *   bun run setup:launchd --uninstall  Unload and remove it
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";
import { repoRoot } from "./lib/envFile.ts";

const LABEL = "com.paperpile-obsidian";
const args = process.argv.slice(2);
const install = args.includes("--install");
const uninstall = args.includes("--uninstall");

const home = homedir();
const targetPath = join(home, "Library/LaunchAgents", `${LABEL}.plist`);
const logDir = join(home, ".paperpile-obsidian");

if ((install || uninstall) && platform() !== "darwin") {
  console.error(
    `launchd is macOS-only (this is ${platform()}). On Linux, schedule "bun run src/index.ts sync --incomplete-only" with cron or a systemd timer instead.`
  );
  process.exit(1);
}

if (uninstall) {
  if (!existsSync(targetPath)) {
    console.log(`Nothing to remove: ${targetPath} does not exist.`);
    process.exit(0);
  }
  await run(["launchctl", "unload", targetPath]);
  rmSync(targetPath);
  console.log(`Removed ${targetPath}`);
  process.exit(0);
}

const bunBin = Bun.which("bun") ?? join(home, ".bun/bin/bun");
if (!existsSync(bunBin)) {
  console.error("Could not locate the bun binary. Install Bun or pass its path via PATH.");
  process.exit(1);
}

const templatePath = join(repoRoot, "config/launchd/com.paperpile-obsidian.plist");
const plist = readFileSync(templatePath, "utf-8")
  .replaceAll("__BUN_BIN__", bunBin)
  .replaceAll("__REPO_ROOT__", repoRoot)
  .replaceAll("__HOME__", home)
  .replaceAll("__LOG_DIR__", logDir)
  .replaceAll("__PATH__", `${dirname(bunBin)}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`);

if (!install) {
  console.log(plist);
  console.log(`\n# Install with: bun run setup:launchd --install`);
  process.exit(0);
}

mkdirSync(dirname(targetPath), { recursive: true });
mkdirSync(logDir, { recursive: true });
writeFileSync(targetPath, plist);
console.log(`Wrote ${targetPath}`);

await run(["launchctl", "unload", targetPath]); // ignore failure: not loaded yet
const loaded = await run(["launchctl", "load", targetPath]);
if (loaded !== 0) {
  console.error("launchctl load failed. Load it manually with:");
  console.error(`  launchctl load ${targetPath}`);
  process.exit(1);
}

console.log(`Loaded ${LABEL}. Logs: ${logDir}/daemon.log`);
console.log(`Stop it with: bun run setup:launchd --uninstall`);

async function run(command: string[]): Promise<number> {
  const proc = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" });
  return proc.exited;
}
