/**
 * The form's icons, drawn rather than typed.
 *
 * Emoji were standing in for these, and they are not interchangeable with a
 * drawn icon: every platform ships its own artwork, so a claimant on an iPhone,
 * one on Android and one on Windows saw three different pictures — in three
 * palettes, none of them ours, and at sizes that do not line up with the text
 * beside them. A camera rendered as a chunky yellow snapshot next to a green
 * outlined button reads as somebody else's sticker pasted onto the page.
 *
 * These take `currentColor` and the size they are given, so they inherit
 * whatever the thing around them decided — a tick is green in a filled circle
 * and white on a filled button without either knowing about the other.
 *
 * Stroke widths and shapes follow the design's icon set (Lucide's), so a later
 * icon lifted straight from it will sit correctly beside these.
 */

type IconProps = { className?: string };

const base = 'shrink-0';

/** A file going up: the button that has not been used yet. */
export function UploadIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className ?? 'h-4 w-4'}`}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <path d="M17 8l-5-5-5 5" />
      <path d="M12 3v12" />
    </svg>
  );
}

/** Done. On the evidence rows, in the choice circles, and on the receipt. */
export function CheckIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className ?? 'h-4 w-4'}`}
    >
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

/**
 * What "Add" opens on a phone.
 *
 * On the button rather than beside the label, because it describes the action
 * and not the document.
 */
export function CameraIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className ?? 'h-4 w-4'}`}
    >
      <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/** The other channels, where they are offered. */
export function ChatIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className ?? 'h-4 w-4'}`}
    >
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.1A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 8.5-8.5 8.4 8.4 0 0 1 8.5 8.5z" />
    </svg>
  );
}

/** Something needs attention: the agent band before consent is recorded. */
export function AlertIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className ?? 'h-4 w-4'}`}
    >
      <path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** Staff-only, and why. */
export function ShieldIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`${base} ${className ?? 'h-4 w-4'}`}
    >
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
