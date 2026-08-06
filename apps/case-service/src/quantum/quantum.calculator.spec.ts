import { Prisma } from '@prisma/client';

import { calculateQuantum, QuantumInput, formatWorksheet } from './quantum.calculator';

const D = (value: string | number) => new Prisma.Decimal(value);

/**
 * COMPLIANCE TESTS — quantum (MASTER_PLAN §5 Phase 2).
 *
 * A quantum figure is the number the insured argues with, so the workings
 * matter as much as the total. What these hold:
 *
 *  - **Average before excess.** The single ordering that most changes the
 *    figure. Reversing it shrinks the excess by the underinsurance ratio and
 *    overpays.
 *  - **The cap applies last**, because the sum insured limits what the policy
 *    pays rather than feeding the arithmetic.
 *  - **Depreciation and betterment are distinct deductions**, not synonyms.
 *  - **Nothing is applied silently.** Average without a value at risk, or
 *    underinsurance on a policy with no average condition, produce a warning
 *    rather than a quiet decision either way.
 */

const base: QuantumInput = {
  assessedLoss: D(0),
  basis: 'REINSTATEMENT',
  sumInsured: D(100_000),
  averageCondition: false,
};

describe('quantum — the ordering that changes the answer', () => {
  /**
   * A fire claim on a shop underinsured by 40%.
   *
   *   Assessed loss                 50,000.00
   *   Average (150,000 declared     -20,000.00
   *     against 250,000 at risk = 60%)
   *   Excess                         -1,000.00
   *   -----------------------------------------
   *   Recommended                    29,000.00
   *
   * Deducting the excess first would give (50,000 − 1,000) × 0.6 = 29,400.00,
   * overpaying by 400.00 — see the explicit comparison below.
   */
  const underinsuredFire: QuantumInput = {
    ...base,
    assessedLoss: D(50_000),
    sumInsured: D(150_000),
    valueAtRisk: D(250_000),
    averageCondition: true,
    excess: D(1_000),
  };

  it('applies average to the loss, then deducts the excess', () => {
    const result = calculateQuantum(underinsuredFire);

    expect(result.underinsured).toBe(true);
    expect(result.averageApplied).toBe(true);
    expect(result.recommended.toFixed(2)).toBe('29000.00');
  });

  it('would overpay if the excess came first — the reason for the order', () => {
    const result = calculateQuantum(underinsuredFire);

    // The wrong order: (50,000 - 1,000) × 0.6 = 29,400.00
    const wrongOrder = D(50_000).minus(D(1_000)).times(D(150_000).dividedBy(D(250_000)));

    // Deducting the excess first makes the insured bear only 60% of it, so the
    // wrong order pays MORE. 29,400 against the correct 29,000.
    expect(wrongOrder.toFixed(2)).toBe('29400.00');
    expect(result.recommended.lessThan(wrongOrder)).toBe(true);
    expect(wrongOrder.minus(result.recommended).toFixed(2)).toBe('400.00');
  });

  it('records the average deduction as its own line with the ratio stated', () => {
    const result = calculateQuantum(underinsuredFire);
    const line = result.lines.find(l => l.key === 'average');

    expect(line).toBeDefined();
    expect(line!.amount.toFixed(2)).toBe('-20000.00');
    expect(line!.basis).toContain('60.00%');
  });
});

describe('quantum — depreciation and betterment', () => {
  it('deducts depreciation on an indemnity basis', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(20_000),
      basis: 'INDEMNITY',
      depreciationRate: D('0.25'),
    });

    expect(result.adjustedLoss.toFixed(2)).toBe('15000.00');
    expect(result.recommended.toFixed(2)).toBe('15000.00');
  });

  it('refuses depreciation on a reinstatement policy rather than ignoring it', () => {
    // Silently dropping it would hide a mis-recorded settlement basis.
    expect(() =>
      calculateQuantum({
        ...base,
        assessedLoss: D(20_000),
        basis: 'REINSTATEMENT',
        depreciationRate: D('0.25'),
      })
    ).toThrow(/reinstatement basis/i);
  });

  it('treats betterment as a separate deduction from depreciation', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(20_000),
      basis: 'INDEMNITY',
      depreciationRate: D('0.25'),
      betterment: D(2_000),
    });

    // 20,000 − 5,000 depreciation − 2,000 betterment
    expect(result.adjustedLoss.toFixed(2)).toBe('13000.00');
    expect(result.lines.map(l => l.key)).toEqual([
      'assessed-loss',
      'depreciation',
      'betterment',
    ]);
  });

  it('warns when an indemnity claim carries no depreciation at all', () => {
    const result = calculateQuantum({ ...base, assessedLoss: D(5_000), basis: 'INDEMNITY' });
    expect(result.warnings.join(' ')).toMatch(/no depreciation/i);
  });
});

describe('quantum — average is never applied silently', () => {
  it('does not apply average where the policy carries no such condition', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(50_000),
      sumInsured: D(150_000),
      valueAtRisk: D(250_000),
      averageCondition: false,
    });

    expect(result.underinsured).toBe(true);
    expect(result.averageApplied).toBe(false);
    expect(result.recommended.toFixed(2)).toBe('50000.00');
    // The insurer may still want to know the risk was underdeclared.
    expect(result.warnings.join(' ')).toMatch(/no condition of average/i);
  });

  it('warns when average is possible but the value at risk was never assessed', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(50_000),
      averageCondition: true,
    });

    expect(result.averageApplied).toBe(false);
    // Unknown, not absent — the distinction the warning exists to preserve.
    expect(result.warnings.join(' ')).toMatch(/could not be tested/i);
  });

  it('does not apply average when the risk is fully insured', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(10_000),
      sumInsured: D(250_000),
      valueAtRisk: D(250_000),
      averageCondition: true,
    });

    expect(result.underinsured).toBe(false);
    expect(result.averageApplied).toBe(false);
    expect(result.recommended.toFixed(2)).toBe('10000.00');
  });
});

describe('quantum — limits and floors', () => {
  it('caps at the sum insured, and says so', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(180_000),
      sumInsured: D(100_000),
    });

    expect(result.cappedAtSumInsured).toBe(true);
    expect(result.recommended.toFixed(2)).toBe('100000.00');
  });

  it('applies the cap after deductions, not before', () => {
    // A 180,000 loss on a 100,000 sum insured with a 5,000 excess pays the
    // full 100,000: the excess bites into the part above the limit, not the
    // settlement. Capping first would have paid 95,000.
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(180_000),
      sumInsured: D(100_000),
      excess: D(5_000),
    });

    expect(result.recommended.toFixed(2)).toBe('100000.00');
  });

  it('never returns a negative figure', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(800),
      excess: D(1_000),
    });

    expect(result.recommended.toFixed(2)).toBe('0.00');
    expect(result.warnings.join(' ')).toMatch(/exceed the assessed loss/i);
  });

  it('deducts salvage before the excess', () => {
    const result = calculateQuantum({
      ...base,
      assessedLoss: D(10_000),
      salvage: D(1_500),
      excess: D(500),
    });

    expect(result.recommended.toFixed(2)).toBe('8000.00');
    expect(result.lines.map(l => l.key)).toEqual(['assessed-loss', 'salvage', 'excess']);
  });
});

describe('quantum — arithmetic and presentation', () => {
  it('rounds to sen, half up, without float drift', () => {
    // 0.1 + 0.2 arithmetic in binary floating point is why this uses Decimal.
    const result = calculateQuantum({
      ...base,
      assessedLoss: D('1000.005'),
    });
    expect(result.recommended.toFixed(2)).toBe('1000.01');
  });

  it('refuses a sum insured of zero rather than dividing by it', () => {
    expect(() => calculateQuantum({ ...base, assessedLoss: D(100), sumInsured: D(0) })).toThrow(
      /sum insured/i
    );
  });

  it('refuses a negative loss', () => {
    expect(() => calculateQuantum({ ...base, assessedLoss: D(-1) })).toThrow(/negative/i);
  });

  it('renders a worksheet an adjuster can read', () => {
    const rendered = formatWorksheet(
      calculateQuantum({
        ...base,
        assessedLoss: D(50_000),
        sumInsured: D(150_000),
        valueAtRisk: D(250_000),
        averageCondition: true,
        excess: D(1_000),
      })
    );

    expect(rendered).toContain('Assessed loss');
    expect(rendered).toContain('Less: condition of average');
    expect(rendered).toContain('Less: excess');
    expect(rendered).toContain('Recommended');
    expect(rendered).toContain('29000.00');
  });
});

describe('quantum — settlement basis against what is being settled', () => {
  const travel = {
    assessedLoss: D('2000'),
    sumInsured: D('10000'),
    averageCondition: false,
    category: 'TRAVEL',
  };

  it('questions a reinstatement basis on a travel loss', () => {
    // A lost bag is not reinstated. The basis is usually set out of habit from
    // property work, and the figure it produces is too high by the wear.
    const result = calculateQuantum({ ...travel, basis: 'REINSTATEMENT' });
    expect(result.warnings.some(w => /Reinstatement is a property basis/.test(w))).toBe(true);
  });

  it('does not refuse it — some travel policies pay new-for-old', () => {
    // A finding, not a block: baggage under an age limit can be replaced new.
    const result = calculateQuantum({ ...travel, basis: 'REINSTATEMENT' });
    expect(result.recommended.toFixed(2)).toBe('2000.00');
  });

  it('says nothing about a reinstatement basis on a fire loss', () => {
    const result = calculateQuantum({
      ...travel,
      category: 'FIRE',
      basis: 'REINSTATEMENT',
    });
    expect(result.warnings.some(w => /property basis/.test(w))).toBe(false);
  });

  it('does not ask a travel claim to justify having no depreciation', () => {
    // A delayed flight is reimbursed at what it cost. Raising the property
    // question on every travel claim would empty "matters outstanding".
    const result = calculateQuantum({ ...travel, basis: 'INDEMNITY' });
    expect(result.warnings.some(w => /no depreciation applied/.test(w))).toBe(false);
  });

  it('still asks it of a property claim', () => {
    const result = calculateQuantum({ ...travel, category: 'FIRE', basis: 'INDEMNITY' });
    expect(result.warnings.some(w => /no depreciation applied/.test(w))).toBe(true);
  });

  it('still asks it when the category is unknown', () => {
    // Absent category must not silence a finding — the safe reading is that
    // this is a property loss until something says otherwise.
    const { category: _omitted, ...noCategory } = travel;
    const result = calculateQuantum({ ...noCategory, basis: 'INDEMNITY' });
    expect(result.warnings.some(w => /no depreciation applied/.test(w))).toBe(true);
  });
});
