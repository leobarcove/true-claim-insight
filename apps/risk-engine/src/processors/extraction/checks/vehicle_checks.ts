import { CheckScenario } from './base.check';

export const VEH_KLON_CAR: CheckScenario = {
  id: 'VEH-001',
  name: 'Klon Car (Asset Mismatch)',
  description: 'Vehicle in photo matches plate but has wrong color/model.',
  mockData: {
    claim: {
      vehiclePlateNumber: 'WX1234',
      vehicleMake: 'Honda',
      vehicleModel: 'Civic',
    },
    documents: [
      {
        type: 'VEHICLE_REG_CARD',
        extractedData: {
          registration_number: 'WX1234',
          vehicle_make: 'Honda',
          vehicle_model: 'Civic',
          colour: 'Red',
        },
      },
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          vehicle: {
            make: 'Honda',
            model: 'Civic',
            color: 'Blue',
            registration_number: 'WX1234',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Vehicle color mismatch', 'Potential Klon car'],
  },
};

export const VEH_CHASSIS_MISMATCH: CheckScenario = {
  id: 'VEH-002',
  name: 'Chassis Mismatch',
  description: 'VOC submitted belongs to a different vehicle (same make/model but different ID).',
  mockData: {
    claim: {
      vehiclePlateNumber: 'WX1234',
      chassisNumber: 'CH123456789',
    },
    documents: [
      {
        type: 'VEHICLE_REG_CARD',
        extractedData: {
          registration_number: 'WX1234',
          chassis_number: 'CH999999999',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Chassis number mismatch'],
  },
};

export const VEH_EXPIRED_ROADTAX: CheckScenario = {
  id: 'VEH-003',
  name: 'Expired Road Tax',
  description: 'Road tax expired before accident date.',
  mockData: {
    claim: {
      incidentDate: '2024-06-01',
    },
    documents: [
      {
        type: 'VEHICLE_REG_CARD',
        extractedData: {
          road_tax_expiry: '2024-01-01',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Road tax expired', 'Illegal to drive'],
  },
};

export const VEH_PHANTOM: CheckScenario = {
  id: 'VEH-004',
  name: 'Phantom Vehicle',
  description: 'Police Report mentions a completely different vehicle involved.',
  mockData: {
    claim: {
      vehiclePlateNumber: 'WX1234',
    },
    documents: [
      {
        type: 'POLICE_REPORT',
        extractedData: {
          incident: {
            description: 'Incident involved vehicle ABC8888 hitting a pole.',
            location: 'Kuala Lumpur',
            date: '2024-01-01',
          },
          report_number: 'POL-999',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Inconsistent vehicle in report'],
  },
};

export const VEH_OWNER_MISMATCH: CheckScenario = {
  id: 'VEH-005',
  name: 'Vehicle Owner Mismatch',
  description: 'The owner of the vehicle in the VOC is not the policyholder.',
  mockData: {
    claim: {},
    documents: [
      {
        type: 'POLICY_DOCUMENT',
        extractedData: {
          policyholder: { name: 'John Doe', ic_number: '800101-14-1234' },
        },
      },
      {
        type: 'VEHICLE_REG_CARD',
        extractedData: {
          owner_name: 'Babu Bin Ali',
          owner_ic_number: '900101-10-5555',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Policyholder is not vehicle owner'],
  },
};

export const VEH_QUOTATION_VEHICLE_MISMATCH: CheckScenario = {
  id: 'VEH-006',
  name: 'Quotation Vehicle Mismatch',
  description: 'The vehicle details in the repair quotation do not match the insured vehicle.',
  mockData: {
    claim: {
      vehiclePlateNumber: 'WX1234',
    },
    documents: [
      {
        type: 'REPAIR_QUOTATION',
        extractedData: {
          vehicle: {
            registration_number: 'ABC8888',
            make: 'Toyota',
            model: 'Vios',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Quotation for different vehicle', 'Potential fraud'],
  },
};
