/**
 * Resolve the Claimant behind a phone number the *platform* has verified.
 *
 * A port rather than a service because `claimant` belongs to the `identity`
 * context, which only api-gateway may write (see
 * `packages/prisma-client/src/data-ownership.ts`). The concrete implementation
 * calls the gateway, which is also the recorded resolution for the existing
 * case-service → claimant ownership exception: the gateway resolves, and
 * passes back an id.
 *
 * **This replaced the OTP port at the door (decided 11 Aug 2026,
 * MASTER_PLAN §6).** The one-time code was being sent to the very number
 * Telegram had already vouched for, so on the share-contact path it proved
 * little — while the path it genuinely protected, a typed number, is one the
 * channel no longer offers. What made the swap safe is the adapter check that
 * a shared contact is the *sender's own*; without it, sharing a victim's card
 * would bind you as them, and the code going to the real owner was the only
 * thing preventing that.
 *
 * The trade is proof of *current* handset possession, accepted because the
 * channel discloses nothing back: it can open a claim, never read one. The
 * condition that reverses it is written into §6 — the day the bot serves claim
 * status or a document, binding becomes read-sensitive and needs a stronger
 * proof (deep-link from an authenticated session, or the code again).
 */

export interface ResolvedClaimant {
  claimantId: string;
  /** Where the identity service knows it; null for a claimant on no panel yet. */
  tenantId?: string;
}

export interface ClaimantResolver {
  /**
   * Find or create the Claimant for a platform-verified phone number.
   *
   * Callers must have established that the number belongs to the sender.
   * There is no code to check here: this port trusts its caller, which is why
   * the check lives in the adapter where the platform's own evidence is.
   */
  resolveByVerifiedPhone(phoneNumber: string, channel: string): Promise<ResolvedClaimant>;

  /**
   * Resolve a claimant from contact details nobody verified — an FNOL email's
   * phone number, above all.
   *
   * Separate from the verified path because the two say different things
   * about the same claimant. Keeping one method and a boolean would have let
   * a caller assert verification by omission; two methods make the weaker
   * claim the one you have to ask for by name.
   */
  resolveByUnverifiedContact(input: {
    phoneNumber: string;
    fullName?: string;
    source: string;
  }): Promise<ResolvedClaimant>;
}

export const CLAIMANT_RESOLVER = Symbol('CLAIMANT_RESOLVER');
