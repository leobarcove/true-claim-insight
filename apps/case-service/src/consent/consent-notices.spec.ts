import { ConsentPurpose } from '@prisma/client';
import { DRAFT_CONSENT_NOTICES, REQUIRED_LOCALES } from './consent-notices.draft';

/**
 * COMPLIANCE TESTS — PDPA notice and consent content.
 *
 * PDPA s.7 requires written notice in **both English and Bahasa Malaysia**, and
 * requires it to state what is collected, why, who it is disclosed to, and the
 * subject's rights of access, correction and withdrawal. A notice missing any of
 * that does not become valid by being agreed to.
 */
describe('Consent notices (PDPA s.7)', () => {
  const purposes = [...new Set(DRAFT_CONSENT_NOTICES.map(notice => notice.purpose))];

  it('covers claim processing, biometric analysis and cross-border transfer', () => {
    expect(purposes).toContain(ConsentPurpose.CLAIM_PROCESSING);
    expect(purposes).toContain(ConsentPurpose.BIOMETRIC_ANALYSIS);
    expect(purposes).toContain(ConsentPurpose.CROSS_BORDER_TRANSFER);
  });

  it('provides every purpose in both English and Bahasa Malaysia', () => {
    for (const purpose of purposes) {
      const locales = DRAFT_CONSENT_NOTICES.filter(n => n.purpose === purpose).map(n => n.locale);

      for (const required of REQUIRED_LOCALES) {
        expect(locales).toContain(required);
      }
    }
  });

  it('ships every draft with substantive wording, not a placeholder', () => {
    for (const notice of DRAFT_CONSENT_NOTICES) {
      expect(notice.title.trim().length).toBeGreaterThan(5);
      expect(notice.body.trim().length).toBeGreaterThan(200);
      expect(notice.body).not.toMatch(/lorem ipsum|TODO|TBC/i);
    }
  });

  it('tells the subject they may withdraw, in every notice and language', () => {
    // The right to withdraw is meaningless if the notice never mentions it.
    for (const notice of DRAFT_CONSENT_NOTICES) {
      const mentionsWithdrawal =
        notice.locale === 'en'
          ? /withdraw/i.test(notice.body)
          : /menarik balik/i.test(notice.body);

      expect(mentionsWithdrawal).toBe(true);
    }
  });

  it('states the consequence of refusing, so consent is informed rather than nominal', () => {
    for (const notice of DRAFT_CONSENT_NOTICES) {
      const statesConsequence =
        notice.locale === 'en'
          ? /if you do not|if you do,|may mean|may be unable|no longer/i.test(notice.body)
          : /jika anda|mungkin bermakna|tidak dapat|tidak lagi/i.test(notice.body);

      expect(statesConsequence).toBe(true);
    }
  });

  describe('the biometric notice specifically', () => {
    const biometric = DRAFT_CONSENT_NOTICES.filter(
      n => n.purpose === ConsentPurpose.BIOMETRIC_ANALYSIS
    );

    it('says the data is treated as sensitive', () => {
      // Voice and facial data are sensitive personal data under the amended
      // PDPA, which carries a higher consent bar than ordinary claim handling.
      expect(biometric.find(n => n.locale === 'en')?.body).toMatch(/sensitive personal data/i);
      expect(biometric.find(n => n.locale === 'ms')?.body).toMatch(/data peribadi sensitif/i);
    });

    it('says automated analysis does not decide the claim on its own', () => {
      // §6 decided position: AI is disclosed, not downplayed — and never
      // presented as the decision-maker, which it is not.
      expect(biometric.find(n => n.locale === 'en')?.body).toMatch(/never decide|qualified adjuster/i);
      expect(biometric.find(n => n.locale === 'ms')?.body).toMatch(/penilai bertauliah/i);
    });

    it('says refusal alone will not cause the claim to be declined', () => {
      // Consent is not freely given if refusing it costs the claimant their claim.
      expect(biometric.find(n => n.locale === 'en')?.body).toMatch(/will not, by itself/i);
    });
  });

  it('keeps the two languages structurally parallel', () => {
    // A translation with a different number of paragraphs has usually gained or
    // lost a statement — the failure mode that makes a translated notice worse
    // than none, because the subject agreed to something other than the English.
    for (const purpose of purposes) {
      const en = DRAFT_CONSENT_NOTICES.find(n => n.purpose === purpose && n.locale === 'en');
      const ms = DRAFT_CONSENT_NOTICES.find(n => n.purpose === purpose && n.locale === 'ms');

      expect(ms?.body.split('\n\n').length).toBe(en?.body.split('\n\n').length);
    }
  });

  it('uses one version per purpose in the drafts, so approval is unambiguous', () => {
    for (const purpose of purposes) {
      const versions = new Set(
        DRAFT_CONSENT_NOTICES.filter(n => n.purpose === purpose).map(n => n.version)
      );
      expect(versions.size).toBe(1);
    }
  });
});
