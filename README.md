# paperpile-obsidian

Automated Paperpile → Obsidian PKM integration. When a new paper is added to Paperpile, this workflow produces three Obsidian notes:

| File | Contents |
|------|----------|
| `Papers/Smith2023/Smith2023.md` | Reference note — YAML metadata, abstract, BibTeX, wikilinks |
| `Papers/Smith2023/Smith2023_body.md` | Full-text PDF converted to Markdown via markitdown |
| `Papers/Smith2023/Smith2023_summary.md` | LLM-structured summary (research question, methods, findings, key quotes) |

## How It Works

A polling daemon checks Paperpile's Google Drive BibTeX file every 15 minutes, detects new citekeys, and runs the pipeline:

```
Google Drive (paperpile.bib + PDFs)
  → Parse BibTeX metadata
  → Download PDF → markitdown → body.md
  → Claude API → summary.md
  → Write all 3 files to Obsidian vault
  → Mark as processed
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
- `ANTHROPIC_API_KEY` — from console.anthropic.com
- `OBSIDIAN_VAULT_PATH` — absolute path to your Obsidian vault
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`
- `DRIVE_PAPERPILE_FOLDER_ID` — find in Paperpile settings → Google Drive sync
- `DRIVE_BIB_FILE_ID` — open `paperpile.bib` in Google Drive, copy ID from URL

### 4. Verify setup

```bash
bun run src/index.ts status
```

### 5. Run

```bash
# Process one paper (good for testing)
bun run src/index.ts process Smith2023

# Start the polling daemon
bun run src/index.ts daemon
```

### 6. Auto-start on login (macOS)

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
  pipeline.ts        Single-paper processing orchestrator
  config.ts          Config loading and validation
  types.ts           TypeScript interfaces
  bibtex/            BibTeX parsing and processed-entry registry
  drive/             Google Drive API client and Paperpile sync
  pdf/               PDF → Markdown conversion (markitdown + fallback)
  llm/               Claude API client and summary generator
  obsidian/          Note builder and vault writer
  daemon/            Polling loop
scripts/
  setup-google-oauth.ts   One-time OAuth2 token setup
  pdf_fallback.py         pypdf fallback converter
  install-markitdown.sh   markitdown installation helper
launchd/
  com.paperpile-obsidian.plist   macOS auto-start config
```
