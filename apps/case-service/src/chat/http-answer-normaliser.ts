import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import type { AnswerValue, FlowStep } from '@tci/shared-types';
import type { AnswerNormaliser } from './answer-normaliser.interface';

/**
 * AnswerNormaliser backed by risk-engine's `/llm/normalise-answer`.
 *
 * Off unless `CHAT_LLM_NORMALISER_ENABLED=true`. Defaulting to off is the
 * point: the conversation must work without a model, so a provider outage,
 * an expired key or a decision to stop paying for inference degrades intake to
 * "please rephrase" rather than breaking it.
 */
@Injectable()
export class HttpAnswerNormaliser implements AnswerNormaliser {
  private readonly logger = new Logger(HttpAnswerNormaliser.name);
  private readonly riskEngineUrl: string;
  private readonly enabled: boolean;
  private readonly internalKey: string | undefined;

  /** Short: a claimant is waiting, and asking again beats a long silence. */
  private static readonly TIMEOUT_MS = 8_000;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService
  ) {
    this.riskEngineUrl = this.config.get('RISK_ENGINE_URL') || 'http://localhost:3004';
    this.enabled = this.config.get('CHAT_LLM_NORMALISER_ENABLED') === 'true';
    this.internalKey = this.config.get<string>('INTERNAL_API_KEY');

    if (this.enabled && !this.internalKey) {
      // Loud, because the failure is otherwise invisible: risk-engine would
      // reject every call, this class would swallow the 403, and intake would
      // carry on looking healthy with a feature that is switched on and doing
      // nothing.
      this.logger.error(
        'CHAT_LLM_NORMALISER_ENABLED is true but INTERNAL_API_KEY is unset — ' +
          'risk-engine will refuse every call and normalisation will silently never fire.'
      );
    } else if (this.enabled) {
      this.logger.log('LLM answer normalisation is ON (fallback only).');
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async normalise(
    text: string,
    step: FlowStep,
    context: { claimId?: string | null; claimantId?: string | null; tenantId?: string | null }
  ): Promise<AnswerValue | null> {
    if (!this.enabled) return null;

    try {
      const { data } = await firstValueFrom(
        this.http.post(
          `${this.riskEngineUrl}/api/v1/llm/normalise-answer`,
          {
            text,
            answerType: step.answerType,
            choices: step.choices,
            prompt: step.prompt,
            claimId: context.claimId ?? null,
            claimantId: context.claimantId ?? null,
          },
          {
            timeout: HttpAnswerNormaliser.TIMEOUT_MS,
            // risk-engine's InternalAuthGuard requires both the shared key and
            // an identity. The claimant is the subject of the call, so name
            // them where known — it is what ties a model call in the logs to
            // the person whose message was sent.
            headers: {
              'x-internal-key': this.internalKey,
              'x-user-id': context.claimantId ?? 'system:chat-normaliser',
              'x-user-role': 'SYSTEM',
              // Required by the guard for anything short of SUPER_ADMIN. The
              // real tenant is passed rather than claiming an admin role we do
              // not have — an internal call that overstates its privileges is
              // exactly what the guard exists to catch.
              'x-tenant-id': context.tenantId ?? '',
            },
          }
        )
      );

      const value = (data?.value ?? data?.data?.value) as AnswerValue | null | undefined;
      if (value === null || value === undefined) return null;

      this.logger.debug(`Normalised "${text}" → "${value}" for step ${step.id}`);
      return value;
    } catch (error) {
      // Never fatal. Intake worked without this yesterday and must today.
      //
      // A 401/403 is called out separately: that is a misconfiguration which
      // will fail every call forever, not a transient blip, and it deserves to
      // look different in the logs from a one-off timeout.
      const status = (error as { response?: { status?: number } })?.response?.status;
      const detail = error instanceof Error ? error.message : String(error);
      if (status === 401 || status === 403) {
        this.logger.error(
          `risk-engine refused the normalisation call (${status}). Check INTERNAL_API_KEY ` +
            `matches on both services. Normalisation is effectively off until this is fixed.`
        );
      } else {
        this.logger.warn(`Normalisation unavailable for step ${step.id}: ${detail}`);
      }
      return null;
    }
  }
}
