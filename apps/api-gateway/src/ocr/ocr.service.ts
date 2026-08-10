import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);

  /**
   * Where document images are sent for extraction. Environment-configured and
   * ABSENT BY DEFAULT: the previous hardcoded third-party endpoint shipped
   * claim document images (MyKad, receipts, damage photos) offshore with no
   * registry entry and no `TransferRecord` — the §3.4 gap, found by the
   * 10 Aug 2026 audit. Unset means the feature is off, not open; enabling it
   * is a data-transfer decision, not a config convenience, and the
   * `N8N_OCR_WEBHOOK` registry entry exists so the transfer is recordable
   * when someone makes it.
   */
  private readonly webhookUrl?: string;

  constructor(
    private readonly httpService: HttpService,
    config: ConfigService
  ) {
    this.webhookUrl = config.get<string>('OCR_WEBHOOK_URL');
    if (!this.webhookUrl) {
      this.logger.log('OCR_WEBHOOK_URL not set — webhook OCR is disabled.');
    }
  }

  async extractData(
    files: { buffer: Buffer; mimetype: string; filename: string; fieldname: string }[],
    sessionId: string = 'tci-claim-process'
  ) {
    const webhookUrl = this.webhookUrl;
    if (!webhookUrl) {
      throw new ServiceUnavailableException(
        'Document OCR is not configured. Set OCR_WEBHOOK_URL to enable it — and note the ' +
          'destination processes claim document images, so a transfer basis is required (§3.4).'
      );
    }
    this.logger.log(`Performing Webhook OCR for session ${sessionId}`);

    const formData = new FormData();
    formData.append('id', sessionId);

    files.forEach(file => {
      // Map frontend types to webhook expected field names
      let fieldname = file.fieldname;
      if (fieldname === 'incident') fieldname = 'damaged_evidence';

      const blob = new Blob([file.buffer], { type: file.mimetype });
      formData.append(fieldname, blob, file.filename);
    });

    try {
      const response = await firstValueFrom(this.httpService.post(webhookUrl, formData));

      return response.data;
    } catch (error: any) {
      this.logger.error(`Webhook OCR Error: ${error.message}`);
      if (error.response) {
        this.logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
      }
      throw error;
    }
  }
}
