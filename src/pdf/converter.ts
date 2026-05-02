import { convertWithMarkitdown, convertWithFallback } from "./markitdown.ts";

/**
 * Convert a PDF to Markdown, trying markitdown first then falling back to pypdf.
 * Returns the markdown string, or null if both methods fail.
 */
export async function pdfToMarkdown(pdfPath: string): Promise<string | null> {
  // Try markitdown first
  try {
    const md = await convertWithMarkitdown(pdfPath);
    if (md.trim().length > 100) {
      console.log(`[pdf] Converted via markitdown (${md.length} chars)`);
      return md;
    }
  } catch (err) {
    console.warn(`[pdf] markitdown failed: ${(err as Error).message}. Trying fallback...`);
  }

  // Fall back to pypdf
  try {
    const md = await convertWithFallback(pdfPath);
    if (md.trim().length > 50) {
      console.log(`[pdf] Converted via pypdf fallback (${md.length} chars)`);
      return md;
    }
  } catch (err) {
    console.error(`[pdf] Fallback also failed: ${(err as Error).message}`);
  }

  return null;
}

/**
 * Truncate body markdown to fit within the LLM token budget.
 * Strategy: keep first 30% + last 20% to preserve abstract/intro and conclusion.
 */
export function truncateBody(body: string, maxChars: number): string {
  if (body.length <= maxChars) return body;

  const headChars = Math.floor(maxChars * 0.6);
  const tailChars = Math.floor(maxChars * 0.4);

  const head = body.slice(0, headChars);
  const tail = body.slice(-tailChars);
  return `${head}\n\n[... middle of document truncated for length ...]\n\n${tail}`;
}
