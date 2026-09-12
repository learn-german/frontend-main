import assert from "node:assert/strict";
import test from "node:test";
import {
  canAccessAdminSection,
  getVisibleAdminSections,
  isAdminPortalRole,
  TUTOR_BLOCKED_ADMIN_SECTIONS,
} from "./adminAcl";

test("isAdminPortalRole allows admin and tutor only", () => {
  assert.equal(isAdminPortalRole("admin"), true);
  assert.equal(isAdminPortalRole("tutor"), true);
  assert.equal(isAdminPortalRole("user"), false);
  assert.equal(isAdminPortalRole("trial"), false);
  assert.equal(isAdminPortalRole(""), false);
});

test("tutor cannot access users or content sections", () => {
  for (const section of TUTOR_BLOCKED_ADMIN_SECTIONS) {
    assert.equal(canAccessAdminSection("tutor", section), false, section);
  }
  assert.equal(canAccessAdminSection("tutor", "quiz"), true);
  assert.equal(canAccessAdminSection("tutor", "writing"), true);
  assert.equal(canAccessAdminSection("tutor", "support"), true);
  assert.equal(canAccessAdminSection("tutor", "meetings"), true);
  assert.equal(canAccessAdminSection("tutor", "dashboard"), true);
});

test("admin can access every admin section", () => {
  const sections = getVisibleAdminSections("admin");
  assert.ok(sections.includes("users"));
  assert.ok(sections.includes("content"));
  assert.ok(sections.includes("quiz"));
});

test("tutor nav hides users and content", () => {
  const sections = getVisibleAdminSections("tutor");
  assert.ok(!sections.includes("users"));
  assert.ok(!sections.includes("content"));
  assert.ok(sections.includes("quiz"));
  assert.ok(sections.includes("dashboard"));
});
