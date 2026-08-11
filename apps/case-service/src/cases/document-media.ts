/**
 * What kind of file this actually is, and whether a browser may render it.
 *
 * Every Telegram upload was stored as `application/octet-stream`, because the
 * adapter trusted the content-type on Telegram's file download and fell back
 * to octet-stream when it was unhelpful. Nothing noticed while the files were
 * write-only; the moment an operator needs to *look* at the evidence, a wrong
 * content type means the browser downloads a file instead of showing a photo.
 *
 * Derived from the extension rather than the transport header: the extension
 * comes from Telegram's own stored file path and has been reliable, while the
 * header demonstrably is not.
 */

const BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  heic: 'image/heic',
  pdf: 'application/pdf',
};

/** Types safe to render inline in an operator's browser. */
const INLINE_RENDERABLE = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
]);

/**
 * Best available media type for a stored file.
 *
 * A declared type is honoured unless it is the generic fallback — that value
 * means "nobody knew", not "this is binary", so the extension gets a turn.
 */
export function resolveMimeType(filename: string, declared?: string | null): string {
  const useful = declared && declared !== 'application/octet-stream' ? declared : null;
  if (useful) return useful;

  const extension = filename.split('.').pop()?.toLowerCase();
  return (extension && BY_EXTENSION[extension]) || 'application/octet-stream';
}

/**
 * Whether the browser may display this inline.
 *
 * Anything else is served as an attachment. This is a safety decision, not a
 * convenience one: rendering claimant-supplied HTML or SVG inline on the
 * portal's own origin would run their markup with an operator's session.
 */
export function isInlineRenderable(mimeType: string): boolean {
  return INLINE_RENDERABLE.has(mimeType);
}
