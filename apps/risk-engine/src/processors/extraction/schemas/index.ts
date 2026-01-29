import { z } from 'zod';

export const MyKadSchema = z.object({
  full_name: z.string().nullable(),
  ic_number: z.string().nullable(),
  date_of_birth: z.string().nullable(),
  age: z.number().nullable(),
  gender: z.enum(['MALE', 'FEMALE']).nullable(),
  citizenship: z.string().nullable(),
  origin: z.string().nullable(),
  religion: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  state: z.string().nullable(),
  postcode: z.string().nullable(),
  place_of_birth: z.string().nullable(),
  issue_date: z.string().nullable(),
  confidence_score: z.number().default(0),
});

export const VehicleRegCardSchema = z.object({
  registration_number: z.string().nullable(),
  owner_name: z.string().nullable(),
  owner_ic_number: z.string().nullable(),
  owner_address: z.string().nullable(),
  vehicle_make: z.string().nullable(),
  vehicle_model: z.string().nullable(),
  vehicle_type: z.string().nullable(),
  engine_number: z.string().nullable(),
  chassis_number: z.string().nullable(),
  engine_capacity_cc: z.number().nullable(),
  fuel_type: z.string().nullable(),
  colour: z.string().nullable(),
  year_of_manufacture: z.string().nullable(),
  date_of_registration: z.string().nullable(),
  road_tax_expiry: z.string().nullable(),
  issuing_authority: z.string().nullable(),
  confidence_score: z.number().default(0),
});

export const PoliceReportSchema = z.object({
  police_station: z.string().nullable(),
  district: z.string().nullable(),
  contingent: z.string().nullable(),
  report_number: z.string().nullable(),
  report_date: z.string().nullable(),
  report_time: z.string().nullable(),
  report_language: z.string().nullable(),
  receiving_officer: z
    .object({
      name: z.string().nullable(),
      id: z.string().nullable(),
      rank: z.string().nullable(),
      signature_present: z.boolean().default(false),
    })
    .optional(),
  complainant: z
    .object({
      name: z.string().nullable(),
      ic_number: z.string().nullable(),
      gender: z.string().nullable(),
      date_of_birth: z.string().nullable(),
      age: z.number().nullable(),
      nationality: z.string().nullable(),
      race: z.string().nullable(),
      occupation: z.string().nullable(),
      address: z.string().nullable(),
      phone_home: z.string().nullable(),
      phone_mobile: z.string().nullable(),
      phone_office: z.string().nullable(),
      signature_present: z.boolean().default(false),
    })
    .optional(),
  incident: z
    .object({
      description: z.string().nullable(),
      date: z.string().nullable(),
      time: z.string().nullable(),
      location: z.string().nullable(),
    })
    .optional(),
  laws_referenced: z.array(z.string()).default([]),
  signatures: z
    .object({
      receiving_officer_signature_present: z.boolean().default(false),
      complainant_signature_present: z.boolean().default(false),
    })
    .optional(),
  confidence_score: z.number().default(0),
});

export const PolicyDocumentSchema = z.object({
  insurer_name: z.string().nullable(),
  insurer_registration_number: z.string().nullable(),
  policy_type: z.string().nullable(),
  policy_number: z.string().nullable(),
  policy_status: z.string().nullable(),
  issue_date: z.string().nullable(),
  effective_date: z.string().nullable(),
  expiry_date: z.string().nullable(),
  policy_currency: z.string().nullable(),
  policy_language: z.string().nullable(),
  policyholder: z
    .object({
      name: z.string().nullable(),
      ic_number: z.string().nullable(),
      date_of_birth: z.string().nullable(),
      gender: z.string().nullable(),
      nationality: z.string().nullable(),
      address: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    })
    .optional(),
  insured_person: z
    .object({
      name: z.string().nullable(),
      ic_number: z.string().nullable(),
      relationship_to_policyholder: z.string().nullable(),
      date_of_birth: z.string().nullable(),
    })
    .optional(),
  coverage: z
    .object({
      sum_insured: z.union([z.number(), z.string()]).nullable(),
      premium_amount: z.union([z.number(), z.string()]).nullable(),
      premium_frequency: z.string().nullable(),
      description: z.string().nullable(),
      riders: z.array(z.string()).default([]),
      exclusions: z.array(z.string()).default([]),
    })
    .optional(),
  nominee: z
    .object({
      name: z.string().nullable(),
      relationship: z.string().nullable(),
      percentage: z.string().nullable(),
    })
    .optional(),
  confidence_score: z.number().default(0),
});

export const RepairQuotationSchema = z.object({
  quotation_number: z.string().nullable(),
  quotation_date: z.string().nullable(),
  quotation_valid_until: z.string().nullable(),
  document_language: z.string().nullable(),
  workshop: z
    .object({
      name: z.string().nullable(),
      registration_number: z.string().nullable(),
      address: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    })
    .optional(),
  customer: z
    .object({
      name: z.string().nullable(),
      ic_number: z.string().nullable(),
      phone: z.string().nullable(),
      address: z.string().nullable(),
    })
    .optional(),
  vehicle: z
    .object({
      registration_number: z.string().nullable(),
      make: z.string().nullable(),
      model: z.string().nullable(),
      year: z.string().nullable(),
      engine_number: z.string().nullable(),
      chassis_number: z.string().nullable(),
      mileage: z.string().nullable(),
    })
    .optional(),
  repairs: z
    .object({
      description: z.string().nullable(),
      labor_items: z.array(z.any()).default([]),
      parts_items: z.array(z.any()).default([]),
    })
    .optional(),
  costs: z
    .object({
      subtotal_amount: z.union([z.number(), z.string()]).nullable(),
      discount_amount: z.union([z.number(), z.string()]).nullable(),
      tax_type: z.string().nullable(),
      tax_amount: z.union([z.number(), z.string()]).nullable(),
      total_amount: z.union([z.number(), z.string()]).nullable(),
    })
    .optional(),
  confidence_score: z.number().default(0),
});

export const DamagePhotoSchema = z.object({
  image_count: z.number().default(0),
  image_quality: z.string().nullable(),
  analysis_confidence: z.string().nullable(),
  vehicle: z
    .object({
      type: z.string().nullable(),
      registration_number: z.string().nullable(),
      make: z.string().nullable(),
      model: z.string().nullable(),
      color: z.string().nullable(),
    })
    .optional(),
  accident_context: z
    .object({
      collision_type: z.string().nullable(),
      impact_severity: z.string().nullable(),
      estimated_drivable: z.string().nullable(),
      airbag_deployed: z.string().nullable(),
    })
    .optional(),
  damage_assessment: z
    .object({
      damaged_areas: z.array(z.string()).default([]),
      damage_types: z.array(z.string()).default([]),
      structural_damage_visible: z.string().nullable(),
      glass_damage_present: z.boolean().default(false),
      tire_damage_present: z.boolean().default(false),
      fluid_leak_visible: z.string().nullable(),
    })
    .optional(),
  environment: z
    .object({
      location_type: z.string().nullable(),
      road_condition: z.string().nullable(),
      lighting_condition: z.string().nullable(),
      surrounding_objects: z.array(z.string()).default([]),
    })
    .optional(),
  special_observations: z
    .object({
      motorcycle_helmet_visible: z.string().nullable(),
      number_of_vehicles_involved: z.number().nullable(),
      fire_or_smoke_visible: z.boolean().default(false),
      emergency_services_visible: z.boolean().default(false),
    })
    .optional(),
  confidence_score: z.number().default(0),
});
