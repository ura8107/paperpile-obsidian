import { convertWithMarkitdown, convertWithFallback, convertWithOcrFallback } from "./markitdown.ts";

/**
 * Convert a PDF to Markdown, trying text-layer extraction before OCR fallback.
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
    console.warn(`[pdf] Fallback also failed: ${(err as Error).message}. Trying OCR fallback...`);
  }

  // OCR fallback for scanned/image-only PDFs
  try {
    const md = await convertWithOcrFallback(pdfPath);
    if (md.trim().length > 100) {
      console.log(`[pdf] Converted via OCR fallback (${md.length} chars)`);
      return md;
    }
  } catch (err) {
    console.error(`[pdf] OCR fallback also failed: ${(err as Error).message}`);
  }

  return null;
}
