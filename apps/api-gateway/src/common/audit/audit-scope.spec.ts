import { readFileSync } from 'fs';
import { join } from 'path';
import {
  AUDITED_READ_PATTERNS,
  auditTarget,
  normalisePath,
  redactMessage,
  safeQuery,
  shouldAudit,
} from './audit-scope';

/**
 * COMPLIANCE TESTS — FSA s.146 audit readiness and PDPA access recording.
 *
 * BNM may examine the firm without notice, so the audit trail has to be able to
 * answer who did what, and who *looked* at whose personal data. These rules
 * decide what becomes a record at all; a silent gap here is indistinguishable
 * from the event never having happened.
 */
describe('Audit scope', () => {
  describe('what gets recorded', () => {
    it('records every state-changing request', () => {
      for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
        expect(shouldAudit(method, '/api/v1/claims/abc', 200)).toBe(true);
      }
    });

    it('does not record ordinary reads, which would bury the answers in noise', () => {
      expect(shouldAudit('GET', '/api/v1/claims', 200)).toBe(false);
      expect(shouldAudit('GET', '/api/v1/cases?status=SUBMITTED', 200)).toBe(false);
    });

    it('records reads of personal data and decrypted material', () => {
      // PDPA asks who accessed personal data, not only who altered it.
      expect(
        shouldAudit('GET', '/api/v1/cases/8b1f6c2e-1111-4222-8333-444455556666/payout-details', 200)
      ).toBe(true);
      expect(
        shouldAudit('GET', '/api/v1/claimants/8b1f6c2e-1111-4222-8333-444455556666', 200)
      ).toBe(true);
      expect(
        shouldAudit('GET', '/api/v1/reports/8b1f6c2e-1111-4222-8333-444455556666/pdf', 200)
      ).toBe(true);
    });

    it('records a search by identity number, even though it is a read', () => {
      // Looking someone up by NRIC is an access to personal data whether or not
      // it matches. The identifier itself is redacted before storage.
      expect(shouldAudit('GET', '/api/v1/claimants?nric=880101-14-5555', 200)).toBe(true);
      expect(shouldAudit('GET', '/api/v1/claimants?passportNumber=A123', 200)).toBe(true);
    });

    it('still ignores an ordinary filtered listing', () => {
      expect(shouldAudit('GET', '/api/v1/cases?status=SUBMITTED&page=2', 200)).toBe(false);
    });

    it('records refusals, which are the events an examiner looks for', () => {
      expect(shouldAudit('GET', '/api/v1/claims/someone-elses', 403)).toBe(true);
      expect(shouldAudit('GET', '/api/v1/claims/someone-elses', 401)).toBe(true);
    });

    it('records a 404 on a named record, because that is now what a refusal looks like', () => {
      // The services answer a blocked cross-tenant read as absence so a 403
      // cannot confirm another firm's claim exists. That moved the evidence
      // out of reach of a rule keyed on 403 alone — the attempt an examiner
      // most wants to see became the one status this function ignored. Both
      // halves of the control have to move together, which is why they are
      // asserted together (18 Aug 2026 audit).
      const claim = '/api/v1/claims/8b1f6c2e-1111-4222-8333-444455556666';
      expect(shouldAudit('GET', claim, 404)).toBe(true);
      expect(shouldAudit('GET', claim, 403)).toBe(true);
      expect(shouldAudit('GET', claim, 200)).toBe(false);
    });

    it('does not record a 404 from a route that named nothing', () => {
      // A mistyped path is noise. A run of 404s naming specific ids from one
      // actor is enumeration, and that is the shape worth keeping.
      expect(shouldAudit('GET', '/api/v1/claimz', 404)).toBe(false);
      expect(shouldAudit('GET', '/api/v1/cases', 404)).toBe(false);
    });

    it('ignores health, metrics and docs traffic', () => {
      for (const path of ['/health', '/api/v1/health', '/metrics', '/docs', '/favicon.ico']) {
        expect(shouldAudit('GET', path, 200)).toBe(false);
      }
    });

    it('still records a mutation that failed', () => {
      expect(shouldAudit('POST', '/api/v1/claims', 500)).toBe(true);
    });

    it('gives every audited read a stated reason', () => {
      for (const entry of AUDITED_READ_PATTERNS) {
        expect(entry.reason.trim().length).toBeGreaterThan(10);
      }
    });

    it('records an operator fetching claimant-supplied evidence', () => {
      // The file itself leaves the system — a MyKad, a receipt, a damage
      // photo. PDPA asks who accessed personal data, not only who changed it,
      // and this route was built precisely so people would look at it.
      const path = '/api/v1/cases/8b1f6c2e-1111-4222-8333-444455556666/documents/'
        + '9c2f7d3f-2222-4333-8444-555566667777/content';
      expect(shouldAudit('GET', path, 200)).toBe(true);
      expect(shouldAudit('GET', path, 403)).toBe(true);
    });

    it('does not record merely listing what is attached', () => {
      // The list is metadata an operator sees on every visit to the screen;
      // recording it would bury the fetches that actually disclosed a file.
      expect(
        shouldAudit('GET', '/api/v1/cases/8b1f6c2e-1111-4222-8333-444455556666/documents', 200)
      ).toBe(false);
    });
  });

  describe('mapping a request to an entity', () => {
    const id = '8b1f6c2e-1111-4222-8333-444455556666';

    it('identifies the resource and the record acted on', () => {
      const target = auditTarget('PATCH', `/api/v1/claims/${id}/status`);

      expect(target.entityType).toBe('CLAIM');
      expect(target.entityId).toBe(id);
    });

    it('records the route shape rather than the id, so rows group by operation', () => {
      expect(auditTarget('POST', `/api/v1/reports/${id}/sign`).action).toBe(
        'POST /reports/:id/sign'
      );
    });

    it('falls back to the resource name when there is no record id', () => {
      const target = auditTarget('POST', '/api/v1/claims');

      expect(target.entityType).toBe('CLAIM');
      expect(target.entityId).toBe('claim');
    });

    it('audits an unmapped resource rather than dropping it', () => {
      // Defaulting to "record it" matters: a new endpoint should appear in the
      // trail without anyone remembering to register it.
      expect(auditTarget('POST', '/api/v1/somethingnew/123').entityType).toBe('SOMETHINGNEW');
    });

    it('strips the version prefix and query string', () => {
      expect(normalisePath('/api/v1/cases?status=OPEN')).toBe('/cases');
    });
  });

  describe('query parameters', () => {
    it('keeps ordinary parameters', () => {
      expect(safeQuery('/api/v1/cases?status=SUBMITTED&page=2')).toEqual({
        status: 'SUBMITTED',
        page: '2',
      });
    });

    it('redacts a searched NRIC rather than writing it to an immutable table', () => {
      // The audit table cannot be corrected by design, so anything sensitive
      // written into it is there permanently. Redacted, not dropped: that the
      // search happened is itself evidence.
      const query = safeQuery('/api/v1/claimants?nric=880101-14-5555&page=1');

      expect(query?.nric).toBe('[redacted]');
      expect(query?.page).toBe('1');
      expect(JSON.stringify(query)).not.toContain('880101');
    });

    it('redacts anything that looks like a credential or account identifier', () => {
      const query = safeQuery(
        '/api/v1/x?password=hunter2&token=abc&accountNumber=123456&secret=s&apiKey=k'
      );

      for (const value of Object.values(query ?? {})) {
        expect(value).toBe('[redacted]');
      }
    });

    it('returns nothing when there is no query string', () => {
      expect(safeQuery('/api/v1/cases')).toBeUndefined();
    });

    it('caps a long value rather than storing it whole', () => {
      const query = safeQuery(`/api/v1/x?note=${'a'.repeat(500)}`);

      expect(query?.note.length).toBeLessThanOrEqual(120);
    });
  });

  describe('redacting free text', () => {
    it('strips an identifier out of a framework error message', () => {
      // The real leak this was written for: Nest's 404 quotes the request URL,
      // so recording the message verbatim wrote an NRIC into a table that by
      // design cannot be corrected afterwards.
      const message = redactMessage('Cannot GET /api/v1/claimants?nric=880101-14-5555');

      expect(message).not.toContain('880101');
      expect(message).toContain('[redacted]');
    });

    it('catches an identifier that arrives without a parameter name', () => {
      expect(redactMessage('Claimant 880101-14-5555 not found')).toBe(
        'Claimant [redacted-identifier] not found'
      );
      expect(redactMessage('Claimant 880101145555 not found')).toBe(
        'Claimant [redacted-identifier] not found'
      );
    });

    it('redacts credentials appearing in free text', () => {
      const message = redactMessage('failed with password=hunter2 and token=abc123');

      expect(message).not.toContain('hunter2');
      expect(message).not.toContain('abc123');
    });

    it('leaves ordinary text untouched', () => {
      expect(redactMessage('Claim CLM-2026-000010 not found')).toBe(
        'Claim CLM-2026-000010 not found'
      );
    });
  });

  describe('the body invariant', () => {
    it('never reads the request body', () => {
      // Not a style preference. Bodies carry NRICs, bank details and passwords,
      // and audit_trail is append-only at the database level — so a body written
      // here could never afterwards be redacted. This asserts the invariant on
      // the source itself, because a future edit adding `request.body` would be
      // a one-line change with permanent consequences.
      const source = readFileSync(
        join(__dirname, '../interceptors/audit-log.interceptor.ts'),
        'utf8'
      );
      const code = source.replace(/\/\*\*[\s\S]*?\*\//g, '').replace(/\/\/.*/g, '');

      expect(code).not.toMatch(/\breq(uest)?\.body\b/);
      expect(code).not.toMatch(/\bbody\s*:/);
    });
  });
});
