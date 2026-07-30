import { AdjusterReportType } from '@prisma/client';
import {
  PD_12_6_REQUIRED_KEYS,
  REPORT_TEMPLATES,
  aiAssistedSections,
  missingMandatorySections,
  templateFor,
} from './report-templates';

/**
 * COMPLIANCE TESTS — BNM Adjuster PD 12.6 report content.
 *
 * The paragraph requires an adjuster's report to disclose the facts relied on,
 * the assumptions made, the methods applied, and the sources and databases
 * consulted. A report missing any of these does not meet the standard however
 * sound its conclusion, so the requirement is enforced in code and asserted here
 * rather than left to a template someone can edit.
 */
describe('Report templates (PD 12.6)', () => {
  const allTypes = Object.values(AdjusterReportType);

  it('covers every report type the schema allows', () => {
    for (const type of allTypes) {
      expect(templateFor(type).length).toBeGreaterThan(0);
    }
  });

  it('requires the four PD 12.6 disclosures on every report type', () => {
    for (const type of allTypes) {
      const mandatory = templateFor(type)
        .filter(section => section.mandatory)
        .map(section => section.key);

      for (const required of PD_12_6_REQUIRED_KEYS) {
        expect(mandatory).toContain(required);
      }
    }
  });

  it('names the regulatory basis for each PD 12.6 section, so the report can cite it', () => {
    for (const type of allTypes) {
      for (const key of PD_12_6_REQUIRED_KEYS) {
        const section = templateFor(type).find(s => s.key === key);
        expect(section?.regulatoryBasis).toMatch(/PD 12\.6/);
      }
    }
  });

  it('gives every section guidance, since a blank heading invites a blank answer', () => {
    for (const type of allTypes) {
      for (const section of templateFor(type)) {
        expect(section.guidance.trim().length).toBeGreaterThan(20);
      }
    }
  });

  it('requires a FINAL report to address liability, quantum and a recommendation', () => {
    const keys = templateFor(AdjusterReportType.FINAL).map(s => s.key);

    expect(keys).toContain('liability');
    expect(keys).toContain('quantum');
    expect(keys).toContain('recommendation');
  });

  it('uses unique section keys within a template', () => {
    for (const type of allTypes) {
      const keys = templateFor(type).map(s => s.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  describe('completeness checking', () => {
    const filled = (type: AdjusterReportType) =>
      Object.fromEntries(templateFor(type).map(s => [s.key, { body: 'content' }]));

    it('reports nothing missing when every mandatory section has content', () => {
      expect(missingMandatorySections(AdjusterReportType.FINAL, filled(AdjusterReportType.FINAL))).toEqual(
        []
      );
    });

    it('does not accept whitespace as a disclosure', () => {
      const sections = { ...filled(AdjusterReportType.FINAL), methodology: { body: '   \n\t ' } };

      expect(missingMandatorySections(AdjusterReportType.FINAL, sections)).toEqual(['methodology']);
    });

    it('treats an absent section as missing, not as satisfied', () => {
      const sections = filled(AdjusterReportType.FINAL);
      delete (sections as Record<string, unknown>).sources;

      expect(missingMandatorySections(AdjusterReportType.FINAL, sections)).toEqual(['sources']);
    });

    it('lists every missing section at once, so an author fixes them in one pass', () => {
      expect(missingMandatorySections(AdjusterReportType.FINAL, {}).sort()).toEqual(
        templateFor(AdjusterReportType.FINAL)
          .filter(s => s.mandatory)
          .map(s => s.key)
          .sort()
      );
    });
  });

  describe('AI disclosure', () => {
    // §6 decided position: AI use is disclosed, never downplayed. The disclosure
    // that matters is which conclusion it touched, not that the firm uses AI.
    it('identifies the sections an author flagged as AI-assisted', () => {
      const sections = {
        facts: { body: 'observed', aiAssisted: true },
        methodology: { body: 'desk review' },
        sources: { body: 'extracted', aiAssisted: true },
      };

      expect(aiAssistedSections(sections).sort()).toEqual(['facts', 'sources']);
    });

    it('reports none when nothing was AI-assisted', () => {
      expect(aiAssistedSections({ facts: { body: 'observed' } })).toEqual([]);
    });
  });

  it('keeps the PD 12.6 set intact (guards against a section being quietly dropped)', () => {
    // Named explicitly: if a future change removes one of these, that is a
    // compliance decision and should fail here rather than pass silently.
    expect(PD_12_6_REQUIRED_KEYS.sort()).toEqual(['assumptions', 'facts', 'methodology', 'sources']);
    expect(Object.keys(REPORT_TEMPLATES).sort()).toEqual(
      ['FINAL', 'INTERIM', 'PRELIMINARY', 'SUPPLEMENTARY']
    );
  });
});
