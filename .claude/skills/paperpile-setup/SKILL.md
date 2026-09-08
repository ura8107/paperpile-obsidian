---
name: paperpile-setup
description: Set up the paperpile-obsidian sync tool on a new machine, interactively. Use when someone wants to install, configure, connect Google Drive to, or troubleshoot the configuration of this Paperpile-to-Obsidian workflow — including .env values, Google OAuth, Paperpile Drive IDs, the Obsidian vault path, markitdown, or the scheduled sync.
---

# Paperpile → Obsidian Guided Setup

Configure this repository on a new machine by running the discovery commands and
asking the human only what cannot be discovered.

## How to run it

Follow `docs/SETUP.md` in this repository step by step. It is the source of
truth: read it now, then execute it.

```bash
cat docs/SETUP.md
```

## Non-negotiables

- Reply in the human's language.
- Discover before asking. `bun run setup:detect --json` already knows the OS,
  the toolchain, every Obsidian vault, downloaded Google client files, local
  Paperpile JSON exports, and which `.env` keys are missing.
- Ask one question at a time, only when the answer changes what you do. The
  only unavoidable human steps are the Google Cloud Console click-through, the
  browser consent screen, and picking a vault when several exist.
- Never print `GOOGLE_CLIENT_SECRET` or `GOOGLE_REFRESH_TOKEN` in full; they
  belong in `.env`, which is git-ignored.
- Setup is resumable. Start from `nextStep` in the detection output rather than
  redoing finished steps.
- Do not declare a step done without running the command and showing its output.

## Shape of the flow

1. `bun run setup:detect --json` — state of the machine
2. `bun install` and `./tools/install-markitdown.sh`
3. Choose the vault → `bun run setup:env --vault <path> --papers-folder paperpile-data`
4. `bun run setup:google-client` (imports the downloaded OAuth client JSON)
5. `bun run oauth` (browser consent; writes the refresh token to `.env`)
6. `bun run setup:drive-ids --write-env` (finds the Paperpile folder and `.bib`)
7. `bun run doctor` until clean, then `bun run src/index.ts sync --incomplete-only --limit 1`
8. Optional: `bun run setup:launchd --install`, `bun run setup:skills`

## Also use this skill for

Diagnosing a broken existing setup. Run `bun run doctor` first and work the
`fix:` lines it prints, then re-run it. `docs/SETUP.md` ends with a
troubleshooting map from failing check to first action.
