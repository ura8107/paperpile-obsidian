# paperpile-obsidian

Automated Paperpile -> Obsidian PKM integration. When a new paper is added to Paperpile, this workflow stores paper material in separate library folders:

| File | Contents |
|------|----------|
| `Papers/References/Smith2023.md` | Reference note — YAML metadata, abstract, BibTeX, wikilinks |
| `Papers/Bodies/Smith2023_body.md` | Full-text PDF converted to Markdown via markitdown |
| `Papers/Summaries/Smith2023_summary.md` | User-created paper notes and summaries |

Reference and body notes keep citekey-based Obsidian wikilinks, so notes remain navigable even though they are no longer stored in one folder per paper.

## How It Works

A polling daemon checks Paperpile's Google Drive BibTeX file every 15 minutes, detects new citekeys, and runs the pipeline:

```
Google Drive (paperpile.bib + PDFs)
  -> Parse BibTeX metadata
  -> Download PDF -> markitdown -> body.md
  -> Write reference and body notes to Obsidian vault
  -> Mark as processed
```

## Setup

### 1. Install dependencies

```bash
bun install
pip3 install markitdown[all]
```

### 2. Google Drive API credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project, enable the **Google Drive API**
3. Create **OAuth2 credentials** (Desktop app type)
4. Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env`
5. Run the OAuth setup script to get a refresh token:
   ```bash
   bun run scripts/setup-google-oauth.ts
   ```

### 3. Configure `.env`

```bash
cp .env.example .env
# Fill in all required values
```

Required values:
- `OBSIDIAN_VAULT_PATH` — absolute path to your Obsidian vault
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- `DRIVE_PAPERPILE_FOLDER_ID` — find in Paperpile settings -> Google Drive sync
- `DRIVE_BIB_FILE_ID` — open `paperpile.bib` in Google Drive, copy ID from URL

### 4. Verify setup

```bash
bun run src/index.ts status
```

### 5. Run

```bash
# Process one paper (good for testing)
bun run src/index.ts process Smith2023

# Sync all Paperpile entries: create missing notes, update changed metadata/PDF bodies
bun run src/index.ts sync

# Sync all entries gently, waiting between papers to reduce Google Drive API load
bun run src/index.ts sync --delay-ms 5000

# Sync only the first N entries for a small test run
bun run src/index.ts sync --limit 10

# Move legacy `Papers/<citekey>/` folders into the current library layout
bun run src/index.ts migrate-folders --dry-run
bun run src/index.ts migrate-folders

# Start the polling daemon
bun run src/index.ts daemon
```

### 6. Summarize papers with the local Codex skill

This repository includes a local Codex skill for structured paper summaries:

```
.codex/skills/paper-summarizer/
```

For Codex to discover it as a reusable skill, expose it from a configured skill root. A symlink keeps the skill local to this repository while making it discoverable:

```bash
ln -s "$(pwd)/.codex/skills/paper-summarizer" ~/.codex/skills/paper-summarizer
```

Use it from Codex with a Paperpile citekey:

```text
$paper-summarizer Smith2023
Smith2023 の本文を構造化要約して
```

The skill is scoped to this Paperpile -> Obsidian workflow. It resolves the citekey against the configured Obsidian vault and reads:

| File | Role |
|------|------|
| `Papers/References/Smith2023.md` | Metadata, abstract, BibTeX, DOI, tags |
| `Papers/Bodies/Smith2023_body.md` | Main full-text evidence for the summary |
| `Papers/Summaries/Smith2023_summary.md` | Markdown output file for the structured summary |

The helper resolver can be run directly for debugging:

```bash
python3 .codex/skills/paper-summarizer/scripts/resolve_paper.py Smith2023
```

The skill saves the generated Markdown summary to `Papers/Summaries/<citekey>_summary.md` by default. It does not search Google Scholar, generate new citation keys, or summarize arbitrary PDFs by default. It preserves the existing Paperpile citekey and uses the local converted body note as the source of truth. If no body note exists, it reports that the full text is unavailable and falls back to metadata/abstract-only summarization.

If the Obsidian vault is outside Codex's writable workspace, Codex may need write approval before it can create or update the summary file. A sandbox failure usually appears as `Operation not permitted` even when normal macOS file permissions look correct.

### 7. Auto-start on login (macOS)

```bash
cp launchd/com.paperpile-obsidian.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.paperpile-obsidian.plist
```

Logs at `~/.paperpile-obsidian/daemon.log`.

## Development

```bash
bun test                              # Run unit tests
bun --watch run src/index.ts daemon   # Dev mode with hot reload
```

## Project Structure

```
src/
  index.ts           CLI entry point
  cli.ts             CLI command dispatcher
  pipeline.ts        Single-paper processing orchestrator
  config.ts          Config loading and validation
  types.ts           TypeScript interfaces
  bibtex/            BibTeX parsing and processed-entry registry
  drive/             Google Drive API client and Paperpile sync
  pdf/               PDF to Markdown conversion (markitdown + fallback)
  obsidian/          Note builder and vault writer
  daemon/            Polling loop
scripts/
  setup-google-oauth.ts   One-time OAuth2 token setup
  pdf_fallback.py         pypdf fallback converter
  install-markitdown.sh   markitdown installation helper
.codex/
  skills/
    paper-summarizer/     Local citekey-based paper summary skill
launchd/
  com.paperpile-obsidian.plist   macOS auto-start config
```
