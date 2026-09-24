/**
 * What a claimant is allowed to attach to a case.
 *
 * The only check before this existed was the browser's `accept` attribute,
 * which is a filter on a file picker and nothing more: anyone can post whatever
 * they like straight at the endpoint. That mattered more than it looks. The
 * portal serves stored documents back to operators, and `isInlineRenderable`
 * is the guard that stops claimant markup running on the portal's own origin —
 * but a guard on *serving* does not stop the file being stored, quota being
 * consumed, or an archive full of something else entirely sitting inside the
 * evidence for a claim.
 *
 * Two checks, and both are needed:
 *
 *  - the **extension and declared type** must be on the list, which is what
 *    gives the claimant a comprehensible refusal naming their own file; and
 *  - the **first bytes** must match, which is what makes it true. `evil.html`
 *    renamed to `receipt.pdf` announces itself as a PDF at every layer that
 *    asks politely.
 *
 * HEIC is on the list because it is what an iPhone produces by default, and a
 * claimant standing in an airport should not have to convert a photo. It has no
 * usable magic number of its own — the check is the ISO base-media `ftyp` box
 * plus a HEIC-family brand.
 */

import { BadRequestException } from '@nestjs/common';

/** Accepted media types, and the extensions that may claim them. */
const ALLOWED: Record<string, readonly string[]> = {
  'image/jpeg': ['jpg', 'jpeg'],
  'image/png': ['png'],
  'image/webp': ['webp'],
  'image/heic': ['heic', 'heif'],
  'application/pdf': ['pdf'],
};

/** Human list for the refusal message. Order is the order a claimant reads. */
const ACCEPTED_LABEL = 'JPEG, PNG, WebP, HEIC or PDF';

const ALLOWED_EXTENSIONS = new Set(Object.values(ALLOWED).flat());

/** ISO base-media brands that mean "this is a HEIC/HEIF image". */
const HEIC_BRANDS = new Set(['heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

function startsWith(buffer: Buffer, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * The media type the bytes themselves claim to be, or null when they match
 * nothing we accept. Deliberately narrow: this is an allowlist, so "not
 * recognised" and "recognised as something else" are the same answer.
 */
export function sniffMimeType(buffer: Buffer): string | null {
  // JPEG — FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG — 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // PDF — %PDF-
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';

  // WebP — "RIFF" .... "WEBP". The four bytes between are the file length, so
  // they are skipped rather than matched.
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }

  // HEIC — an ISO base-media file whose major brand is in the HEIC family.
  // Bytes 4–8 are "ftyp"; the brand follows.
  if (buffer.length >= 12 && buffer.toString('ascii', 4, 8) === 'ftyp') {
    const brand = buffer.toString('ascii', 8, 12).toLowerCase();
    if (HEIC_BRANDS.has(brand)) return 'image/heic';
  }

  return null;
}

/**
 * Refuse anything not on the list, before a byte reaches storage.
 *
 * `declared` is whatever `resolveMimeType` settled on — the transport header
 * where it was useful, the extension otherwise. It is checked so the claimant
 * gets a refusal that names their file, but it is never what decides: the
 * sniffed type is, and it must agree.
 *
 * @throws BadRequestException with wording a claimant can act on.
 */
export function assertAllowedUpload(
  buffer: Buffer,
  filename: string,
  declared: string
): asserts declared is keyof typeof ALLOWED {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new BadRequestException(
      `“${filename}” is not a file type we can accept. Please send a ${ACCEPTED_LABEL}.`
    );
  }

  if (!(declared in ALLOWED) || !ALLOWED[declared].includes(extension)) {
    throw new BadRequestException(
      `“${filename}” is not a file type we can accept. Please send a ${ACCEPTED_LABEL}.`
    );
  }

  const actual = sniffMimeType(buffer);
  if (actual === null || actual !== declared) {
    // Deliberately the same message as above. The claimant who renamed a photo
    // and the attacker who renamed a script get told the same thing, and the
    // difference between them is a detail for the log, not the response.
    throw new BadRequestException(
      `“${filename}” is not a file type we can accept. Please send a ${ACCEPTED_LABEL}.`
    );
  }
}
