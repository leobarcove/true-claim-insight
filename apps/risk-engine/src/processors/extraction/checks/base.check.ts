export interface CheckScenario {
  id: string;
  name: string;
  description: string;
  mockData: {
    claim: any;
    documents: any[];
  };
  expectedResult: {
    recommendation: 'APPROVE' | 'INVESTIGATE' | 'REJECT';
    redFlags: string[];
  };
}
