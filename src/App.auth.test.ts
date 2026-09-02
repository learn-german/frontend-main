import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

test("App đọc tên hiển thị từ profiles thay vì Google metadata", () => {
  assert.match(source, /from\("profiles"\)[\s\S]*select\("full_name"\)/);
  assert.doesNotMatch(source, /user_metadata\?\.full_name/);
});

test("App chặn user chưa có tên tại RegistrationPage", () => {
  assert.match(source, /needsProfileOnboarding/);
  assert.match(source, /<RegistrationPage/);
  assert.match(source, /pendingUser/);
});

test("App chỉ cập nhật full_name của chính user đang onboarding", () => {
  assert.match(source, /update\(\{ full_name: fullName \}\)[\s\S]*eq\("id", pendingUser\.id\)/);
});
