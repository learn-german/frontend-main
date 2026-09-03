import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");
const authCallback = source.slice(
  source.indexOf("supabase.auth.onAuthStateChange"),
  source.indexOf("\n\n    return () =>", source.indexOf("supabase.auth.onAuthStateChange")),
);

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

test("App giữ route khi INITIAL_SESSION không có session và chỉ về landing khi SIGNED_OUT", () => {
  assert.doesNotMatch(source, /auth\.getSession\(\)/);
  assert.match(authCallback, /onAuthStateChange\(\(event, session\) =>/);
  const signedOutGuard = authCallback.indexOf('if (event === "SIGNED_OUT")');
  const landingNavigation = authCallback.indexOf('setCurrentPage("landing")');
  const signedOutReturn = authCallback.indexOf("return;", signedOutGuard);
  assert.ok(signedOutGuard < landingNavigation && landingNavigation < signedOutReturn);
  assert.equal(authCallback.match(/setCurrentPage\("landing"\)/g)?.length, 1);
  assert.match(authCallback.slice(signedOutReturn), /setAuthLoading\(false\);/);
});

test("App tách request hydrate khỏi vòng đời identity", () => {
  assert.match(source, /const requestId = \+\+hydrationGenerationRef\.current/);
  assert.match(source, /requestId === hydrationGenerationRef\.current/);
  assert.match(
    source,
    /if \(previousUserId !== nextUserId\) \{[\s\S]*identityGenerationRef\.current \+= 1;[\s\S]*\}/,
  );
  assert.match(source, /isMountedRef\.current = true/);
});

test("App cho phép auth event cùng user trong lúc lưu tên nhưng chặn identity cũ", () => {
  assert.match(
    source,
    /const pendingIdentityGeneration = identityGenerationRef\.current;[\s\S]*update\(\{ full_name: fullName \}\)[\s\S]*single\(\);[\s\S]*pendingIdentityGeneration !== identityGenerationRef\.current[\s\S]*authSessionUserIdRef\.current !== pendingUser\.id[\s\S]*hydrationGenerationRef\.current \+= 1;[\s\S]*setUser/,
  );
  assert.match(
    source,
    /const handleLogout = async \(\) => \{[\s\S]*hydrationGenerationRef\.current \+= 1;[\s\S]*identityGenerationRef\.current \+= 1;[\s\S]*authSessionUserIdRef\.current = null;/,
  );
});

test("App xóa lỗi hồ sơ cũ khi hoàn tất đăng ký thành công", () => {
  const registrationHandler = source.slice(
    source.indexOf("const handleCompleteRegistration"),
    source.indexOf("\n\n  // Không ép sang", source.indexOf("const handleCompleteRegistration")),
  );
  const acceptedCompletion = registrationHandler.indexOf("hydrationGenerationRef.current += 1;");
  const clearProfileError = registrationHandler.indexOf('setProfileError("");');
  const publishUser = registrationHandler.indexOf("setUser({ ...pendingUser, fullName: data.full_name });");

  assert.ok(acceptedCompletion < clearProfileError && clearProfileError < publishUser);
});
