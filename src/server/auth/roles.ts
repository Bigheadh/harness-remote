import type { UserRole } from "../../shared/types.js";

/**
 * Permission strings for fine-grained RBAC.
 *
 * Each route/action maps to one or more permissions.
 * A role grants a set of permissions.
 */
export type Permission =
  | "tasks.read"
  | "tasks.write"
  | "tasks.status"
  | "tasks.result"
  | "tasks.reply"
  | "tasks.assign"
  | "tasks.cleanup"
  | "tasks.reset_stale"
  | "tasks.search"
  | "devices.read"
  | "devices.write"
  | "devices.delete"
  | "audit.read"
  | "audit.cleanup"
  | "users.read"
  | "users.write"
  | "users.delete"
  | "dashboard.read"
  | "health.read"
  | "webhooks.read"
  | "webhooks.write";

/** Default role → permission mapping */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  admin: [
    "tasks.read",
    "tasks.write",
    "tasks.status",
    "tasks.result",
    "tasks.reply",
    "tasks.assign",
    "tasks.cleanup",
    "tasks.reset_stale",
    "tasks.search",
    "devices.read",
    "devices.write",
    "devices.delete",
    "audit.read",
    "audit.cleanup",
    "users.read",
    "users.write",
    "users.delete",
    "dashboard.read",
    "health.read",
    "webhooks.read",
    "webhooks.write",
  ],
  operator: [
    "tasks.read",
    "tasks.write",
    "tasks.status",
    "tasks.result",
    "tasks.reply",
    "tasks.assign",
    "tasks.cleanup",
    "tasks.reset_stale",
    "tasks.search",
    "devices.read",
    "devices.write",
    "audit.read",
    "dashboard.read",
    "health.read",
    "webhooks.read",
    "webhooks.write",
  ],
  viewer: [
    "tasks.read",
    "tasks.search",
    "devices.read",
    "audit.read",
    "dashboard.read",
    "health.read",
    "webhooks.read",
  ],
};

/**
 * Check if a role has a specific permission.
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Get all permissions for a role.
 */
export function getRolePermissions(role: UserRole): Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

/** All valid roles */
export const VALID_ROLES: UserRole[] = ["admin", "operator", "viewer"];

/** All valid permissions */
export const ALL_PERMISSIONS: Permission[] = [
  "tasks.read",
  "tasks.write",
  "tasks.status",
  "tasks.result",
  "tasks.reply",
  "tasks.assign",
  "tasks.cleanup",
  "tasks.reset_stale",
  "tasks.search",
  "devices.read",
  "devices.write",
  "devices.delete",
  "audit.read",
  "audit.cleanup",
  "users.read",
  "users.write",
  "users.delete",
  "dashboard.read",
  "health.read",
  "webhooks.read",
  "webhooks.write",
];
