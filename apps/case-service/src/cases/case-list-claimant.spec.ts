import { statedClaimantNameFromAnswers, statedClaimantNameOf } from './cases.service';

/**
 * The ranking these cover is the fix for a case naming two different people on
 * two screens: the list read the intake answer, the detail page had nothing to
 * read, and both fell back to a shared Claimant row whose name an assisted
 * intake is not allowed to overwrite.
 */
describe('stated claimant name, across both sources', () => {
  it('prefers the IC-matching intake answer over the declared name', () => {
    expect(statedClaimantNameOf({ 'claimant-name': 'CHUA XIN YING' }, 'Jane')).toBe(
      'CHUA XIN YING'
    );
  });

  it('uses the declared name while the case has no answers yet', () => {
    // The DRAFT window: consent taken, step one not yet reached. This is
    // exactly where an assisted case used to show the wrong person.
    expect(statedClaimantNameOf({}, '  Jane  ')).toBe('Jane');
  });

  it('is null when neither source has a name, so callers fall back to the record', () => {
    expect(statedClaimantNameOf({}, null)).toBeNull();
    expect(statedClaimantNameOf({}, '   ')).toBeNull();
    expect(statedClaimantNameOf(null, undefined)).toBeNull();
  });
});

describe('case list claimant name', () => {
  it('uses the trimmed name stated during intake', () => {
    expect(statedClaimantNameFromAnswers({ 'claimant-name': '  CHUA XIN YING  ' })).toBe(
      'CHUA XIN YING'
    );
  });

  it.each([null, {}, { 'claimant-name': '' }, { 'claimant-name': 123 }])(
    'returns null when no usable intake name exists',
    answers => {
      expect(statedClaimantNameFromAnswers(answers)).toBeNull();
    }
  );
});
