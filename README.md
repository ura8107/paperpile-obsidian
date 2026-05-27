# paperpile-obsidian

A Paperpile to Obsidian sync tool that turns papers saved in Paperpile into a Markdown library you can read and annotate in Obsidian.

The tool reads Paperpile's Google Drive sync data and creates these files for each paper:

| Destination | Contents |
| --- | --- |
| `paperpile-data/References/<citekey>.md` | Paper metadata, abstract, BibTeX, and related links |
| `paperpile-data/Bodies/<citekey>_body.md` | PDF full text converted to Markdown |
| `paperpile-data/Summaries/<citekey>_summary.md` | Output location for summaries and reading notes |

`<citekey>` is the Paperpile citation key, for example `Acemoglu2019-br`. Reference, Body, and Summary notes are connected with citekey-based Obsidian wikilinks, so they remain easy to navigate even when stored in separate folders.

## Before You Start

This repository is intended to contain the sync tool and configuration examples only. Do not commit generated `paperpile-data/` or `Papers/` content, because it can include PDF text, personal notes, reading history, and research interests.

The `.gitignore` excludes:

- `.env`
- `.venv/`
- `paperpile-data/`
- `/Papers/`
- `*.pdf`

## Requirements

- Paperpile
- Paperpile Google Drive sync
- Google Drive API OAuth2 credentials
- Bun
- Python 3
- Obsidian

PDF body conversion uses `markitdown`. This project recommends creating a dedicated `.venv` inside the repository instead of using the system-wide Python environment.

## Initial Setup

### 1. Install JavaScript Dependencies

```bash
bun install
```

### 2. Create the PDF Conversion Environment

```bash
./tools/install-markitdown.sh
```

This creates `.venv` and installs `markitdown[all]` plus the required Python dependencies. The project-local environment helps avoid NumPy architecture mismatches that can occur on Apple Silicon Macs.

### 3. Create `.env`

```bash
cp .env.example .env
```

At minimum, set:

```env
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_PAPERS_FOLDER=paperpile-data
MARKITDOWN_BIN=/absolute/path/to/this/repo/.venv/bin/markitdown

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

DRIVE_PAPERPILE_FOLDER_ID=...
DRIVE_BIB_FILE_ID=...
# Optional, for syncing Paperpile folders and labels into Obsidian frontmatter.
# Use either one. PAPERPILE_JSON_PATH takes precedence when both are set.
DRIVE_JSON_FILE_ID=...
PAPERPILE_JSON_PATH=/absolute/path/to/paperpile.json
```

Example for storing generated notes inside this repository:

```env
OBSIDIAN_VAULT_PATH=/Users/you/Documents/GitHub/paperpile-obsidian
OBSIDIAN_PAPERS_FOLDER=paperpile-data
MARKITDOWN_BIN=/Users/you/Documents/GitHub/paperpile-obsidian/.venv/bin/markitdown
```

To store notes in another Obsidian vault, set `OBSIDIAN_VAULT_PATH` to the absolute path of that vault.

### 4. Prepare Google Drive API Access

1. Create a project in Google Cloud Console.
2. Enable the Google Drive API.
3. Create OAuth2 credentials.
4. Choose Desktop app as the application type.
5. Add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to `.env`.
6. Get a refresh token.

```bash
bun run oauth
```

Follow the displayed authentication instructions, then add the resulting `GOOGLE_REFRESH_TOKEN` to `.env`.

### 5. Add Paperpile Drive IDs

Add these values to `.env`:

- `DRIVE_PAPERPILE_FOLDER_ID`: the ID of the Paperpile Google Drive sync folder
- `DRIVE_BIB_FILE_ID`: the file ID of `paperpile.bib` in Google Drive
- `DRIVE_JSON_FILE_ID` or `PAPERPILE_JSON_PATH` (optional): a full-library Paperpile JSON export used to sync Paperpile folders and labels into Obsidian metadata

You can copy these IDs from Google Drive URLs.

### 6. Check the Configuration

```bash
bun run status
```

Setup is complete if the command shows the total Paperpile entries, processed entries, and unprocessed entries.

## Usage

### Process One Paper

```bash
bun run src/index.ts process <citekey>
```

Example:

```bash
bun run src/index.ts process Acemoglu2019-br
```

After initial setup, processing one paper first is the fastest way to catch configuration mistakes.

### Sync Only Unprocessed or Incomplete Papers

```bash
bun run src/index.ts sync --incomplete-only --limit 100
```

This is the recommended command for normal use. It processes papers that match any of these conditions:

- Missing metadata
- Missing PDF body
- Previously had no PDF, but later received a PDF attachment in Paperpile
- Previously failed PDF conversion

If you attach a PDF in Paperpile later, this command checks the paper again and saves the PDF body as Markdown.

### Sync All Papers

```bash
bun run sync
```

This checks the entire library, so it can take a long time for large libraries. Prefer `--incomplete-only` for normal use.

### Limit the Number of Papers

```bash
bun run src/index.ts sync --incomplete-only --limit 20
```

Use this to reduce Google Drive API load and runtime.

### Add a Delay Between Papers

```bash
bun run src/index.ts sync --incomplete-only --limit 100 --delay-ms 5000
```

This waits 5 seconds between papers, which makes large syncs gentler on the Google Drive API.

## Automation

In this environment, the Codex app automation is configured to run:

| Item | Value |
| --- | --- |
| Name | `Paperpile incomplete sync` |
| Automation ID | `paperpile-incomplete-sync` |
| Schedule | Every day at 00:00 and 12:00 |
| Command | `bun run src/index.ts sync --incomplete-only` |

This automation imports every incomplete paper per run when metadata or PDF body content is still missing. Papers that later receive PDFs are retried when the previous body status is `missing` or `failed`.

To run the same sync manually:

```bash
bun run src/index.ts sync --incomplete-only
```

## Output Files

### Reference Note

`paperpile-data/References/<citekey>.md`

Usually includes:

- YAML metadata
- Title, authors, year, venue
- Abstract
- DOI and URL
- Paperpile folders and labels, when a JSON export is configured
- BibTeX
- Wikilinks to the Body and Summary notes

### Paperpile Folders and Labels

Paperpile's BibTeX export is still used as the main metadata source. To also filter by Paperpile folders and labels in Obsidian, export your full Paperpile library as JSON and configure one of:

```env
DRIVE_JSON_FILE_ID=...
```

or:

```env
PAPERPILE_JSON_PATH=/absolute/path/to/paperpile.json
```

The sync merges folder/label metadata from that JSON export into each Reference note:

```yaml
paperpile-folders:
  - "Dissertation"
paperpile-labels:
  - "Causal Inference"
```

Then filter in Obsidian with Dataview:

```dataview
TABLE title, year, journal
FROM "paperpile-data/References"
WHERE contains(paperpile-folders, "Dissertation")
SORT year DESC
```

### Body Note

`paperpile-data/Bodies/<citekey>_body.md`

This is the PDF full text converted to Markdown. Conversion uses `markitdown` first, then falls back to `pypdf` if needed.

### Summary Note

`paperpile-data/Summaries/<citekey>_summary.md`

This is the output location for summaries and reading notes. The sync process creates the folder structure, but it does not automatically write summary text.

## Summarize Papers

This repository includes a Codex skill that resolves a citekey to the corresponding Reference and Body notes, then creates a structured summary.

```text
.codex/skills/paper-summarizer/
```

To make the skill available from Codex, add a symlink from a configured skill root:

```bash
mkdir -p ~/.codex/skills
ln -s "$(pwd)/.codex/skills/paper-summarizer" ~/.codex/skills/paper-summarizer
```

Example:

```text
$paper-summarizer Acemoglu2019-br
Summarize the full text of Acemoglu2019-br.
```

Summaries are normally saved to `paperpile-data/Summaries/<citekey>_summary.md`. If no Body note exists, the summary uses metadata and abstract only.

## Common Commands

| Task | Command |
| --- | --- |
| Show status | `bun run status` |
| Process one paper | `bun run src/index.ts process <citekey>` |
| Process all incomplete papers | `bun run src/index.ts sync --incomplete-only` |
| Sync all papers | `bun run sync` |
| Run tests | `bun test` |
| Start the development daemon | `bun run dev` |

## Troubleshooting

### `markitdown` Is Not Found

Check `MARKITDOWN_BIN` in `.env`.

```env
MARKITDOWN_BIN=/absolute/path/to/paperpile-obsidian/.venv/bin/markitdown
```

Verify it with:

```bash
.venv/bin/markitdown --help
```

### NumPy Architecture Mismatch

The project may be using broken dependencies from the system Python environment. Recreate the project-local environment:

```bash
rm -rf .venv
./tools/install-markitdown.sh
```

### PDF Body Is Not Created

First, rerun the incomplete-only sync:

```bash
bun run src/index.ts sync --incomplete-only --limit 100
```

If Paperpile does not have a PDF, the Body note records a warning that the PDF could not be fetched or converted. Attach the PDF in Paperpile, then the next `--incomplete-only` run will retry it.

### Google Drive Authentication Fails

Check these `.env` values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `DRIVE_PAPERPILE_FOLDER_ID`
- `DRIVE_BIB_FILE_ID`

To get a new refresh token:

```bash
bun run oauth
```

### Codex Cannot Write Summary Files

If the Obsidian vault is outside Codex's writable workspace, Codex may hit `Operation not permitted` even when normal macOS permissions look correct. In that case, Codex needs write approval for the vault location.

## Migrate From the Old Folder Layout

To migrate from the old `Papers/<citekey>/` layout to the current `References/`, `Bodies/`, and `Summaries/` layout:

```bash
bun run src/index.ts migrate-folders --dry-run
bun run src/index.ts migrate-folders
```

Run `--dry-run` first to inspect the planned moves.

## Developer Notes

Most users do not need this section.

```text
src/index.ts              CLI entry point
src/cli.ts                CLI command dispatcher
src/config.ts             .env and defaults loading
src/bibtex/               BibTeX parser and processed registry
src/drive/                Google Drive API client
src/pdf/                  PDF to Markdown conversion
src/obsidian/             Obsidian note writer
src/daemon/               polling daemon
tools/setup-google-oauth.ts
tools/install-markitdown.sh
tools/pdf_fallback.py
config/defaults.json
config/launchd/
```

Type check:

```bash
./node_modules/.bin/tsc --noEmit
```

Tests:

```bash
bun test
```
