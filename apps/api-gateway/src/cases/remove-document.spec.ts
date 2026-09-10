import { CasesController } from './cases.controller';

/**
 * The agent-assisted form calls `DELETE /cases/:id/documents/:documentId`, and
 * reaches case-service only through this proxy. A route that exists downstream
 * and not here is a 404 at the edge with a working implementation behind it —
 * which is how removing a photo shipped broken on both surfaces at once.
 *
 * What may be removed is case-service's decision (the document belongs to the
 * case, and its step allows more than one). Asserting that here would be a
 * second opinion able to disagree with the first, so these tests only check
 * that the request arrives, carrying who is asking.
 */
const controllerWith = (httpService: unknown) =>
  new CasesController(
    httpService as never,
    { get: (key: string) => (key === 'CASE_SERVICE_URL' ? 'http://case-service:3001' : undefined) } as never,
    {} as never
  );

describe('removing one document from a case', () => {
  it('forwards to case-service with the caller’s identity', () => {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const controller = controllerWith({
      delete: (url: string, config: { headers: Record<string, string> }) => {
        calls.push({ url, headers: config.headers });
        return { pipe: () => 'piped' };
      },
    });

    controller.removeDocument('case-1', 'doc-1', {
      headers: { authorization: 'Bearer t' },
      user: { id: 'user-1', role: 'ADJUSTER', tenantId: 'tenant-1' },
      tenantContext: { tenantId: 'tenant-1', userRole: 'ADJUSTER' },
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://case-service:3001/api/v1/cases/case-1/documents/doc-1');
    // Tenant and role travel with it: case-service scopes the case by them, so
    // a removal that arrived anonymous would be refused there rather than here.
    expect(calls[0].headers['X-Tenant-Id']).toBe('tenant-1');
    expect(calls[0].headers['X-User-Id']).toBe('user-1');
    expect(calls[0].headers['X-User-Role']).toBe('ADJUSTER');
    expect(calls[0].headers.Authorization).toBe('Bearer t');
  });
});
