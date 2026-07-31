/**
 * Fee arithmetic — CSP 11.16–11.18's firm-side half, as pure decisions.
 *
 * Money rounds half-up to the sen at each named amount, and every computed fee
 * carries its derivation: a number without its working is unanswerable when the
 * insurer disputes it, and disputes are the one certainty in billing.
 */

export interface ScaleBand {
  /** Upper bound of the band; null = the top band. */
  upTo: number | null;
  /** Percentage of the assessed amount within this band. */
  pct?: number;
  /** Flat fee for the band instead of a percentage. */
  fee?: number;
}

export interface FeeScaleLike {
  basis: 'SCALE' | 'TIME' | 'FIXED';
  bands?: ScaleBand[] | null;
  hourlyRate?: number | null;
  fixedFee?: number | null;
  sstRate: number;
}

export interface FeeComputation {
  professionalFee: number;
  /** Human-readable derivation, stored on the note. */
  derivation: string[];
}

const toSen = (value: number) => Math.round(value * 100) / 100;

/**
 * SCALE: progressive bands over the assessed amount, like a tax schedule —
 * each band's rate applies only to the slice inside it. A flat-on-total
 * reading would make the fee jump discontinuously at band edges, which no
 * insurer's scale intends.
 */
export function scaleFee(bands: ScaleBand[], assessedAmount: number): FeeComputation {
  if (!bands.length) throw new RangeError('A SCALE basis requires at least one band');
  if (assessedAmount < 0) throw new RangeError('Assessed amount cannot be negative');

  let remaining = assessedAmount;
  let previousCap = 0;
  let fee = 0;
  const derivation: string[] = [];

  for (const band of bands) {
    if (remaining <= 0) break;
    const width = band.upTo === null ? remaining : Math.max(0, band.upTo - previousCap);
    const slice = Math.min(remaining, width);

    if (band.pct !== undefined) {
      const part = toSen(slice * band.pct);
      fee += part;
      derivation.push(`${band.pct * 100}% of ${slice.toFixed(2)} (band to ${band.upTo ?? 'top'}) = ${part.toFixed(2)}`);
    } else if (band.fee !== undefined) {
      fee += band.fee;
      derivation.push(`flat ${band.fee.toFixed(2)} (band to ${band.upTo ?? 'top'})`);
    }

    remaining -= slice;
    if (band.upTo !== null) previousCap = band.upTo;
  }

  return { professionalFee: toSen(fee), derivation };
}

export function computeProfessionalFee(
  scale: FeeScaleLike,
  inputs: { assessedAmount?: number; hours?: number }
): FeeComputation {
  switch (scale.basis) {
    case 'SCALE': {
      if (inputs.assessedAmount === undefined) {
        throw new RangeError('SCALE basis requires the assessed amount');
      }
      return scaleFee(scale.bands ?? [], inputs.assessedAmount);
    }
    case 'TIME': {
      if (!scale.hourlyRate) throw new RangeError('TIME basis requires an hourly rate');
      if (inputs.hours === undefined) throw new RangeError('TIME basis requires the hours');
      const fee = toSen(inputs.hours * scale.hourlyRate);
      return {
        professionalFee: fee,
        derivation: [`${inputs.hours} h × ${scale.hourlyRate.toFixed(2)}/h = ${fee.toFixed(2)}`],
      };
    }
    case 'FIXED': {
      if (!scale.fixedFee) throw new RangeError('FIXED basis requires the fixed fee');
      return { professionalFee: toSen(scale.fixedFee), derivation: [`fixed fee ${scale.fixedFee.toFixed(2)}`] };
    }
  }
}

export interface FeeNoteAmounts {
  professionalFee: number;
  disbursementsTotal: number;
  sstAmount: number;
  total: number;
}

/**
 * SST applies to the professional fee — the taxable service — not to
 * disbursements, which are reimbursements of costs already incurred.
 */
export function computeFeeNote(
  professionalFee: number,
  disbursements: number[],
  sstRate: number
): FeeNoteAmounts {
  const disbursementsTotal = toSen(disbursements.reduce((sum, amount) => sum + amount, 0));
  const sstAmount = toSen(professionalFee * sstRate);
  return {
    professionalFee: toSen(professionalFee),
    disbursementsTotal,
    sstAmount,
    total: toSen(professionalFee + sstAmount + disbursementsTotal),
  };
}

export type AgeingBucket = 'CURRENT' | 'OVERDUE_1_30' | 'OVERDUE_31_60' | 'OVERDUE_61_90' | 'OVERDUE_90_PLUS';

/** Ageing of an issued, unpaid note — the CSP 11.16–11.18 evidence. */
export function ageingBucket(dueAt: Date, now: Date): AgeingBucket {
  const daysOver = Math.floor((now.getTime() - dueAt.getTime()) / 86_400_000);
  if (daysOver <= 0) return 'CURRENT';
  if (daysOver <= 30) return 'OVERDUE_1_30';
  if (daysOver <= 60) return 'OVERDUE_31_60';
  if (daysOver <= 90) return 'OVERDUE_61_90';
  return 'OVERDUE_90_PLUS';
}
