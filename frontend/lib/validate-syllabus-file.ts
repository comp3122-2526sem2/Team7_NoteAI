/**
 * Client-side validation for syllabus file uploads.
 * Mirrors the same limits enforced by the backend so the teacher gets
 * immediate feedback without waiting for a server round-trip.
 */

const MAX_FILE_SIZE_MB = 20;
const MAX_PDF_PAGES = 50;

/**
 * Returns an error message string, or null if the file is valid.
 *
 * PDF page count is extracted from the raw bytes by finding all `/Count N`
 * entries and taking the maximum — the root Pages node always has the highest
 * count, so this reliably gives the total page count for standard PDFs.
 */
export async function validateSyllabusFile(file: File): Promise<string | null> {
  // ── Size check (all types) ──────────────────────────────────────────────────
  const sizeMb = file.size / (1024 * 1024);
  if (sizeMb > MAX_FILE_SIZE_MB) {
    return (
      `File is too large (${sizeMb.toFixed(1)} MB). ` +
      `Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`
    );
  }

  // ── PDF page count ──────────────────────────────────────────────────────────
  if (file.type === "application/pdf") {
    try {
      const buffer = await file.arrayBuffer();
      const text = new TextDecoder("latin1").decode(new Uint8Array(buffer));
      const matches = [...text.matchAll(/\/Count\s+(\d+)/g)];
      if (matches.length > 0) {
        const pageCount = Math.max(...matches.map((m) => parseInt(m[1]!, 10)));
        if (pageCount > MAX_PDF_PAGES) {
          return (
            `PDF has ${pageCount} pages. ` +
            `Maximum allowed is ${MAX_PDF_PAGES} pages. ` +
            `Please split the document or reduce it to ${MAX_PDF_PAGES} pages or fewer.`
          );
        }
      }
    } catch {
      // If the bytes can't be parsed let the backend validation handle it.
    }
  }

  return null;
}
