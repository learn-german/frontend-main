const ALLOWED_AUTH_ROLES = new Set(["admin", "user", "trial", "tutor"]);

export function isAllowedAuthRole(role: string): boolean {
  return ALLOWED_AUTH_ROLES.has(role);
}
