/**
 * The mobile number a claimant types under the fixed **+60** prefix.
 *
 * Everything here works on the *national* part, because that is what the field
 * holds: the country code is printed beside the box and is never typed. So a
 * valid answer is a Malaysian mobile without its leading zero — `1` followed by
 * eight or nine more digits, which covers 010–019 including the ten-digit 011
 * range. It is the same rule `isValidMalaysianPhone` applies in `lib/utils`,
 * narrowed to the one shape this field can produce.
 *
 * Checked here rather than left to the server for one reason: the server's
 * refusal costs a WhatsApp round trip and arrives after a wait, and the claimant
 * has by then been told a code is coming. A number that is nine digits when it
 * should be ten is a thing this screen can see for itself.
 *
 * It does not check that the number *exists* — nothing but sending to it can —
 * so this is deliberately the shape and nothing more. Sending remains the test.
 */

/** The digits of a typed number, with the leading zero a claimant may include. */
function digitsOf(typed: string): string {
  return typed.replace(/\D/g, '').replace(/^0+/, '');
}

/**
 * What the server should be sent for what was typed.
 *
 * One place, so the check and the send can never disagree about which digits
 * are being talked about — the bug that hides behind a validator reading one
 * string and the request carrying another.
 */
export function toE164(typed: string): string {
  return `+60${digitsOf(typed)}`;
}

/**
 * What is wrong with a typed mobile number, or null if nothing is.
 *
 * A reason rather than a boolean. "Please enter a valid phone number" tells
 * somebody who has typed nine digits nothing they can act on; "9 or 10 digits"
 * tells them to count.
 */
export function checkMobileNumber(typed: string): string | null {
  const digits = digitsOf(typed);

  if (digits.length === 0) return 'Enter your mobile number.';

  /*
    The country code, typed twice.

    "+60" is printed in the box, so "60123456789" is somebody reading their own
    number off a card rather than making a mistake about the format. Silently
    stripping it would send the right number under a field showing the wrong
    one; saying so costs a sentence and leaves them in control.
  */
  if (digits.startsWith('60'))
    return 'Leave out the 60 because it is already there. For example 12 345 6789.';

  if (!digits.startsWith('1')) {
    return 'A Malaysian mobile number starts with 1 after +60. For example 12 345 6789.';
  }

  if (digits.length < 9)
    return 'That is too short. A Malaysian mobile number has 9 or 10 digits after +60.';
  if (digits.length > 10)
    return 'That is too long. A Malaysian mobile number has 9 or 10 digits after +60.';

  return null;
}
