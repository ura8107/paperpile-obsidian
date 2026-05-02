/**
 * Convert a PDF file to Markdown using markitdown (Python CLI by Microsoft).
 * Install: pip3 install markitdown[all]
 */
export async function convertWithMarkitdown(pdfPath: string): Promise<string> {
  const result = await Bun.$`markitdown ${pdfPath}`.text();
  return result;
}

/**
 * Fallback: convert PDF to Markdown using bundled Python/pypdf script.
 */
export async function convertWithFallback(pdfPath: string): Promise<string> {
  const scriptPath = new URL("../../scripts/pdf_fallback.py", import.meta.url).pathname;
  const result = await Bun.$`python3 ${scriptPath} ${pdfPath}`.text();
  return result;
}
