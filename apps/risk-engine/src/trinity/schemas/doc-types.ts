export interface BaseDocumentSchema {
  confidence_score: number;
  authenticity?: {
    ai_generated: boolean;
    screen_capture: boolean;
    suspicious_elements: string[];
    potential_manipulation: string[];
  };
}

export interface NRICSchema extends BaseDocumentSchema {
  full_name?: string;
  ic_number?: string;
  address?: string;
  date_of_birth?: string;
  gender?: string;
  age?: number;
}

export interface PolicyDocumentSchema extends BaseDocumentSchema {
  insurer_name?: string;
  policy_number?: string;
  policy_status?: string;
  effective_date?: string;
  expiry_date?: string;
  policyholder?: {
    name?: string;
    ic_number?: string;
    address?: string;
    email?: string;
  };
  insured_person?: {
    name?: string;
    ic_number?: string;
    relationship_to_policyholder?: string;
    date_of_birth?: string;
  };
  coverage?: {
    sum_insured?: number;
    premium_amount?: number;
    description?: string; // Might contain vehicle info
  };
  vehicle?: {
    registration_number?: string;
    chassis_number?: string;
    make?: string;
    model?: string;
  };
}

export interface VehicleRegistrationCardSchema extends BaseDocumentSchema {
  registration_number?: string;
  owner_name?: string;
  owner_ic_number?: string;
  chassis_number?: string;
  engine_number?: string;
  vehicle_make?: string;
  vehicle_model?: string;
  year_of_manufacture?: string;
  road_tax_expiry?: string;
}

export interface PoliceReportSchema extends BaseDocumentSchema {
  report_number?: string;
  report_date?: string;
  incident?: {
    date?: string;
    time?: string;
    location?: string;
    description?: string; // Vehicle plate usually here
    weather?: string;
    road_surface?: string;
  };
  complainant?: {
    name?: string;
    ic_number?: string;
  };
  signatures?: {
    complainant_present: boolean;
    interpreter_present: boolean;
    receiving_officer_present: boolean;
  };
}

export interface RepairQuotationSchema extends BaseDocumentSchema {
  quotation_number?: string;
  quotation_date?: string;
  costs?: {
    total_amount?: number;
    subtotal_amount?: number;
  };
  repairs?: {
    parts_items?: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
    labor_items?: Array<{
      description: string;
      quantity: number;
      unit_price: number;
      total_price: number;
    }>;
  };
  vehicle?: {
    registration_number?: string;
    make?: string;
    model?: string;
    color?: string;
  };
}

export interface DamagePhotoAnalysisSchema extends BaseDocumentSchema {
  image_count?: number;
  damage_assessment?: {
    damaged_areas?: string[];
    damage_types?: string[];
    structural_damage_visible?: string;
  };
  vehicle?: {
    registration_number?: string;
    type?: string;
    make?: string;
    model?: string;
    color?: string;
  };
  environment?: {
    lighting_condition?: string;
    road_condition?: string;
  };
  weather_condition?: string;
  road_surface_condition?: string;
  accident_context?: {
    impact_severity?: string;
    airbag_deployed?: string;
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
