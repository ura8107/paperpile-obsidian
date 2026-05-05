#!/usr/bin/env python3
import json
import os
import sys
from pathlib import Path


def load_dotenv(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        value = value.strip().strip('"').strip("'")
        values[key.strip()] = value
    return values


def expand_path(value: str) -> Path:
    return Path(os.path.expandvars(os.path.expanduser(value))).resolve()


def find_repo_root() -> Path:
    current = Path.cwd().resolve()
    for candidate in [current, *current.parents]:
        if (candidate / "config.json").exists() and (candidate / "README.md").exists():
            return candidate
    return current


def main() -> int:
    if len(sys.argv) != 2 or not sys.argv[1].strip():
        print("usage: resolve_paper.py <citekey>", file=sys.stderr)
        return 2

    citekey = sys.argv[1].strip()
    repo_root = find_repo_root()
    dotenv = load_dotenv(repo_root / ".env")

    config_path = repo_root / "config.json"
    config = json.loads(config_path.read_text(encoding="utf-8")) if config_path.exists() else {}

    vault_value = (
        os.environ.get("OBSIDIAN_VAULT_PATH")
        or dotenv.get("OBSIDIAN_VAULT_PATH")
        or ""
    )
    papers_folder = (
        os.environ.get("OBSIDIAN_PAPERS_FOLDER")
        or dotenv.get("OBSIDIAN_PAPERS_FOLDER")
        or config.get("obsidianPapersFolder")
        or "Papers"
    )

    result = {
        "citekey": citekey,
        "repo_root": str(repo_root),
        "vault_path": str(expand_path(vault_value)) if vault_value else None,
        "papers_folder": papers_folder,
        "body_path": None,
        "reference_path": None,
        "summary_path": None,
        "exists": {
            "body": False,
            "reference": False,
            "summary": False,
        },
        "errors": [],
    }

    if not vault_value:
        result["errors"].append("OBSIDIAN_VAULT_PATH is not set in the environment or .env")
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 1

    papers_root = expand_path(vault_value) / papers_folder
    body_path = papers_root / "Bodies" / f"{citekey}_body.md"
    reference_path = papers_root / "References" / f"{citekey}.md"
    summary_path = papers_root / "Summaries" / f"{citekey}_summary.md"

    result.update(
        {
            "body_path": str(body_path),
            "reference_path": str(reference_path),
            "summary_path": str(summary_path),
            "exists": {
                "body": body_path.exists(),
                "reference": reference_path.exists(),
                "summary": summary_path.exists(),
            },
        }
    )

    if not body_path.exists():
        result["errors"].append(f"Body note not found: {body_path}")
    if not reference_path.exists():
        result["errors"].append(f"Reference note not found: {reference_path}")

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0 if body_path.exists() or reference_path.exists() else 1


if __name__ == "__main__":
    raise SystemExit(main())
