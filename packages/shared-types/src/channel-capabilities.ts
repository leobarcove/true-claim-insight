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
import { SKIP_VALUE } from './case-flows';
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
   * Whether the channel has somewhere to render a review summary beside the
   * conversation. The PWA does — a panel under the chat. A messaging thread
   * has nothing but the thread, so a confirm step there must carry the answers
   * in the message body or the claimant is asked to confirm details they
   * cannot see.
   */
  readonly summaryPanel: boolean;
  /**
   * Whether the platform itself proves who the sender is.
   *
   * True for the messaging channels, and it is the reason they have no login:
   * a WhatsApp message can only come from the account that sent it, and
   * Telegram's `request_contact` returns a number that platform verified. The
   * gateway takes that as attestation and resolves the claimant from it.
   *
   * False for web chat. A browser can claim any number, so the conversation
   * asks for one and proves possession with a code before anything is bound.
   * That code is not a formality standing in for a login — it is the only
   * thing preventing someone filing a claim as another person.
   */
  readonly platformVerifiedPhone: boolean;
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

/**
 * How a channel is named to staff.
 *
 * Raw enums leaked onto the operator's screen as "WEB_CHAT" the moment a
 * second channel existed. More than cosmetic: an agent has to know which
 * channel a thread is on before they type, because the channels do not behave
 * the same — see `retainsPlaintext`.
 */
export const CHANNEL_LABELS: Record<string, string> = {
  [Channel.WEB_CHAT]: 'Web chat',
  [Channel.STAFF]: 'Staff',
  [Channel.EMAIL]: 'Email',
  [Channel.WHATSAPP]: 'WhatsApp',
  [Channel.TELEGRAM]: 'Telegram',
  [Channel.MESSENGER]: 'Messenger',
};

export const CHANNEL_CAPABILITIES: Record<string, ChannelCapabilities> = {
  [Channel.WEB_CHAT]: {
    channel: Channel.WEB_CHAT,
    choiceMax: Number.POSITIVE_INFINITY,
    choiceStyle: 'native',
    document: 'native',
    dateEntry: 'picker',
    maxMessageChars: Number.POSITIVE_INFINITY,
    summaryPanel: true,
    platformVerifiedPhone: false,
    retainsPlaintext: false,
  },
  [Channel.TELEGRAM]: {
    channel: Channel.TELEGRAM,
    choiceMax: 100,
    choiceStyle: 'inline_keyboard',
    document: 'native',
    dateEntry: 'text',
    maxMessageChars: 4096,
    summaryPanel: false,
    platformVerifiedPhone: true,
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
    summaryPanel: false,
    platformVerifiedPhone: true,
    retainsPlaintext: true,
  },
  [Channel.MESSENGER]: {
    channel: Channel.MESSENGER,
    choiceMax: 13,
    choiceStyle: 'buttons',
    document: 'native',
    dateEntry: 'text',
    maxMessageChars: 2000,
    summaryPanel: false,
    platformVerifiedPhone: true,
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
const MONTH_NAMES: Record<string, number> = {
  jan: 1, january: 1, januari: 1,
  feb: 2, february: 2, februari: 2,
  mar: 3, march: 3, mac: 3,
  apr: 4, april: 4,
  may: 5, mei: 5,
  jun: 6, june: 6,
  jul: 7, july: 7, julai: 7,
  aug: 8, august: 8, ogos: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, oktober: 10,
  nov: 11, november: 11,
  dec: 12, december: 12, disember: 12,
};

/** Whole-message words meaning a day relative to now. Malay included. */
const RELATIVE_DAYS: Record<string, number> = {
  today: 0, tod: 0, 'hari ini': 0,
  yesterday: -1, yest: -1, semalam: -1, kelmarin: -1,
  tomorrow: 1, esok: 1,
};

/**
 * Turn the many shapes of a typed date into a canonical DD/MM/YYYY-ish triple.
 *
 * Kept separate from the numeric path because month NAMES are unambiguous:
 * "16 June 2026" and "June 16, 2026" both mean the same day, so word order can
 * be relaxed here without reintroducing the day/month guessing that the numeric
 * path exists to prevent.
 */
const matchNamedMonth = (
  text: string
): { day: number; month: number; year: number; rest: string } | null => {
  const names = Object.keys(MONTH_NAMES).join('|');
  // "16 June 2026", "16 Jun 26", "16th June 2026"
  const dayFirst = new RegExp(
    `^(\\d{1,2})(?:st|nd|rd|th)?[\\s,.-]+(${names})[\\s,.-]+(\\d{2,4})(.*)$`,
    'i'
  );
  // "June 16 2026", "June 16th, 2026"
  const monthFirst = new RegExp(
    `^(${names})[\\s,.-]+(\\d{1,2})(?:st|nd|rd|th)?[\\s,.-]+(\\d{2,4})(.*)$`,
    'i'
  );

  const dm = text.match(dayFirst);
  if (dm) {
    return {
      day: Number(dm[1]),
      month: MONTH_NAMES[dm[2].toLowerCase()],
      year: Number(dm[3]),
      rest: dm[4] ?? '',
    };
  }
  const md = text.match(monthFirst);
  if (md) {
    return {
      day: Number(md[2]),
      month: MONTH_NAMES[md[1].toLowerCase()],
      year: Number(md[3]),
      rest: md[4] ?? '',
    };
  }
  return null;
};

/**
 * Two digits meant as a year. "26" is 2026, not 1926.
 *
 * Claims are filed about the recent past and near future, so the whole
 * plausible range sits in this century. Anchoring on the current century keeps
 * that true without a sliding window nobody would remember to revisit.
 */
const expandYear = (year: number, now: Date): number => {
  if (year >= 1000) return year;
  if (year >= 100) return NaN; // three digits is a typo, not a year
  return Math.floor(now.getUTCFullYear() / 100) * 100 + year;
};

export const parseTextDate = (
  raw: string,
  kind: 'date' | 'datetime' = 'date',
  /**
   * Reference point for relative words like "today". Injected rather than read
   * from the clock so the behaviour is testable and so a caller can anchor to
   * the claimant's own day if it ever differs from the server's.
   */
  now: Date = new Date()
): string | null => {
  const text = raw.trim();
  if (!text) return null;

  // Already ISO (YYYY-MM-DD, optionally with a time) — unambiguous, pass through.
  if (/^\d{4}-\d{2}-\d{2}([T ]|$)/.test(text)) {
    const parsed = new Date(text.replace(' ', 'T'));
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  // "today", "semalam" — on a date step only. A datetime step needs a clock
  // reading the claimant has not given, and inventing one would put a made-up
  // time on an incident record.
  const relative = RELATIVE_DAYS[text.toLowerCase()];
  if (relative !== undefined) {
    if (kind === 'datetime') return null;
    const day = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + relative)
    );
    return day.toISOString();
  }

  let day: number;
  let month: number;
  let year: number;
  let hourText: string | undefined;
  let minuteText: string | undefined;
  let meridiem: string | undefined;

  const named = matchNamedMonth(text);
  if (named) {
    ({ day, month, year } = named);
    const time = named.rest.trim().match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
    if (named.rest.trim() && !time) return null;
    if (time) [, hourText, minuteText, meridiem] = time;
  } else {
    // Numeric, day-first. A space is allowed as a separator ("16 06 2026")
    // because phone keyboards make it the path of least resistance.
    const match = text.match(
      /^(\d{1,2})[/\-.\s](\d{1,2})[/\-.\s](\d{2,4})(?:[\s,]+(\d{1,2})[:.](\d{2})\s*(am|pm)?)?$/i
    );
    if (!match) return null;

    const [, dayText, monthText, yearText, h, m, mer] = match;
    day = Number(dayText);
    month = Number(monthText);
    year = Number(yearText);
    hourText = h;
    minuteText = m;
    meridiem = mer;
  }

  year = expandYear(year, now);
  if (Number.isNaN(year)) return null;

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
 * A stored date rendered the way a claimant wrote it.
 *
 * Dates are stored as ISO, and the review summary printed them raw: a claimant
 * was asked to confirm "2026-08-11T00:00:00.000Z" as their trip start. That is
 * not a formatting blemish on a confirmation screen — it is the one moment the
 * claimant is asked to check the facts of their own claim, and it was
 * unreadable, so nobody checked anything.
 *
 * Month spelled out, because "11/08" and "08/11" look alike and that ambiguity
 * is precisely what is being confirmed. Rendered in UTC, which is not a
 * timezone claim: intake stores what the claimant typed without applying an
 * offset, so reading it back with UTC getters returns their own words. Shifting
 * to a local zone here would move a 10:00 incident to 18:00.
 *
 * Returns null when the value will not parse, so the caller can fall back to
 * showing the raw string rather than "Invalid Date".
 */
export const formatDateAnswer = (
  value: string,
  answerType: 'date' | 'datetime'
): string | null => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;

  const day = parsed.toLocaleString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  if (answerType === 'date') return day;

  const time = parsed.toLocaleString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
  return `${day} at ${time}`;
};

/**
 * Render the answers so far as a plain-text review summary.
 *
 * For channels with no summary panel: a confirm step that says "review your
 * details" while showing none is asking a claimant to agree to something they
 * cannot see — and the thing they are agreeing to is a claim submission.
 *
 * Values are rendered through the step's own labels, so a choice reads as the
 * claimant saw it rather than as the stored enum. Sensitive answers are already
 * masked in the answer bag before they reach here (`SENSITIVE_ANSWER_STEPS` in
 * case-service), so the bank account shows as its tail — the masking is not
 * repeated here, deliberately, because two places doing it is how one of them
 * drifts.
 */
export const summariseAnswers = (
  steps: ReadonlyArray<{
    id: string;
    label: string;
    answerType: AnswerType;
    choices?: Array<{ value: string; label: string }>;
  }>,
  answers: Record<string, string | number | boolean>
): string => {
  const lines: string[] = [];

  for (const step of steps) {
    if (step.answerType === 'confirm') continue;
    const value = answers[step.id];
    if (value === undefined || value === null || value === '') continue;

    let display: string;
    // A skipped optional step read back as the literal word: "Policy number:
    // skip". The claimant is being asked to confirm a claim, and that line
    // says nothing true about it.
    if (typeof value === 'string' && value.trim().toLowerCase() === SKIP_VALUE) {
      display = 'not provided';
    } else if (step.answerType === 'document') {
      // The stored answer is a CaseDocument id, which means nothing to a
      // claimant reading it back.
      display = 'provided';
    } else if (step.answerType === 'choice') {
      display = step.choices?.find(choice => choice.value === value)?.label ?? String(value);
    } else if (step.answerType === 'date' || step.answerType === 'datetime') {
      display = formatDateAnswer(String(value), step.answerType) ?? String(value);
    } else {
      display = String(value);
    }

    lines.push(`• ${step.label}: ${display}`);
  }

  return lines.join('\n');
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
