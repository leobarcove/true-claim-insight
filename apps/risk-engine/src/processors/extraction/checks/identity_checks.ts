import { CheckScenario } from './base.check';

export const ID_GHOST_DRIVER: CheckScenario = {
  id: 'ID-001',
  name: 'Ghost Driver (Identity Mismatch)',
  description: 'The person in the police report is not the policyholder or any named driver.',
  mockData: {
    claim: {
      claimNumber: 'C-MEM-002',
      claimant: { name: 'John Doe', nric: '800101-14-1234' },
      incidentDate: '2024-03-15',
    },
    documents: [
      {
        type: 'POLICY_DOCUMENT',
        extractedData: {
          policyholder: { name: 'John Doe', ic_number: '800101-14-1234' },
          insured_person: {
            name: 'Jane Doe',
            ic_number: '850505-14-5678',
            relationship_to_policyholder: 'SPOUSE',
          },
        },
      },
      {
        type: 'POLICE_REPORT',
        extractedData: {
          complainant: {
            name: 'Unknown Stranger',
            ic_number: '990909-10-9999',
            gender: 'MALE',
            age: 25,
            nationality: 'MALAYSIAN',
          },
          incident: { description: 'Driving car WX1234...' },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Driver not authorized', 'Unknown complainant'],
  },
};

export const ID_UNAUTHORIZED_DRIVER: CheckScenario = {
  id: 'ID-002',
  name: 'Unauthorized Driver',
  description: 'Driver is real but not covered (not the policyholder or insured person).',
  mockData: {
    claim: {
      claimant: { name: 'John Doe', nric: '800101-14-1234' },
    },
    documents: [
      {
        type: 'POLICY_DOCUMENT',
        extractedData: {
          policyholder: { name: 'John Doe', ic_number: '800101-14-1234' },
          insured_person: { name: 'Jane Doe', ic_number: '850505-14-5678' },
        },
      },
      {
        type: 'POLICE_REPORT',
        extractedData: {
          complainant: { name: 'Babu Bin Ali', ic_number: '900101-10-5555' },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Unauthorized driver'],
  },
};

export const ID_MYKAD_MISMATCH: CheckScenario = {
  id: 'ID-003',
  name: 'MyKad Identity Theft',
  description: 'The extracted MyKad NRIC does not match the claimant NRIC.',
  mockData: {
    claim: {
      claimant: { name: 'Ali Bin Abu', nric: '900202-10-5555' },
    },
    documents: [
      {
        type: 'MYKAD_FRONT',
        extractedData: {
          full_name: 'Chong Wei',
          ic_number: '880808-10-8888',
          gender: 'MALE',
          citizenship: 'WARGANEGARA',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Identity mismatch', 'Stolen ID suspected'],
  },
};

export const ID_UNDERAGE_DRIVER: CheckScenario = {
  id: 'ID-004',
  name: 'Underage Driver',
  description: 'Driver NRIC indicates age below legal driving limit (17).',
  mockData: {
    claim: {
      incidentDate: '2024-01-01',
      driver: { nric: '100101-14-1234' },
    },
    documents: [],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Driver underage', 'Illegal driving'],
  },
};

export const ID_NRIC_DOB_MISMATCH: CheckScenario = {
  id: 'ID-005',
  name: 'NRIC-DOB Mismatch',
  description: 'The NRIC number does not match the Date of Birth on the same document.',
  mockData: {
    claim: { claimant: { name: 'Tan Ah Kow' } },
    documents: [
      {
        type: 'MYKAD_FRONT',
        extractedData: {
          full_name: 'Tan Ah Kow',
          ic_number: '900505-10-1234',
          date_of_birth: '1992-08-20',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['NRIC validation failed', 'Potential forged ID'],
  },
};

export const ID_NAME_NRIC_REPORT_MISMATCH: CheckScenario = {
  id: 'ID-006',
  name: 'Complainant Name/NRIC Mismatch',
  description:
    'The complainant name/NRIC in the police report does not match the claimant details.',
  mockData: {
    claim: {
      claimant: { name: 'Ali Bin Abu', nric: '900202-10-5555' },
    },
    documents: [
      {
        type: 'POLICE_REPORT',
        extractedData: {
          complainant: {
            name: 'Ali Bin Ahmad',
            ic_number: '900202-10-5556',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Complainant mismatch', 'Identity verification failed'],
  },
};
