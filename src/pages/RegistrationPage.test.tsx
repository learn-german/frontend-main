import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { RegistrationPage } from "./RegistrationPage";

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

test("registration page nối nút đăng xuất với callback", () => {
  const onLogout = () => {};
  const element = RegistrationPage({
    email: "new@test.local",
    onSubmit: async () => null,
    onLogout,
  });
  const source = JSON.stringify(element, (_key, value) =>
    typeof value === "function" ? (value === onLogout ? "ON_LOGOUT" : "FUNCTION") : value,
  );
  assert.match(source, /ON_LOGOUT/);
});
