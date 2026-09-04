import assert from "node:assert/strict";
import test from "node:test";
import { filterUsers, type FilterableUser, type UserFilterCriteria } from "./adminUserFilter";

const EMPTY_CRITERIA: UserFilterCriteria = { search: "", role: "all", levels: new Set(), dateFrom: "", dateTo: "" };

const user = (overrides: Partial<FilterableUser> = {}): FilterableUser => ({
  email: "a@example.com",
  full_name: "Nguyen Van A",
  role: "user",
  unlockedLevels: ["A1"],
  created_at: "2026-08-01T00:00:00+00:00",
  ...overrides,
});

test("filterUsers: criteria rỗng trả về tất cả", () => {
  const users = [user(), user({ email: "b@example.com" })];
  assert.equal(filterUsers(users, EMPTY_CRITERIA).length, 2);
});

test("filterUsers: search khớp email hoặc họ tên, không phân biệt hoa thường", () => {
  const users = [user({ email: "Foo@Bar.com" }), user({ email: "x@y.com", full_name: "Tran Thi B" })];
  assert.equal(filterUsers(users, { ...EMPTY_CRITERIA, search: "foo" }).length, 1);
  assert.equal(filterUsers(users, { ...EMPTY_CRITERIA, search: "tran" }).length, 1);
});

test("filterUsers: role lọc đúng, 'all' không lọc", () => {
  const users = [user({ role: "trial" }), user({ role: "admin" })];
  assert.equal(filterUsers(users, { ...EMPTY_CRITERIA, role: "trial" }).length, 1);
  assert.equal(filterUsers(users, { ...EMPTY_CRITERIA, role: "admin" }).length, 1);
  assert.equal(filterUsers(users, EMPTY_CRITERIA).length, 2);
});

test("filterUsers: levels khớp OR — user có ít nhất 1 cấp độ trong bộ lọc", () => {
  const users = [
    user({ unlockedLevels: ["A1"] }),
    user({ unlockedLevels: ["B1"] }),
    user({ unlockedLevels: ["A2", "B2"] }),
  ];
  const result = filterUsers(users, { ...EMPTY_CRITERIA, levels: new Set(["A1", "B2"]) });
  assert.equal(result.length, 2);
});

test("filterUsers: khoảng ngày lọc đúng biên, bao trọn ngày dateTo", () => {
  const users = [
    user({ created_at: "2026-08-01T00:00:00+00:00" }),
    user({ created_at: "2026-08-05T23:00:00+00:00" }),
    user({ created_at: "2026-08-10T00:00:00+00:00" }),
  ];
  const result = filterUsers(users, { ...EMPTY_CRITERIA, dateFrom: "2026-08-01", dateTo: "2026-08-05" });
  assert.equal(result.length, 2);
});

test("filterUsers: kết hợp nhiều điều kiện (AND)", () => {
  const users = [
    user({ role: "admin", unlockedLevels: ["A1"], created_at: "2026-08-03T00:00:00+00:00" }),
    user({ role: "admin", unlockedLevels: ["B2"], created_at: "2026-08-03T00:00:00+00:00" }),
  ];
  const result = filterUsers(users, {
    search: "",
    role: "admin",
    levels: new Set(["A1"]),
    dateFrom: "2026-08-01",
    dateTo: "2026-08-05",
  });
  assert.equal(result.length, 1);
});
