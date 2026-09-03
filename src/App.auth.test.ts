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

test("App chỉ hydrate initial session từ auth callback và bỏ qua kết quả profile cũ", () => {
  assert.doesNotMatch(source, /auth\.getSession\(\)/);
  assert.match(source, /const requestId = \+\+authGenerationRef\.current/);
  assert.match(source, /requestId === authGenerationRef\.current/);
  assert.match(source, /isMountedRef\.current = true/);
});

test("App chỉ hoàn tất đăng ký cho identity session hiện tại", () => {
  assert.match(
    source,
    /const pendingGeneration = authGenerationRef\.current;[\s\S]*update\(\{ full_name: fullName \}\)[\s\S]*single\(\);[\s\S]*pendingGeneration !== authGenerationRef\.current[\s\S]*authSessionUserIdRef\.current !== pendingUser\.id[\s\S]*setUser/,
  );
});
