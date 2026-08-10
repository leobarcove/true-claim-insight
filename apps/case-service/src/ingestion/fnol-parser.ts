import { TravelClaimType } from '@prisma/client';

/**
 * Deterministic extraction of FNOL facts from an email.
 *
 * NO LLM. MASTER_PLAN §6.3 forbids AI extraction on real claimant documents
 * until the in-country LLM path lands, and an FNOL email is the most
 * personal-data-dense artefact in the system — sender identity, travel dates,
 * often an NRIC and bank details in the body. Sending it to Gemini today would
 * be an offshore transfer with no established basis (§3.4).
 *
 * The seam for later: `parseFnol` returns `missing` listing the mandatory
 * facts it could not find. When the local LLM is available, a second pass can
 * attempt only those fields, and only after a per-tenant policy check. The
 * deterministic pass stays first regardless — it is free, explainable to an
 * examiner, and correct on the semi-structured mail that agents actually send.
 */

export interface ParsedFnol {
  policyNumber?: string;
  travelClaimType?: TravelClaimType;
  incidentDate?: Date;
  flightNumber?: string;
  destination?: string;
  claimantName?: string;
  claimantEmail?: string;
  claimantPhone?: string;
  /** Mandatory facts that could not be extracted; drives NEEDS_REVIEW. */
  missing: string[];
}

/**
 * Facts safe to persist on `InboundMessage.parsed`.
 *
 * Identity fields are deliberately excluded: that column is plain JSONB, and
 * this platform encrypts personal identifiers at rest (§8). Claimant name,
 * email and phone travel onward to the Claimant/Case writers, which handle
 * them properly — they do not get a second, unprotected home here.
 */
export type StoredParse = Pick<
  ParsedFnol,
  'policyNumber' | 'travelClaimType' | 'incidentDate' | 'flightNumber' | 'destination'
> & { missing: string[] };

/** Facts without which an operator cannot act on the case. */
const MANDATORY: (keyof ParsedFnol)[] = ['policyNumber', 'incidentDate'];

/**
 * Labels agents and insurers actually use in FNOL mail. Matched
 * case-insensitively against `Label: value` lines, which is how most
 * forwarded notifications are structured.
 */
const LABELS: Record<string, keyof ParsedFnol> = {
  'policy number': 'policyNumber',
  'policy no': 'policyNumber',
  'policy #': 'policyNumber',
  policy: 'policyNumber',
  'certificate number': 'policyNumber',
  'flight number': 'flightNumber',
  'flight no': 'flightNumber',
  flight: 'flightNumber',
  destination: 'destination',
  'date of incident': 'incidentDate',
  'incident date': 'incidentDate',
  'date of loss': 'incidentDate',
  'loss date': 'incidentDate',
  'departure date': 'incidentDate',
  'insured name': 'claimantName',
  'claimant name': 'claimantName',
  name: 'claimantName',
  'contact number': 'claimantPhone',
  'phone number': 'claimantPhone',
  'mobile number': 'claimantPhone',
  phone: 'claimantPhone',
  email: 'claimantEmail',
};

/**
 * Claim-type keywords, most specific first. Order matters: "delayed baggage"
 * must not resolve to FLIGHT_DELAY simply because "delay" appears.
 */
const TYPE_KEYWORDS: [RegExp, TravelClaimType][] = [
  [/\b(baggage|luggage|suitcase)\b[\s\S]{0,40}\b(damag|broken|torn|crush)/i, 'LUGGAGE_DAMAGE'],
  [/\b(damag|broken|torn|crush)[\s\S]{0,40}\b(baggage|luggage|suitcase)\b/i, 'LUGGAGE_DAMAGE'],
  [/\b(baggage|luggage|suitcase)\b[\s\S]{0,40}\b(lost|loss|missing|never arrived|not arrive)/i, 'LUGGAGE_LOSS'],
  [/\b(lost|missing)[\s\S]{0,40}\b(baggage|luggage|suitcase)\b/i, 'LUGGAGE_LOSS'],
  [/\b(trip|travel|journey|booking|holiday)\b[\s\S]{0,30}\bcancel/i, 'TRIP_CANCELLATION'],
  // Both word orders: "cancelled the trip" and "trip was cancelled" are the
  // same claim. "flight" is deliberately absent — a cancelled flight is
  // handled by the FLIGHT_DELAY flow, which asks for the replacement
  // departure time, whereas cancelling the trip is a different benefit.
  [/\bcancel\w*\b[\s\S]{0,30}\b(trip|travel|journey|booking|holiday)\b/i, 'TRIP_CANCELLATION'],
  [/\bcancellation\b/i, 'TRIP_CANCELLATION'],
  [/\b(medical|hospital|illness|injur|clinic|doctor)\b/i, 'MEDICAL'],
  [/\bflight\b[\s\S]{0,30}\b(delay|late)/i, 'FLIGHT_DELAY'],
  [/\b(delay)\w*\b[\s\S]{0,30}\bflight\b/i, 'FLIGHT_DELAY'],
];

/** Unanchored scanning form of the flow's flight-number rule. */
const FLIGHT_SCAN = /\b([A-Z0-9]{2,3}\s?\d{1,4}[A-Z]?)\b/g;
const POLICY_SCAN = /\b([A-Z]{2,5}[-/]?\d{6,14}|\d{8,20})\b/g;
const EMAIL_SCAN = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/;
/** Malaysian mobile: +60xx, 60xx or local 01x. */
const PHONE_SCAN = /(?:\+?60|0)1\d[-\s]?\d{3,4}[-\s]?\d{4}/;

export function parseFnol(input: {
  subject?: string;
  text: string;
  fromAddress: string;
}): ParsedFnol {
  const haystack = `${input.subject ?? ''}\n${input.text}`;
  const result: ParsedFnol = { missing: [] };

  applyLabelledFields(haystack, result);

  // Fall back to scanning only where a label did not already supply the value:
  // a labelled field is a statement of intent, a scanned one is a guess.
  if (!result.policyNumber) result.policyNumber = firstMatch(haystack, POLICY_SCAN);
  if (!result.flightNumber) result.flightNumber = firstValidFlight(haystack);
  if (!result.incidentDate) result.incidentDate = firstDate(haystack);
  if (!result.claimantPhone) result.claimantPhone = PHONE_SCAN.exec(haystack)?.[0];

  // The sender address is a better default than a body scan: a forwarded mail
  // often quotes several addresses, but exactly one person sent it.
  if (!result.claimantEmail) {
    result.claimantEmail = input.fromAddress || EMAIL_SCAN.exec(haystack)?.[0];
  }

  result.travelClaimType ??= detectType(haystack);

  result.missing = MANDATORY.filter(field => result[field] === undefined).map(String);
  return result;
}

/** Strip identity fields before persistence — see StoredParse. */
export function toStoredParse(parsed: ParsedFnol): StoredParse {
  return {
    policyNumber: parsed.policyNumber,
    travelClaimType: parsed.travelClaimType,
    incidentDate: parsed.incidentDate,
    flightNumber: parsed.flightNumber,
    destination: parsed.destination,
    missing: parsed.missing,
  };
}

function applyLabelledFields(haystack: string, result: ParsedFnol): void {
  for (const line of haystack.split(/\r?\n/)) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;

    const label = line.slice(0, separator).trim().toLowerCase().replace(/\s+/g, ' ');
    const value = line.slice(separator + 1).trim();
    if (!value) continue;

    const field = LABELS[label];
    if (!field || result[field] !== undefined) continue;

    switch (field) {
      case 'incidentDate': {
        const date = parseDate(value);
        if (date) result.incidentDate = date;
        break;
      }
      case 'flightNumber': {
        const flight = firstValidFlight(value);
        if (flight) result.flightNumber = flight;
        break;
      }
      case 'policyNumber':
        // Labels are trusted, but not blindly: a policy number is never a
        // sentence, and "Policy: please see attached" must not become one.
        if (/^[A-Za-z0-9\-/ ]{6,30}$/.test(value)) result.policyNumber = value.trim();
        break;
      // Listed explicitly rather than assigned through the index: the union
      // includes Date and TravelClaimType, and a widening cast here would let
      // a future label silently write a string into one of them.
      case 'destination':
        result.destination = value;
        break;
      case 'claimantName':
        result.claimantName = value;
        break;
      case 'claimantPhone':
        result.claimantPhone = value;
        break;
      case 'claimantEmail':
        result.claimantEmail = value;
        break;
      default:
        break;
    }
  }
}

function detectType(haystack: string): TravelClaimType | undefined {
  for (const [pattern, type] of TYPE_KEYWORDS) {
    if (pattern.test(haystack)) return type;
  }
  return undefined;
}

function firstMatch(haystack: string, pattern: RegExp): string | undefined {
  const match = new RegExp(pattern.source, pattern.flags).exec(haystack);
  return match?.[1] ?? match?.[0];
}

/**
 * Scan for a flight number, keeping only candidates that satisfy the flow's
 * own rule. Extraction proposes; the canonical validator disposes — so the
 * definition of a valid flight number lives in exactly one place.
 */
function firstValidFlight(haystack: string): string | undefined {
  const anchored = /^[A-Za-z0-9]{2,3}\s?[0-9]{1,4}[A-Za-z]?$/;
  const scanner = new RegExp(FLIGHT_SCAN.source, 'gi');
  let match: RegExpExecArray | null;

  while ((match = scanner.exec(haystack)) !== null) {
    const candidate = match[1].trim();
    // A bare number is a quantity, not a flight; require a letter somewhere.
    if (!/[A-Za-z]/.test(candidate)) continue;

    // "Delay of 8 hours" reads as designator "OF", flight 8. Two-letter
    // English function words sit exactly in the airline-designator shape, so
    // prose around a delay is the most likely place a false flight number
    // comes from — and a wrong flight number sends an assessor to the wrong
    // carrier's records.
    const designator = candidate.split(/\s/)[0].replace(/\d+$/, '').toLowerCase();
    if (STOPWORD_DESIGNATORS.has(designator)) continue;

    if (anchored.test(candidate)) return candidate.toUpperCase();
  }
  return undefined;
}

/**
 * Two- and three-letter English words that collide with the IATA designator
 * shape. Not exhaustive by design — this catches the words that actually
 * appear next to a number in FNOL prose.
 */
const STOPWORD_DESIGNATORS = new Set([
  'of', 'on', 'at', 'in', 'to', 'by', 'no', 'is', 'it', 'as', 'we', 'my',
  'or', 'if', 'be', 'do', 'up', 'us', 'an', 'the', 'for', 'was', 'and',
  'our', 'all', 'per', 'via', 'ref',
]);

/**
 * Dates in Malaysian mail are day-first. `03/04/2026` is 3 April, never
 * 4 March — reading it the American way would silently shift an incident date
 * by up to eleven months and, with it, every CSP deadline computed from it.
 */
function parseDate(value: string): Date | undefined {
  const trimmed = value.trim();

  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (iso) return utc(+iso[1], +iso[2], +iso[3]);

  const dayFirst = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})/.exec(trimmed);
  if (dayFirst) {
    const year = +dayFirst[3] < 100 ? 2000 + +dayFirst[3] : +dayFirst[3];
    return utc(year, +dayFirst[2], +dayFirst[1]);
  }

  const named = /^(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{4})/.exec(trimmed);
  if (named) {
    const month = MONTHS.indexOf(named[2].slice(0, 3).toLowerCase());
    if (month >= 0) return utc(+named[3], month + 1, +named[1]);
  }

  return undefined;
}

function firstDate(haystack: string): Date | undefined {
  const candidate =
    /\b\d{4}-\d{2}-\d{2}\b/.exec(haystack)?.[0] ??
    /\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/.exec(haystack)?.[0] ??
    /\b\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4}\b/.exec(haystack)?.[0];
  return candidate ? parseDate(candidate) : undefined;
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/**
 * Built in UTC deliberately. An incident date parsed in the server's local
 * zone shifts by a day either side of midnight, and these dates feed the
 * 24-hour late-notification and 30-day out-of-window flags.
 */
function utc(year: number, month: number, day: number): Date | undefined {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(date.getTime())) return undefined;
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return undefined;
  return date;
}
