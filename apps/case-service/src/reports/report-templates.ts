import { AdjusterReportType } from '@prisma/client';

/**
 * Report section templates.
 *
 * BNM Adjuster PD 12.6 requires an adjuster's report to disclose the facts it
 * relies on, the assumptions made, the methods applied, and the sources and
 * databases consulted. Those are not stylistic preferences — a report that omits
 * them does not satisfy the standard, however good its conclusion.
 *
 * Deliberately a code registry rather than a database table. Mandatory sections
 * are a compliance control, and a control that can be switched off with an UPDATE
 * statement is not a control. Keeping the definition in version control means
 * removing a PD 12.6 section requires a reviewed commit, and the test below fails
 * if anyone does it. Per-insurer *wording* can still vary; the required sections
 * cannot.
 */
export interface ReportSectionTemplate {
  key: string;
  heading: string;
  /** Cannot be left empty on a report that is submitted for sign-off. */
  mandatory: boolean;
  /** Shown to the author as what this section is for. */
  guidance: string;
  /** Satisfies a specific PD paragraph — surfaced in the rendered PDF. */
  regulatoryBasis?: string;
}

/**
 * The four PD 12.6 disclosure sections, required on every report type.
 *
 * `aiAssisted` is captured per section rather than per report because the
 * disclosure that matters is *which* conclusion an AI contributed to, not
 * whether the firm uses AI at all (§6, decided position: AI is disclosed, never
 * downplayed).
 */
const PD_12_6_SECTIONS: ReportSectionTemplate[] = [
  {
    key: 'facts',
    heading: 'Facts and Findings',
    mandatory: true,
    guidance:
      'What was observed or established, separated from inference. State the date and means of each observation.',
    regulatoryBasis: 'PD 12.6 — facts relied upon',
  },
  {
    key: 'assumptions',
    heading: 'Assumptions and Limitations',
    mandatory: true,
    guidance:
      'What was assumed rather than verified, and what could not be established. An assessment made without a site visit says so here.',
    regulatoryBasis: 'PD 12.6 — assumptions made',
  },
  {
    key: 'methodology',
    heading: 'Methodology',
    mandatory: true,
    guidance:
      'How the assessment was conducted: desk review, remote video, site visit or expert referral, and why that mode was appropriate.',
    regulatoryBasis: 'PD 12.6 — methods applied',
  },
  {
    key: 'sources',
    heading: 'Sources and Databases',
    mandatory: true,
    guidance:
      'Every document, database, third-party report and system consulted, including any automated analysis and the provider behind it.',
    regulatoryBasis: 'PD 12.6 — sources and databases consulted',
  },
];

const scopeSection = (guidance: string): ReportSectionTemplate => ({
  key: 'scope',
  heading: 'Scope of Appointment',
  mandatory: true,
  guidance,
  regulatoryBasis: 'PD 11.2(a) — the adjusting engagement',
});

export const REPORT_TEMPLATES: Record<AdjusterReportType, ReportSectionTemplate[]> = {
  [AdjusterReportType.PRELIMINARY]: [
    scopeSection('What the insurer appointed the firm to assess, and on what date.'),
    ...PD_12_6_SECTIONS,
    {
      key: 'preliminaryView',
      heading: 'Preliminary View',
      mandatory: true,
      guidance:
        'An initial indication only. State explicitly that quantum is not yet settled and what remains outstanding.',
    },
    {
      key: 'outstanding',
      heading: 'Outstanding Requirements',
      mandatory: true,
      guidance: 'Documents or steps still needed, and who is expected to provide each.',
    },
  ],

  [AdjusterReportType.INTERIM]: [
    scopeSection('The engagement, and what has changed since the previous report.'),
    ...PD_12_6_SECTIONS,
    {
      key: 'progress',
      heading: 'Progress Since Last Report',
      mandatory: true,
      guidance: 'What has advanced, what is blocked, and why the matter remains open.',
    },
  ],

  [AdjusterReportType.FINAL]: [
    scopeSection('What the insurer appointed the firm to assess, and on what date.'),
    ...PD_12_6_SECTIONS,
    {
      key: 'liability',
      heading: 'Liability and Policy Response',
      mandatory: true,
      guidance:
        'Whether the loss falls within cover, citing the policy terms relied on. Recommendation only — the insurer decides.',
    },
    {
      key: 'quantum',
      heading: 'Quantum',
      mandatory: true,
      guidance:
        'The adjusted figure and how it was reached: sum insured against value at risk, average, betterment, depreciation and excess, each shown separately.',
    },
    {
      key: 'recommendation',
      heading: 'Recommendation',
      mandatory: true,
      guidance:
        'The recommendation to the insurer. State clearly that the settlement decision rests with the insurer.',
    },
  ],

  [AdjusterReportType.SUPPLEMENTARY]: [
    scopeSection('What prompted the supplementary report and which report it supplements.'),
    ...PD_12_6_SECTIONS,
    {
      key: 'revision',
      heading: 'Revision and Reason',
      mandatory: true,
      guidance: 'What has changed from the previous report and the evidence that justifies the change.',
    },
  ],
};

/** The section keys PD 12.6 requires, whatever the report type. */
export const PD_12_6_REQUIRED_KEYS = PD_12_6_SECTIONS.map(section => section.key);

export interface ReportSectionContent {
  body: string;
  /** True when an AI system materially contributed to this section's content. */
  aiAssisted?: boolean;
}

export type ReportSections = Record<string, ReportSectionContent>;

/** Template for a report type, or an empty list for an unknown one. */
export function templateFor(type: AdjusterReportType): ReportSectionTemplate[] {
  return REPORT_TEMPLATES[type] ?? [];
}

/**
 * Mandatory sections that are missing or blank.
 *
 * Whitespace does not count as content: an author cannot satisfy a disclosure
 * requirement with a space bar.
 */
export function missingMandatorySections(
  type: AdjusterReportType,
  sections: ReportSections
): string[] {
  return templateFor(type)
    .filter(template => template.mandatory)
    .filter(template => !sections[template.key]?.body?.trim())
    .map(template => template.key);
}

/** Section keys the author marked as AI-assisted, for disclosure in the report. */
export function aiAssistedSections(sections: ReportSections): string[] {
  return Object.entries(sections)
    .filter(([, content]) => content?.aiAssisted)
    .map(([key]) => key);
}
