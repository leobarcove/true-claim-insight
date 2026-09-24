/**
 * How the recorded consent instant is shown.
 *
 * The value carried around the agent surface is the server's own timestamp, so
 * it is formatted where it is displayed rather than at the point it is
 * captured — a pre-formatted string cannot be shown as a time on one screen and
 * a date and time on another, and it quietly loses the information needed to do
 * either properly.
 */

/** "14:47" — for the band, where the claim was opened minutes ago. */
export function asTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** "14 Aug 2026, 11:07" — for the receipt, which may be read back later. */
export function asDateAndTime(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return iso;
  return at.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
