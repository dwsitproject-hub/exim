/**
 * Multipart upload filenames: browsers send UTF-8 bytes; multer/busboy often expose them as latin1 strings.
 */

/** Decode `file.originalname` from multipart uploads to proper UTF-8. Safe for ASCII-only names. */
export function decodeMultipartFileName(raw: string): string {
  if (!raw) return raw;
  try {
    const decoded = Buffer.from(raw, "latin1").toString("utf8").normalize("NFC");
    return decoded.includes("\uFFFD") ? raw.normalize("NFC") : decoded;
  } catch {
    return raw.normalize("NFC");
  }
}

/** True when a stored name likely came from UTF-8 bytes misread as latin1 (legacy uploads). */
function looksLikeMojibakeFileName(name: string): boolean {
  if (/[\u3400-\u9fff\uf900-\ufaff]/.test(name)) return false;
  return /[\u0080-\u00ff]/.test(name);
}

/** Repair legacy rows stored with UTF-8 misread as latin1 (display + download). */
export function repairMojibakeFileName(name: string): string {
  if (!name) return name;
  if (!looksLikeMojibakeFileName(name)) return name.normalize("NFC");
  return decodeMultipartFileName(name);
}

/** RFC 5987 attachment header for Unicode filenames. */
export function contentDispositionAttachment(fileName: string): string {
  const trimmed = fileName.trim() || "download";
  const asciiFallback =
    trimmed.replace(/[^\x20-\x7E]/g, "_").replace(/\\/g, "\\\\").replace(/"/g, '\\"') || "download";
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(trimmed)}`;
}
