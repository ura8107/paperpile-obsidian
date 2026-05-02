import Handlebars from "handlebars";
import { callClaude } from "./anthropicClient.ts";
import { truncateBody } from "../pdf/converter.ts";
import { config } from "../config.ts";
import type { PaperEntry } from "../types.ts";

// Load and compile the summary prompt template once at module load
const templatePath = new URL(
  "../obsidian/templates/summary.hbs",
  import.meta.url
).pathname;
const templateSource = await Bun.file(templatePath).text();
const compiledTemplate = Handlebars.compile(templateSource);

export async function generateSummary(
  entry: PaperEntry,
  bodyMarkdown: string
): Promise<string> {
  const truncated = truncateBody(bodyMarkdown, config.maxBodyChars);

  const venue = entry.journal ?? entry.booktitle ?? "N/A";
  const today = new Date().toISOString().split("T")[0];

  // Render the prompt template
  const prompt = compiledTemplate({
    citekey: entry.citekey,
    title: entry.title,
    authors: entry.authors.join("; "),
    year: entry.year,
    venue,
    doi: entry.doi ?? "N/A",
    bodyMarkdown: truncated,
    today,
  });

  // Split into system (everything before the full-text block) and user (the full text + instructions)
  // The system prompt is the static part (template minus the paper body) — cached by Anthropic
  const [systemPart, userPart] = splitPrompt(prompt, truncated);

  console.log(`[llm] Generating summary for ${entry.citekey}...`);
  const summary = await callClaude(systemPart, userPart);
  return summary;
}

/**
 * Split the rendered prompt into a cacheable system part and a per-paper user part.
 * The system part contains everything up to and including the <fulltext> opening tag.
 * The user part contains the actual document text and instructions.
 */
function splitPrompt(fullPrompt: string, bodyMarkdown: string): [string, string] {
  const fulltextStart = fullPrompt.indexOf("<fulltext>");
  if (fulltextStart === -1) {
    // No split point found — send everything as user content
    return ["You are an expert research assistant.", fullPrompt];
  }

  const systemPart = fullPrompt.slice(0, fulltextStart).trim();
  const userPart = fullPrompt.slice(fulltextStart).trim();
  return [systemPart, userPart];
}
