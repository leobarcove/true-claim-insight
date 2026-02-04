import { BaseNormalizer } from './base.normalized';
import { DocumentType } from '@tci/shared-types';

export class MyKadNormalizer extends BaseNormalizer<any> {
  normalize(raw: any) {
    if (!raw) return null;
    return {
      full_name: this.toString(raw.full_name),
      ic_number: this.toString(raw.ic_number),
      date_of_birth: this.toString(raw.date_of_birth),
      age: this.toInt(raw.age),
      gender: raw.gender === 'MALE' || raw.gender === 'FEMALE' ? raw.gender : null,
      citizenship: this.toString(raw.citizenship),
      origin: this.toString(raw.origin),
      religion: this.toString(raw.religion),
      address: this.toString(raw.address),
      city: this.toString(raw.city),
      state: this.toString(raw.state),
      postcode: this.toString(raw.postcode),
      authenticity: this.normalizeAuth(raw.authenticity),
      confidence_score: this.toFloat(raw.confidence_score),
    };
  }
}

export class VehicleRegNormalizer extends BaseNormalizer<any> {
  normalize(raw: any) {
    if (!raw) return null;
    return {
      registration_number: this.toString(raw.registration_number),
      owner_name: this.toString(raw.owner_name),
      owner_ic_number: this.toString(raw.owner_ic_number),
      owner_address: this.toString(raw.owner_address),
      vehicle_make: this.toString(raw.vehicle_make),
      vehicle_model: this.toString(raw.vehicle_model),
      engine_number: this.toString(raw.engine_number),
      chassis_number: this.toString(raw.chassis_number),
      engine_capacity_cc: this.toInt(raw.engine_capacity_cc),
      fuel_type: this.toString(raw.fuel_type),
      colour: this.toString(raw.colour),
      year_of_manufacture: this.toString(raw.year_of_manufacture),
      date_of_registration: this.toString(raw.date_of_registration),
      road_tax_expiry: this.toString(raw.road_tax_expiry),
      issuing_authority: this.toString(raw.issuing_authority),
      authenticity: this.normalizeAuth(raw.authenticity),
      confidence_score: this.toFloat(raw.confidence_score),
    };
  }
}

export class PoliceReportNormalizer extends BaseNormalizer<any> {
  normalize(raw: any) {
    if (!raw) return null;
    return {
      police_station: this.toString(raw.police_station),
      district: this.toString(raw.district),
      contingent: this.toString(raw.contingent),
      report_number: this.toString(raw.report_number),
      report_date: this.toString(raw.report_date),
      report_time: this.toString(raw.report_time),
      report_language: this.toString(raw.report_language),
      receiving_officer: raw.receiving_officer
        ? {
            name: this.toString(raw.receiving_officer.name),
            id: this.toString(raw.receiving_officer.id),
            rank: this.toString(raw.receiving_officer.rank),
          }
        : undefined,
      complainant: raw.complainant
        ? {
            name: this.toString(raw.complainant.name),
            ic_number: this.toString(raw.complainant.ic_number),
            gender: this.toString(raw.complainant.gender),
            date_of_birth: this.toString(raw.complainant.date_of_birth),
            age: this.toInt(raw.complainant.age),
            nationality: this.toString(raw.complainant.nationality),
            race: this.toString(raw.complainant.race),
            occupation: this.toString(raw.complainant.occupation),
            address: this.toString(raw.complainant.address),
            phone_home: this.toString(raw.complainant.phone_home),
            phone_mobile: this.toString(raw.complainant.phone_mobile),
            phone_office: this.toString(raw.complainant.phone_office),
          }
        : undefined,
      incident: raw.incident
        ? {
            description: this.toString(raw.incident.description),
            date: this.toString(raw.incident.date),
            time: this.toString(raw.incident.time),
            location: this.toString(raw.incident.location),
            weather: this.toString(raw.incident.weather),
            road_surface: this.toString(raw.incident.road_surface),
          }
        : undefined,
      laws_referenced: Array.isArray(raw.laws_referenced)
        ? raw.laws_referenced.map((l: any) => String(l))
        : [],
      signatures: raw.signatures
        ? {
            complainant_present: this.toBool(raw.signatures.complainant_present),
            interpreter_present: this.toBool(raw.signatures.interpreter_present),
            receiving_officer_present: this.toBool(raw.signatures.receiving_officer_present),
          }
        : undefined,
      authenticity: this.normalizeAuth(raw.authenticity),
      confidence_score: this.toFloat(raw.confidence_score),
    };
  }
}

export class PolicyDocumentNormalizer extends BaseNormalizer<any> {
  normalize(raw: any) {
    if (!raw) return null;
    return {
      insurer_name: this.toString(raw.insurer_name),
      insurer_registration_number: this.toString(raw.insurer_registration_number),
      policy_type: this.toString(raw.policy_type),
      policy_number: this.toString(raw.policy_number),
      policy_status: this.toString(raw.policy_status),
      issue_date: this.toString(raw.issue_date),
      effective_date: this.toString(raw.effective_date),
      expiry_date: this.toString(raw.expiry_date),
      policy_currency: this.toString(raw.policy_currency),
      policy_language: this.toString(raw.policy_language),
      policyholder: raw.policyholder
        ? {
            name: this.toString(raw.policyholder.name),
            ic_number: this.toString(raw.policyholder.ic_number),
            date_of_birth: this.toString(raw.policyholder.date_of_birth),
            gender: this.toString(raw.policyholder.gender),
            nationality: this.toString(raw.policyholder.nationality),
            address: this.toString(raw.policyholder.address),
            phone: this.toString(raw.policyholder.phone),
            email: this.toString(raw.policyholder.email),
          }
        : undefined,
      insured_person: raw.insured_person
        ? {
            name: this.toString(raw.insured_person.name),
            ic_number: this.toString(raw.insured_person.ic_number),
            relationship_to_policyholder: this.toString(
              raw.insured_person.relationship_to_policyholder
            ),
            date_of_birth: this.toString(raw.insured_person.date_of_birth),
          }
        : undefined,
      coverage: raw.coverage
        ? {
            sum_insured: this.toFloat(raw.coverage.sum_insured),
            premium_amount: this.toFloat(raw.coverage.premium_amount),
            premium_frequency: this.toString(raw.coverage.premium_frequency),
            description: this.toString(raw.coverage.description),
            riders: Array.isArray(raw.coverage.riders)
              ? raw.coverage.riders.map((r: any) => String(r))
              : [],
            exclusions: Array.isArray(raw.coverage.exclusions)
              ? raw.coverage.exclusions.map((e: any) => String(e))
              : [],
          }
        : undefined,
      nominee: raw.nominee
        ? {
            name: this.toString(raw.nominee.name),
            relationship: this.toString(raw.nominee.relationship),
            percentage: this.toString(raw.nominee.percentage),
          }
        : undefined,
      authenticity: this.normalizeAuth(raw.authenticity),
      confidence_score: this.toFloat(raw.confidence_score),
    };
  }
}

export class RepairQuotationNormalizer extends BaseNormalizer<any> {
  normalize(raw: any) {
    if (!raw) return null;
    return {
      quotation_number: this.toString(raw.quotation_number),
      quotation_date: this.toString(raw.quotation_date),
      quotation_valid_until: this.toString(raw.quotation_valid_until),
      document_language: this.toString(raw.document_language),
      workshop: raw.workshop
        ? {
            name: this.toString(raw.workshop.name),
            registration_number: this.toString(raw.workshop.registration_number),
            address: this.toString(raw.workshop.address),
            phone: this.toString(raw.workshop.phone),
            email: this.toString(raw.workshop.email),
          }
        : undefined,
      customer: raw.customer
        ? {
            name: this.toString(raw.customer.name),
            ic_number: this.toString(raw.customer.ic_number),
            phone: this.toString(raw.customer.phone),
            address: this.toString(raw.customer.address),
          }
        : undefined,
      vehicle: raw.vehicle
        ? {
            registration_number: this.toString(raw.vehicle.registration_number),
            make: this.toString(raw.vehicle.make),
            model: this.toString(raw.vehicle.model),
            year: this.toString(raw.vehicle.year),
            engine_number: this.toString(raw.vehicle.engine_number),
            chassis_number: this.toString(raw.vehicle.chassis_number),
            mileage: this.toString(raw.vehicle.mileage),
          }
        : undefined,
      repairs: raw.repairs
        ? {
            description: this.toString(raw.repairs.description),
            labor_items: Array.isArray(raw.repairs.labor_items)
              ? raw.repairs.labor_items.map((item: any) => ({
                  description: this.toString(item.description),
                  quantity: this.toInt(item.quantity),
                  unit_price: this.toFloat(item.unit_price),
                  total_price: this.toFloat(item.total_price),
                }))
              : [],
            parts_items: Array.isArray(raw.repairs.parts_items)
              ? raw.repairs.parts_items.map((item: any) => ({
                  description: this.toString(item.description),
                  quantity: this.toInt(item.quantity),
                  unit_price: this.toFloat(item.unit_price),
                  total_price: this.toFloat(item.total_price),
                }))
              : [],
          }
        : undefined,
      costs: raw.costs
        ? {
            subtotal_amount: this.toFloat(raw.costs.subtotal_amount),
            discount_amount: this.toFloat(raw.costs.discount_amount),
            tax_type: this.toString(raw.costs.tax_type),
            tax_amount: this.toFloat(raw.costs.tax_amount),
            total_amount: this.toFloat(raw.costs.total_amount),
          }
        : undefined,
      authenticity: this.normalizeAuth(raw.authenticity),
      confidence_score: this.toFloat(raw.confidence_score),
    };
  }
}

export class DamagePhotoNormalizer extends BaseNormalizer<any> {
  normalize(raw: any) {
    if (!raw) return null;
    return {
      image_count: this.toInt(raw.image_count),
      image_quality: this.toString(raw.image_quality),
      analysis_confidence: this.toString(raw.analysis_confidence),
      vehicle: raw.vehicle
        ? {
            type: this.toString(raw.vehicle.type),
            registration_number: this.toString(raw.vehicle.registration_number),
            make: this.toString(raw.vehicle.make),
            model: this.toString(raw.vehicle.model),
            color: this.toString(raw.vehicle.color),
          }
        : undefined,
      accident_context: raw.accident_context
        ? {
            collision_type: this.toString(raw.accident_context.collision_type),
            impact_severity: this.toString(raw.accident_context.impact_severity),
            estimated_drivable: this.toString(raw.accident_context.estimated_drivable),
            airbag_deployed: this.toString(raw.accident_context.airbag_deployed),
          }
        : undefined,
      damage_assessment: raw.damage_assessment
        ? {
            damaged_areas: Array.isArray(raw.damage_assessment.damaged_areas)
              ? raw.damage_assessment.damaged_areas.map((a: any) => String(a))
              : [],
            damage_types: Array.isArray(raw.damage_assessment.damage_types)
              ? raw.damage_assessment.damage_types.map((t: any) => String(t))
              : [],
            structural_damage_visible: this.toString(
              raw.damage_assessment.structural_damage_visible
            ),
            glass_damage_present: this.toBool(raw.damage_assessment.glass_damage_present),
            tire_damage_present: this.toBool(raw.damage_assessment.tire_damage_present),
            fluid_leak_visible: this.toString(raw.damage_assessment.fluid_leak_visible),
          }
        : undefined,
      environment: raw.environment
        ? {
            location_type: this.toString(raw.environment.location_type),
            road_condition: this.toString(raw.environment.road_condition),
            lighting_condition: this.toString(raw.environment.lighting_condition),
            surrounding_objects: Array.isArray(raw.environment.surrounding_objects)
              ? raw.environment.surrounding_objects.map((o: any) => String(o))
              : [],
          }
        : undefined,
      special_observations: raw.special_observations
        ? {
            motorcycle_helmet_visible: this.toString(
              raw.special_observations.motorcycle_helmet_visible
            ),
            number_of_vehicles_involved: this.toInt(
              raw.special_observations.number_of_vehicles_involved
            ),
            fire_or_smoke_visible: this.toBool(raw.special_observations.fire_or_smoke_visible),
            emergency_services_visible: this.toBool(
              raw.special_observations.emergency_services_visible
            ),
          }
        : undefined,
      weather_condition: this.toString(raw.weather_condition),
      road_surface_condition: this.toString(raw.road_surface_condition),
      authenticity: this.normalizeAuth(raw.authenticity),
      confidence_score: this.toFloat(raw.confidence_score),
    };
  }
}

const normalizers: Record<string, any> = {
  [DocumentType.MYKAD_FRONT]: new MyKadNormalizer(),
  [DocumentType.NRIC]: new MyKadNormalizer(),
  [DocumentType.VEHICLE_REG_CARD]: new VehicleRegNormalizer(),
  [DocumentType.POLICE_REPORT]: new PoliceReportNormalizer(),
  [DocumentType.REPAIR_QUOTATION]: new RepairQuotationNormalizer(),
  [DocumentType.DAMAGE_PHOTO]: new DamagePhotoNormalizer(),
  [DocumentType.POLICY_DOCUMENT]: new PolicyDocumentNormalizer(),
};

export function getNormalizer(type: string) {
  return normalizers[type];
}
