import { BadRequestException } from '@nestjs/common';

import { assertAllowedUpload, sniffMimeType } from './upload-allowlist';

/** Smallest byte sequences that each format is recognised by. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const PDF = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3', 'binary');
const WEBP = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);
const HEIC = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x18]),
  Buffer.from('ftyp', 'ascii'),
  Buffer.from('heic', 'ascii'),
]);
const HTML = Buffer.from('<!doctype html><script>alert(1)</script>', 'ascii');

describe('sniffMimeType', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['PDF', PDF, 'application/pdf'],
    ['WebP', WEBP, 'image/webp'],
    ['HEIC', HEIC, 'image/heic'],
  ])('recognises %s', (_label, buffer, expected) => {
    expect(sniffMimeType(buffer as Buffer)).toBe(expected);
  });

  it('recognises nothing else — an allowlist has no "unknown but probably fine"', () => {
    expect(sniffMimeType(HTML)).toBeNull();
    expect(sniffMimeType(Buffer.from('PK\x03\x04', 'binary'))).toBeNull();
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
  });

  it('does not mistake a short buffer for a match', () => {
    expect(sniffMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
    expect(sniffMimeType(Buffer.from('RIFF', 'ascii'))).toBeNull();
  });
});

describe('assertAllowedUpload', () => {
  it('accepts each allowed type when name, declared type and bytes agree', () => {
    expect(() => assertAllowedUpload(JPEG, 'boarding-pass.jpg', 'image/jpeg')).not.toThrow();
    expect(() => assertAllowedUpload(JPEG, 'boarding-pass.jpeg', 'image/jpeg')).not.toThrow();
    expect(() => assertAllowedUpload(PNG, 'receipt.png', 'image/png')).not.toThrow();
    expect(() => assertAllowedUpload(PDF, 'policy.pdf', 'application/pdf')).not.toThrow();
    expect(() => assertAllowedUpload(WEBP, 'photo.webp', 'image/webp')).not.toThrow();
    expect(() => assertAllowedUpload(HEIC, 'IMG_0042.heic', 'image/heic')).not.toThrow();
  });

  it('is case-insensitive about the extension — cameras shout', () => {
    expect(() => assertAllowedUpload(HEIC, 'IMG_0042.HEIC', 'image/heic')).not.toThrow();
    expect(() => assertAllowedUpload(JPEG, 'SCAN.JPG', 'image/jpeg')).not.toThrow();
  });

  it('refuses an extension that is not on the list', () => {
    expect(() => assertAllowedUpload(PDF, 'notes.docx', 'application/pdf')).toThrow(
      BadRequestException
    );
    expect(() => assertAllowedUpload(HTML, 'page.html', 'text/html')).toThrow(BadRequestException);
  });

  it('refuses a file with no extension at all', () => {
    expect(() => assertAllowedUpload(PDF, 'receipt', 'application/pdf')).toThrow(
      BadRequestException
    );
  });

  // The reason this module exists: the browser's `accept` attribute stops none
  // of these, because none of them go through a file picker.
  it('refuses HTML renamed to .pdf, which every name-based check accepts', () => {
    expect(() => assertAllowedUpload(HTML, 'receipt.pdf', 'application/pdf')).toThrow(
      BadRequestException
    );
  });

  it('refuses a real PDF presented under an image extension', () => {
    expect(() => assertAllowedUpload(PDF, 'receipt.png', 'image/png')).toThrow(
      BadRequestException
    );
  });

  it('refuses when the declared type is allowed but disagrees with the extension', () => {
    expect(() => assertAllowedUpload(JPEG, 'photo.png', 'image/jpeg')).toThrow(
      BadRequestException
    );
  });

  it('names the file in the refusal, so a claimant knows which one to replace', () => {
    expect(() => assertAllowedUpload(HTML, 'my receipt.pdf', 'application/pdf')).toThrow(
      /my receipt\.pdf/
    );
  });

  it('gives the same message whether the file was renamed by mistake or on purpose', () => {
    const mistake = (): void => assertAllowedUpload(PDF, 'receipt.png', 'image/png');
    const attack = (): void => assertAllowedUpload(HTML, 'receipt.png', 'image/png');

    const messageOf = (fn: () => void): string => {
      try {
        fn();
      } catch (error) {
        return (error as BadRequestException).message;
      }
      throw new Error('expected a refusal');
    };

    expect(messageOf(mistake)).toBe(messageOf(attack));
  });
});
