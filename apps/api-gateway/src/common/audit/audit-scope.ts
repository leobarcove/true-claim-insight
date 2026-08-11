/**
 * What the HTTP layer records, and how a request maps to an audited entity.
 *
 * Pure decisions, no framework, so the rules deciding what becomes evidence can
 * be tested exhaustively — this is the s.146 "audit-ready always" control, and a
 * silent gap in it is indistinguishable from nothing having happened.
 */

/** Methods that change state. A mutation is always worth recording. */
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Reads that must be recorded even though they change nothing.
 *
 * PDPA asks who accessed personal data, not only who altered it. Recording every
 * GET would bury those answers in noise — a queue listing viewed forty times an
 * hour tells nobody anything — so the reads that matter are declared here.
 * Each entry is a route whose response contains identifiable personal data or
 * decrypted material.
 */
export const AUDITED_READ_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\/cases\/[^/]+\/payout-details/, reason: 'decrypts bank account details' },
  {
    pattern: /\/cases\/[^/]+\/documents\/[^/]+\/content/,
    reason: 'claimant-supplied evidence leaving the system — MyKad, receipts, damage photos',
  },
  { pattern: /\/claimants\/[^/]+$/, reason: 'claimant personal data' },
  { pattern: /\/reports\/[^/]+\/pdf/, reason: 'full report content leaving the system' },
  { pattern: /\/claims\/[^/]+\/export/, reason: 'complete claim file incl. decrypted NRIC (s.143)' },
];

/** Noise with no evidential value; recording it only makes the trail harder to read. */
const IGNORED_PATTERNS: RegExp[] = [/\/health/, /\/metrics/, /\/docs/, /\/favicon/];

/**
 * Path segments that name a resource, mapped to the entity type recorded.
 * Anything unlisted still gets audited, under its upper-cased segment.
 */
const ENTITY_TYPES: Record<string, string> = {
  cases: 'CASE',
  claims: 'CLAIM',
  claimants: 'CLAIMANT',
  reports: 'ADJUSTER_REPORT',
  policies: 'POLICY',
  documents: 'DOCUMENT',
  adjusters: 'ADJUSTER',
  auth: 'AUTH',
  users: 'USER',
  sessions: 'SESSION',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AuditTarget {
  entityType: string;
  entityId: string;
  action: string;
}

/** Strip the query string and the /api/v1 prefix. */
export function normalisePath(url: string): string {
  const path = url.split('?')[0];
  return path.replace(/^\/api\/v\d+/, '') || '/';
}

/**
 * Should this request be persisted as an audit row?
 *
 * Failures are recorded as readily as successes: a refused attempt to reach
 * someone else's claim is precisely the event an examiner would want to see.
 */
export function shouldAudit(method: string, url: string, statusCode: number): boolean {
  const path = normalisePath(url);

  if (IGNORED_PATTERNS.some(pattern => pattern.test(path))) return false;
  if (MUTATING_METHODS.has(method.toUpperCase())) return true;
  if (AUDITED_READ_PATTERNS.some(({ pattern }) => pattern.test(path))) return true;

  // Searching *by* an identity number is an access to personal data even when
  // nothing is found, and the searcher chose the identifier — so the fact of the
  // lookup is recorded (the value itself is redacted by safeQuery). Found by
  // checking the live trail and noticing a search by NRIC produced no row at all.
  if (searchesOnIdentifier(url)) return true;

  // An authorisation failure on any route is evidence, read or not.
  return statusCode === 401 || statusCode === 403;
}

/**
 * Map a request to the entity it acted on.
 *
 * The identifier is taken from the path, never the body — see the interceptor
 * for why the body is not read at all.
 */
export function auditTarget(method: string, url: string): AuditTarget {
  const path = normalisePath(url);
  const segments = path.split('/').filter(Boolean);

  const resource = segments[0] ?? 'unknown';
  const entityType = ENTITY_TYPES[resource] ?? resource.toUpperCase();

  // First id-shaped segment after the resource. UUIDs are the common case;
  // fall back to any non-word-only segment so numeric or prefixed ids still bind.
  const identifier =
    segments.slice(1).find(segment => UUID.test(segment)) ??
    segments.slice(1).find(segment => /\d/.test(segment)) ??
    '';

  // A stable action string: the route shape rather than the concrete id, so
  // rows for the same operation group together.
  const shape = segments
    .map(segment => (segment === identifier ? ':id' : segment))
    .join('/');

  return {
    entityType,
    entityId: identifier || entityType.toLowerCase(),
    action: `${method.toUpperCase()} /${shape}`,
  };
}

/**
 * Query parameters that must never be written to the audit trail.
 *
 * A search by NRIC would otherwise persist the NRIC in clear, in a table
 * deliberately made impossible to correct — undoing the encryption work in the
 * one place it cannot be undone.
 */
export const SENSITIVE_QUERY_KEYS = /nric|passport|account|password|token|secret|pepper|key/i;

/** Does this URL search on a personal identifier? */
export function searchesOnIdentifier(url: string): boolean {
  const queryString = url.split('?')[1];
  if (!queryString) return false;

  for (const [key] of new URLSearchParams(queryString)) {
    if (SENSITIVE_QUERY_KEYS.test(key)) return true;
  }
  return false;
}

/** Query parameters, with sensitive values replaced rather than dropped. */
export function safeQuery(url: string): Record<string, string> | undefined {
  const queryString = url.split('?')[1];
  if (!queryString) return undefined;

  const safe: Record<string, string> = {};
  for (const [key, value] of new URLSearchParams(queryString)) {
    // Redacted rather than omitted: that the search happened is itself evidence.
    safe[key] = SENSITIVE_QUERY_KEYS.test(key) ? '[redacted]' : value.slice(0, 120);
  }
  return Object.keys(safe).length ? safe : undefined;
}

/**
 * Strip personal data out of free text before it is written to the trail.
 *
 * Needed because framework-generated messages quote the request. A 404 from
 * Nest reads "Cannot GET /api/v1/claimants?nric=880101-14-5555", so recording
 * an exception message verbatim writes the identifier into an append-only table
 * — where, by design, no later correction can remove it. This was found by
 * grepping the live trail for NRIC-shaped strings after wiring the filter up.
 *
 * Two passes: sensitive `key=value` pairs anywhere in the text, then anything
 * NRIC-shaped, so an identifier that arrives by some other route is still caught.
 */
export function redactMessage(text: string): string {
  return text
    .replace(
      /\b([\w.]*(?:nric|passport|account|password|token|secret|pepper|key)[\w.]*)=([^&\s"']+)/gi,
      '$1=[redacted]'
    )
    .replace(/\b\d{6}-?\d{2}-?\d{4}\b/g, '[redacted-identifier]');
}
