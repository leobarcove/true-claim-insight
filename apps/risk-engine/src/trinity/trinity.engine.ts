import { Injectable, Logger } from '@nestjs/common';
import {
  TrinityAuditReport,
  TrinityMatchResult,
  NRICSchema,
  PolicyDocumentSchema,
  VehicleRegistrationCardSchema,
  PoliceReportSchema,
  RepairQuotationSchema,
  DamagePhotoAnalysisSchema,
} from './schemas/doc-types';

@Injectable()
export class TrinityCheckEngine {
  private readonly logger = new Logger(TrinityCheckEngine.name);

  /**
   * Main entry point for auditing an Insurance Claim.
   */
  public auditClaim(data: {
    nric?: NRICSchema;
    policy?: PolicyDocumentSchema;
    registrationCard?: VehicleRegistrationCardSchema;
    policeReport?: PoliceReportSchema;
    repairQuotation?: RepairQuotationSchema;
    visualEvidence?: DamagePhotoAnalysisSchema[];
    claim?: any;
  }): TrinityAuditReport {
    const checks: Record<string, TrinityMatchResult> = {};
    const riskFactors: string[] = [];

    // --- C1. Identity Verification ---
    // 1. NRIC vs Policy Holder
    if (data.nric && data.policy) {
      const nricName = data.nric.full_name || '';
      const nricId = data.nric.ic_number || '';
      const policyHolderName = data.policy.policyholder?.name || '';
      const policyHolderId = data.policy.policyholder?.ic_number || '';

      checks['C1_IDENTITY_POLICY_MATCH'] = this.checkIdentityMatch(
        nricName,
        policyHolderName,
        nricId,
        policyHolderId
      );
    } else {
      checks['C1_IDENTITY_POLICY_MATCH'] = this.skipCheck(
        'C1_IDENTITY_POLICY_MATCH',
        'NRIC or Policy Document missing'
      );
    }

    // NRIC-DOB Consistency (ID-005)
    if (data.nric?.ic_number && data.nric?.date_of_birth) {
      const ic6 = data.nric.ic_number.substring(0, 6);
      const dob = data.nric.date_of_birth.replace(/-/g, '').substring(2); // YYMMDD
      const isMatch = ic6 === dob;
      checks['C1_NRIC_DOB_CONSISTENCY'] = {
        check_id: 'C1_NRIC_DOB_CONSISTENCY',
        is_pass: isMatch,
        confidence: 1.0,
        priority: 'HIGH',
        details: isMatch ? 'NRIC matches DOB' : `NRIC Prefix ${ic6} does not match DOB ${dob}`,
        status: 'RUN',
      };
    }

    // 2. NRIC vs Vehicle Owner (if Reg Card present)
    if (data.nric && data.registrationCard) {
      checks['C1_IDENTITY_OWNER_MATCH'] = this.checkNameMatch(
        data.nric.full_name || '',
        data.registrationCard.owner_name || '',
        'C1_IDENTITY_OWNER_MATCH'
      );
    } else {
      checks['C1_IDENTITY_OWNER_MATCH'] = this.skipCheck(
        'C1_IDENTITY_OWNER_MATCH',
        'NRIC or Registration Card missing'
      );
    }

    // 3. Unauthorized Driver (ID-002) - If complainant != policyholder, check if driver is named
    if (data.policeReport?.complainant && data.policy) {
      const compName = data.policeReport.complainant.name || '';
      const holderName = data.policy.policyholder?.name || '';
      if (this.fuzzyMatch(compName, holderName) < 0.8) {
        // Different person, check named drivers or insured person
        const insuredName = data.policy.insured_person?.name || '';
        const isAuthorized = this.fuzzyMatch(compName, insuredName) > 0.8;
        checks['C1_AUTHORIZED_DRIVER'] = {
          check_id: 'C1_AUTHORIZED_DRIVER',
          is_pass: isAuthorized,
          confidence: 0.9,
          priority: 'HIGH',
          details: isAuthorized
            ? 'Driver is authorized/named'
            : `Driver ${compName} is not the policyholder or named insured`,
          status: 'RUN',
        };
      }
    }

    // --- C2. Vehicle Verification ---

    // 4. Policy Vehicle vs Registration Card
    if (data.policy && data.registrationCard) {
      const policyPlate =
        data.policy.vehicle?.registration_number ||
        this.extractPlateFromText(data.policy.coverage?.description || '');
      const policyChassis = data.policy.vehicle?.chassis_number || '';
      const regPlate = data.registrationCard.registration_number || '';
      const regChassis = data.registrationCard.chassis_number || '';

      if (!policyPlate && !policyChassis) {
        checks['C2_VEHICLE_DETAILS_MATCH'] = this.skipCheck(
          'C2_VEHICLE_DETAILS_MATCH',
          'Vehicle details not found in Policy'
        );
      } else {
        checks['C2_VEHICLE_DETAILS_MATCH'] = this.checkVehicleDetails(
          policyPlate || '',
          regPlate,
          policyChassis,
          regChassis
        );
      }
    } else {
      checks['C2_VEHICLE_DETAILS_MATCH'] = this.skipCheck(
        'C2_VEHICLE_DETAILS_MATCH',
        'Policy or Reg Card missing'
      );
    }

    // Road Tax Validity (VEH-003)
    if (data.registrationCard?.road_tax_expiry && data.claim?.incidentDate) {
      const expiry = new Date(data.registrationCard.road_tax_expiry);
      const incident = new Date(data.claim.incidentDate);
      const isValid = expiry >= incident;
      checks['C2_ROAD_TAX_VALIDITY'] = {
        check_id: 'C2_ROAD_TAX_VALIDITY',
        is_pass: isValid,
        confidence: 1.0,
        priority: 'HIGH',
        details: isValid
          ? 'Road tax was valid'
          : `Road tax expired on ${expiry.toDateString()} (Incident: ${incident.toDateString()})`,
        status: 'RUN',
      };
    }

    // Vehicle Visual Match (VEH-001) - Match Photos/RegCard Make&Model
    if (data.visualEvidence?.length && data.registrationCard) {
      const regMake = (data.registrationCard.vehicle_make || '').toLowerCase();
      const photoMake = (data.visualEvidence[0].vehicle?.make || '').toLowerCase();
      const isMatch = regMake.includes(photoMake) || photoMake.includes(regMake);
      checks['C2_VEHICLE_VISUAL_MATCH'] = {
        check_id: 'C2_VEHICLE_VISUAL_MATCH',
        is_pass: isMatch,
        confidence: 0.7,
        priority: 'MEDIUM',
        details: isMatch
          ? 'Vehicle visual features match documentation'
          : `Visual Make (${photoMake}) mismatch with Reg Card (${regMake})`,
        status: 'RUN',
      };
    }

    // 5. Incident Vehicle vs Policy
    if (data.policeReport && data.policy) {
      // Try to extract plate from incident description if not explicit
      let incidentPlate = '';
      if (data.policeReport.incident?.description) {
        incidentPlate = this.extractPlateFromText(data.policeReport.incident.description);
      }

      const policyPlate =
        data.policy.vehicle?.registration_number ||
        this.extractPlateFromText(data.policy.coverage?.description || '');

      if (!incidentPlate) {
        checks['C2_INCIDENT_VEHICLE_MATCH'] = this.skipCheck(
          'C2_INCIDENT_VEHICLE_MATCH',
          'Vehicle number not found in Police Report'
        );
      } else if (!policyPlate) {
        checks['C2_INCIDENT_VEHICLE_MATCH'] = this.skipCheck(
          'C2_INCIDENT_VEHICLE_MATCH',
          'Vehicle number not found in Policy'
        );
      } else {
        checks['C2_INCIDENT_VEHICLE_MATCH'] = this.checkPlateMatch(
          incidentPlate,
          policyPlate,
          'C2_INCIDENT_VEHICLE_MATCH'
        );
      }
    } else {
      checks['C2_INCIDENT_VEHICLE_MATCH'] = this.skipCheck(
        'C2_INCIDENT_VEHICLE_MATCH',
        'Police Report or Policy missing'
      );
    }

    // --- C3. Incident Validity ---

    // 6. Incident Date vs Policy Period
    if (data.policeReport && data.policy) {
      const incidentDate = data.policeReport.incident?.date || data.policeReport.report_date || '';
      const policyStart = data.policy.effective_date || '';
      const policyEnd = data.policy.expiry_date || '';

      checks['C3_POLICY_ACTIVE_AT_INCIDENT'] = this.checkPolicyActiveDate(
        incidentDate,
        policyStart,
        policyEnd
      );
    } else {
      checks['C3_POLICY_ACTIVE_AT_INCIDENT'] = this.skipCheck(
        'C3_POLICY_ACTIVE_AT_INCIDENT',
        'Police Report or Policy dates missing'
      );
    }

    // Environment Consistency (LOG-005, LOG-006)
    if (data.policeReport?.incident && data.visualEvidence?.length) {
      const reportWeather = (data.policeReport.incident.weather || '').toLowerCase();
      const photoWeather = (data.visualEvidence[0].weather_condition || '').toLowerCase();
      if (reportWeather && photoWeather) {
        const isMatch =
          reportWeather.includes(photoWeather) || photoWeather.includes(reportWeather);
        checks['C3_ENVIRONMENT_CONSISTENCY'] = {
          check_id: 'C3_ENVIRONMENT_CONSISTENCY',
          is_pass: isMatch,
          confidence: 0.6,
          priority: 'MEDIUM',
          details: isMatch
            ? 'Weather conditions consistent'
            : `Weather mismatch: Report=${reportWeather}, Photos=${photoWeather}`,
          status: 'RUN',
        };
      }
    }

    // Police Report Signatures (LOG-008)
    if (data.policeReport?.signatures) {
      const sigs = data.policeReport.signatures;
      const isComplete = sigs.complainant_present && sigs.receiving_officer_present;
      checks['C3_POLICE_REPORT_SIGNATURES'] = {
        check_id: 'C3_POLICE_REPORT_SIGNATURES',
        is_pass: isComplete,
        confidence: 1.0,
        priority: 'MEDIUM',
        details: isComplete
          ? 'Mandatory signatures present'
          : 'Missing mandatory signatures on police report',
        status: 'RUN',
      };
    }

    // --- C4. Damage & Cost Analysis ---

    // 7. Repair amount vs Sum Insured
    if (data.repairQuotation && data.policy) {
      const repairAmount = data.repairQuotation.costs?.total_amount || 0;
      const sumInsured = data.policy.coverage?.sum_insured || 0;

      if (repairAmount > 0 && sumInsured > 0) {
        checks['C4_REPAIR_WITHIN_INSURED_SUM'] = this.checkRepairCost(repairAmount, sumInsured);
      } else {
        checks['C4_REPAIR_WITHIN_INSURED_SUM'] = this.skipCheck(
          'C4_REPAIR_WITHIN_INSURED_SUM',
          'Repair Amount or Sum Insured missing/zero'
        );
      }
    } else {
      checks['C4_REPAIR_WITHIN_INSURED_SUM'] = this.skipCheck(
        'C4_REPAIR_WITHIN_INSURED_SUM',
        'Quotation or Policy missing'
      );
    }

    // 8. Visual Damage Consistency (Vision vs Quotation)
    const hasPhotos =
      data.visualEvidence && Array.isArray(data.visualEvidence) && data.visualEvidence.length > 0;
    if (hasPhotos && data.repairQuotation) {
      checks['C4_VISUAL_DAMAGE_CONSISTENCY'] = this.checkVisualConsistency(
        data.visualEvidence!,
        data.repairQuotation
      );
    } else {
      checks['C4_VISUAL_DAMAGE_CONSISTENCY'] = this.skipCheck(
        'C4_VISUAL_DAMAGE_CONSISTENCY',
        'Photos or Quotation missing'
      );
    }

    // Airbag Deployment vs Severity Anomaly (LOG-007)
    if (data.visualEvidence?.length) {
      const photo = data.visualEvidence[0];
      const severity = photo.accident_context?.impact_severity;
      const airbag = photo.accident_context?.airbag_deployed;
      if (severity === 'SEVERE' && airbag === 'false') {
        checks['C4_AIRBAG_DEPLOYMENT_ANOMALY'] = {
          check_id: 'C4_AIRBAG_DEPLOYMENT_ANOMALY',
          is_pass: false,
          confidence: 0.8,
          priority: 'MEDIUM',
          details: 'Severe impact visible but airbags did not deploy',
          status: 'RUN',
        };
      }
    }

    // --- Aggregation ---
    const results = Object.values(checks);
    const criticalFails = results.filter(r => r.is_pass === false && r.priority === 'CRITICAL');
    const warnings = results.filter(r => r.is_pass === false && r.priority !== 'CRITICAL');
    const passed = results.filter(r => r.is_pass === true);

    let status: TrinityAuditReport['status'] = 'VERIFIED';
    let summary = 'Verification successful. All checks passed.';
    if (criticalFails.length > 0) {
      status = 'REJECTED';
      summary = `Critical Mismatches detected: ${criticalFails.map(f => f.check_id).join(', ')}`;
      riskFactors.push(...criticalFails.map(f => f.details));
    } else if (warnings.length > 0) {
      status = 'FLAGGED';
      summary = ` flagged for review: ${warnings.map(f => f.check_id).join(', ')}`;
      riskFactors.push(...warnings.map(f => f.details));
    } else if (results.every(r => r.status === 'SKIPPED')) {
      status = 'INCOMPLETE';
      summary = 'No valid cross-checks possible due to missing documents.';
    }

    // Simple Scoring Logic
    const totalRunnable = results.filter(r => r.status !== 'SKIPPED').length;
    const totalPassed = passed.length;
    const score = totalRunnable > 0 ? (totalPassed / totalRunnable) * 100 : 0;

    return {
      status,
      total_score: Math.round(score),
      checks,
      summary,
      risk_factors: riskFactors,
      verification_coverage: totalRunnable / results.length,
    };
  }

  // --- Helper Methods ---

  private fuzzyMatch(s1: string, s2: string): number {
    if (!s1 || !s2) return 0;
    const a = s1.toLowerCase().replace(/[^a-z0-9]/g, '');
    const b = s2.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (a === b) return 1.0;
    if (a.includes(b) || b.includes(a)) return 0.8;
    return 0.0;
  }

  private cleanPlate(plate: string): string {
    return plate ? plate.toUpperCase().replace(/\s+/g, '') : '';
  }

  private extractPlateFromText(text: string): string {
    // Basic regex for Malaysian plates (e.g., WA1234F, W1234A, ABC1234)
    // Matches 1-3 letters, 1-4 digits, optionally 1 letter
    const regex = /\b([A-Z]{1,3}\s?\d{1,4}\s?[A-Z]?)\b/i;
    const match = text.match(regex);
    return match ? this.cleanPlate(match[0]) : '';
  }

  // --- Check Logic ---

  private checkIdentityMatch(
    nameA: string,
    nameB: string,
    idA: string,
    idB: string
  ): TrinityMatchResult {
    const nameScore = this.fuzzyMatch(nameA, nameB);
    const idMatch = this.cleanPlate(idA) === this.cleanPlate(idB);

    const isPass = idMatch && nameScore > 0.7;

    return {
      check_id: 'C1_IDENTITY_POLICY_MATCH',
      is_pass: isPass,
      confidence: idMatch ? 1.0 : nameScore,
      priority: 'CRITICAL',
      details: `Name Match: ${Math.round(nameScore * 100)}%. ID Match: ${idMatch}. (${nameA} vs ${nameB})`,
      status: 'RUN',
    };
  }

  private checkNameMatch(nameA: string, nameB: string, checkId: string): TrinityMatchResult {
    const score = this.fuzzyMatch(nameA, nameB);
    return {
      check_id: checkId,
      is_pass: score > 0.75,
      confidence: score,
      priority: 'CRITICAL',
      details: `Name Similarity: ${Math.round(score * 100)}%. (${nameA} vs ${nameB})`,
      status: 'RUN',
    };
  }

  private checkVehicleDetails(
    plateA: string,
    plateB: string,
    chassisA: string,
    chassisB: string
  ): TrinityMatchResult {
    const pA = this.cleanPlate(plateA);
    const pB = this.cleanPlate(plateB);
    const cA = this.cleanPlate(chassisA);
    const cB = this.cleanPlate(chassisB);

    const plateMatch = pA === pB;
    const chassisMatch = cA === cB;

    let pass = plateMatch;
    if (cA && cB) pass = pass && chassisMatch; // Stricter if Chassis available

    return {
      check_id: 'C2_VEHICLE_DETAILS_MATCH',
      is_pass: pass,
      confidence: 1.0,
      priority: 'CRITICAL',
      details: `Plate Match: ${plateMatch} (${pA}). Chassis Match: ${chassisMatch} (${cA}).`,
      status: 'RUN',
    };
  }

  private checkPlateMatch(plateA: string, plateB: string, checkId: string): TrinityMatchResult {
    const pA = this.cleanPlate(plateA);
    const pB = this.cleanPlate(plateB);
    return {
      check_id: checkId,
      is_pass: pA === pB,
      confidence: 1.0,
      priority: 'CRITICAL',
      details: `Vehicle Number Match: ${pA} vs ${pB}`,
      status: 'RUN',
    };
  }

  private checkPolicyActiveDate(
    incidentDateStr: string,
    policyStart: string,
    policyEnd: string
  ): TrinityMatchResult {
    const incident = new Date(incidentDateStr);
    const start = new Date(policyStart);
    const end = new Date(policyEnd);

    if (isNaN(incident.getTime()) || isNaN(start.getTime()) || isNaN(end.getTime())) {
      return this.skipCheck('C3_POLICY_ACTIVE_AT_INCIDENT', 'Invalid date formats');
    }

    // Check inclusion
    const isValid = incident >= start && incident <= end;

    return {
      check_id: 'C3_POLICY_ACTIVE_AT_INCIDENT',
      is_pass: isValid,
      confidence: 1.0,
      priority: 'CRITICAL',
      details: `Incident (${incident.toDateString()}) within Policy Period (${start.toDateString()} - ${end.toDateString()})`,
      status: 'RUN',
    };
  }

  private checkRepairCost(repairAmount: number, sumInsured: number): TrinityMatchResult {
    const isPass = repairAmount <= sumInsured;
    const ratio = (repairAmount / sumInsured) * 100;

    return {
      check_id: 'C4_REPAIR_WITHIN_INSURED_SUM',
      is_pass: isPass,
      confidence: 1.0,
      variance: ratio,
      priority: 'HIGH',
      details: `Repair Estimate RM${repairAmount} is ${ratio.toFixed(1)}% of Sum Insured RM${sumInsured}.`,
      status: 'RUN',
    };
  }

  private checkVisualConsistency(
    photos: DamagePhotoAnalysisSchema[],
    quotation: RepairQuotationSchema
  ): TrinityMatchResult {
    // Collect all damaged parts mentioned in visual AI analysis
    const visuallyDamagedParts = new Set<string>();

    if (Array.isArray(photos)) {
      photos.forEach(p => {
        const areas = p.damage_assessment?.damaged_areas;
        if (Array.isArray(areas)) {
          areas.forEach(part => {
            if (part) visuallyDamagedParts.add(part.toLowerCase());
          });
        }
      });
    }

    // Collect quoted parts: support parts_list vs repairs.parts_items
    const partsItems = quotation.repairs?.parts_items;
    const quotedParts = Array.isArray(partsItems)
      ? partsItems.map(p => (p.description || '').toLowerCase())
      : [];

    let overlapCount = 0;
    for (const vPart of visuallyDamagedParts) {
      for (const qPart of quotedParts) {
        if (qPart && vPart && (qPart.includes(vPart) || vPart.includes(qPart))) {
          overlapCount++;
          break; // Count this visual part as covered
        }
      }
    }

    // If we detected damage but quote has nothing related?
    const coverageRatio =
      visuallyDamagedParts.size > 0 ? overlapCount / visuallyDamagedParts.size : 1;

    return {
      check_id: 'C4_VISUAL_DAMAGE_CONSISTENCY',
      is_pass: coverageRatio > 0.3, // Loose threshold
      confidence: 0.6, // Low confidence due to keyword matching
      priority: 'MEDIUM',
      details: `Visual AI detected: [${Array.from(visuallyDamagedParts).join(', ')}]. Quote overlaps: ${overlapCount} items. Consistency Score: ${coverageRatio.toFixed(2)}`,
      status: 'RUN',
    };
  }

  private skipCheck(id: string, reason: string): TrinityMatchResult {
    return {
      check_id: id,
      is_pass: null,
      confidence: 0,
      details: reason,
      priority: 'LOW',
      status: 'SKIPPED',
    };
  }
}
