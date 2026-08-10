import { TRAVEL_CLAIM_TYPE_LABELS, type Claim } from '@tci/shared-types';

import { getCategoryConfig } from './category-config';

const MOTOR_TYPE_LABELS: Record<string, string> = {
  OWN_DAMAGE: 'Own damage',
  THIRD_PARTY_PROPERTY: 'Third party property',
  THIRD_PARTY_INJURY: 'Third party injury',
  THEFT: 'Theft',
  WINDSCREEN: 'Windscreen',
};

/**
 * What to call a claim in a list.
 *
 * `Claim.claimType` is a motor enum, and this book is non-motor, so every
 * screen that read it directly printed a dash on every row. The real subtype
 * for travel lives on the TravelClaim child; property lines have no subtype at
 * all and are named by their category.
 *
 * Shared rather than copied: the claims list and the dashboard both showed the
 * same wrong thing, and fixing one of them is how they came to disagree.
 */
export function claimTypeLabel(claim: Claim): string {
  if (claim.category === 'MOTOR') {
    return claim.claimType ? MOTOR_TYPE_LABELS[claim.claimType] ?? claim.claimType : 'Motor';
  }

  const travelType = claim.travelClaim?.travelClaimType;
  if (travelType) {
    return TRAVEL_CLAIM_TYPE_LABELS[travelType] ?? travelType;
  }

  return getCategoryConfig(claim.category).label;
}
