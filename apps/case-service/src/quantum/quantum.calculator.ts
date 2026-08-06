import { Prisma } from '@prisma/client';

const D = Prisma.Decimal;
type Decimal = Prisma.Decimal;

/**
 * Quantum — how a loss becomes a recommended figure.
 *
 * ## The order is domain law, not configuration
 *
 * Each deduction sits where it does for a reason, and moving any of them
 * changes the answer. The two that matter most:
 *
 * **Average is applied before the excess.** Underinsurance reduces the loss
 * proportionally; the excess is then taken from the reduced figure. Deducting
 * the excess first and averaging afterwards would shrink the excess by the same
 * proportion and overpay — on a 60% underinsured claim with a RM1,000 excess,
 * the insured would effectively bear only RM600 of it.
 *
 * **The sum insured caps last.** It is a limit on what the policy pays, not an
 * input to the arithmetic, so it applies once every deduction has been made.
 *
 * ## Depreciation and betterment are not the same deduction
 *
 * Depreciation reflects what the property was worth *before* the loss — it
 * converts a reinstatement cost to an indemnity value, and applies only on an
 * indemnity basis. Betterment reflects the insured being left *better off than
 * before* by the repair, and can arise even on a reinstatement policy where the
 * work exceeds like-for-like. Conflating them either double-counts or misses a
 * deduction, and both are arguable positions an insured may contest — which is
 * why every line is retained rather than only the total.
 *
 * ## Nothing here decides a claim
 *
 * This produces a recommendation with its workings. The insurer decides
 * (MASTER_PLAN §1), and `averageApplies` in particular is surfaced as a finding
 * for an adjuster to confirm rather than applied silently — see the note on
 * that field.
 */

export type SettlementBasis = 'REINSTATEMENT' | 'INDEMNITY';

export interface QuantumInput {
  /** Assessed cost to reinstate or repair, before any deduction. */
  assessedLoss: Decimal;

  /** Reinstatement pays new-for-old; indemnity deducts wear and age. */
  basis: SettlementBasis;

  /**
   * The claim's category, where known.
   *
   * The arithmetic does not branch on it — a deduction is a deduction. It
   * qualifies two *findings*, because both only make sense against what is
   * being settled: reinstatement is a property concept, and a travel loss
   * reimbursed at cost has nothing to depreciate.
   */
  category?: string;

  /**
   * Depreciation as a rate (0–1) of the assessed loss. Indemnity basis only —
   * supplying it on a reinstatement policy is a caller error, not a silent
   * no-op, because it usually means the basis was set wrongly.
   */
  depreciationRate?: Decimal;

  /** Betterment as an absolute amount, where the repair improves the property. */
  betterment?: Decimal;

  /** The sum insured on the policy or the affected section. */
  sumInsured: Decimal;

  /**
   * The true value at risk at the time of loss. Underinsurance exists when this
   * exceeds the sum insured; without it, average cannot be assessed at all.
   */
  valueAtRisk?: Decimal;

  /** Whether the policy carries a condition of average at all. */
  averageCondition: boolean;

  /** Recoveries reducing the loss — scrap, undamaged stock, resale. */
  salvage?: Decimal;

  /** The excess or deductible borne by the insured. */
  excess?: Decimal;
}

export interface QuantumLine {
  /** Stable key, so a stored worksheet survives a change of wording. */
  key: string;
  label: string;
  /** Negative for a deduction, positive for the opening figure. */
  amount: Decimal;
  /** Why this line has the value it does, in an adjuster's terms. */
  basis: string;
}

export interface QuantumResult {
  lines: QuantumLine[];
  /** Loss after depreciation and betterment, before average. */
  adjustedLoss: Decimal;
  /** True where the sum insured is less than the value at risk. */
  underinsured: boolean;
  /** sumInsured / valueAtRisk, where average is assessable. */
  averageRatio?: Decimal;
  /**
   * Whether average was applied to the figure below.
   *
   * Deliberately reported rather than assumed: average is one of the most
   * frequently contested and waived conditions in a property claim, and this
   * firm recommends where the insurer decides. The calculator applies it when
   * the policy carries the condition and the numbers show underinsurance, and
   * says so in the workings so it can be argued with.
   */
  averageApplied: boolean;
  /** The recommended figure. Never negative — a claim cannot pay backwards. */
  recommended: Decimal;
  /** True where the sum insured limited the figure. */
  cappedAtSumInsured: boolean;
  /** Anything an adjuster must resolve before relying on this. */
  warnings: string[];
}

const ZERO = new D(0);
const ONE = new D(1);

/** Round half-up to sen. Money is presented and paid in two decimal places. */
const sen = (value: Decimal): Decimal => value.toDecimalPlaces(2, D.ROUND_HALF_UP);

export function calculateQuantum(input: QuantumInput): QuantumResult {
  const warnings: string[] = [];
  const lines: QuantumLine[] = [];

  if (input.assessedLoss.lessThan(ZERO)) {
    throw new Error('Assessed loss cannot be negative');
  }
  if (input.sumInsured.lessThanOrEqualTo(ZERO)) {
    throw new Error('Sum insured must be greater than zero');
  }

  let running = sen(input.assessedLoss);
  lines.push({
    key: 'assessed-loss',
    label: 'Assessed loss',
    amount: running,
    basis: 'Cost to reinstate or repair, as assessed',
  });

  // ---- 1. Depreciation — indemnity basis only -----------------------------
  if (input.depreciationRate && input.depreciationRate.greaterThan(ZERO)) {
    if (input.basis === 'REINSTATEMENT') {
      // Refused rather than ignored: a depreciation rate on a new-for-old
      // policy almost always means the basis was recorded wrongly, and
      // silently dropping it would hide that.
      throw new Error(
        'Depreciation cannot be applied on a reinstatement basis — check the settlement basis'
      );
    }
    if (input.depreciationRate.greaterThan(ONE)) {
      throw new Error('Depreciation rate must be between 0 and 1');
    }
    const deduction = sen(running.times(input.depreciationRate));
    running = running.minus(deduction);
    lines.push({
      key: 'depreciation',
      label: 'Less: depreciation',
      amount: deduction.negated(),
      basis: `Indemnity basis, ${input.depreciationRate.times(100).toFixed(1)}% for age and wear`,
    });
  } else if (input.basis === 'INDEMNITY' && input.category !== 'TRAVEL') {
    // Not raised on travel: a delayed flight or an overseas medical bill is
    // reimbursed at what it cost, and there is nothing there to depreciate.
    // Raising it on every such claim would empty "matters outstanding" of
    // meaning, which is the failure mode §3.6 calls false comfort.
    warnings.push(
      'Indemnity basis with no depreciation applied — confirm this is intended'
    );
  }

  if (input.category === 'TRAVEL' && input.basis === 'REINSTATEMENT') {
    // Not refused. Some travel policies do pay new-for-old on baggage under an
    // age limit, so a reinstatement basis can be right — but it is the unusual
    // reading, and on a lost bag it is more often a basis set out of habit from
    // property work. Surfaced the same way as `averageApplies`: put in front of
    // an adjuster to confirm, never applied or overridden silently.
    warnings.push(
      'Reinstatement is a property basis — a travel loss is normally settled at ' +
        'its value at the time of loss. Confirm the policy pays new-for-old'
    );
  }

  // ---- 2. Betterment ------------------------------------------------------
  if (input.betterment && input.betterment.greaterThan(ZERO)) {
    const deduction = sen(input.betterment);
    running = running.minus(deduction);
    lines.push({
      key: 'betterment',
      label: 'Less: betterment',
      amount: deduction.negated(),
      basis: 'Improvement beyond pre-loss condition, borne by the insured',
    });
  }

  const adjustedLoss = running;

  // ---- 3. Condition of average -------------------------------------------
  let averageRatio: Decimal | undefined;
  let averageApplied = false;
  const underinsured = Boolean(
    input.valueAtRisk && input.valueAtRisk.greaterThan(input.sumInsured)
  );

  if (input.averageCondition && !input.valueAtRisk) {
    // The policy can average but nobody established what the property was
    // worth, so underinsurance is unknown — not absent.
    warnings.push(
      'Policy carries a condition of average but no value at risk was assessed — ' +
        'underinsurance could not be tested'
    );
  }

  if (input.averageCondition && input.valueAtRisk) {
    if (input.valueAtRisk.lessThanOrEqualTo(ZERO)) {
      throw new Error('Value at risk must be greater than zero when supplied');
    }
    averageRatio = input.sumInsured.dividedBy(input.valueAtRisk);

    if (underinsured) {
      const reduced = sen(running.times(averageRatio));
      const deduction = running.minus(reduced);
      running = reduced;
      averageApplied = true;
      lines.push({
        key: 'average',
        label: 'Less: condition of average',
        amount: deduction.negated(),
        basis:
          `Underinsured — sum insured ${input.sumInsured.toFixed(2)} against ` +
          `value at risk ${input.valueAtRisk.toFixed(2)} (${averageRatio.times(100).toFixed(2)}%)`,
      });
    }
  } else if (!input.averageCondition && underinsured) {
    // Worth saying even where it costs the insured nothing: the insurer may
    // want to know the risk was underdeclared.
    warnings.push(
      'Underinsurance detected but the policy carries no condition of average — not applied'
    );
  }

  // ---- 4. Salvage ---------------------------------------------------------
  if (input.salvage && input.salvage.greaterThan(ZERO)) {
    const deduction = sen(input.salvage);
    running = running.minus(deduction);
    lines.push({
      key: 'salvage',
      label: 'Less: salvage and recoveries',
      amount: deduction.negated(),
      basis: 'Realisable value retained by or credited to the insured',
    });
  }

  // ---- 5. Excess — always last among the deductions ------------------------
  if (input.excess && input.excess.greaterThan(ZERO)) {
    const deduction = sen(input.excess);
    running = running.minus(deduction);
    lines.push({
      key: 'excess',
      label: 'Less: excess',
      amount: deduction.negated(),
      basis: 'Policy excess borne by the insured, applied after average',
    });
  }

  // ---- 6. Floor at zero ---------------------------------------------------
  if (running.lessThan(ZERO)) {
    warnings.push('Deductions exceed the assessed loss — nothing is payable');
    running = ZERO;
  }

  // ---- 7. Cap at the sum insured -----------------------------------------
  let cappedAtSumInsured = false;
  if (running.greaterThan(input.sumInsured)) {
    lines.push({
      key: 'cap',
      label: 'Limited to sum insured',
      amount: input.sumInsured.minus(running),
      basis: `Policy limit of ${input.sumInsured.toFixed(2)}`,
    });
    running = sen(input.sumInsured);
    cappedAtSumInsured = true;
  }

  return {
    lines,
    adjustedLoss,
    underinsured,
    averageRatio,
    averageApplied,
    recommended: sen(running),
    cappedAtSumInsured,
    warnings,
  };
}

/** The worksheet as an adjuster would read it, for the report and the UI. */
export function formatWorksheet(result: QuantumResult): string {
  const width = 46;
  const rows = result.lines.map(line => {
    const amount = line.amount.toFixed(2);
    return `${line.label.padEnd(width)}${amount.padStart(14)}`;
  });

  return [
    ...rows,
    ''.padEnd(width + 14, '-'),
    `${'Recommended'.padEnd(width)}${result.recommended.toFixed(2).padStart(14)}`,
  ].join('\n');
}
