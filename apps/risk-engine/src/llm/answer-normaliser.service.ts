import { Inject, Injectable, Logger } from '@nestjs/common';
import { TransferRegister } from '@tci/prisma-client';
import { PrismaService } from '../config/prisma.service';
import { LLM_PROVIDER, LlmProvider } from './llm-provider.interface';

export interface NormaliseRequest {
  /** Exactly what the claimant typed. */
  text: string;
  /** The shape the flow step expects back. */
  answerType: 'text' | 'date' | 'datetime' | 'number' | 'choice' | 'phone';
  /** Allowed values, when the step is a choice. The model may pick only these. */
  choices?: Array<{ value: string; label: string }>;
  /** The question that was asked, so the model has the same context as the claimant. */
  prompt?: string;
  claimId?: string | null;
  claimantId?: string | null;
}

export interface NormaliseResult {
  /** A value the shared validator will accept, or null if it could not be read. */
  value: string | number | null;
  model: string | null;
}

/**
 * Turns free text a claimant typed into the value a flow step expects.
 *
 * A **normaliser, not a conversationalist**. It is handed one message and one
 * expected shape, and returns a value or null. It never sees the flow, never
 * chooses the next question, and never writes to a Case — the state machine
 * keeps doing all of that, and whatever comes back here still goes through the
 * same `validateAnswer` as a typed answer would.
 *
 * That boundary is the point. It is the pattern the industry converged on for
 * regulated intake — the model is the language layer, the rule engine is the
 * control plane — and it is what keeps the conversation auditable: every
 * question asked is still traceable to a published flow version, not to a
 * model's judgement on the day.
 *
 * Lives in risk-engine rather than case-service for a concrete reason: every
 * offshore model call must write a `TransferRecord` (PDPA s.129), and
 * `transferRecord` belongs to the assessment context, which only this service
 * may write.
 */
@Injectable()
export class AnswerNormaliserService {
  private readonly logger = new Logger(AnswerNormaliserService.name);
  private readonly transfers: TransferRegister;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PROVIDER) private readonly llm: LlmProvider
  ) {
    this.transfers = new TransferRegister(this.prisma, 'risk-engine', (entry, error) =>
      this.logger.error(
        `TRANSFER UNRECORDED: ${entry.provider} for intake answer normalisation`,
        error instanceof Error ? error.message : String(error)
      )
    );
  }

  async normalise(request: NormaliseRequest): Promise<NormaliseResult> {
    // Only when the active provider actually crosses a border. This used to
    // record a Google transfer unconditionally, so every normalisation on the
    // local models logged a cross-border transfer that never happened -- the
    // same fault as a missing record, in the other direction, and the comment
    // below already said why that is bad.
    //
    // Recorded before the call, and with its own data description rather than
    // the registry default: the registry's Gemini entry describes document
    // images, and a claimant's chat message is a different kind of personal
    // data. A register that says the wrong thing is worse than a thin one.
    //
    // No lawful basis is claimed, because none is established for this path
    // (MASTER_PLAN §3.4). The honest record says so.
    if (this.llm.offshore) {
      await this.transfers.record({
        provider: 'GOOGLE_GEMINI',
        dataDescription: 'Free-text message typed by a claimant during conversational intake',
        purpose: `Interpreting a claimant's answer to an intake question (${request.answerType})`,
        lawfulBasis: null,
        claimId: request.claimId ?? null,
        claimantId: request.claimantId ?? null,
        metadata: { answerType: request.answerType, characters: request.text.length },
      });
    }

    try {
      const raw = await this.llm.generateJson(this.buildPrompt(request));
      const value = this.coerce(raw?.value, request);
      return { value, model: this.llm.name };
    } catch (error) {
      // A normaliser outage must not stop intake. The caller falls back to
      // asking the question again, which is what happened before this existed.
      this.logger.error(
        `Normalisation failed: ${error instanceof Error ? error.message : String(error)}`
      );
      return { value: null, model: null };
    }
  }

  /**
   * Deliberately narrow. The model is told to extract or return null, never to
   * guess, converse, or explain — an invented value here would enter the claim
   * record as though the claimant had typed it.
   */
  private buildPrompt(request: NormaliseRequest): string {
    const lines = [
      'You convert one message from an insurance claimant into a single machine-readable value.',
      'Return JSON only: {"value": <value>} or {"value": null} if you cannot tell.',
      'Never guess. If the message is ambiguous, incomplete, or unrelated, return null.',
      '',
      request.prompt ? `The claimant was asked: "${request.prompt}"` : '',
      `They replied: "${request.text}"`,
      '',
    ];

    switch (request.answerType) {
      case 'date':
        lines.push(
          'Return the date as YYYY-MM-DD.',
          'Dates are written day-first in Malaysia: "06/07/2026" means 6 July 2026, not 7 June.',
          'Relative expressions ("yesterday", "last Tuesday") must return null — you do not know today\'s date.'
        );
        break;
      case 'datetime':
        lines.push(
          'Return the date and time as an ISO 8601 string.',
          'Dates are written day-first in Malaysia. A 24-hour or am/pm time is acceptable input.',
          'If no time is given, return null rather than assuming midnight.'
        );
        break;
      case 'number':
        lines.push(
          'Return a plain number with no currency symbol, no thousands separator, no units.',
          '"RM 1,200" and "1200 ringgit" both mean 1200.'
        );
        break;
      case 'phone':
        lines.push('Return the phone number as digits, keeping any leading + country code.');
        break;
      case 'choice':
        lines.push(
          'Return exactly one of these values, copied character for character:',
          ...(request.choices ?? []).map(choice => `  ${choice.value} — means "${choice.label}"`),
          'If the message does not clearly match one, return null.'
        );
        break;
      default:
        lines.push('Return the message cleaned of greetings and filler, or null if it says nothing.');
    }

    return lines.filter(Boolean).join('\n');
  }

  /**
   * Constrain what comes back before it leaves this service.
   *
   * A model asked for one of five choice values can still return a sixth. The
   * caller re-validates too, but a value that was never offered should not
   * travel that far — it would reach `validateAnswer` looking like something
   * the claimant chose.
   */
  private coerce(value: unknown, request: NormaliseRequest): string | number | null {
    if (value === null || value === undefined || value === '') return null;

    if (request.answerType === 'number') {
      const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[,\s]/g, ''));
      return Number.isFinite(numeric) ? numeric : null;
    }

    const text = String(value).trim();
    if (!text) return null;

    if (request.answerType === 'choice') {
      const allowed = new Set((request.choices ?? []).map(choice => choice.value));
      return allowed.has(text) ? text : null;
    }

    return text;
  }
}
