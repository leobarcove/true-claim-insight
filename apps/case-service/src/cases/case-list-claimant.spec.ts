import { statedClaimantNameFromAnswers } from './cases.service';

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
