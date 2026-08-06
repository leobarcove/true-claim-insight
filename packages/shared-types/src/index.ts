// ============================================
// Augmented Adjusting - Shared Types
// ============================================

// ============ ENUMS ============

export enum TenantType {
  ADJUSTING_FIRM = 'ADJUSTING_FIRM',
  INSURER = 'INSURER',
}

export enum SubscriptionTier {
  BASIC = 'BASIC',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum AdjusterStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
}

export enum KycStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

export enum ClaimType {
  OWN_DAMAGE = 'OWN_DAMAGE',
  THIRD_PARTY_PROPERTY = 'THIRD_PARTY_PROPERTY',
  THIRD_PARTY_INJURY = 'THIRD_PARTY_INJURY',
  THEFT = 'THEFT',
  WINDSCREEN = 'WINDSCREEN',
}

// Coarse-grained category drives polymorphic sub-tables, evidence checklists,
// and which FraudSignalProvider plugins apply.
export enum ClaimCategory {
  MOTOR = 'MOTOR',
  FLOOD = 'FLOOD',
  FIRE = 'FIRE',
  LIGHTNING = 'LIGHTNING',
  BURGLARY = 'BURGLARY',
  PERSONAL_ACCIDENT = 'PERSONAL_ACCIDENT',
  HOH = 'HOH',
  TRAVEL = 'TRAVEL',
  OTHER = 'OTHER',
}

// Travel-specific subtype — only meaningful when category=TRAVEL.
// Exactly the five categories agreed for the MSIG TPA scope.
export enum TravelClaimType {
  FLIGHT_DELAY = 'FLIGHT_DELAY',
  LUGGAGE_DAMAGE = 'LUGGAGE_DAMAGE',
  LUGGAGE_LOSS = 'LUGGAGE_LOSS',
  TRIP_CANCELLATION = 'TRIP_CANCELLATION',
  MEDICAL = 'MEDICAL',
}

// Pre-claim intake (Case) lifecycle. Cases are TPA-internal vetting records;
// conversion creates the insurer-facing Claim.
export enum CaseStatus {
  DRAFT = 'DRAFT',
  IN_PROGRESS = 'IN_PROGRESS',
  SUBMITTED = 'SUBMITTED',
  UNDER_REVIEW = 'UNDER_REVIEW',
  INFO_REQUESTED = 'INFO_REQUESTED',
  REFERRED_TO_EXPERT = 'REFERRED_TO_EXPERT',
  CONVERTED = 'CONVERTED',
  REJECTED = 'REJECTED',
  ABANDONED = 'ABANDONED',
}

export enum CaseChannel {
  WEB_CHAT = 'WEB_CHAT',
  STAFF = 'STAFF',
  EMAIL = 'EMAIL',
  WHATSAPP = 'WHATSAPP',
}

export enum CaseInitiator {
  CLAIMANT = 'CLAIMANT',
  STAFF = 'STAFF',
  SYSTEM = 'SYSTEM',
}

export enum PolicySource {
  MANUAL = 'MANUAL',
  API = 'API',
  FILE_FEED = 'FILE_FEED',
}

export enum DocumentValidationStatus {
  PENDING = 'PENDING',
  PASSED = 'PASSED',
  FLAGGED = 'FLAGGED',
  SKIPPED = 'SKIPPED',
}

export enum FloodSource {
  RIVER_OVERFLOW = 'RIVER_OVERFLOW',
  FLASH_FLOOD = 'FLASH_FLOOD',
  COASTAL_SURGE = 'COASTAL_SURGE',
  DRAINAGE_FAILURE = 'DRAINAGE_FAILURE',
  RAINWATER_INGRESS = 'RAINWATER_INGRESS',
  DAM_RELEASE = 'DAM_RELEASE',
  UNKNOWN = 'UNKNOWN',
}

export enum PropertyType {
  RESIDENTIAL = 'RESIDENTIAL',
  COMMERCIAL = 'COMMERCIAL',
  INDUSTRIAL = 'INDUSTRIAL',
  MIXED_USE = 'MIXED_USE',
  AGRICULTURAL = 'AGRICULTURAL',
  OTHER = 'OTHER',
}

export enum FraudCategory {
  PARAMETRIC = 'PARAMETRIC',
  IDENTITY = 'IDENTITY',
  BEHAVIOURAL = 'BEHAVIOURAL',
  DOCUMENT = 'DOCUMENT',
  NETWORK = 'NETWORK',
  ENVIRONMENTAL = 'ENVIRONMENTAL',
  INVENTORY = 'INVENTORY',
  POLICY = 'POLICY',
}

export enum SignalSeverity {
  INFO = 'INFO',
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

export interface FloodClaim {
  id: string;
  claimId: string;
  tenantId?: string;
  incidentStart: string;
  incidentEnd?: string;
  waterDepthCm?: number;
  durationHours?: number;
  source?: FloodSource;
  propertyType?: PropertyType;
  propertyFloorLevel?: number;
  propertyElevationMeters?: number;
  postcode?: string;
  state?: string;
  parametricTriggerMet?: boolean;
  metMalaysiaEventRef?: string;
  jpsGaugeId?: string;
  buildingDamageRm?: number | string;
  contentsDamageRm?: number | string;
  vehicleDamageRm?: number | string;
  createdAt: string;
  updatedAt: string;
}

export interface FraudSignal {
  id: string;
  claimId: string;
  provider: string;
  category: FraudCategory;
  signalType: string;
  severity: SignalSeverity;
  confidence: number;
  message?: string;
  rawData?: Record<string, unknown>;
  createdAt: string;
}

export interface EvidenceRequirementResolved {
  documentType: string;
  isMandatory: boolean;
  description?: string;
  sortOrder: number;
  satisfied: boolean;
  uploaded: Array<{
    id: string;
    type: string;
    filename: string;
    createdAt: string;
  }>;
}

export enum ClaimStatus {
  SUBMITTED = 'SUBMITTED',
  DOCUMENTS_PENDING = 'DOCUMENTS_PENDING',
  PENDING_ASSIGNMENT = 'PENDING_ASSIGNMENT',
  ASSIGNED = 'ASSIGNED',
  SCHEDULED = 'SCHEDULED',
  IN_ASSESSMENT = 'IN_ASSESSMENT',
  REPORT_PENDING = 'REPORT_PENDING',
  UNDER_REVIEW = 'UNDER_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ESCALATED_SIU = 'ESCALATED_SIU',
  CLOSED = 'CLOSED',
}

/**
 * How a claim is examined. Chosen by the assessment-mode router from value,
 * complexity and fraud signal (MASTER_PLAN §2.4) — the per-claim COGS ceiling
 * in §2.5 depends on most claims landing on DESK_REVIEW.
 *
 * Mirrors the `AssessmentMode` enum in the Prisma schema.
 */
export enum AssessmentMode {
  /** Documents only, no interview — the fast track. */
  DESK_REVIEW = 'DESK_REVIEW',
  VIDEO = 'VIDEO',
  SITE_VISIT = 'SITE_VISIT',
  EXPERT_REFERRAL = 'EXPERT_REFERRAL',
}

export const ASSESSMENT_MODE_LABELS: Record<AssessmentMode, string> = {
  [AssessmentMode.DESK_REVIEW]: 'Desk review',
  [AssessmentMode.VIDEO]: 'Video assessment',
  [AssessmentMode.SITE_VISIT]: 'Site visit',
  [AssessmentMode.EXPERT_REFERRAL]: 'Expert referral',
};

export enum Priority {
  LOW = 'LOW',
  NORMAL = 'NORMAL',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum SessionStatus {
  SCHEDULED = 'SCHEDULED',
  WAITING = 'WAITING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
}

export enum AssessmentType {
  VOICE_ANALYSIS = 'VOICE_ANALYSIS',
  VISUAL_MODERATION = 'VISUAL_MODERATION',
  ATTENTION_TRACKING = 'ATTENTION_TRACKING',
  DEEPFAKE_CHECK = 'DEEPFAKE_CHECK',
}

export enum RiskScore {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum DocumentType {
  DAMAGE_PHOTO = 'DAMAGE_PHOTO',
  POLICE_REPORT = 'POLICE_REPORT',
  DRIVING_LICENCE = 'DRIVING_LICENCE',
  ASSESSMENT_REPORT = 'ASSESSMENT_REPORT',
  SIGNED_STATEMENT = 'SIGNED_STATEMENT',
  MYKAD_FRONT = 'MYKAD_FRONT',
  VEHICLE_REG_CARD = 'VEHICLE_REG_CARD',
  REPAIR_QUOTATION = 'REPAIR_QUOTATION',
  POLICY_DOCUMENT = 'POLICY_DOCUMENT',
  NRIC = 'NRIC',
  OTHER_DOCUMENT = 'OTHER_DOCUMENT',
  CLAIMANT_SCREENSHOT = 'CLAIMANT_SCREENSHOT',
  // Non-motor evidence types
  BOMBA_REPORT = 'BOMBA_REPORT',
  FLOOD_AUTHORITY_REPORT = 'FLOOD_AUTHORITY_REPORT',
  WEATHER_REPORT = 'WEATHER_REPORT',
  UTILITY_SURGE_REPORT = 'UTILITY_SURGE_REPORT',
  INVENTORY_LIST = 'INVENTORY_LIST',
  PROOF_OF_OWNERSHIP = 'PROOF_OF_OWNERSHIP',
  MEDICAL_REPORT = 'MEDICAL_REPORT',
  PROPERTY_TITLE = 'PROPERTY_TITLE',
  UTILITY_BILL = 'UTILITY_BILL',
  // Travel evidence types
  BOARDING_PASS = 'BOARDING_PASS',
  FLIGHT_ITINERARY = 'FLIGHT_ITINERARY',
  AIRLINE_DELAY_CONFIRMATION = 'AIRLINE_DELAY_CONFIRMATION',
  PROPERTY_IRREGULARITY_REPORT = 'PROPERTY_IRREGULARITY_REPORT',
  BAGGAGE_TAG = 'BAGGAGE_TAG',
  PASSPORT = 'PASSPORT',
  OVERSEAS_MEDICAL_BILL = 'OVERSEAS_MEDICAL_BILL',
  TRAVEL_BOOKING_INVOICE = 'TRAVEL_BOOKING_INVOICE',
}

export enum DocumentStatus {
  QUEUED = 'QUEUED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum ActorType {
  CLAIMANT = 'CLAIMANT',
  ADJUSTER = 'ADJUSTER',
  FIRM_ADMIN = 'FIRM_ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
  SIU_INVESTIGATOR = 'SIU_INVESTIGATOR',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  SUPPORT_DESK = 'SUPPORT_DESK',
  SHARIAH_REVIEWER = 'SHARIAH_REVIEWER',
  SYSTEM = 'SYSTEM',
}

export enum UserRole {
  ADJUSTER = 'ADJUSTER',
  FIRM_ADMIN = 'FIRM_ADMIN',
  CLAIMANT = 'CLAIMANT',
  SUPER_ADMIN = 'SUPER_ADMIN',
  SIU_INVESTIGATOR = 'SIU_INVESTIGATOR',
  COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER',
  SUPPORT_DESK = 'SUPPORT_DESK',
  SHARIAH_REVIEWER = 'SHARIAH_REVIEWER',
}

// ============ INTERFACES ============

export interface Location {
  address: string;
  latitude?: number;
  longitude?: number;
}

export interface Tenant {
  id: string;
  name: string;
  type: TenantType;
  subscriptionTier: SubscriptionTier;
  settings: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Adjuster {
  id: string;
  userId: string;
  tenantId: string;
  licenseNumber: string;
  bcillaCertified: boolean;
  amlaMember: boolean;
  status: AdjusterStatus;
  licenseVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
  user?: {
    fullName: string;
    email: string;
    phoneNumber?: string;
  };
}

export interface Claimant {
  id: string;
  fullName: string;
  nric?: string;
  phoneNumber: string;
  email?: string;
  kycStatus: KycStatus;
  kycVerifiedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Claim {
  id: string;
  claimNumber: string;
  claimantId: string;
  nric?: string;
  adjusterId?: string;
  insurerTenantId?: string;
  policyNumber: string;
  category: ClaimCategory;
  /** Motor only. Non-motor lines carry their subtype on the sub-table. */
  claimType?: ClaimType | null;
  status: ClaimStatus;
  /**
   * How this claim is being examined, chosen by the assessment-mode router
   * (MASTER_PLAN §2.4). Null on claims created before routing existed.
   */
  assessmentMode?: AssessmentMode | null;
  // Non-motor polymorphic sub-table (populated when category=FLOOD)
  floodClaim?: FloodClaim | null;
  /** Populated when category=TRAVEL; the list query selects the subtype only. */
  travelClaim?: { travelClaimType?: TravelClaimType | null } | null;
  // Fraud signals attached to this claim, newest/highest severity first
  fraudSignals?: FraudSignal[];
  incidentDate: string;
  incidentTime?: string;
  incidentLocation: Location;
  description: string;
  otherParty?: Record<string, unknown>;
  policeReportNumber?: string;
  policeStation?: string;
  policeReportDate?: string;
  vehiclePlateNumber?: string;
  vehicleChassisNumber?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  vehicleEngineNumber?: string;
  vehicleYear?: number;
  ncdRate?: number;
  sumInsured?: number;
  workshopName?: string;
  estimatedLossAmount?: number;
  estimatedRepairCost?: number;
  sstAmount?: number;
  excessAmount?: number;
  approvedAmount?: number;
  /**
   * Consent standing, read from the consent records.
   *
   * Replaces `isPdpaCompliant`, a boolean the client set and nothing verified —
   * a claimant ticking a box is not evidence that a lawful basis exists.
   */
  consent?: {
    claimProcessing: boolean;
    biometric: boolean;
    crossBorder: boolean;
  };
  slaDeadline?: string;
  complianceNotes?: Record<string, any>;
  siuInvestigatorId?: string;
  priority: Priority;
  scheduledAssessmentTime?: string;
  createdAt: string;
  updatedAt: string;
  // Relations (populated by API)
  claimant?: Claimant;
  adjuster?: Adjuster;
  documents?: Document[];
  sessions?: Session[];
  trinityChecks?: TrinityCheck[];
}

export interface TrinityCheck {
  id: string;
  claimId: string;
  score: number;
  status: 'PASS' | 'FAIL' | 'WARNING' | 'REVIEW_NEEDED';
  summary?: string;
  checkResults: Record<string, any>;
  riskFactors: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface Session {
  id: string;
  claimId: string;
  roomId: number;
  status: SessionStatus;
  scheduledTime?: string;
  startedAt?: string;
  endedAt?: string;
  durationSeconds?: number;
  recordingUrl?: string;
  screenshots: string[];
  createdAt: string;
}

export interface RiskAssessment {
  id: string;
  sessionId: string;
  assessmentType: AssessmentType;
  provider: string;
  questionId?: string;
  questionText?: string;
  riskScore?: RiskScore;
  confidence?: number;
  rawResponse?: Record<string, unknown>;
  contextData?: Record<string, unknown>;
  createdAt: string;
}

export interface Document {
  id: string;
  claimId: string;
  type: DocumentType;
  filename: string;
  storageUrl: string;
  fileSize?: number;
  mimeType?: string;
  metadata: Record<string, unknown>;
  signedAt?: string;
  documentHash?: string;
  createdAt: string;
}

// ============ API TYPES ============

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

export interface CreateClaimRequest {
  policyNumber: string;
  claimType: ClaimType;
  incidentDate: string;
  incidentTime?: string;
  incidentLocation: Location;
  description: string;
  otherParty?: Record<string, unknown>;
  policeReportNumber?: string;
  preferredAssessmentTimes?: string[];
}

export interface CreateClaimResponse {
  claimId: string;
  claimNumber: string;
  status: ClaimStatus;
  createdAt: string;
  nextSteps: string[];
  documentsRequired: Array<{
    type: DocumentType;
    required: boolean;
    uploaded: boolean;
  }>;
}

export interface AdjusterQueueItem {
  claimId: string;
  claimNumber: string;
  claimType: ClaimType;
  claimantName: string;
  vehicleNumber?: string;
  incidentDate: string;
  priority: Priority;
  status: ClaimStatus;
  scheduledTime?: string;
  assignedAt: string;
  documentsUploaded: number;
  documentsRequired: number;
}

export interface AdjusterQueueResponse {
  adjusterId: string;
  queue: AdjusterQueueItem[];
  summary: {
    total: number;
    pendingAssessment: number;
    inProgress: number;
    awaitingReport: number;
  };
}

export interface RiskAssessmentResponse {
  claimId: string;
  sessionId: string;
  overallRisk: RiskScore;
  confidence: number;
  recommendation: string;
  breakdown: {
    voiceAnalysis: {
      score: RiskScore;
      confidence: number;
      questionsAnalysed: number;
      flaggedQuestions: number;
    };
    visualAnalysis: {
      deepfakeDetected: boolean;
      multiFaceDetected: boolean;
      contentModeration: string;
    };
    attentionTracking: {
      averageAttentionScore: number;
      offScreenPercentage: number;
      suspiciousBehaviourFlags: number;
    };
  };
  explainability: {
    summary: string;
    factors: Array<{
      factor: string;
      impact: string;
      detail: string;
    }>;
  };
  analysedAt: string;
}

// Travel claim intake flow definitions (Case guided intake).
// NOTE: explicit named re-exports (not `export *`) — the frontends consume the
// compiled CJS dist, and the CJS→ESM named-export lexer cannot see through
// tsc's __exportStar helper, but does detect explicit re-export bindings.
export {
  CASE_FLOWS,
  TRAVEL_CLAIM_TYPE_LABELS,
  NOTIFY_WITHIN_HOURS,
  CLAIM_WINDOW_DAYS,
  getFlow,
  getStep,
  resolveNextStep,
  validateAnswer,
  computeDeadlineFlags,
  computeCompleteness,
} from './case-flows';
export type {
  AnswerType,
  AnswerValidation,
  AnswerValue,
  CaseAnswers,
  CaseFlow,
  CompletenessSummary,
  DeadlineFlags,
  DocumentTypeLike,
  FlowStep,
  TravelClaimTypeLike,
} from './case-flows';
