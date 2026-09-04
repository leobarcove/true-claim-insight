/**
 * The form's own wording, in one place, keyed by language.
 *
 * **Only wording the form invents.** Every question, hint and validation
 * message belongs to the flow and comes from the server already dressed for
 * the claimant's language — copying any of it here would create a second
 * version that drifts, and the version that drifts is the one nobody notices
 * because it only shows on one surface.
 *
 * So what is here is the furniture: buttons, headings the flow has no opinion
 * about, and the few sentences the form has to say for itself.
 *
 * The Malay column is deliberately incomplete — no Malay wording exists for the
 * questions yet (D5), so a form whose buttons were Malay and whose questions
 * were English would be worse than one that is honestly English throughout.
 * `copy()` falls back to English for anything missing, which is what lets the
 * translation land a phrase at a time instead of all at once.
 */

export type Locale = 'en' | 'ms';

const EN = {
  loading: 'Loading…',
  continue: 'Continue',
  back: 'Back',
  saving: 'Saving…',
  save: 'Save',
  cancel: 'Cancel',
  change: 'Change',
  startAgain: 'Start again',

  sendCode: 'Send code',
  sending: 'Sending…',
  checking: 'Checking…',
  mobileNumber: 'Mobile number',
  codeLabel: '6-digit code',

  agree: 'I agree',
  decline: 'I do not agree',
  declineNote: 'If you do not agree, no claim is opened and nothing you entered is kept.',

  submit: 'Submit claim request',
  submitting: 'Submitting…',
  confirmDeclaration:
    'I confirm the details above are true and complete to the best of my knowledge, and I understand a false statement may void this claim.',

  claimSoFar: 'Your claim so far',
  savedOnDevice: 'Saved after each step on this device.',
  haveTheseReady: 'Have these ready',

  addDocument: 'Add a photo or PDF',
  uploading: 'Uploading…',
  noDocument: 'I do not have this',
  attached: 'Attached',

  submittedTitle: 'Your claim request is submitted',
  submittedChecking: 'A member of our team will check what you have sent.',
  submittedContact: 'If anything is missing they will contact you on the number you verified.',
  submittedReference: 'Keep the reference above. It is how we find your claim request.',

  /** Shown when the section could not be saved for a reason that is not a field's fault. */
  tooFast: 'We are saving your answers a little too quickly. Please try again in a moment.',
} as const;

export type CopyKey = keyof typeof EN;

/**
 * Translations that exist today. Nothing is invented to fill the table: an
 * approximate Malay button beside an English question helps nobody, and a gap
 * here is visible in a way a bad translation is not.
 */
const MS: Partial<Record<CopyKey, string>> = {
  continue: 'Teruskan',
  back: 'Kembali',
  cancel: 'Batal',
  change: 'Ubah',
  agree: 'Saya setuju',
  decline: 'Saya tidak setuju',
  mobileNumber: 'Nombor telefon bimbit',
  sendCode: 'Hantar kod',
};

const TABLE: Record<Locale, Partial<Record<CopyKey, string>>> = { en: EN, ms: MS };

/** One phrase, in the claimant's language where it exists and English where it does not. */
export function copy(locale: Locale, key: CopyKey): string {
  return TABLE[locale]?.[key] ?? EN[key];
}

/** Bound to a locale once, so a component reads `t('continue')`. */
export function copyFor(locale: Locale): (key: CopyKey) => string {
  return key => copy(locale, key);
}
