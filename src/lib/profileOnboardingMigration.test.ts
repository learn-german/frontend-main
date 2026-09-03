import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20260902000000_google_user_onboarding.sql", import.meta.url),
  "utf8",
);
const databaseTest = readFileSync(
  new URL("../../supabase/tests/profile_onboarding_test.sql", import.meta.url),
  "utf8",
);

test("pgTAP dùng fixture trong thư mục tests và fixture khớp migration backfill", () => {
  assert.doesNotMatch(databaseTest, /\\ir \.\.\/migrations\//);
  assert.match(databaseTest, /\\ir fixtures\/google_user_onboarding_backfill\.inc/);

  const fixture = readFileSync(
    new URL("../../supabase/tests/fixtures/google_user_onboarding_backfill.inc", import.meta.url),
    "utf8",
  );
  const backfillEnd = migration.indexOf("\n\ncreate or replace function");
  assert.notEqual(backfillEnd, -1);
  assert.equal(fixture.trim(), migration.slice(0, backfillEnd).trim());
});
