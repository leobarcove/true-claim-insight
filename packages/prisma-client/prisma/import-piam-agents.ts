import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { PrismaClient, Prisma } from '@prisma/client';

const BASE_URL = 'https://oars.piam.org.my/eid/';
const CAPTCHA_DIR = resolve(process.cwd(), '.runlogs');
const REQUEST_DELAY_MS = 1_500;

type Criteria = 'identity' | 'registration';
type CaptchaResponse = { token: string; image: string };
type Principal = { name: string; from: string; to: string };
type SearchResponse = {
  status: boolean;
  error?: string;
  captcha?: boolean;
  registration?: string;
  name?: string;
  member?: Principal[];
  nominee?: Array<{ name: string }>;
  url?: string;
};

function usage(): never {
  throw new Error(
    'Usage: pnpm --filter @tci/prisma-client import:piam -- --criteria registration <number> [number ...]\n' +
      '   or: pnpm --filter @tci/prisma-client import:piam -- --criteria identity <NRIC> [NRIC ...]'
  );
}

function parseArgs(argv: string[]): { criteria: Criteria; keywords: string[] } {
  const criteriaIndex = argv.indexOf('--criteria');
  if (criteriaIndex < 0) usage();

  const criteria = argv[criteriaIndex + 1] as Criteria;
  if (criteria !== 'identity' && criteria !== 'registration') usage();

  const keywords = argv
    .filter((_, index) => index !== criteriaIndex && index !== criteriaIndex + 1)
    .map(value => value.trim().toUpperCase())
    .filter(Boolean);
  if (keywords.length === 0) usage();

  return { criteria, keywords };
}

async function getJson<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(path, BASE_URL);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'TrueClaimInsight/1.0 (PIAM OARS importer)',
    },
  });
  if (!response.ok) throw new Error(`PIAM returned HTTP ${response.status} for ${url.pathname}`);
  return (await response.json()) as T;
}

async function requestCaptcha(): Promise<CaptchaResponse & { file: string }> {
  const captcha = await getJson<CaptchaResponse>('captcha', {});
  const match = /^data:image\/(png|jpeg|svg\+xml);base64,(.+)$/i.exec(captcha.image);
  if (!match) throw new Error('PIAM returned an unsupported CAPTCHA image format');

  const extension = match[1].toLowerCase() === 'svg+xml' ? 'svg' : match[1].toLowerCase();
  const file = resolve(CAPTCHA_DIR, `piam-captcha.${extension}`);
  await mkdir(CAPTCHA_DIR, { recursive: true });
  await writeFile(file, Buffer.from(match[2], 'base64'));
  return { ...captcha, file };
}

async function lookup(criteria: Criteria, keyword: string, code: string, token: string) {
  return getJson<SearchResponse>('search', {
    token,
    code: code.trim().toUpperCase(),
    criteria,
    keyword,
    auto: 'false',
  });
}

function validateResult(result: SearchResponse) {
  if (!result.status) throw new Error(result.error ?? 'PIAM lookup failed');
  if (!result.registration || !result.name) throw new Error('PIAM response omitted agent details');

  const permanentUrl = result.url ? new URL(result.url, BASE_URL) : null;
  return {
    registrationNumber: result.registration.trim(),
    agencyName: result.name.trim(),
    principals: (result.member ?? []).map(item => ({
      name: item.name?.trim() ?? '',
      validFrom: item.from?.trim() || null,
      validTo: item.to?.trim() || null,
    })) as Prisma.InputJsonValue,
    corporateNominees: (result.nominee ?? [])
      .map(item => item.name?.trim())
      .filter(Boolean) as string[],
    permanentUrl: permanentUrl?.href ?? null,
    // PIAM creates this opaque value after a successful CAPTCHA-validated
    // lookup. We only retain what PIAM returned; it is never derived or guessed.
    permanentLinkCode: permanentUrl?.searchParams.get('cs') ?? null,
    sourceCheckedAt: new Date(),
  };
}

async function main() {
  const { criteria, keywords } = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const prompt = createInterface({ input: stdin, output: stdout });

  try {
    for (const [index, keyword] of keywords.entries()) {
      const captcha = await requestCaptcha();
      stdout.write(`\nLookup ${index + 1}/${keywords.length}: ${keyword}\n`);
      stdout.write(`Open CAPTCHA image: ${captcha.file}\n`);
      const code = await prompt.question('Security code (or "skip"): ');
      if (code.trim().toLowerCase() === 'skip') continue;

      try {
        const record = validateResult(await lookup(criteria, keyword, code, captcha.token));
        await prisma.piamRegisteredAgent.upsert({
          where: { registrationNumber: record.registrationNumber },
          create: record,
          update: record,
        });
        stdout.write(`Saved ${record.registrationNumber} — ${record.agencyName}\n`);
        if (record.permanentLinkCode) {
          stdout.write(`Permanent-link code (cs): ${record.permanentLinkCode}\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        stdout.write(`Not saved: ${message}\n`);
      }

      if (index < keywords.length - 1) {
        await new Promise(resolveDelay => setTimeout(resolveDelay, REQUEST_DELAY_MS));
      }
    }
  } finally {
    prompt.close();
    await prisma.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
