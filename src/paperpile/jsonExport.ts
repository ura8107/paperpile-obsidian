import type { PaperEntry } from "../types.ts";

type JsonObject = Record<string, unknown>;

interface Classification {
  citekey?: string;
  doi?: string;
  title?: string;
  folders: string[];
  labels: string[];
}

const ID_FIELDS = ["id", "guid", "uuid", "key"];
const NAME_FIELDS = ["name", "title", "label", "path"];
const CITEKEY_FIELDS = ["citekey", "citationkey", "citation_key", "bibtexkey", "bibtex_key", "key"];
const DOI_FIELDS = ["doi"];
const TITLE_FIELDS = ["title"];

export function mergePaperpileJsonExport(entries: PaperEntry[], rawJson: string): PaperEntry[] {
  const parsed = JSON.parse(rawJson) as unknown;
  const folderNames = collectNameMap(parsed, "folder");
  const labelNames = collectNameMap(parsed, "label");
  const classifications = collectClassifications(parsed, folderNames, labelNames);

  const byCitekey = new Map<string, Classification>();
  const byDoi = new Map<string, Classification>();
  const byTitle = new Map<string, Classification>();

  for (const classification of classifications) {
    if (classification.citekey) byCitekey.set(classification.citekey, classification);
    if (classification.doi) byDoi.set(normalizeDoi(classification.doi), classification);
    if (classification.title) byTitle.set(normalizeTitle(classification.title), classification);
  }

  return entries.map((entry) => {
    const classification =
      byCitekey.get(entry.citekey) ??
      (entry.doi ? byDoi.get(normalizeDoi(entry.doi)) : undefined) ??
      byTitle.get(normalizeTitle(entry.title));

    if (!classification) return entry;

    return {
      ...entry,
      paperpileFolders: classification.folders,
      paperpileLabels: classification.labels,
    };
  });
}

export function collectClassifications(
  value: unknown,
  folderNames = new Map<string, string>(),
  labelNames = new Map<string, string>()
): Classification[] {
  const results: Classification[] = [];
  visitObjects(value, (object) => {
    const folders = extractNamedValues(object, "folder", folderNames);
    const labels = extractNamedValues(object, "label", labelNames);
    if (folders.length === 0 && labels.length === 0) return;

    const citekey = getStringField(object, CITEKEY_FIELDS);
    const doi = getStringField(object, DOI_FIELDS);
    const title = getStringField(object, TITLE_FIELDS);
    if (!citekey && !doi && !title) return;

    results.push({
      citekey,
      doi,
      title,
      folders,
      labels,
    });
  });
  return dedupeClassifications(results);
}

function collectNameMap(value: unknown, kind: "folder" | "label"): Map<string, string> {
  const map = new Map<string, string>();
  visitObjects(value, (object, parentKey) => {
    if (!parentKey.toLowerCase().includes(kind)) return;

    const id = getStringField(object, ID_FIELDS);
    const name = getStringField(object, NAME_FIELDS);
    if (id && name) map.set(id, name);
  });
  return map;
}

function extractNamedValues(
  object: JsonObject,
  kind: "folder" | "label",
  nameById: Map<string, string>
): string[] {
  const namedValues = getNamedExportValues(object, kind);
  if (namedValues.length > 0) return namedValues;

  const values: string[] = [];

  for (const [key, value] of Object.entries(object)) {
    if (!key.toLowerCase().includes(kind)) continue;
    values.push(...flattenNames(value, nameById));
  }

  return unique(values);
}

function getNamedExportValues(object: JsonObject, kind: "folder" | "label"): string[] {
  const namedKey = `${kind}sNamed`;
  const value = Object.entries(object).find(
    ([key]) => key.toLowerCase() === namedKey.toLowerCase()
  )?.[1];
  return value === undefined ? [] : flattenNames(value, new Map());
}

function flattenNames(value: unknown, nameById: Map<string, string>): string[] {
  if (value == null) return [];
  if (typeof value === "string" || typeof value === "number") {
    const raw = String(value).trim();
    return raw ? [nameById.get(raw) ?? raw] : [];
  }
  if (Array.isArray(value)) {
    return unique(value.flatMap((item) => flattenNames(item, nameById)));
  }
  if (isObject(value)) {
    const id = getStringField(value, ID_FIELDS);
    const name = getStringField(value, NAME_FIELDS);
    if (name) return [name];
    if (id) return [nameById.get(id) ?? id];
  }
  return [];
}

function visitObjects(
  value: unknown,
  visitor: (object: JsonObject, parentKey: string) => void,
  parentKey = ""
): void {
  if (Array.isArray(value)) {
    for (const item of value) visitObjects(item, visitor, parentKey);
    return;
  }

  if (!isObject(value)) return;

  visitor(value, parentKey);
  for (const [key, child] of Object.entries(value)) {
    visitObjects(child, visitor, key);
  }
}

function getStringField(object: JsonObject, fields: string[]): string | undefined {
  const lowerFields = new Set(fields.map((field) => field.toLowerCase()));
  for (const [key, value] of Object.entries(object)) {
    if (!lowerFields.has(key.toLowerCase())) continue;
    if (typeof value === "string" || typeof value === "number") {
      const normalized = String(value).trim();
      if (normalized) return normalized;
    }
  }
  return undefined;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function dedupeClassifications(classifications: Classification[]): Classification[] {
  const merged = new Map<string, Classification>();

  for (const classification of classifications) {
    const key =
      classification.citekey ??
      (classification.doi ? `doi:${normalizeDoi(classification.doi)}` : undefined) ??
      (classification.title ? `title:${normalizeTitle(classification.title)}` : undefined);
    if (!key) continue;

    const current = merged.get(key);
    if (!current) {
      merged.set(key, classification);
      continue;
    }

    merged.set(key, {
      citekey: current.citekey ?? classification.citekey,
      doi: current.doi ?? classification.doi,
      title: current.title ?? classification.title,
      folders: unique([...current.folders, ...classification.folders]),
      labels: unique([...current.labels, ...classification.labels]),
    });
  }

  return [...merged.values()];
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort();
}

function normalizeDoi(doi: string): string {
  return doi.trim().replace(/^https?:\/\/doi\.org\//i, "").toLowerCase();
}

function normalizeTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, " ").trim();
}
