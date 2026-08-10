import { QuantumWorksheet } from '@prisma/client';

/**
 * Renders a stored worksheet into the report's PD 12.6 quantum section.
 *
 * Reads from the persisted row rather than recomputing. A report cites a
 * specific revision, and re-running the calculator at render time would let a
 * later correction restate a figure already issued to an insurer — the exact
 * thing storing the lines was meant to prevent.
 *
 * The prose states the basis of each deduction because PD 12.6 requires the
 * **method** to be disclosed, not just the result. An insured disputing the
 * figure should be able to see which condition reduced it and by how much,
 * without asking for a second document.
 */

export interface StoredLine {
  key: string;
  label: string;
  /** Decimal string, as persisted. */
  amount: string;
  basis: string;
}

const money = (value: string): string =>
  `RM ${Number(value).toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export function renderQuantumSection(worksheet: QuantumWorksheet): string {
  const lines = (worksheet.lines as unknown as StoredLine[]) ?? [];

  const table = lines.map(line => `  ${line.label.padEnd(38)}${money(line.amount).padStart(18)}`);

  const basis = lines
    .filter(line => line.key !== 'assessed-loss')
    .map(line => `  - ${line.label.replace(/^Less: /, '')}: ${line.basis}`);

  const parts: string[] = [
    `Settlement basis: ${worksheet.basis === 'REINSTATEMENT' ? 'reinstatement (new for old)' : 'indemnity (value at the time of loss)'}.`,
    '',
    ...table,
    '  ' + ''.padEnd(56, '-'),
    `  ${'Recommended'.padEnd(38)}${money(worksheet.recommended.toFixed(2)).padStart(18)}`,
    '',
  ];

  if (basis.length > 0) {
    parts.push('Basis of each deduction:', ...basis, '');
  }

  if (worksheet.averageApplied && worksheet.averageRatio) {
    parts.push(
      'The condition of average has been applied. The sum insured of ' +
        `${money(worksheet.sumInsured.toFixed(2))} against an assessed value at risk of ` +
        `${money((worksheet.valueAtRisk ?? worksheet.sumInsured).toFixed(2))} represents ` +
        `${worksheet.averageRatio.times(100).toFixed(2)}% cover, and the loss has been ` +
        'reduced in that proportion.',
      ''
    );
  }

  if (worksheet.cappedAtSumInsured) {
    parts.push(
      `The figure is limited by the sum insured of ${money(worksheet.sumInsured.toFixed(2))}.`,
      ''
    );
  }

  if (worksheet.warnings.length > 0) {
    // Carried into the report rather than left in the worksheet: an unresolved
    // question about the figure is part of the opinion, and a reader is
    // entitled to see it alongside the number.
    parts.push(
      'Matters outstanding:',
      ...worksheet.warnings.map(warning => `  - ${warning}`),
      ''
    );
  }

  if (worksheet.notes) parts.push(worksheet.notes, '');

  parts.push(
    `Prepared from quantum worksheet revision ${worksheet.revision}.`,
    'The settlement decision rests with the insurer.'
  );

  return parts.join('\n');
}
