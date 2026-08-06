/**
 * Channel capability descriptors — the contract that lets one flow definition
 * drive web chat, Telegram, WhatsApp and Messenger without forking the flow.
 *
 * The flow engine (`case-flows.ts`) says *what* to ask. This module says what
 * each channel can physically render, so the conversation gateway can degrade
 * a single `FlowStep` into each channel's native affordances rather than
 * maintaining one flow per platform.
 *
 * Consumed by:
 *  - chat-gateway: picks a rendering strategy per outbound prompt
 *  - flow editor: warns an author when a step cannot render on an enabled channel
 *
 * NOTE: type-only import below. `index.ts` re-exports this module, so a runtime
 * value import of CaseChannel would create an index ⇄ channel-capabilities
 * circular evaluation — harmless under CJS, fatal under native ESM (Vite dev).
 * Same reason, same shape as the mirror in `case-flows.ts`.
 */
import type { AnswerType } from './case-flows';
import type { CaseChannel } from './index';

const Channel = {
  WEB_CHAT: 'WEB_CHAT',
  STAFF: 'STAFF',
  EMAIL: 'EMAIL',
  WHATSAPP: 'WHATSAPP',
  TELEGRAM: 'TELEGRAM',
  MESSENGER: 'MESSENGER',
} as unknown as typeof import('./index').CaseChannel;

/** How a channel presents a fixed set of options. */
export type ChoiceStyle =
  | 'native' // web chat — arbitrary count, rendered as a list
  | 'inline_keyboard' // Telegram — effectively unbounded, paginated by us
  | 'buttons' // WhatsApp reply buttons / Messenger quick replies — tight cap
  | 'list' // WhatsApp interactive list — 10 rows
  | 'text'; // no interactive primitive; numbered options in the message body

export interface ChannelCapabilities {
  readonly channel: CaseChannel;
  /** Maximum options renderable in one interactive prompt. */
  readonly choiceMax: number;
  readonly choiceStyle: ChoiceStyle;
  /** Native file/media upload, or a link out to the PWA to attach evidence. */
  readonly document: 'native' | 'link_out';
  /**
   * 'picker' means the client supplies a real date control. 'text' means the
   * claimant types free-form and the gateway must parse and confirm back —
   * no messaging platform offers a date picker.
   */
  readonly dateEntry: 'picker' | 'text';
  /** Hard cap on a single outbound message body. */
  readonly maxMessageChars: number;
  /**
   * Whether a value typed here stays under our control. False for every
   * third-party messaging platform: the plaintext persists in the platform's
   * own message history, outside our retention and anonymisation jobs.
   *
   * Recorded rather than enforced — the decision to collect payout details
   * in-channel anyway is deliberate and logged against MASTER_PLAN §3.
   */
  readonly retainsPlaintext: boolean;
}

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  [Channel.WEB_CHAT]: {
    channel: Channel.WEB_CHAT,
    choiceMax: Number.POSITIVE_INFINITY,
    choiceStyle: 'native',
    document: 'native',
    dateEntry: 'picker',
    maxMessageChars: Number.POSITIVE_INFINITY,
    retainsPlaintext: false,
  },
  [Channel.TELEGRAM]: {
    channel: Channel.TELEGRAM,
    choiceMax: 100,
    choiceStyle: 'inline_keyboard',
    document: 'native',
    dateEntry: 'text',
    maxMessageChars: 4096,
    retainsPlaintext: true,
  },
  [Channel.WHATSAPP]: {
    channel: Channel.WHATSAPP,
    // Interactive list: 10 rows. Reply buttons: 3. We render lists, so 10.
    choiceMax: 10,
    choiceStyle: 'list',
    document: 'native',
    dateEntry: 'text',
    maxMessageChars: 1024, // interactive message body limit, not the 4096 text limit
    retainsPlaintext: true,
  },
  [Channel.MESSENGER]: {
    channel: Channel.MESSENGER,
    choiceMax: 13,
    choiceStyle: 'buttons',
    document: 'native',
    dateEntry: 'text',
    maxMessageChars: 2000,
    retainsPlaintext: true,
  },
};

/** One renderable option in a degraded choice prompt. */
export interface RenderableChoice {
  value: string;
  label: string;
}

/**
 * The gateway's instruction for rendering one choice step on one channel.
 * `page` is 0-indexed; `hasMore` tells the adapter to append a "More options"
 * affordance that advances the page without touching flow state.
 */
export interface ChoiceRendering {
  style: ChoiceStyle;
  options: RenderableChoice[];
  page: number;
  hasMore: boolean;
}

/**
 * Decide how to present a choice step whose option count may exceed what the
 * channel can render in one prompt.
 *
 * Pagination, with one slot per page reserved for a "More options" affordance.
 *
 * This is a default, not a settled answer. The alternative — dropping to a
 * numbered text list so every option is visible at once — trades an ordering
 * bias for a parsing burden, and which is worse depends on how claimants
 * actually behave. It does not bite for the two channels in scope: web chat is
 * unbounded and Telegram holds around a hundred inline buttons, so with the
 * longest realistic list (a fire or flood cause-of-loss, roughly twenty) this
 * function never paginates for either. Revisit it if WhatsApp arrives, whose
 * limit of ten is the first that would genuinely truncate.
 */
export const renderChoices = (
  capabilities: ChannelCapabilities,
  choices: RenderableChoice[],
  page = 0
): ChoiceRendering => {
  const { choiceMax, choiceStyle } = capabilities;

  if (!Number.isFinite(choiceMax) || choices.length <= choiceMax) {
    return { style: choiceStyle, options: choices, page: 0, hasMore: false };
  }

  // One slot goes to "More options", so a page holds choiceMax - 1 real
  // entries. Floored at 1 so a pathological cap cannot produce empty pages.
  const perPage = Math.max(1, choiceMax - 1);
  const start = page * perPage;
  const options = choices.slice(start, start + perPage);

  return {
    style: choiceStyle,
    options,
    page,
    hasMore: start + perPage < choices.length,
  };
};

/**
 * Parse a date a claimant typed, on a channel with no date control.
 *
 * Day-first, always. Malaysia writes DD/MM/YYYY, and that is what every prompt
 * on a text channel asks for — but `new Date()` reads a slash date as American
 * month-first. The consequences differ, and the quiet one is worse:
 *
 *   "16/06/2026" → invalid, because there is no month 16. Visible.
 *   "06/07/2026" → 7 June, when the claimant meant 6 July. Silent.
 *
 * The second is why this exists rather than a looser validator. `incident-date`
 * drives the CSP notification-deadline flags, so a month-day swap can move a
 * claim in or out of the 24-hour window without anyone seeing a wrong value.
 *
 * ISO input is accepted untouched: it is unambiguous, and it is what the PWA's
 * date control and the FNOL parser already produce.
 *
 * @returns an ISO string the shared validator accepts, or null if unparseable.
 */
export const parseTextDate = (
  raw: string,
  kind: 'date' | 'datetime' = 'date'
): string | null => {
  const text = raw.trim();
  if (!text) return null;

  // Already ISO (YYYY-MM-DD, optionally with a time) — unambiguous, pass through.
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(text)) {
    const parsed = new Date(text.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  const match = text.match(
    /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})(?:[\s,]+(\d{1,2})[:.](\d{2})\s*(am|pm)?)?$/i
  );
  if (!match) return null;

  const [, dayText, monthText, yearText, hourText, minuteText, meridiem] = match;
  const day = Number(dayText);
  const month = Number(monthText);
  const year = Number(yearText);

  let hour = hourText ? Number(hourText) : 0;
  const minute = minuteText ? Number(minuteText) : 0;
  if (meridiem) {
    const lower = meridiem.toLowerCase();
    if (lower === 'pm' && hour < 12) hour += 12;
    if (lower === 'am' && hour === 12) hour = 0;
  }

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (hour > 23 || minute > 59) return null;
  if (kind === 'date' && hourText) return null; // a date step given a time

  const parsed = new Date(Date.UTC(year, month - 1, day, hour, minute));
  // Rejects 31/02 and friends: the Date constructor rolls them over silently,
  // so the only reliable check is that the parts survived the round trip.
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return parsed.toISOString();
};

/**
 * Whether a channel can carry a step at all. A `document` step on a channel
 * with `document: 'link_out'` is renderable but needs a hand-off, not a
 * refusal — this returns the strategy, not a boolean.
 */
export const supportsAnswerType = (
  capabilities: ChannelCapabilities,
  answerType: AnswerType
): 'native' | 'degraded' | 'handoff' => {
  switch (answerType) {
    case 'date':
    case 'datetime':
      return capabilities.dateEntry === 'picker' ? 'native' : 'degraded';
    case 'document':
      return capabilities.document === 'native' ? 'native' : 'handoff';
    case 'choice':
    case 'confirm':
    case 'text':
    case 'phone':
    case 'number':
      return 'native';
    default:
      return 'native';
  }
};
