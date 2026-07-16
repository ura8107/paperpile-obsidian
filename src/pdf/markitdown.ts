import { config } from "../config.ts";
import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";

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

/**
 * OCR fallback for scanned/image-only PDFs using Docling + RapidOCR.
 * This is intentionally last because it is much slower than text-layer extraction.
 */
export async function convertWithOcrFallback(pdfPath: string): Promise<string> {
  const outputDir = mkdtempSync(join(tmpdir(), "paperpile-ocr-"));
  const doclingBin = process.env.DOCLING_BIN ?? ".venv/bin/docling";

  try {
    const proc = Bun.spawn(
      [
        doclingBin,
        "convert",
        pdfPath,
        "--to",
        "md",
        "--output",
        outputDir,
        "--force-ocr",
        "--ocr-engine",
        "rapidocr",
        "--device",
        "auto",
        "--document-timeout",
        "300",
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      const detail = stderr.trim() || stdout.trim() || `exit code ${exitCode}`;
      throw new Error(`${doclingBin} OCR failed: ${detail}`);
    }

    const markdownFile = findDoclingMarkdown(outputDir, pdfPath);
    return await Bun.file(markdownFile).text();
  } finally {
    rmSync(outputDir, { recursive: true, force: true });
  }
}

function findDoclingMarkdown(outputDir: string, pdfPath: string): string {
  const preferred = `${basename(pdfPath).replace(/\.pdf$/i, "")}.md`;
  const files = readdirSync(outputDir).filter((file) => file.endsWith(".md"));

  if (files.includes(preferred)) {
    return join(outputDir, preferred);
  }
  if (files.length === 1) {
    return join(outputDir, files[0]);
  }

  throw new Error(`Docling OCR did not produce a single markdown file in ${outputDir}`);
}
