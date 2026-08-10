import { Body, Controller, Logger, Post, UseGuards } from '@nestjs/common';
import { InternalAuthGuard } from '../common/guards/internal-auth.guard';
import { AnswerNormaliserService, type NormaliseRequest } from './answer-normaliser.service';

/**
 * Internal only — no tenant guard, because the caller is case-service on the
 * internal channel rather than a browser, and nothing here reads or writes
 * tenant-scoped data. `InternalAuthGuard` is what stands between this and the
 * outside; it fails closed when the internal key is unconfigured.
 */
@Controller({ path: 'llm', version: '1' })
@UseGuards(InternalAuthGuard)
export class AnswerNormaliserController {
  private readonly logger = new Logger(AnswerNormaliserController.name);

  constructor(private readonly normaliser: AnswerNormaliserService) {}

  @Post('normalise-answer')
  async normalise(@Body() body: NormaliseRequest) {
    return this.normaliser.normalise(body);
  }
}
