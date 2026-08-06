# Admin Users Filter + Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trang Admin > Người dùng có filter riêng theo Role/Cấp độ mở/Ngày tạo (kết hợp được với ô tìm kiếm hiện có) và phân trang 15 user/trang.

**Architecture:** Trích logic lọc thuần sang `src/lib/adminUserFilter.ts` (testable, không phụ thuộc React) — `AdminUsersSection.tsx` chỉ giữ state + JSX, gọi hàm này để tính `filtered`. Phân trang cắt `filtered` client-side, không đổi cách fetch dữ liệu.

**Tech Stack:** React 19 + TypeScript 5.8. Test bằng `node:test` qua `npx tsx --test`. Không thêm npm package mới.

## Global Constraints

- Không dùng `any`.
- Không thêm npm package mới (theo CLAUDE.md) — dùng `<input type="date">` native.
- Không đổi cách fetch dữ liệu (`fetchUsers()` vẫn tải hết 1 lần).
- Không đổi các modal (tạo/sửa/xoá user, xem tiến độ).
- Chạy `npm run lint` sau mỗi task đụng TypeScript.

---

### Task 1: Hàm lọc thuần `filterUsers`

**Files:**
- Create: `src/lib/adminUserFilter.ts`
- Test: `src/lib/adminUserFilter.test.ts`

**Interfaces:**
- Produces: `interface FilterableUser { email: string; full_name: string | null; role: string; unlockedLevels: string[]; created_at: string; }`, `interface UserFilterCriteria { search: string; role: "all" | "user" | "admin"; levels: Set<string>; dateFrom: string; dateTo: string; }`, `function filterUsers<T extends FilterableUser>(users: T[], criteria: UserFilterCriteria): T[]`.

- [ ] **Step 1: Viết test trước — `src/lib/adminUserFilter.test.ts`:**

```ts
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
  const users = [user({ role: "user" }), user({ role: "admin" })];
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
```

- [ ] **Step 2: Chạy test, xác nhận FAIL**

Run: `npx tsx --test src/lib/adminUserFilter.test.ts`
Expected: FAIL — "Cannot find module"

- [ ] **Step 3: Tạo `src/lib/adminUserFilter.ts`:**

```ts
export interface FilterableUser {
  email: string;
  full_name: string | null;
  role: string;
  unlockedLevels: string[];
  created_at: string;
}

export interface UserFilterCriteria {
  search: string;
  role: "all" | "user" | "admin";
  levels: Set<string>;
  dateFrom: string;
  dateTo: string;
}

export function filterUsers<T extends FilterableUser>(users: T[], criteria: UserFilterCriteria): T[] {
  const searchLower = criteria.search.toLowerCase();
  const fromTime = criteria.dateFrom ? new Date(criteria.dateFrom).getTime() : null;
  const toTime = criteria.dateTo ? new Date(`${criteria.dateTo}T23:59:59`).getTime() : null;

  return users.filter((u) => {
    if (
      searchLower
      && !u.email.toLowerCase().includes(searchLower)
      && !(u.full_name ?? "").toLowerCase().includes(searchLower)
    ) {
      return false;
    }
    if (criteria.role !== "all" && u.role !== criteria.role) return false;
    if (criteria.levels.size > 0 && !u.unlockedLevels.some((l) => criteria.levels.has(l))) return false;
    const createdTime = new Date(u.created_at).getTime();
    if (fromTime !== null && createdTime < fromTime) return false;
    if (toTime !== null && createdTime > toTime) return false;
    return true;
  });
}
```

- [ ] **Step 4: Chạy test, xác nhận PASS**

Run: `npx tsx --test src/lib/adminUserFilter.test.ts`
Expected: PASS toàn bộ 6 test.

- [ ] **Step 5: `npm run lint` phải pass.**

- [ ] **Step 6: Commit**

```bash
git add src/lib/adminUserFilter.ts src/lib/adminUserFilter.test.ts
git commit -m "feat: hàm lọc thuần filterUsers cho Admin Users"
```

---

### Task 2: Wire filter UI vào `AdminUsersSection.tsx`

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Consumes: `filterUsers`, `type UserFilterCriteria` (Task 1).

- [ ] **Step 1: Thêm import** — thêm vào đầu file, sau import `completion`:

```ts
import { filterUsers, type UserFilterCriteria } from "../../lib/adminUserFilter";
```

- [ ] **Step 2: Thêm state filter** — thêm ngay sau dòng `const [search, setSearch] = useState("");` (dòng 44 gốc):

```ts
  const [roleFilter, setRoleFilter] = useState<UserFilterCriteria["role"]>("all");
  const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
```

- [ ] **Step 3: Thay `filtered` dùng `filterUsers`** — tìm khối (dòng 233-237 gốc):

```ts
  const filtered = users.filter(
    (u) =>
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      (u.full_name ?? "").toLowerCase().includes(search.toLowerCase()),
  );
```

thay bằng:

```ts
  const filtered = filterUsers(users, {
    search,
    role: roleFilter,
    levels: levelFilter,
    dateFrom,
    dateTo,
  });
```

- [ ] **Step 4: Thêm hàng UI filter** — chèn ngay sau khối header (đóng bằng `</div>` ở dòng 267 gốc, trước comment `{/* Table */}`):

```tsx
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl border border-slate-200/60 shadow-sm p-3">
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserFilterCriteria["role"])}
          className="px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
        >
          <option value="all">Tất cả role</option>
          <option value="user">User</option>
          <option value="admin">Admin</option>
        </select>

        <div className="flex items-center gap-1.5">
          {(["A1", "A2", "B1", "B2"] as const).map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setLevelFilter((prev) => {
                const next = new Set(prev);
                if (next.has(level)) next.delete(level);
                else next.add(level);
                return next;
              })}
              className={`px-2.5 py-1.5 text-xs font-bold rounded-lg border transition-colors ${
                levelFilter.has(level)
                  ? "bg-orange-50 border-orange-300 text-orange-700"
                  : "bg-white border-slate-200 text-slate-500 hover:bg-slate-50"
              }`}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <span>Từ</span>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
          <span>đến</span>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        {(roleFilter !== "all" || levelFilter.size > 0 || dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setRoleFilter("all");
              setLevelFilter(new Set());
              setDateFrom("");
              setDateTo("");
            }}
            className="text-xs font-bold text-slate-400 hover:text-slate-600 underline"
          >
            Xoá bộ lọc
          </button>
        )}
      </div>

      {/* Table */}
```

- [ ] **Step 5: `npm run lint` phải pass.**

- [ ] **Step 6: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ (131 test cũ + 6 test mới Task 1 = 137).

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: thêm filter theo Role/Cấp độ mở/Ngày tạo cho Admin Users"
```

---

### Task 3: Phân trang 15 user/trang

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Consumes: `filtered` (Task 2).

- [ ] **Step 1: Thêm hằng số + state phân trang** — thêm `PAGE_SIZE` ngay sau `const EMPTY_CREATE: CreateForm = { ... };` (dòng 39 gốc):

```ts
const PAGE_SIZE = 15;
```

Thêm state `currentPage` ngay sau state `dateTo` (thêm ở Task 2 Step 2):

```ts
  const [currentPage, setCurrentPage] = useState(1);
```

- [ ] **Step 2: Reset trang khi đổi filter/search** — thêm ngay sau khối `useEffect(() => { fetchUsers(); }, []);` (dòng 82 gốc):

```ts
  useEffect(() => {
    setCurrentPage(1);
  }, [search, roleFilter, levelFilter, dateFrom, dateTo]);
```

- [ ] **Step 3: Tính `totalPages`/`safePage`/`paginated`** — ngay sau khối `const filtered = filterUsers(...)` (Task 2 Step 3), thêm:

```ts
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const paginated = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
```

(`safePage` xử lý trường hợp `currentPage` vượt quá số trang thực tế sau khi xoá user — không cần đợi effect chạy lại.)

- [ ] **Step 4: Render `paginated` thay vì `filtered` trong bảng** — tìm dòng `{filtered.map((u) => (` (dòng 284 gốc), đổi thành:

```tsx
            {paginated.map((u) => (
```

(dòng đóng `))}` tương ứng và toàn bộ nội dung `<tr>` bên trong giữ nguyên không đổi — chỉ đổi nguồn dữ liệu map.)

Dòng check rỗng `{filtered.length === 0 && (` (dòng 341 gốc) giữ nguyên — đây là thông báo "không có user khớp filter", đúng nghĩa dùng `filtered` (không phải `paginated`) vì phải hiện dù có kết quả nhưng đang ở trang trống do lỗi state (dù `safePage` đã chặn trường hợp này).

- [ ] **Step 5: Thêm điều khiển phân trang** — chèn ngay sau khối đóng bảng (`</div>` đóng `{/* Table */}`, dòng 348 gốc), trước comment `{/* Create user modal */}`:

```tsx
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
            disabled={safePage <= 1}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Trước
          </button>
          <span className="text-xs text-slate-500">Trang {safePage}/{totalPages}</span>
          <button
            type="button"
            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
            disabled={safePage >= totalPages}
            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Sau
          </button>
        </div>
      )}
```

- [ ] **Step 6: `npm run lint` phải pass.**

- [ ] **Step 7: Chạy lại toàn bộ test suite**

Run: `npx tsx --test "src/**/*.test.ts" "supabase/functions/**/*.test.ts"`
Expected: PASS toàn bộ.

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: phân trang 15 user/trang cho Admin Users"
```

---

### Task 4: Xác minh thủ công + cập nhật roadmap

**Files:** `requirement.md` (cập nhật trạng thái), không sửa code khác.

- [ ] **Step 1: `npm run lint` lần cuối trên toàn repo** — 0 lỗi.
- [ ] **Step 2: Chạy lại toàn bộ test suite lần cuối** — PASS.
- [ ] **Step 3: Filter hoạt động đúng** — thử từng filter riêng lẻ (Role, từng nút cấp độ, khoảng ngày) và kết hợp nhiều filter cùng lúc với ô tìm kiếm — xác nhận kết quả đúng logic AND, nút "Xoá bộ lọc" chỉ hiện khi có filter đang bật và reset đúng.
- [ ] **Step 4: Phân trang hoạt động đúng** — nếu có >15 user, xác nhận hiện đúng "Trang 1/N", nút Trước/Sau disable đúng ở biên, đổi bất kỳ filter/search nào cũng nhảy về trang 1.
- [ ] **Step 5: Cập nhật `requirement.md`** — đánh dấu mục "[Feature][Admin][Người dùng] Thêm filter cho từng cột..." đã xong, thêm ghi chú đã làm thêm phân trang.

```bash
git add requirement.md
git commit -m "docs: đánh dấu xong filter + phân trang cho Admin Users"
```

## Self-Review

**Spec coverage:** Filter theo cột (spec §1) → Task 1-2. Phân trang (spec §2) → Task 3. Testing/verification → Task 4.

**Placeholder scan:** không còn TBD — mọi step có code đầy đủ.

**Type consistency:** `UserFilterCriteria`/`filterUsers` định nghĩa ở Task 1, dùng đúng ở Task 2. `filtered`/`totalPages`/`safePage`/`paginated` định nghĩa nối tiếp ở Task 2-3, dùng đúng tên xuyên suốt.
