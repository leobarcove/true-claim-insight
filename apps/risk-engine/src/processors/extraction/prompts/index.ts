import { MYKAD_PROMPT } from './mykad';
import { VEHICLE_REG_CARD_PROMPT } from './vehicle-reg';
import { POLICE_REPORT_PROMPT } from './police-report';
import { POLICY_DOCUMENT_PROMPT } from './policy';
import { REPAIR_QUOTATION_PROMPT } from './repair-quotation';
import { DAMAGE_PHOTO_PROMPT } from './damage-photo';
import { DocumentType } from '@tci/shared-types';

export const EXTRACTION_PROMPTS: Record<string, string> = {
  [DocumentType.MYKAD_FRONT]: MYKAD_PROMPT,
  [DocumentType.NRIC]: MYKAD_PROMPT,
  [DocumentType.VEHICLE_REG_CARD]: VEHICLE_REG_CARD_PROMPT,
  [DocumentType.POLICE_REPORT]: POLICE_REPORT_PROMPT,
  [DocumentType.POLICY_DOCUMENT]: POLICY_DOCUMENT_PROMPT,
  [DocumentType.REPAIR_QUOTATION]: REPAIR_QUOTATION_PROMPT,
  [DocumentType.DAMAGE_PHOTO]: DAMAGE_PHOTO_PROMPT,
};

export {
  MYKAD_PROMPT,
  VEHICLE_REG_CARD_PROMPT,
  POLICE_REPORT_PROMPT,
  POLICY_DOCUMENT_PROMPT,
  REPAIR_QUOTATION_PROMPT,
  DAMAGE_PHOTO_PROMPT,
};
