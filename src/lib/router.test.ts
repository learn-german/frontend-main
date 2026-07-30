import assert from "node:assert/strict";
import { parseRoute, serializeRoute, isProtectedPage, type AppRoute } from "./router";

// parse các trang đơn
assert.deepEqual(parseRoute("/"), { page: "landing" });
assert.deepEqual(parseRoute("/login"), { page: "login" });
assert.deepEqual(parseRoute("/dashboard"), { page: "dashboard" });
assert.deepEqual(parseRoute("/roadmap"), { page: "roadmap" });
assert.deepEqual(parseRoute("/leaderboard"), { page: "leaderboard" });

// bỏ qua dấu / thừa
assert.deepEqual(parseRoute("/dashboard/"), { page: "dashboard" });
assert.deepEqual(parseRoute(""), { page: "landing" });

// bài học có / không có tab
assert.deepEqual(parseRoute("/lesson/a1-l3"), { page: "lesson-detail", lessonId: "a1-l3" });
assert.deepEqual(parseRoute("/lesson/a1-l3/nghe"), {
  page: "lesson-detail",
  lessonId: "a1-l3",
  tab: "nghe",
});
// tab không hợp lệ bị bỏ, vẫn vào được bài
assert.deepEqual(parseRoute("/lesson/a1-l3/khongtontai"), {
  page: "lesson-detail",
  lessonId: "a1-l3",
});
// thiếu lessonId -> landing
assert.deepEqual(parseRoute("/lesson"), { page: "landing" });

// bài tập
assert.deepEqual(parseRoute("/quiz/a1-l3/nguphap"), {
  page: "quiz",
  lessonId: "a1-l3",
  category: "nguphap",
});
assert.deepEqual(parseRoute("/quiz/a1-l3/doc"), {
  page: "quiz",
  lessonId: "a1-l3",
  category: "doc",
});
// category không hợp lệ hoặc thiếu -> landing
assert.deepEqual(parseRoute("/quiz/a1-l3/xyz"), { page: "landing" });
assert.deepEqual(parseRoute("/quiz/a1-l3"), { page: "landing" });

// đường dẫn lạ -> landing
assert.deepEqual(parseRoute("/khong-ton-tai"), { page: "landing" });

// /reset-password giữ hành vi cũ: hiện màn hình đăng nhập
assert.deepEqual(parseRoute("/reset-password"), { page: "login" });

// serialize
assert.equal(serializeRoute({ page: "landing" }), "/");
assert.equal(serializeRoute({ page: "login" }), "/login");
assert.equal(serializeRoute({ page: "dashboard" }), "/dashboard");
assert.equal(serializeRoute({ page: "roadmap" }), "/roadmap");
assert.equal(serializeRoute({ page: "leaderboard" }), "/leaderboard");
assert.equal(serializeRoute({ page: "lesson-detail", lessonId: "a1-l3" }), "/lesson/a1-l3");
assert.equal(
  serializeRoute({ page: "lesson-detail", lessonId: "a1-l3", tab: "nghe" }),
  "/lesson/a1-l3/nghe",
);
assert.equal(
  serializeRoute({ page: "quiz", lessonId: "a1-l3", category: "nguphap" }),
  "/quiz/a1-l3/nguphap",
);

// round-trip: route -> path -> route giữ nguyên
const routes: AppRoute[] = [
  { page: "landing" },
  { page: "login" },
  { page: "dashboard" },
  { page: "roadmap" },
  { page: "leaderboard" },
  { page: "lesson-detail", lessonId: "a1-l3" },
  { page: "lesson-detail", lessonId: "a1-l3", tab: "tuvung" },
  { page: "quiz", lessonId: "a1-l3", category: "nghe" },
];
for (const route of routes) {
  assert.deepEqual(parseRoute(serializeRoute(route)), route);
}

// trang cần đăng nhập
assert.equal(isProtectedPage("dashboard"), true);
assert.equal(isProtectedPage("roadmap"), true);
assert.equal(isProtectedPage("leaderboard"), true);
assert.equal(isProtectedPage("lesson-detail"), true);
assert.equal(isProtectedPage("quiz"), true);
assert.equal(isProtectedPage("landing"), false);
assert.equal(isProtectedPage("login"), false);

console.log("router.test.ts OK");
