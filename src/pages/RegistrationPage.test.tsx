import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationPage } from "./RegistrationPage";

const source = readFileSync(new URL("./RegistrationPage.tsx", import.meta.url), "utf8");

test("registration page chỉ yêu cầu tên hiển thị và tái sử dụng illustration", () => {
  const html = renderToStaticMarkup(
    <RegistrationPage email="new@test.local" onSubmit={async () => null} onLogout={() => {}} />,
  );

  assert.match(html, /Hoàn tất đăng ký/);
  assert.match(html, /Tên hiển thị/);
  assert.match(html, /Bắt đầu học/);
  assert.match(html, /login-illustration\.png/);
  assert.doesNotMatch(html, /type="email"|type="password"/);
});

test("registration page wires logout and submit contract", () => {
  assert.match(source, /onClick=\{onLogout\}/);
  assert.match(source, /validateDisplayName\(fullName\)/);
  assert.match(source, /onSubmit\(result\.value\)/);
  assert.match(source, /setError\(submitError\)/);
  assert.match(source, /disabled=\{isLoading\}/);
  assert.match(source, /setIsLoading\(false\)/);
});
