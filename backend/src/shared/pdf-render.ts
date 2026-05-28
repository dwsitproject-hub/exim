/**
 * PDF page renderer — spawns a Python subprocess using PyMuPDF (fitz) to convert
 * the first page of a PDF to a high-resolution PNG for OCR.
 * Requires: `python3` available in PATH and `pymupdf` installed (`pip install pymupdf`).
 * In Docker (node:20-alpine), add to Dockerfile: apk add python3 py3-pip && pip3 install pymupdf
 */

import { spawn, spawnSync } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { randomBytes } from "crypto";
import { writeFile, unlink } from "fs/promises";
import { logger } from "../utils/logger.js";

/**
 * Resolves the Python executable path, trying multiple candidates in priority order.
 * Runs once at module load and caches the result.
 * Works on Linux/Docker (python3), macOS (python3), and Windows (python / python.exe).
 */
function resolvePythonExe(): string {
  for (const cmd of ["python3", "python", "python.exe"]) {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8", timeout: 3000, windowsHide: true });
    if (!r.error && r.status === 0) {
      logger.debug("Python resolved", { cmd });
      return cmd;
    }
  }
  logger.warn("Python executable not found — falling back to 'python3'");
  return "python3";
}

/** Cached Python executable path, resolved once at module load. */
const PYTHON_EXE = resolvePythonExe();

/**
 * Python script: extracts the embedded text layer from one PDF page.
 * Writes the plain text to stdout.  Produces empty output on image-only pages.
 */
const TEXT_SCRIPT = `
import sys
import fitz

def main():
    pdf_path = sys.argv[1]
    page_idx = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    doc = fitz.open(pdf_path)
    if page_idx >= doc.page_count:
        page_idx = 0
    page = doc[page_idx]
    text = page.get_text()
    sys.stdout.write(text)
    doc.close()

main()
`.trimStart();

/** Inline Python script: renders PDF page 0 → PNG at 2.5x scale for good OCR quality. */
const RENDER_SCRIPT = `
import sys, os
import fitz

def main():
    pdf_path = sys.argv[1]
    out_path = sys.argv[2]
    page_idx = int(sys.argv[3]) if len(sys.argv) > 3 else 0
    doc = fitz.open(pdf_path)
    if page_idx >= doc.page_count:
        page_idx = 0
    page = doc[page_idx]
    pix = page.get_pixmap(matrix=fitz.Matrix(2.5, 2.5), alpha=False)
    pix.save(out_path)
    doc.close()

main()
`.trimStart();

/**
 * Returns the number of pages in a PDF.
 * Falls back to 1 on any error (so callers can safely OCR page 0).
 */
export async function getPdfPageCount(pdfPath: string): Promise<number> {
  const id = randomBytes(8).toString("hex");
  const scriptPath = join(tmpdir(), `pdf_count_${id}.py`);
  const script = `import sys, fitz\ndoc = fitz.open(sys.argv[1])\nprint(doc.page_count)\ndoc.close()\n`;
  await writeFile(scriptPath, script, "utf8");
  return new Promise((resolve) => {
    const proc = spawn(PYTHON_EXE, [scriptPath, pdfPath]);
    let stdout = "";
    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on("close", async () => {
      await unlink(scriptPath).catch(() => undefined);
      const n = parseInt(stdout.trim(), 10);
      resolve(Number.isFinite(n) && n > 0 ? n : 1);
    });
    proc.on("error", async () => {
      await unlink(scriptPath).catch(() => undefined);
      resolve(1);
    });
  });
}

/**
 * Extracts the embedded text layer from one PDF page using PyMuPDF.
 *
 * Returns the page's plain text if the PDF has a text layer, or an empty
 * string for scanned/image-only pages.  Callers should check whether the
 * returned text is usable (e.g. ≥ 150 non-whitespace characters) before
 * deciding to skip the more expensive OCR path.
 *
 * @param pdfPath   Absolute path to the source PDF.
 * @param pageIndex 0-based page index (defaults to 0).
 */
export async function extractPdfPageText(pdfPath: string, pageIndex = 0): Promise<string> {
  const id = randomBytes(8).toString("hex");
  const scriptPath = join(tmpdir(), `pdf_text_${id}.py`);
  await writeFile(scriptPath, TEXT_SCRIPT, "utf8");

  return new Promise((resolve) => {
    const proc = spawn(PYTHON_EXE, [scriptPath, pdfPath, String(pageIndex)]);
    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on("close", async (code) => {
      await unlink(scriptPath).catch(() => undefined);
      if (code !== 0) {
        logger.debug("PDF text extraction failed, will fall back to OCR", { page: pageIndex, stderr: stderr.trim() });
        resolve("");
      } else {
        logger.debug("PDF text extracted", { page: pageIndex, chars: stdout.length });
        resolve(stdout);
      }
    });

    proc.on("error", async () => {
      await unlink(scriptPath).catch(() => undefined);
      resolve("");
    });
  });
}

/**
 * Renders one page of a PDF to a temporary PNG file.
 * Caller is responsible for deleting the returned file.
 *
 * @param pdfPath  Absolute path to the source PDF.
 * @param pageIndex  0-based page index (defaults to 0 = page 1).
 * @returns  Absolute path to the rendered PNG in the OS temp directory.
 */
export async function renderPdfPageToPng(pdfPath: string, pageIndex = 0): Promise<string> {
  const id = randomBytes(8).toString("hex");
  const scriptPath = join(tmpdir(), `pdf_render_${id}.py`);
  const outPngPath = join(tmpdir(), `pdf_page_${id}.png`);

  await writeFile(scriptPath, RENDER_SCRIPT, "utf8");

  return new Promise((resolve, reject) => {
    const proc = spawn(PYTHON_EXE, [scriptPath, pdfPath, outPngPath, String(pageIndex)]);
    let stderr = "";

    proc.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on("close", async (code) => {
      await unlink(scriptPath).catch(() => undefined);
      if (code !== 0) {
        reject(new Error(`PDF render failed (exit ${code}): ${stderr.trim()}`));
      } else {
        logger.debug("PDF page rendered", { pdf: pdfPath, page: pageIndex, out: outPngPath });
        resolve(outPngPath);
      }
    });

    proc.on("error", (err) => {
      unlink(scriptPath).catch(() => undefined);
      reject(new Error(`Failed to spawn Python: ${err.message}`));
    });
  });
}
