/**
 * Move focus to the field that was refused.
 *
 * A section can be taller than the screen, so an error message rendered below
 * the fold is an error nobody sees: Continue is pressed, nothing appears to
 * happen, and it is pressed again. Focus scrolls it into view and announces it
 * to a screen reader in one act.
 *
 * Deferred a frame because the message is rendered by the same state update
 * that calls this, and focusing an element React has not drawn yet does nothing
 * at all.
 *
 * Shared by the claimant's form and the agent's rather than written twice: they
 * draw the same fields from the same flow, and a fix to one that missed the
 * other would show up as "it scrolls for claimants but not for us".
 */
export function focusField(stepId: string) {
  requestAnimationFrame(() => {
    const field = document.getElementById(stepId);
    if (field instanceof HTMLElement) {
      field.focus({ preventScroll: false });
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
}
