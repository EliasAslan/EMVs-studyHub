/**
 * PDF text extraction — runs entirely in the browser via pdf.js (CDN, lazy).
 *
 * No server, no upload: the File object is read locally and only plain text
 * comes out. Scanned/image-only PDFs contain no text layer — those are
 * rejected with a dedicated error code instead of silently yielding nothing.
 *
 * Mostly DOM-free: only FileReader/ArrayBuffer APIs are used, so the pure
 * guards are unit-testable in Node.
 */

export const MAX_PAGES = 150;
export const MIN_CHARS_PER_PAGE = 20;

const PDFJS_VERSION_MAJOR = 4;
const PDFJS_BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${PDFJS_VERSION_MAJOR}`;

let pdfJsPromise = null;

/** Lazy-load pdf.js ESM build + worker. Rejects with 'pdfjs-load' on failure. */
export function loadPdfJs(deps = {}) {
  if (deps.pdfjs) return Promise.resolve(deps.pdfjs);
  if (!pdfJsPromise) {
    pdfJsPromise = import(`${PDFJS_BASE}/build/pdf.mjs`).then((lib) => {
      const pdfjs = lib && lib.default ? { ...lib, ...lib.default } : lib;
      try {
        if (pdfjs?.GlobalWorkerOptions) {
          pdfjs.GlobalWorkerOptions.workerSrc = `${PDFJS_BASE}/build/pdf.worker.mjs`;
        }
      } catch {}
      return pdfjs;
    }).catch(() => {
      pdfJsPromise = null;
      const err = new Error('pdfjs-load');
      err.code = 'pdfjs-load';
      throw err;
    });
  }
  return pdfJsPromise;
}

/** Join per-page texts with page markers (pure, tested). */
export function joinPageTexts(pages) {
  return (pages || [])
    .map((t, i) => `[Seite ${i + 1}]\n${String(t || '').trim()}`)
    .join('\n\n')
    .trim();
}

/**
 * Meaningfulness guard (pure, tested): at least 2 pages worth of text on
 * average, else the PDF is likely a scan without a text layer.
 */
export function isTextMeaningful(text, pageCount) {
  const len = String(text || '').trim().length;
  if (!len || !(pageCount > 0)) return false;
  return len >= Math.min(pageCount, 10) * MIN_CHARS_PER_PAGE;
}

export function describePdfError(code) {
  switch (code) {
    case 'pdfjs-load':
      return 'PDF-Bibliothek konnte nicht geladen werden (Internet nötig für den ersten Aufruf). Erneut versuchen.';
    case 'pdf-empty':
      return 'Dieses PDF enthält keinen lesbaren Text — vermutlich ein Scan. Text-PDFs funktionieren, Bilder leider nicht.';
    case 'pdf-too-big':
      return `Dieses PDF hat zu viele Seiten (max. ${MAX_PAGES}). Bitte einen kleineren Ausschnitt wählen.`;
    case 'pdf-unreadable':
      return 'PDF konnte nicht gelesen werden — Datei prüfen und erneut versuchen.';
    default:
      return 'PDF konnte nicht verarbeitet werden.';
  }
}

/**
 * Extract plain text from a File/Blob. onProgress({done, total}).
 * Resolves { text, pageCount }. Rejects Error with .code.
 */
export async function extractPdfText(file, opts = {}, deps = {}) {
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : () => {};
  let pdfjs;
  try {
    pdfjs = await loadPdfJs(deps);
  } catch (e) {
    throw e?.code ? e : Object.assign(new Error('pdfjs-load'), { code: 'pdfjs-load' });
  }
  let buffer;
  try {
    buffer = await file.arrayBuffer();
  } catch {
    throw Object.assign(new Error('pdf-unreadable'), { code: 'pdf-unreadable' });
  }
  let doc;
  try {
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer) });
    doc = await task.promise;
  } catch {
    throw Object.assign(new Error('pdf-unreadable'), { code: 'pdf-unreadable' });
  }
  try {
    if (doc.numPages > (opts.maxPages ?? MAX_PAGES)) {
      throw Object.assign(new Error('pdf-too-big'), { code: 'pdf-too-big' });
    }
    const pages = [];
    for (let n = 1; n <= doc.numPages; n += 1) {
      if (opts.signal?.aborted) throw Object.assign(new Error('aborted'), { code: 'aborted' });
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const strings = (content?.items || []).map(it => (typeof it?.str === 'string' ? it.str : '')).filter(Boolean);
      pages.push(strings.join(' ').replace(/\s+/g, ' '));
      onProgress({ done: n, total: doc.numPages });
      try { page.cleanup?.(); } catch {}
    }
    const text = joinPageTexts(pages);
    if (!isTextMeaningful(text, doc.numPages)) {
      throw Object.assign(new Error('pdf-empty'), { code: 'pdf-empty' });
    }
    return { text, pageCount: doc.numPages };
  } finally {
    try { await doc.destroy?.(); } catch {}
  }
}
