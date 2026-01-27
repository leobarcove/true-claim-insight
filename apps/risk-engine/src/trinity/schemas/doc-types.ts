export interface BaseDocumentSchema {
  confidence_score: number;
}

export interface NRICSchema extends BaseDocumentSchema {
  full_name: string;
  id_number: string;
  address?: string;
  date_of_birth?: string; // YYYY-MM-DD
  gender?: string;
}

export interface PolicyDocumentSchema extends BaseDocumentSchema {
  policy_number: string;
  policy_holder_name: string;
  policy_holder_nric: string;
  vehicle_plate_number: string;
  vehicle_chassis_number: string;
  vehicle_make_model: string;
  period_from: string; // YYYY-MM-DD
  period_to: string; // YYYY-MM-DD
  sum_insured: number;
  coverage_type: 'Comprehensive' | 'Third Party';
}

export interface VehicleRegistrationCardSchema extends BaseDocumentSchema {
  registration_number: string; // Plate
  owner_name: string;
  owner_nric: string;
  chassis_number: string;
  engine_number: string;
  make: string;
  model: string;
  manufacturing_year: string;
}

export interface PoliceReportSchema extends BaseDocumentSchema {
  report_number: string;
  report_date: string;
  incident_date_time: string;
  incident_location: string;
  complainant_name: string;
  complainant_nric: string;
  vehicle_number_involved: string;
  incident_description: string;
}

export interface RepairQuotationSchema extends BaseDocumentSchema {
  quotation_number: string;
  workshop_name: string;
  workshop_reg_no: string;
  vehicle_plate: string;
  total_parts_amount: number;
  total_labor_amount: number;
  total_amount: number;
  parts_list: Array<{
    item_name: string;
    quantity: number;
    price: number;
  }>;
}

export interface DamagePhotoAnalysisSchema extends BaseDocumentSchema {
  vehicle_detected: boolean;
  plate_number_visible?: string;
  damage_severity: 'Minor' | 'Moderate' | 'Severe';
  damage_location: string[]; // e.g., ["Front Bumper", "Headlight"]
  parts_to_replace: string[];
  estimated_cost_range?: {
    min: number;
    max: number;
  };
}

// Result Interface
export interface TrinityMatchResult {
  check_id: string;
  is_pass: boolean | null; // null = skipped
  confidence: number;
  variance?: number; // % difference or value difference
  details: string;
  priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'RUN' | 'SKIPPED' | 'ERROR';
}

export interface TrinityAuditReport {
  status: 'VERIFIED' | 'FLAGGED' | 'REJECTED' | 'INCOMPLETE';
  total_score: number; // 0-100
  checks: Record<string, TrinityMatchResult>;
  summary: string;
  risk_factors: string[];
  verification_coverage: number;
}
