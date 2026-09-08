# Guided Setup Runbook

This document is written for an AI assistant (Claude Code, Codex, or similar)
that sets up `paperpile-obsidian` on a new machine by talking to a human. It is
also readable by a human who wants to do it by hand.

**Operating rules for the assistant**

1. Reply in the language the human is using.
2. Never ask for a value a command can discover. Run the discovery command
   first, show what it found, and ask only to confirm or to choose.
3. Ask one question at a time, and only when the answer changes what you do.
4. Run every command from the repository root, and show its real output. Never
   claim a step succeeded without running it.
5. Only these three things genuinely require the human:
   - clicking through the Google Cloud Console once,
   - approving the Google consent screen in a browser,
   - choosing which Obsidian vault to use when several exist.
6. Secrets (`GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`) go into `.env` only.
   Never print them in full, never paste them into chat, never commit them.
7. If a step fails, read the printed `fix:` line, apply it, and re-run the same
   step before moving on.

---

## Step 0 — Detect the current state

```bash
bun run setup:detect --json
```

This one command reports: OS, `bun` / `python3` / `git` / `markitdown`
locations, whether dependencies are installed, every Obsidian vault on the
machine, any `client_secret_*.json` already downloaded, local Paperpile JSON
exports, which `.env` keys are still missing, and a suggested `nextStep`.

Use `detect.nextStep` to decide where to resume — setup is resumable, and a
partially configured machine should not be started from scratch.

If `bun` is missing, stop and ask the human to install it
(`curl -fsSL https://bun.sh/install | bash`), then re-run Step 0.

## Step 1 — Install dependencies

```bash
bun install
./tools/install-markitdown.sh
```

`install-markitdown.sh` creates `.venv/` in the repository and installs
`markitdown[all]`. It takes a few minutes; say so before running it. On failure,
report the last lines of output — the usual cause is a missing `python3` or a
sandbox without network access.

## Step 2 — Choose the Obsidian vault

Read `obsidian.vaultCandidates` from Step 0. Each entry has a `source`:

| `source` | Meaning |
| --- | --- |
| `obsidian-config` | Obsidian's own vault list — the most reliable |
| `filesystem` | a directory containing `.obsidian/` |
| `repo` | this repository, i.e. keep the notes next to the tool |

- Exactly one candidate → propose it and ask for a yes/no confirmation.
- Several → list them (path, source, last opened) and ask which one.
- None → ask for a path, or offer the `repo` option.

Then write the choice:

```bash
bun run setup:env --vault "<vault path>" --papers-folder paperpile-data
```

`setup:env` also fills in `MARKITDOWN_BIN` automatically when
`.venv/bin/markitdown` exists, creates `.env` from `.env.example` on first run,
and backs up the previous file to `.env.bak`.

`--papers-folder` is the subfolder inside the vault that receives
`References/`, `Bodies/` and `Summaries/`. Default it to `paperpile-data` unless
the human wants another name.

## Step 3 — Google Cloud OAuth client (the one manual part)

First check whether the file is already on the machine:

```bash
bun run setup:google-client --list
```

If a `client_secret_*.json` is listed, import it and skip the console walkthrough:

```bash
bun run setup:google-client            # auto-detect, or pass the path explicitly
```

Otherwise walk the human through this once, then re-run the import:

1. Open <https://console.cloud.google.com> and create or select a project.
2. **APIs & Services → Library** → enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** → External → add their own Google
   account as a test user (needed while the app is unpublished).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
5. Application type: **Desktop app** (not Web — the callback is `127.0.0.1`).
6. **Download JSON**, leave it in `~/Downloads`, and say "done".

The human never has to copy the client ID or secret by hand; the importer reads
them from that file.

## Step 4 — Authorize Drive access

```bash
bun run oauth
```

This starts a local callback server, prints (and tries to open) the consent URL,
and writes `GOOGLE_REFRESH_TOKEN` straight into `.env`. Tell the human to
approve in the browser and come back. If they see "Google hasn't verified this
app", they should choose **Advanced → Go to … (unsafe)** — it is their own app.

Common failures:

| Symptom | Cause and fix |
| --- | --- |
| `redirect_uri_mismatch` | The client is a Web client. Create a Desktop app client and re-run Step 3. |
| `access_denied` | The account is not a test user on the consent screen. |
| "did not return a refresh token" | The app was authorized before. Revoke at <https://myaccount.google.com/permissions>, re-run. |

## Step 5 — Find the Paperpile IDs automatically

```bash
bun run setup:drive-ids --json
```

This searches Drive for `paperpile.bib` and for folders named `Paperpile`, then
scores each candidate by what it contains (`paperpile.bib`, an `All Papers`
subfolder, PDFs, a JSON export). Nobody has to copy IDs out of browser URLs.

- `confident: true` → write it:

  ```bash
  bun run setup:drive-ids --write-env
  ```

  This sets `DRIVE_PAPERPILE_FOLDER_ID`, `DRIVE_BIB_FILE_ID` and, when a JSON
  export is present in that folder, `DRIVE_JSON_FILE_ID`.

- `ambiguous: true` → show the candidates with their `reasons`, ask which one,
  then:

  ```bash
  bun run setup:env --drive-folder-id <id> --drive-bib-id <id>
  ```

- No candidates → Paperpile Drive sync is probably off, or the authorized
  Google account is not the one Paperpile syncs to. Ask the human to check
  **Paperpile → Settings → Google Drive sync**, then re-run.

Optional: if they prefer a local Paperpile JSON export for folders/labels, Step
0 lists any found under `paperpile.localJsonExports`:

```bash
bun run setup:env --paperpile-json "<path>"
```

## Step 6 — Verify

```bash
bun run doctor
```

`doctor` checks the toolchain, `.env` completeness, the vault (existence and
writability), the `markitdown` binary, the registry directory, the Google token
exchange, the Drive folder, and it downloads and parses `paperpile.bib` to
report an entry count. Every failure prints a `fix:` command. Exit code is
non-zero while anything required fails — keep fixing and re-running until it is
clean.

Then the real smoke test:

```bash
bun run status
bun run src/index.ts sync --incomplete-only --limit 1
```

Show the human the files that were created under
`<vault>/<papers folder>/References/`, `Bodies/` and `Summaries/`, and confirm
the Body note actually contains converted PDF text.

## Step 7 — Optional extras

Ask only after Step 6 is clean, and only about what applies.

**Scheduled sync (macOS).** Generate a launchd agent with this machine's real
paths and load it:

```bash
bun run setup:launchd            # preview
bun run setup:launchd --install  # write to ~/Library/LaunchAgents and load
bun run setup:launchd --uninstall
```

On Linux, schedule `bun run src/index.ts sync --incomplete-only` with cron or a
systemd timer instead. The daemon polls every `POLL_INTERVAL_MS` (default 15
minutes).

**Summarizer skill.** Claude Code picks up `.claude/skills/` from this
repository automatically. For Codex:

```bash
bun run setup:skills            # symlink into ~/.codex/skills
bun run setup:skills --status
```

**First bulk import.** A full library takes a long time and is heavy on the
Drive API. Suggest starting gently:

```bash
bun run src/index.ts sync --incomplete-only --limit 20 --delay-ms 5000
```

## Finishing

Summarize for the human:

- the vault path and papers folder in use,
- the Paperpile entry count reported by `doctor`,
- which optional pieces were enabled (JSON export, scheduled sync, skills),
- the everyday command: `bun run src/index.ts sync --incomplete-only`,
- that `.env` holds secrets, is git-ignored, and should never be shared.

## Command reference

| Command | Purpose |
| --- | --- |
| `bun run setup:detect [--json]` | Discover machine state, vaults, credentials, next step |
| `bun run setup:env [...]` | Write `.env` values without hand-editing |
| `bun run setup:google-client [path]` | Import OAuth client ID/secret from the downloaded JSON |
| `bun run oauth` | Browser authorization; writes `GOOGLE_REFRESH_TOKEN` to `.env` |
| `bun run setup:drive-ids [--write-env]` | Find the Paperpile folder, `.bib` and JSON export IDs |
| `bun run doctor [--json]` | Verify everything end to end, with fixes |
| `bun run setup:launchd [--install]` | Generate/install the macOS scheduled sync |
| `bun run setup:skills [--status]` | Link repository skills into `~/.codex/skills` |

## Troubleshooting map

| Failing check | First action |
| --- | --- |
| `bun` / `dependencies` | Install Bun, then `bun install` |
| `.env` | `bun run setup:detect` and follow `nextStep` |
| `vault` | `bun run setup:env --vault <path>`; check the path is not inside an unsynced cloud placeholder |
| `markitdown` | `rm -rf .venv && ./tools/install-markitdown.sh` |
| `google auth` | `bun run oauth`; if it still fails, `bun run setup:google-client` first |
| `drive folder` / `paperpile.bib` | `bun run setup:drive-ids --write-env` |
| Body notes empty | The paper has no PDF in Paperpile. Attach it, then re-run `sync --incomplete-only` |
