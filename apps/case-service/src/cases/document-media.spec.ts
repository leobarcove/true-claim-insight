import { isInlineRenderable, resolveMimeType } from './document-media';

/**
 * COMPLIANCE-ADJACENT TEST — an operator has to be able to look at the
 * evidence, and must not be served claimant markup as executable content.
 *
 * The defect behind the first half: every Telegram upload was stored as
 * `application/octet-stream`, because the adapter trusted the content-type on
 * Telegram's file download. Nothing noticed while case documents were
 * write-only. The moment one is served, the wrong type means the browser
 * downloads a file instead of showing the damage photo the operator is vetting.
 */
describe('resolveMimeType', () => {
  it('derives the type from the extension when the transport did not know', () => {
    expect(resolveMimeType('file_0.jpg', 'application/octet-stream')).toBe('image/jpeg');
    expect(resolveMimeType('report.pdf', 'application/octet-stream')).toBe('application/pdf');
  });

  it('treats the generic fallback as "nobody knew", not as a declaration', () => {
    // The distinction that fixes the bug: octet-stream is the absence of an
    // answer, so the extension gets a turn rather than being overridden by it.
    expect(resolveMimeType('photo.png', 'application/octet-stream')).toBe('image/png');
  });

  it('honours a real declared type over the extension', () => {
    // A caller that genuinely knows beats a guess from the filename.
    expect(resolveMimeType('scan.jpg', 'application/pdf')).toBe('application/pdf');
  });

  it('falls back to the generic type rather than guessing wrongly', () => {
    expect(resolveMimeType('mystery', null)).toBe('application/octet-stream');
    expect(resolveMimeType('archive.zip', null)).toBe('application/octet-stream');
  });

  it('is case-insensitive about the extension', () => {
    expect(resolveMimeType('IMG_2201.JPEG', null)).toBe('image/jpeg');
  });
});

describe('isInlineRenderable', () => {
  it('permits the types an operator needs to see in place', () => {
    expect(isInlineRenderable('image/jpeg')).toBe(true);
    expect(isInlineRenderable('application/pdf')).toBe(true);
  });

  it('refuses anything that would run claimant-supplied markup', () => {
    // Served inline on the portal's own origin, these would execute with an
    // operator's session. They download instead.
    expect(isInlineRenderable('text/html')).toBe(false);
    expect(isInlineRenderable('image/svg+xml')).toBe(false);
    expect(isInlineRenderable('application/octet-stream')).toBe(false);
  });
});
