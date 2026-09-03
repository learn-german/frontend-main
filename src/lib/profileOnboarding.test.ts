import assert from "node:assert/strict";
import test from "node:test";
import { needsProfileOnboarding, validateDisplayName } from "./profileOnboarding";

test("profile cần onboarding khi tên null, rỗng hoặc chỉ có khoảng trắng", () => {
  assert.equal(needsProfileOnboarding(undefined), true);
  assert.equal(needsProfileOnboarding(null), true);
  assert.equal(needsProfileOnboarding(""), true);
  assert.equal(needsProfileOnboarding("   "), true);
  assert.equal(needsProfileOnboarding("Nguyen Thang"), false);
});

test("validateDisplayName trim tên hợp lệ", () => {
  assert.deepEqual(validateDisplayName("  Nguyễn Văn A  "), {
    value: "Nguyễn Văn A",
    error: null,
  });
});

test("validateDisplayName chặn tên ngoài khoảng 2 đến 80 ký tự", () => {
  assert.equal(validateDisplayName(" ").error, "Vui lòng nhập tên hiển thị.");
  assert.equal(validateDisplayName("A").error, "Tên hiển thị phải có từ 2 đến 80 ký tự.");
  assert.equal(validateDisplayName("A".repeat(81)).error, "Tên hiển thị phải có từ 2 đến 80 ký tự.");
});
