import { Injectable } from '@nestjs/common';
import type { KeyStore } from '@tci/crypto';
import { PrismaKeyStore as SharedKeyStore } from '@tci/prisma-client';
import { PrismaService } from '../../config/prisma.service';

/**
 * NestJS provider around the shared key store. The queries themselves live in
 * @tci/prisma-client so every encrypting service resolves the same active key
 * version — see the note there.
 */
@Injectable()
export class PrismaKeyStore extends SharedKeyStore implements KeyStore {
  constructor(prisma: PrismaService) {
    super(prisma);
  }
}
