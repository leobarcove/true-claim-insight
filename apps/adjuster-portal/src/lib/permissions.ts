import { useAuthStore, UserRole } from '@/stores/auth-store';

/**
 * Granular permissions for the Adjuster Portal
 */
export const PERMISSIONS = {
  // Claims
  CLAIMS_VIEW_OWN: 'claims:view:own',
  CLAIMS_VIEW_BASIC: 'claims:view:basic', // Restricted view for Support
  CLAIMS_VIEW_ALL: 'claims:view:all',
  CLAIMS_CREATE: 'claims:create',
  CLAIMS_EDIT: 'claims:edit',
  CLAIMS_ASSIGN: 'claims:assign',
  CLAIMS_APPROVE: 'claims:approve',
  CLAIMS_EXPORT: 'claims:export',

  // Video
  VIDEO_CONDUCT: 'video:conduct',
  VIDEO_VIEW_RECORDINGS: 'video:view:recordings',

  // Users
  USERS_MANAGE: 'users:manage',

  // Audit & Compliance
  AUDIT_VIEW: 'audit:view',
  COMPLIANCE_FLAG: 'compliance:flag',

  // SIU
  SIU_ESCALATE: 'siu:escalate',
  SIU_INVESTIGATE: 'siu:investigate',

  // Shariah
  SHARIAH_REVIEW: 'shariah:review',

  // Privacy & PII
  PII_VIEW_UNMASKED: 'pii:view:unmasked',

  // Notes
  CLAIMS_NOTE_PRIVATE: 'claims:note:private',

  // System
  SYSTEM_ADMIN: 'system:admin',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Role to permissions mapping
 */
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADJUSTER: [
    PERMISSIONS.CLAIMS_VIEW_OWN,
    PERMISSIONS.CLAIMS_VIEW_BASIC,
    PERMISSIONS.CLAIMS_CREATE,
    PERMISSIONS.CLAIMS_EDIT,
    PERMISSIONS.CLAIMS_ASSIGN,
    PERMISSIONS.CLAIMS_APPROVE,
    PERMISSIONS.CLAIMS_EXPORT,
    PERMISSIONS.VIDEO_CONDUCT,
    PERMISSIONS.VIDEO_VIEW_RECORDINGS,
    PERMISSIONS.PII_VIEW_UNMASKED,
    PERMISSIONS.CLAIMS_NOTE_PRIVATE,
  ],
  FIRM_ADMIN: [
    PERMISSIONS.CLAIMS_VIEW_ALL,
    PERMISSIONS.CLAIMS_CREATE,
    PERMISSIONS.CLAIMS_EDIT,
    PERMISSIONS.CLAIMS_ASSIGN,
    PERMISSIONS.CLAIMS_APPROVE,
    PERMISSIONS.CLAIMS_EXPORT,
    PERMISSIONS.VIDEO_VIEW_RECORDINGS,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.SIU_ESCALATE,
    PERMISSIONS.PII_VIEW_UNMASKED,
  ],
  CLAIMANT: [],
  SIU_INVESTIGATOR: [
    PERMISSIONS.CLAIMS_VIEW_ALL,
    PERMISSIONS.CLAIMS_EXPORT,
    PERMISSIONS.VIDEO_VIEW_RECORDINGS,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.SIU_INVESTIGATE,
    PERMISSIONS.PII_VIEW_UNMASKED,
    PERMISSIONS.CLAIMS_NOTE_PRIVATE,
  ],
  COMPLIANCE_OFFICER: [
    PERMISSIONS.CLAIMS_VIEW_ALL,
    PERMISSIONS.CLAIMS_EXPORT,
    PERMISSIONS.CLAIMS_ASSIGN,
    PERMISSIONS.CLAIMS_APPROVE,
    PERMISSIONS.VIDEO_VIEW_RECORDINGS,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.COMPLIANCE_FLAG,
    PERMISSIONS.PII_VIEW_UNMASKED,
  ],
  SUPPORT_DESK: [PERMISSIONS.CLAIMS_VIEW_ALL, PERMISSIONS.CLAIMS_VIEW_BASIC],
  SHARIAH_REVIEWER: [PERMISSIONS.CLAIMS_VIEW_ALL, PERMISSIONS.SHARIAH_REVIEW],
  SUPER_ADMIN: [
    PERMISSIONS.CLAIMS_VIEW_OWN,
    PERMISSIONS.CLAIMS_VIEW_BASIC,
    PERMISSIONS.CLAIMS_VIEW_ALL,
    PERMISSIONS.CLAIMS_CREATE,
    PERMISSIONS.CLAIMS_EDIT,
    PERMISSIONS.CLAIMS_ASSIGN,
    PERMISSIONS.CLAIMS_APPROVE,
    PERMISSIONS.CLAIMS_EXPORT,
    PERMISSIONS.VIDEO_CONDUCT,
    PERMISSIONS.VIDEO_VIEW_RECORDINGS,
    PERMISSIONS.USERS_MANAGE,
    PERMISSIONS.AUDIT_VIEW,
    PERMISSIONS.COMPLIANCE_FLAG,
    PERMISSIONS.SIU_ESCALATE,
    PERMISSIONS.SIU_INVESTIGATE,
    PERMISSIONS.SHARIAH_REVIEW,
    PERMISSIONS.PII_VIEW_UNMASKED,
    PERMISSIONS.CLAIMS_NOTE_PRIVATE,
    PERMISSIONS.SYSTEM_ADMIN,
  ],
};

/**
 * Hook to check if the current user has a specific permission
 */
export function useHasPermission(permission: Permission): boolean {
  const user = useAuthStore(state => state.user);
  if (!user) return false;
  return ROLE_PERMISSIONS[user.role]?.includes(permission) ?? false;
}

/**
 * Hook to check if the current user has any of the specified permissions
 */
export function useHasAnyPermission(permissions: Permission[]): boolean {
  const user = useAuthStore(state => state.user);
  if (!user) return false;
  const userPerms = ROLE_PERMISSIONS[user.role] ?? [];
  return permissions.some(p => userPerms.includes(p));
}

/**
 * Hook to get all permissions for the current user
 */
export function useUserPermissions(): Permission[] {
  const user = useAuthStore(state => state.user);
  if (!user) return [];
  return ROLE_PERMISSIONS[user.role] ?? [];
}

/**
 * Utility to check permission for a given role (non-hook)
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}
