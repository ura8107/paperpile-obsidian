import type { PaperEntry } from "../types.ts";

// bibtex-parse v2: fields are uppercase, directly on the entry object
const { entries: bibEntries } = await import("bibtex-parse");

const LATEX_CLEANUP = [
  [/\{\\textit\{([^}]*)\}\}/g, "$1"],
  [/\\emph\{([^}]*)\}/g, "$1"],
  [/\{([^}]*)\}/g, "$1"],   // strip remaining braces
  [/\\[a-z]+(?=[A-Z])/g, ""],  // strip \emph when directly followed by capital (bibtex-parse strips braces)
  [/\\[a-z]+\s+/g, " "],      // strip \command followed by spaces
  [/\\&/g, "&"],
  [/\\%/g, "%"],
  [/\\$/g, "$"],
  [/~~/g, " "],
  [/~/g, " "],
  [/--/g, "–"],
] as [RegExp, string][];

function cleanLatex(s: string | undefined): string {
  if (!s) return "";
  let result = s;
  for (const [pattern, replacement] of LATEX_CLEANUP) {
    result = result.replace(pattern, replacement);
  }
  return result.trim();
}

function parseAuthors(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(" and ")
    .map((a) => cleanLatex(a.trim()))
    .filter(Boolean);
}

// bibtex-parse v2 entry shape: { key, type, FIELD_NAME: value, ... }
type RawEntry = { key: string; type: string } & Record<string, string>;

function field(entry: RawEntry, name: string): string | undefined {
  // Try lowercase first (some parsers lowercase), then uppercase
  return entry[name] ?? entry[name.toUpperCase()] ?? entry[name.toLowerCase()];
}

export function parseBibTeX(raw: string): PaperEntry[] {
  const parsed = bibEntries(raw) as RawEntry[];

  return parsed.map((entry) => {
    const title = cleanLatex(field(entry, "TITLE"));
    const author = field(entry, "AUTHOR");
    const year = field(entry, "YEAR") ?? "";
    const journal = field(entry, "JOURNAL");
    const booktitle = field(entry, "BOOKTITLE");
    const doi = field(entry, "DOI");
    const abstract = field(entry, "ABSTRACT");
    const url = field(entry, "URL");
    const keywords = field(entry, "KEYWORDS");

    return {
      citekey: entry.key,
      title,
      authors: parseAuthors(author),
      year,
      journal: journal ? cleanLatex(journal) : undefined,
      booktitle: booktitle ? cleanLatex(booktitle) : undefined,
      doi,
      abstract: abstract ? cleanLatex(abstract) : undefined,
      url,
      tags: keywords
        ? keywords.split(/[,;]/).map((t) => t.trim()).filter(Boolean)
        : undefined,
      rawBibtex: buildRawBibtex(entry.key, entry.type, entry),
    };
  });
}

function buildRawBibtex(key: string, type: string, entry: RawEntry): string {
  const lines = [`@${type ?? "article"}{${key},`];
  for (const [k, v] of Object.entries(entry)) {
    if (k === "key" || k === "type") continue;
    lines.push(`  ${k.toLowerCase()} = {${v}},`);
  }
  lines.push("}");
  return lines.join("\n");
}

export function diffNewEntries(
  entries: PaperEntry[],
  processedKeys: Set<string>
): PaperEntry[] {
  return entries.filter((e) => !processedKeys.has(e.citekey));
}
