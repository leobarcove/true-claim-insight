import { CheckScenario } from './base.check';

export const LOG_PHYSICS_MISMATCH: CheckScenario = {
  id: 'LOG-002',
  name: 'Physics Mismatch (Rear vs Front)',
  description: 'Claim says rear-ended, photos show front damage.',
  mockData: {
    claim: {
      description: 'I was rear-ended at a traffic light.',
    },
    documents: [
      {
        type: 'POLICE_REPORT',
        extractedData: {
          incident: { description: 'Vehicle was hit from behind.' },
        },
      },
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          damage_assessment: {
            damaged_areas: ['front_bumper', 'bonnet'],
            damage_types: ['crush'],
            structural_damage_visible: 'YES',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Inconsistent damage location', 'Physics mismatch'],
  },
};

export const LOG_TIME_TRAVEL: CheckScenario = {
  id: 'LOG-001',
  name: 'Time Travel (Policy Check)',
  description: 'Accident happened before policy effective date.',
  mockData: {
    claim: {
      incidentDate: '2024-01-01',
    },
    documents: [
      {
        type: 'POLICY_DOCUMENT',
        extractedData: {
          effective_date: '2024-02-01',
          expiry_date: '2025-02-01',
        },
      },
      {
        type: 'POLICE_REPORT',
        extractedData: {
          incident: { date: '2024-01-01' },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Accident outside policy period'],
  },
};

export const LOG_METADATA_MISMATCH: CheckScenario = {
  id: 'LOG-003',
  name: 'Metadata Time Travel',
  description: 'Photo metadata indicates it was taken before the incident occurred.',
  mockData: {
    claim: {
      incidentDate: '2024-05-20',
    },
    documents: [
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          metadata: {
            date_created: '2024-05-19',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'REJECT',
    redFlags: ['Photo taken before accident', 'Metadata inconsistency'],
  },
};

export const LOG_GPS_MISMATCH: CheckScenario = {
  id: 'LOG-004',
  name: 'GPS Location Mismatch',
  description: 'Photo GPS coordinates do not match the reported incident location.',
  mockData: {
    claim: {
      location: 'Kuala Lumpur',
    },
    documents: [
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          environment: {
            location_type: 'URBAN',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Location mismatch'],
  },
};

export const LOG_ENVIRONMENT_MISMATCH: CheckScenario = {
  id: 'LOG-005',
  name: 'Environmental Anomaly',
  description: 'Incident at "2:00 PM" (Day) but Photos show "Night".',
  mockData: {
    claim: {
      incidentTime: '14:00',
    },
    documents: [
      {
        type: 'POLICE_REPORT',
        extractedData: {
          report_time: '14:30',
          incident: { time: '14:00' },
        },
      },
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          environment: {
            lighting_condition: 'NIGHT_WITHOUT_STREET_LIGHTS',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Lighting condition mismatch'],
  },
};

export const LOG_WEATHER_MISMATCH: CheckScenario = {
  id: 'LOG-006',
  name: 'Weather Anomaly',
  description: 'Report says "Raining" but Photos show dry road.',
  mockData: {
    claim: {
      weather: 'RAINING',
    },
    documents: [
      {
        type: 'POLICE_REPORT',
        extractedData: {
          incident: { description: 'It was raining heavily.' },
          weather_condition: 'HEAVY_RAIN',
        },
      },
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          weather_condition: 'SUNNY',
          road_surface_condition: 'DRY',
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Weather condition mismatch'],
  },
};

export const LOG_AIRBAG_MISMATCH: CheckScenario = {
  id: 'LOG-007',
  name: 'Airbag Deployment Inconsistency',
  description: 'Severe impact reported/visible but airbags did not deploy.',
  mockData: {
    claim: {},
    documents: [
      {
        type: 'DAMAGE_PHOTO',
        extractedData: {
          accident_context: {
            impact_severity: 'SEVERE',
            airbag_deployed: 'NO',
          },
          damage_assessment: {
            structural_damage_visible: 'YES',
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Airbag deployment anomaly', 'Potential non-original vehicle parts'],
  },
};

export const LOG_SIGNATURE_MISSING: CheckScenario = {
  id: 'LOG-008',
  name: 'Missing Signatures',
  description: 'The police report is missing mandatory signatures.',
  mockData: {
    claim: {},
    documents: [
      {
        type: 'POLICE_REPORT',
        extractedData: {
          signatures: {
            complainant_present: true,
            interpreter_present: false,
            receiving_officer_present: false,
          },
        },
      },
    ],
  },
  expectedResult: {
    recommendation: 'INVESTIGATE',
    redFlags: ['Missing officer signature', 'Incomplete document'],
  },
};
