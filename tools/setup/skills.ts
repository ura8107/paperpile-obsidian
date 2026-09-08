#!/usr/bin/env bun
/**
 * Link this repository's skills into the assistant skill roots, so the
 * summarizer and the setup guide can be invoked from anywhere.
 *
 * Run:
 *   bun run setup:skills            Link into ~/.codex/skills
 *   bun run setup:skills --status   Show what is linked
 *
 * Claude Code loads `.claude/skills/` from the repository automatically, so
 * only Codex needs the symlink.
 */
import { existsSync, lstatSync, mkdirSync, readlinkSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { repoRoot } from "./lib/envFile.ts";

const statusOnly = process.argv.includes("--status");
const codexSkillRoot = join(homedir(), ".codex/skills");

const links = ["paper-summarizer", "paperpile-setup"]
  .map((name) => ({
    name,
    source: join(repoRoot, ".codex/skills", name),
    target: join(codexSkillRoot, name),
  }))
  .filter((link) => existsSync(link.source));

if (statusOnly) {
  for (const link of links) {
    const state = !existsSync(link.target)
      ? "not linked"
      : isSymlinkTo(link.target, link.source)
        ? "linked"
        : `occupied by something else (${describe(link.target)})`;
    console.log(`${link.name.padEnd(18)} ${state}`);
  }
  process.exit(0);
}

mkdirSync(codexSkillRoot, { recursive: true });

for (const link of links) {
  if (isSymlinkTo(link.target, link.source)) {
    console.log(`Already linked: ${link.target}`);
    continue;
  }

  if (existsSync(link.target) || isSymlink(link.target)) {
    if (isSymlink(link.target)) {
      unlinkSync(link.target);
    } else {
      console.warn(`[warn] Skipping ${link.name}: ${link.target} exists and is not a symlink.`);
      continue;
    }
  }

  symlinkSync(link.source, link.target);
  console.log(`Linked ${link.target} -> ${link.source}`);
}

function isSymlink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

function isSymlinkTo(path: string, expected: string): boolean {
  try {
    return isSymlink(path) && readlinkSync(path) === expected;
  } catch {
    return false;
  }
}

function describe(path: string): string {
  try {
    return lstatSync(path).isDirectory() ? "directory" : "file";
  } catch {
    return "unknown";
  }
}
