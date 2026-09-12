export type AdminSection = "dashboard" | "users" | "content" | "quiz" | "writing" | "support" | "meetings";

export const ALL_ADMIN_SECTIONS: AdminSection[] = [
  "dashboard",
  "users",
  "content",
  "quiz",
  "writing",
  "support",
  "meetings",
];

export const TUTOR_BLOCKED_ADMIN_SECTIONS: AdminSection[] = ["users", "content"];

export function isAdminPortalRole(role: string): boolean {
  return role === "admin" || role === "tutor";
}

export function canAccessAdminSection(role: string, section: AdminSection): boolean {
  if (!isAdminPortalRole(role)) return false;
  if (role === "tutor" && TUTOR_BLOCKED_ADMIN_SECTIONS.includes(section)) return false;
  return true;
}

export function getVisibleAdminSections(role: string): AdminSection[] {
  if (!isAdminPortalRole(role)) return [];
  if (role === "tutor") {
    return ALL_ADMIN_SECTIONS.filter((section) => !TUTOR_BLOCKED_ADMIN_SECTIONS.includes(section));
  }
  return ALL_ADMIN_SECTIONS;
}
