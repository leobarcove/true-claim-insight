import { useRef } from 'react';

/**
 * Six boxes, one digit each.
 *
 * A single wide input with letter-spacing looks similar and behaves worse: on a
 * phone it gives no sense of how many digits are left, a mistyped digit means
 * re-reading the whole string, and autofill lands the code somewhere the eye
 * has to hunt for. Six boxes make position visible.
 *
 * Paste has to work on the *first* box, because that is where a claimant pastes
 * a code copied from WhatsApp — and WhatsApp's own copy button puts the whole
 * six digits on the clipboard at once.
 */
export function CodeBoxes({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  const setAt = (index: number, digit: string) => {
    const next = (value.padEnd(6, ' ').split('') as string[]);
    next[index] = digit || ' ';
    const joined = next.join('').replace(/ /g, ' ').trimEnd();
    const cleaned = joined.replace(/ /g, '');
    onChange(cleaned);
    if (digit && index < 5) refs.current[index + 1]?.focus();
  };

  return (
    // Six fixed-width boxes plus their gaps came to more than a phone is wide,
    // so the last one sat off the edge of the screen — on the one screen where
    // a claimant has to see all six to know how many digits are left. They now
    // share the width available and stop growing once there is room.
    <div className="flex gap-2 sm:gap-2.5" role="group" aria-label="6-digit code">
      {[0, 1, 2, 3, 4, 5].map(index => (
        <input
          key={index}
          ref={element => {
            refs.current[index] = element;
          }}
          id={index === 0 ? 'code' : undefined}
          inputMode="numeric"
          autoComplete={index === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          disabled={disabled}
          aria-label={`Digit ${index + 1}`}
          value={value[index] ?? ''}
          onChange={event => setAt(index, event.target.value.replace(/\D/g, '').slice(-1))}
          onKeyDown={event => {
            // Backspace on an empty box steps back, which is what everyone
            // expects and what makes correcting a mistyped digit bearable.
            if (event.key === 'Backspace' && !value[index] && index > 0) {
              refs.current[index - 1]?.focus();
            }
          }}
          onPaste={event => {
            const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
            if (!pasted) return;
            event.preventDefault();
            onChange(pasted);
            refs.current[Math.min(pasted.length, 5)]?.focus();
          }}
          className="h-[60px] w-full min-w-0 flex-1 rounded-xl border-2 border-input bg-background text-center text-2xl font-semibold focus:border-primary focus:outline-none disabled:opacity-60 sm:h-[72px] sm:w-[62px] sm:flex-none"
        />
      ))}
    </div>
  );
}

/** How long before "Send again" becomes available, on either surface. */
export const RESEND_SECONDS = 60;

