import { config } from "../config.ts";

/**
 * Convert a PDF file to Markdown using markitdown (Python CLI by Microsoft).
 * Install: pip3 install markitdown[all]
 */
export async function convertWithMarkitdown(pdfPath: string): Promise<string> {
  const proc = Bun.spawn([config.markitdownBin, pdfPath], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  if (exitCode !== 0) {
    const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
    throw new Error(`${config.markitdownBin} failed: ${detail}`);
  }

  return stdout;
}

/**
 * Fallback: convert PDF to Markdown using bundled Python/pypdf script.
 */
export async function convertWithFallback(pdfPath: string): Promise<string> {
  const scriptPath = new URL("../../tools/pdf_fallback.py", import.meta.url).pathname;
  const result = await Bun.$`python3 ${scriptPath} ${pdfPath}`.text();
  return result;
}
