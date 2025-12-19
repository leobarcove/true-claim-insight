import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore, UserRole } from '@/stores/auth-store';
import { Permission, useHasPermission, useHasAnyPermission } from '@/lib/permissions';

interface RoleRouteProps {
  children: React.ReactNode;
  allowedRoles: UserRole[];
  fallback?: React.ReactNode;
  redirectTo?: string;
}

/**
 * Route guard that restricts access based on user role.
 * If the user's role is not in allowedRoles, they are redirected or shown fallback.
 */
export function RoleRoute({
  children,
  allowedRoles,
  fallback,
  redirectTo = '/',
}: RoleRouteProps) {
  const user = useAuthStore((state) => state.user);

  if (!user || !allowedRoles.includes(user.role)) {
    if (fallback) {
      return <>{fallback}</>;
    }
    return <Navigate to={redirectTo} replace />;
  }

  return <>{children}</>;
}

interface CanProps {
  permission: Permission;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on a single permission.
 */
export function Can({ permission, children, fallback = null }: CanProps) {
  const hasPermission = useHasPermission(permission);
  return hasPermission ? <>{children}</> : <>{fallback}</>;
}

interface CanAnyProps {
  permissions: Permission[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children if user has ANY of the specified permissions.
 */
export function CanAny({ permissions, children, fallback = null }: CanAnyProps) {
  const hasAny = useHasAnyPermission(permissions);
  return hasAny ? <>{children}</> : <>{fallback}</>;
}

interface RoleOnlyProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * Conditionally renders children based on user role (not permission).
 */
export function RoleOnly({ roles, children, fallback = null }: RoleOnlyProps) {
  const user = useAuthStore((state) => state.user);

  if (!user || !roles.includes(user.role)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
