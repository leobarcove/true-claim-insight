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
}

export enum ActorType {
  CLAIMANT = 'CLAIMANT',
  ADJUSTER = 'ADJUSTER',
  ADMIN = 'ADMIN',
  SYSTEM = 'SYSTEM',
}

export enum UserRole {
  ADJUSTER = 'ADJUSTER',
  FIRM_ADMIN = 'FIRM_ADMIN',
  CLAIMANT = 'CLAIMANT',
  INSURER_STAFF = 'INSURER_STAFF',
  INSURER_ADMIN = 'INSURER_ADMIN',
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
  adjusterId?: string;
  insurerTenantId?: string;
  policyNumber: string;
  claimType: ClaimType;
  status: ClaimStatus;
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
  isPdpaCompliant: boolean;
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
