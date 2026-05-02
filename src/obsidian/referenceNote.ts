import Handlebars from "handlebars";
import type { PaperEntry } from "../types.ts";

const templatePath = new URL("./templates/reference.hbs", import.meta.url).pathname;
const templateSource = await Bun.file(templatePath).text();
const compiledTemplate = Handlebars.compile(templateSource);

export function buildReferenceNote(entry: PaperEntry): string {
  const venue = entry.journal ?? entry.booktitle ?? "";
  const today = new Date().toISOString().split("T")[0];

  return compiledTemplate({
    citekey: entry.citekey,
    title: entry.title,
    authors: entry.authors,
    authorsInline: entry.authors.join("; "),
    year: entry.year,
    journal: entry.journal,
    booktitle: entry.booktitle,
    doi: entry.doi,
    url: entry.url,
    abstract: entry.abstract,
    venue: venue || "N/A",
    tags: entry.tags ?? [],
    rawBibtex: entry.rawBibtex,
    today,
  });
}
