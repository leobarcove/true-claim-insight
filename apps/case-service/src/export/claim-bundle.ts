import { createHash } from 'crypto';

/**
 * The claim-file bundle: what "produce the records" means, in one place.
 *
 * FSA s.143 obliges a registered person to submit documents or information to
 * BNM in the form the Bank specifies; s.146 lets the Bank examine without
 * notice. The bundle is the firm's answer to "give us everything on this
 * claim": one machine-readable file whose completeness is defined here rather
 * than by whichever queries an endpoint happened to make.
 */

/**
 * Every section a complete claim file must carry.
 *
 * The list is data, not convention, so the completeness test can assert the
 * assembled bundle against it — a section silently dropped from the assembly
 * query would otherwise just be absent, and an examiner has no way to know a
 * bundle is partial.
 */
export const BUNDLE_SECTIONS = [
  'claim',
  'claimant',
  'assignment',
  'documents',
  'reports',
  'slaClocks',
  'consents',
  'transferRecords',
  'auditTrail',
  'sessions',
  'notes',
] as const;

export type BundleSection = (typeof BUNDLE_SECTIONS)[number];

export interface ClaimFileBundle {
  manifest: {
    claimId: string;
    claimNumber: string;
    producedAt: string;
    producedByUserId: string;
    /** Row counts per section, so a partial production is visible at a glance. */
    counts: Record<BundleSection, number | null>;
    note: string;
  };
  sections: Record<BundleSection, unknown>;
}

/**
 * Sections that hold zero-or-one records rather than lists. `null` there means
 * "none exists" (e.g. a claim opened before Assignment did), which is a
 * statement of fact, not a gap in the bundle.
 */
export const SINGULAR_SECTIONS: readonly BundleSection[] = ['claim', 'claimant', 'assignment'];

/** Sections missing from an assembled bundle — must be empty for a valid one. */
export function missingSections(sections: Record<string, unknown>): BundleSection[] {
  return BUNDLE_SECTIONS.filter(section => !(section in sections));
}

/** Manifest counts: list length, 1/0 for singulars, null only for absent singulars. */
export function sectionCounts(
  sections: Record<BundleSection, unknown>
): Record<BundleSection, number | null> {
  return Object.fromEntries(
    BUNDLE_SECTIONS.map(section => {
      const value = sections[section];
      if (Array.isArray(value)) return [section, value.length];
      return [section, value ? 1 : null];
    })
  ) as Record<BundleSection, number | null>;
}

/**
 * Canonical hash of a bundle.
 *
 * Written onto the append-only audit trail at export time, so the firm can
 * later prove that what it produced to BNM is byte-for-byte what its records
 * said — or detect that it is not. Key order is normalised because JSON key
 * order is an implementation detail and must not change the hash.
 */
export function bundleHash(bundle: ClaimFileBundle): string {
  return createHash('sha256').update(canonicalJson(bundle)).digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;

  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`);
  return `{${entries.join(',')}}`;
}
