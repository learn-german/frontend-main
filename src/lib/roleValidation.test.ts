import assert from "node:assert/strict";
import test from "node:test";
import { isAllowedAuthRole } from "./roleValidation";

test("set-admin-role whitelist accepts admin, user, trial, tutor", () => {
  assert.equal(isAllowedAuthRole("admin"), true);
  assert.equal(isAllowedAuthRole("user"), true);
  assert.equal(isAllowedAuthRole("trial"), true);
  assert.equal(isAllowedAuthRole("tutor"), true);
});

test("set-admin-role whitelist rejects unknown roles", () => {
  assert.equal(isAllowedAuthRole("superadmin"), false);
  assert.equal(isAllowedAuthRole(""), false);
  assert.equal(isAllowedAuthRole("moderator"), false);
});
