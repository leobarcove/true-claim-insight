import type { Prisma } from '@prisma/client';

/**
 * Fields excluded from every query result unless a caller explicitly asks.
 *
 * Encryption protects personal data *at rest*. It does nothing once a service
 * loads the ciphertext into a response body and hands it to a browser: the
 * blind index in particular is a lookup key derived from the NRIC, so exposing
 * it turns a leaked pepper into a full NRIC recovery. Neither value has any
 * legitimate use outside the service that decrypts it.
 *
 * Relying on each query to remember `omit` does not hold — a `include:
 * { claimant: true }` three modules away silently re-exposes the field. Passing
 * this to the PrismaClient constructor inverts the default: the fields are
 * absent everywhere, and the few paths that genuinely decrypt opt back in with
 * `omit: { nricEncrypted: false }`, which is visible in review.
 *
 * `nricLast4` and the other `…Last4` columns are deliberately NOT here — a
 * clear four-digit tail is what screens display.
 *
 * Add a row whenever a new encrypted or hashed personal-data column appears.
 * `Document.documentHash` is absent on purpose: it is a file-integrity digest,
 * not personal data.
 */
export const SENSITIVE_FIELD_OMIT = {
  claimant: { nricEncrypted: true, nricHash: true },
  claim: { nricEncrypted: true },
  case: { bankAccountNumberEncrypted: true },
  policy: { insuredNricEncrypted: true },
} as const;

/**
 * Client option shape every service must use.
 *
 * Services extend `PrismaClient<TciPrismaOptions>` rather than bare
 * `PrismaClient`. That is what carries the omit into the generated result
 * types, so reading an omitted field without opting in is a compile error
 * instead of an `undefined` discovered in production.
 */
export type TciPrismaOptions = Prisma.PrismaClientOptions & {
  omit: typeof SENSITIVE_FIELD_OMIT;
};
