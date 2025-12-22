import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class OcrService {
  private readonly logger = new Logger(OcrService.name);
  private readonly webhookUrl =
    'https://smitherytech.zeabur.app/webhook/f5f1a332-6e84-473a-937e-63a46f63858e/extraction';

  constructor(private readonly httpService: HttpService) {}

  async extractData(
    files: { buffer: Buffer; mimetype: string; filename: string; fieldname: string }[],
    sessionId: string = 'tci-claim-process'
  ) {
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
      const response = await firstValueFrom(this.httpService.post(this.webhookUrl, formData));

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
