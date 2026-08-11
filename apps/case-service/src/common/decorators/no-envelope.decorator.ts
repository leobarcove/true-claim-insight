import { SetMetadata } from '@nestjs/common';

export const NO_ENVELOPE = 'noEnvelope';

/**
 * Return this handler's value as the response body, unwrapped.
 *
 * Every other route is wrapped in `{ success, data, meta }` by
 * `TransformInterceptor`, which is right for our own clients and wrong for a
 * third party that specified the response itself. Meta's webhook handshake
 * wants the challenge string and nothing else; it received
 * `{"success":true,"data":"CHALLENGE-OK",…}` and would have failed
 * verification with no indication why — the same class of fault as the
 * envelope swallowing a `StreamableFile` and breaking document downloads.
 *
 * Deliberately opt-in per handler rather than inferred from the return type.
 * A rule like "do not wrap strings" would silently change every endpoint that
 * happens to return one.
 */
export const NoEnvelope = () => SetMetadata(NO_ENVELOPE, true);
