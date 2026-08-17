/**
 * Snooze options, not a date picker.
 *
 * Every real choice here is "not now, but don't lose it", and the three
 * timescales that covers are: after this call, after lunch, tomorrow. A
 * calendar widget makes the agent do arithmetic to express one of them.
 */
export const SNOOZE_OPTIONS: { label: string; hours: number }[] = [
  { label: 'in 1 hour', hours: 1 },
  { label: 'in 3 hours', hours: 3 },
  { label: 'tomorrow', hours: 24 },
];
