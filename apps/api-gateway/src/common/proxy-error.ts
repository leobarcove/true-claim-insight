import { HttpException, HttpStatus } from '@nestjs/common';
import { catchError } from 'rxjs/operators';

/**
 * Carry a downstream service's answer out to the caller unchanged.
 *
 * Without this an axios rejection is not an `HttpException`, so Nest reports it
 * as a 500 and the real answer is lost. Six proxy controllers had no
 * translation at all and a seventh rethrew the raw error, which turned every
 * downstream 400, 403 and 404 on those routes into an internal server error
 * (18 Aug 2026 audit).
 *
 * Two things went wrong at once, and only the second is obvious:
 *
 *  - the caller was told the platform had broken when in fact they had asked
 *    for something that is not theirs, or sent something invalid; and
 *  - `shouldAudit` keys on the status, so a refused cross-tenant read arriving
 *    as a 500 was **not recorded** — the control looked present because the
 *    service raised the right exception, while the edge quietly discarded it.
 *
 * The status and body are the downstream's own. The `failure` string is only
 * for the case where there is no response at all — the service is down, and
 * 500 is then the honest answer.
 */
export const passThroughDownstreamError = (failure: string) =>
  catchError((error: any) => {
    throw new HttpException(
      error?.response?.data ?? failure,
      error?.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR
    );
  });
