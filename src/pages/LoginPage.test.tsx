import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./LoginPage.tsx", import.meta.url), "utf8");

test("login page offers Google as the only authentication method", () => {
  assert.match(source, /signInWithGoogle/);
  assert.match(source, /Đăng nhập qua Google/);
  assert.doesNotMatch(source, /signIn\(|signUp\(|resetPassword\(/);
  assert.doesNotMatch(source, /type="(?:email|password)"/);
});

test("login page uses the approved learning illustration", () => {
  assert.match(source, /login-illustration\.png/);
});
