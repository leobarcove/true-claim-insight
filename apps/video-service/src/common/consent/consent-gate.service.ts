import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Asks case-service whether biometric processing may proceed.
 *
 * This service deliberately holds no consent data — consent lives with the
 * claim context — so the question is asked over the internal API rather than
 * answered locally. Voice and facial data are *sensitive* personal data under
 * the amended PDPA, and the analysis runs offshore (Hume), so the gate fails
 * CLOSED on every path: no consent, unknown claimant, or case-service being
 * unreachable all refuse analysis. Losing an analysis run to an outage is
 * recoverable; processing sensitive data without a basis is not.
 */
@Injectable()
export class ConsentGateService {
  private readonly logger = new Logger(ConsentGateService.name);
  private readonly caseServiceUrl: string;
  private readonly internalKey: string;

  constructor(config: ConfigService) {
    this.caseServiceUrl = config.get<string>('CASE_SERVICE_URL') || 'http://localhost:3001';
    this.internalKey = config.get<string>('INTERNAL_API_KEY') || '';
  }

  /** Throws unless a live BIOMETRIC_ANALYSIS consent exists for the claimant. */
  async assertBiometricConsent(claimantId: string | null | undefined, claimId: string) {
    if (!claimantId) {
      throw new BadRequestException(
        'Biometric analysis refused: this claim has no claimant to hold the consent. ' +
          'BIOMETRIC_ANALYSIS consent must exist before a recording is analysed.'
      );
    }

    let granted = false;
    try {
      const response = await fetch(
        `${this.caseServiceUrl}/api/v1/consent/check?claimantId=${encodeURIComponent(
          claimantId
        )}&purpose=BIOMETRIC_ANALYSIS`,
        {
          // An internal route (`@InternalRoute` in case-service): the key is
          // the whole of the caller's authority. It once had to claim
          // SUPER_ADMIN to get past the identity check — a service borrowing
          // the platform operator's role to ask a yes/no question.
          headers: {
            'x-internal-key': this.internalKey,
          },
        }
      );
      if (response.ok) {
        const body = (await response.json()) as { data?: { granted?: boolean }; granted?: boolean };
        granted = Boolean(body.data?.granted ?? body.granted);
      } else {
        this.logger.error(`Consent check returned ${response.status}; treating as not granted`);
      }
    } catch (error) {
      // Fail closed: an unreachable consent service is indistinguishable from
      // "no consent", and only one of those errors is recoverable.
      this.logger.error(
        'Consent check unreachable; refusing biometric analysis',
        error instanceof Error ? error.message : String(error)
      );
    }

    if (!granted) {
      this.logger.warn(`Biometric analysis refused for claim ${claimId}: no live consent`);
      throw new BadRequestException(
        'Biometric analysis requires the claimant’s BIOMETRIC_ANALYSIS consent (voice and ' +
          'facial data are sensitive personal data under the PDPA). Record consent first, or ' +
          'assess this claim without video analysis.'
      );
    }
  }
}
