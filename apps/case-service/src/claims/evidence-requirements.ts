import type { TravelClaimType } from '@prisma/client';

/**
 * Which evidence requirements apply to a claim — the one answer both readers
 * must share.
 *
 * Two places ask this question: the claimant-facing checklist
 * (ClaimsService.getEvidenceChecklist) and the fast-track's evidence-complete
 * condition (AssessmentService). They used to answer it differently — the fast
 * track ignored the travel subtype, so a flight-delay claim was measured
 * against every mandatory travel document in the book rather than the three
 * that apply to it, and the desk-review fast track could never fire on a
 * travel claim. Two code paths disagreeing on "complete" is the §3.6
 * false-comfort shape with the §2.5 COGS ceiling on the receiving end.
 *
 * Resolution order (most specific wins per documentType):
 *   1. Tenant-specific + subtype-specific
 *   2. Tenant-specific + subtype-generic (travelClaimType IS NULL)
 *   3. Global + subtype-specific
 *   4. Global + subtype-generic
 *
 * Pure functions, so the precedence rules run in CI without a database.
 */

/**
 * Prisma where-fragment matching this subtype's rows plus the subtype-generic
 * rows. For non-travel categories only the generic rows exist, so a null
 * subtype collapses to travelClaimType IS NULL.
 */
export function evidenceSubtypeFilter(subtype: TravelClaimType | null | undefined) {
  return subtype
    ? { OR: [{ travelClaimType: subtype }, { travelClaimType: null }] }
    : { travelClaimType: null };
}

export interface EvidenceRequirementRow {
  documentType: string;
  travelClaimType: TravelClaimType | string | null;
}

/**
 * Collapse tenant and global rows to one requirement per documentType, most
 * specific winning. A tenant row that relaxes a global mandatory requirement
 * must win here too — counting both rows would demand a document the tenant
 * decided not to require.
 */
export function resolveRequirements<T extends EvidenceRequirementRow>(
  globalRows: T[],
  tenantRows: T[]
): T[] {
  // Least specific first so the more specific row overwrites it.
  const bySpecificity = (rows: T[]) => [
    ...rows.filter(row => row.travelClaimType === null),
    ...rows.filter(row => row.travelClaimType !== null),
  ];

  const byType = new Map<string, T>();
  for (const row of bySpecificity(globalRows)) byType.set(row.documentType, row);
  for (const row of bySpecificity(tenantRows)) byType.set(row.documentType, row); // tenant overrides global
  return Array.from(byType.values());
}
