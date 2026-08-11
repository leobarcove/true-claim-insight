import { TRAVEL_CLAIM_TYPE_LABELS } from './case-flows';

/**
 * Turning what a claimant *did* into what a transcript should *read*.
 *
 * A tapped button carries a value, not a sentence. Until this existed the
 * gateway stored only `payload.text`, so every tap — claim type, consent
 * agreement, cancellation reason, the review confirmation — persisted as NULL
 * and the operator inbox rendered "—". The conversation went blank at exactly
 * the points where the claimant made a decision.
 *
 * These are the *synthetic* values the gateway invents: menus and controls
 * that belong to no flow step, so no `choices` list can name them. A real
 * choice step resolves its label from the step itself, where the wording the
 * claimant actually saw lives; this is the fallback for everything else, and
 * for a transcript read after the flow that produced it has been revised.
 *
 * Deliberately total: an unrecognised value returns itself rather than null.
 * `ILLNESS` in a transcript is worse than "Illness or injury" and far better
 * than a dash — a reader can still tell what was chosen.
 */

/** Buttons the gateway renders itself, rather than from a flow step. */
export const PAGE_CALLBACK_PREFIX = '__page:';
export const EDIT_CALLBACK_PREFIX = '__edit:';
export const CONSENT_AGREED_VALUE = '__consent:agree';

/** What a shared contact looks like in a transcript. */
export const SHARED_PHONE_DESCRIPTION = 'Shared their phone number';

/**
 * A human-readable description of a tapped value.
 *
 * `stepChoices` is the step's own choice list where one applies — passing it
 * means the transcript shows the label the claimant read, not the enum the
 * flow stored.
 */
export function describeCallbackValue(
  value: string | null | undefined,
  stepChoices?: { value: string; label: string }[]
): string | null {
  if (value === null || value === undefined || value === '') return null;

  // The step's own wording wins: it is what was on the button.
  const fromStep = stepChoices?.find(choice => choice.value === value);
  if (fromStep) return fromStep.label;

  if (value === CONSENT_AGREED_VALUE) return 'Agreed to the privacy notice';
  if (value.startsWith(PAGE_CALLBACK_PREFIX)) return 'Asked for more options';
  if (value.startsWith(EDIT_CALLBACK_PREFIX)) {
    return `Chose to change "${value.slice(EDIT_CALLBACK_PREFIX.length)}"`;
  }

  // The review step's confirm/decline pair.
  if (value === 'true') return 'Confirmed';
  if (value === 'false') return 'Asked to change something';

  // The claim-type menu is a synthetic step, so its labels live here.
  const claimType = (TRAVEL_CLAIM_TYPE_LABELS as Record<string, string>)[value];
  if (claimType) return claimType;

  return value;
}
