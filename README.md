# paperpile-obsidian

Paperpile に保存した論文を、Obsidian で読める Markdown ライブラリとして整理するための同期ツールです。

このツールは Paperpile の Google Drive 同期データを読み取り、論文ごとに次のファイルを作ります。

| 保存先 | 内容 |
| --- | --- |
| `paperpile-data/References/<citekey>.md` | 論文メタデータ、Abstract、BibTeX、関連リンク |
| `paperpile-data/Bodies/<citekey>_body.md` | PDF本文を Markdown に変換したもの |
| `paperpile-data/Summaries/<citekey>_summary.md` | 要約や読書メモ用の出力先 |

`<citekey>` は Paperpile の citation key です。Reference、Body、Summary は citekey ベースの Obsidian wikilink でつながるため、ファイルを別フォルダに分けても行き来できます。

## まず知ること

このリポジトリには、同期ツール本体と設定例だけを入れる想定です。同期で作られる `paperpile-data/` や `Papers/` には、PDF本文、個人メモ、読書履歴、研究関心が含まれるため Git にコミットしないでください。

`.gitignore` では次を除外しています。

- `.env`
- `.venv/`
- `paperpile-data/`
- `/Papers/`
- `*.pdf`

## 必要なもの

- Paperpile
- Paperpile の Google Drive sync
- Google Drive API の OAuth2 credentials
- Bun
- Python 3
- Obsidian

PDF本文の Markdown 変換には `markitdown` を使います。このプロジェクトでは、システム全体の Python 環境ではなく、リポジトリ内の `.venv` に専用環境を作ることを推奨します。

## 初回セットアップ

### 1. JavaScript 依存関係を入れる

```bash
bun install
```

### 2. PDF変換環境を作る

```bash
./tools/install-markitdown.sh
```

このコマンドは `.venv` を作り、`markitdown[all]` と必要な Python 依存関係を入れます。Apple Silicon Mac で起きやすい NumPy の architecture mismatch を避けるため、プロジェクト専用環境を使います。

### 3. `.env` を作る

```bash
cp .env.example .env
```

最低限、次を設定します。

```env
OBSIDIAN_VAULT_PATH=/absolute/path/to/your/vault
OBSIDIAN_PAPERS_FOLDER=paperpile-data
MARKITDOWN_BIN=/absolute/path/to/this/repo/.venv/bin/markitdown

GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REFRESH_TOKEN=...

DRIVE_PAPERPILE_FOLDER_ID=...
DRIVE_BIB_FILE_ID=...
```

このリポジトリ内にデータを置く場合の例:

```env
OBSIDIAN_VAULT_PATH=/Users/you/Documents/GitHub/paperpile-obsidian
OBSIDIAN_PAPERS_FOLDER=paperpile-data
MARKITDOWN_BIN=/Users/you/Documents/GitHub/paperpile-obsidian/.venv/bin/markitdown
```

別の Obsidian vault に保存したい場合は、`OBSIDIAN_VAULT_PATH` をその vault の絶対パスにします。

### 4. Google Drive API を準備する

1. Google Cloud Console でプロジェクトを作る
2. Google Drive API を有効にする
3. OAuth2 credentials を作る
4. Application type は Desktop app を選ぶ
5. `GOOGLE_CLIENT_ID` と `GOOGLE_CLIENT_SECRET` を `.env` に入れる
6. refresh token を取得する

```bash
bun run oauth
```

表示される案内に従って認証し、得られた `GOOGLE_REFRESH_TOKEN` を `.env` に入れます。

### 5. Paperpile 側の Drive ID を入れる

`.env` に次を入れます。

- `DRIVE_PAPERPILE_FOLDER_ID`: Paperpile の Google Drive sync フォルダID
- `DRIVE_BIB_FILE_ID`: Google Drive 上の `paperpile.bib` のファイルID

Google Drive のURLからIDをコピーできます。

### 6. 設定を確認する

```bash
bun run status
```

Paperpile の総件数、処理済み件数、未処理件数が表示されれば準備完了です。

## 使い方

### 1本だけ試す

```bash
bun run src/index.ts process <citekey>
```

例:

```bash
bun run src/index.ts process Acemoglu2019-br
```

初回セットアップ直後は、まず1本だけ試すと設定ミスを見つけやすいです。

### 未処理・未完成の論文だけ同期する

```bash
bun run src/index.ts sync --incomplete-only --limit 100
```

通常運用ではこのコマンドを推奨します。対象になるのは次の論文です。

- まだ metadata がない論文
- まだ PDF body がない論文
- 以前はPDFがなく、後からPaperpileにPDFが添付された論文
- PDF変換が過去に失敗した論文

後からPDFをPaperpileに添付した場合も、このコマンドで再チェックされ、PDF本文が Markdown として保存されます。

### すべての論文を同期する

```bash
bun run sync
```

全件を確認するため、大きいライブラリでは時間がかかります。通常は `--incomplete-only` を使ってください。

### 件数を絞って同期する

```bash
bun run src/index.ts sync --incomplete-only --limit 20
```

Google Drive API 負荷や実行時間を抑えたいときに使います。

### 実行間隔を空ける

```bash
bun run src/index.ts sync --incomplete-only --limit 100 --delay-ms 5000
```

論文ごとに5秒待ちます。大量同期時にGoogle Drive APIへのアクセスを少し穏やかにできます。

## 自動実行

この環境では Codex app の automation により、次の定期実行を設定しています。

| 項目 | 内容 |
| --- | --- |
| 名前 | `Paperpile incomplete sync` |
| automation id | `paperpile-incomplete-sync` |
| 時刻 | 毎日 0:00 と 12:00 |
| 実行内容 | `npx --yes bun run src/index.ts sync --incomplete-only --limit 100` |

この定期実行により、metadata や PDF body がまだない論文が1回最大100件ずつ取り込まれます。PDFが後から添付された論文も、以前の本文状態が `missing` または `failed` なら再処理されます。

手動で同じ処理を走らせる場合:

```bash
npx --yes bun run src/index.ts sync --incomplete-only --limit 100
```

## 出力ファイルの見方

### Reference note

`paperpile-data/References/<citekey>.md`

主に次を含みます。

- YAML metadata
- title, authors, year, venue
- abstract
- DOI やURL
- BibTeX
- Body/Summary への wikilink

### Body note

`paperpile-data/Bodies/<citekey>_body.md`

PDF本文を Markdown に変換したファイルです。変換にはまず `markitdown` を使い、失敗した場合は `pypdf` fallback を使います。

### Summary note

`paperpile-data/Summaries/<citekey>_summary.md`

要約や読書メモの保存先です。同期処理では空フォルダだけを作り、要約本文は自動では作りません。

## 論文を要約する

このリポジトリには、citekey から Reference/Body を探して構造化要約を作る Codex skill が入っています。

```text
.codex/skills/paper-summarizer/
```

Codex から使えるようにするには、skill root に symlink を置きます。

```bash
mkdir -p ~/.codex/skills
ln -s "$(pwd)/.codex/skills/paper-summarizer" ~/.codex/skills/paper-summarizer
```

使い方の例:

```text
$paper-summarizer Acemoglu2019-br
Acemoglu2019-br の本文を構造化要約して
```

要約は通常 `paperpile-data/Summaries/<citekey>_summary.md` に保存されます。Body note がない場合は、metadata と abstract を使った要約になります。

## よく使うコマンド

| やりたいこと | コマンド |
| --- | --- |
| 状態を見る | `bun run status` |
| 1本だけ処理する | `bun run src/index.ts process <citekey>` |
| 未完成分だけ100件処理する | `bun run src/index.ts sync --incomplete-only --limit 100` |
| 全件同期する | `bun run sync` |
| テストを走らせる | `bun test` |
| 開発用daemonを起動する | `bun run dev` |

## トラブルシューティング

### `markitdown` が見つからない

`.env` の `MARKITDOWN_BIN` を確認します。

```env
MARKITDOWN_BIN=/absolute/path/to/paperpile-obsidian/.venv/bin/markitdown
```

次で確認できます。

```bash
.venv/bin/markitdown --help
```

### NumPy の architecture mismatch が出る

システムPythonに入った壊れた依存関係を使っている可能性があります。プロジェクト専用環境を作り直してください。

```bash
rm -rf .venv
./tools/install-markitdown.sh
```

### PDF body が作られない

まず未完成分だけ再同期します。

```bash
bun run src/index.ts sync --incomplete-only --limit 100
```

Paperpile にPDFがない場合は、Body note に「PDFを取得または変換できなかった」旨の warning が書かれます。後からPDFをPaperpileに添付すれば、次回の `--incomplete-only` 実行で再処理されます。

### Google Drive 認証で失敗する

`.env` の次を確認します。

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `DRIVE_PAPERPILE_FOLDER_ID`
- `DRIVE_BIB_FILE_ID`

refresh token を取り直す場合:

```bash
bun run oauth
```

### Codex が summary ファイルを書けない

Obsidian vault が Codex の書き込み許可範囲外にあると、通常のmacOS権限が正しくても `Operation not permitted` になることがあります。その場合はCodex側で書き込み承認が必要です。

## 古いフォルダ構成から移行する

以前の `Papers/<citekey>/` 形式から、現在の `References/`、`Bodies/`、`Summaries/` 形式へ移す場合:

```bash
bun run src/index.ts migrate-folders --dry-run
bun run src/index.ts migrate-folders
```

まず `--dry-run` で移動予定を確認してください。

## 開発者向けメモ

通常利用ではこの節を読む必要はありません。

```text
src/index.ts              CLI entry point
src/cli.ts                CLI command dispatcher
src/config.ts             .env と defaults の読み込み
src/bibtex/               BibTeX parser と processed registry
src/drive/                Google Drive API client
src/pdf/                  PDF -> Markdown 変換
src/obsidian/             Obsidian note writer
src/daemon/               polling daemon
tools/setup-google-oauth.ts
tools/install-markitdown.sh
tools/pdf_fallback.py
config/defaults.json
config/launchd/
```

型チェック:

```bash
./node_modules/.bin/tsc --noEmit
```

テスト:

```bash
bun test
```
