import { z } from "zod";

// ---------------------------------------------------------------------------
// Permission Definitions
// ---------------------------------------------------------------------------

export const PERMISSIONS = [
  "project:create",
  "project:read",
  "project:update",
  "project:delete",
  "project:publish",
  "billing:read",
  "billing:manage",
  "team:invite",
  "team:remove",
  "team:manage_roles",
  "ai:use",
  "ai:configure",
  "admin:users",
  "admin:settings",
  "admin:audit_logs",
  "support:view_tickets",
  "support:manage_tickets",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PermissionSchema = z.enum(PERMISSIONS);

// ---------------------------------------------------------------------------
// Role Definitions
// ---------------------------------------------------------------------------

export const ROLES = [
  "owner",
  "admin",
  "editor",
  "viewer",
  "billing_admin",
] as const;

export type Role = (typeof ROLES)[number];

export const RoleSchema = z.enum(ROLES);

// ---------------------------------------------------------------------------
// Default Role-Permission Mappings
// ---------------------------------------------------------------------------

const ALL_PERMISSIONS: readonly Permission[] = PERMISSIONS;

const ADMIN_PERMISSIONS: readonly Permission[] = PERMISSIONS.filter(
  (p) => p !== "billing:manage" && p !== "admin:settings",
);

const EDITOR_PERMISSIONS: readonly Permission[] = [
  "project:create",
  "project:read",
  "project:update",
  "project:delete",
  "ai:use",
];

const VIEWER_PERMISSIONS: readonly Permission[] = ["project:read"];

const BILLING_ADMIN_PERMISSIONS: readonly Permission[] = [
  "billing:read",
  "billing:manage",
];

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ADMIN_PERMISSIONS,
  editor: EDITOR_PERMISSIONS,
  viewer: VIEWER_PERMISSIONS,
  billing_admin: BILLING_ADMIN_PERMISSIONS,
};

// ---------------------------------------------------------------------------
// Permission Checking Utilities
// ---------------------------------------------------------------------------

/**
 * Check if a role has ALL of the specified permissions.
 */
export function roleHasAllPermissions(
  role: Role,
  requiredPermissions: readonly Permission[],
): boolean {
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[role];
  return requiredPermissions.every((p) => rolePerms.includes(p));
}

/**
 * Check if a role has at least ONE of the specified permissions.
 */
export function roleHasAnyPermission(
  role: Role,
  requiredPermissions: readonly Permission[],
): boolean {
  const rolePerms = DEFAULT_ROLE_PERMISSIONS[role];
  return requiredPermissions.some((p) => rolePerms.includes(p));
}

/**
 * Get all permissions for a given role.
 */
export function getPermissionsForRole(role: Role): readonly Permission[] {
  return DEFAULT_ROLE_PERMISSIONS[role];
}
