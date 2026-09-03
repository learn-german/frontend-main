# Google User Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sau Google OAuth, user cũ dùng tên đã lưu hoặc tên Google được backfill, còn user mới phải nhập tên hiển thị trước khi vào ứng dụng.

**Architecture:** `profiles.full_name` là nguồn sự thật và cũng là cờ onboarding: tên trống nghĩa là chưa hoàn tất. Database trigger tạo profile mới với tên trống; `App` tải profile sau mỗi session, render một trang onboarding riêng khi cần, rồi cập nhật app user từ tên vừa lưu.

**Tech Stack:** React 19, TypeScript 5.8, Supabase Auth/Postgres/RLS, Tailwind CSS 4, Node test runner, pgTAP.

**Spec:** `docs/superpowers/specs/2026-09-02-google-user-onboarding-design.md`

## Global Constraints

- Google là phương thức đăng nhập duy nhất.
- Không thêm `onboarding_completed`; chỉ dùng `profiles.full_name`.
- Không ghi đè `profiles.full_name` đã có nội dung.
- Tên mới được trim và phải dài 2–80 ký tự.
- Không dùng `user_metadata` cho phân quyền.
- Không đưa service-role/secret key vào client.
- Không sửa tay `src/lib/database.types.ts`; migration này không đổi shape bảng nên không cần regenerate.
- Trước khi sửa bất kỳ function/component nào, chạy GitNexus `impact(..., direction: "upstream")`, báo blast radius và dừng nếu risk HIGH/CRITICAL cho đến khi user xác nhận.
- Trước mỗi commit, chạy GitNexus `detect_changes({ scope: "staged" })` và xác nhận chỉ có file/symbol dự kiến.
- Worktree đang có thay đổi không liên quan; mỗi commit chỉ stage các file được liệt kê trong task tương ứng.

---

## File Structure

| File | Trách nhiệm |
|---|---|
| `supabase/migrations/20260902000000_google_user_onboarding.sql` | Backfill tên user cũ, sửa trigger user mới, hoàn thiện RLS INSERT/UPDATE. |
| `supabase/tests/profile_onboarding_test.sql` | pgTAP cho trigger mới và ownership policies. |
| `src/lib/profileOnboarding.ts` | Logic thuần phân loại profile và validate/trim tên. |
| `src/lib/profileOnboarding.test.ts` | Unit test cho mọi nhánh tên trống/hợp lệ/không hợp lệ. |
| `src/pages/RegistrationPage.tsx` | Form hoàn tất đăng ký, không truy cập Supabase trực tiếp. |
| `src/pages/RegistrationPage.test.tsx` | Render/contract test cho form onboarding. |
| `src/App.tsx` | Tải profile sau session, giữ pending user, update tên, điều hướng sau onboarding. |
| `src/App.auth.test.ts` | Source-level regression test cho các invariants auth khó render nếu không có Supabase env. |

---

### Task 1: Database backfill, trigger và RLS

**Files:**
- Create: `supabase/tests/profile_onboarding_test.sql`
- Create: `supabase/migrations/20260902000000_google_user_onboarding.sql`

**Interfaces:**
- Consumes: `public.profiles(id, email, full_name)`, `public.user_stats(user_id)`, `auth.users.raw_user_meta_data`, trigger `public.handle_new_user()`.
- Produces: user mới có `profiles.full_name IS NULL`; user authenticated có thể INSERT/UPDATE duy nhất profile của chính mình.

- [ ] **Step 1: Viết pgTAP test thất bại cho trigger và RLS**

Tạo `supabase/tests/profile_onboarding_test.sql`:

```sql
begin;
create extension if not exists pgtap with schema extensions;

select plan(8);

insert into auth.users
  (instance_id, id, aud, role, email, encrypted_password,
   email_confirmed_at, created_at, updated_at,
   raw_app_meta_data, raw_user_meta_data)
values
  ('00000000-0000-0000-0000-000000000000',
   '33333333-3333-3333-3333-333333333333',
   'authenticated', 'authenticated', 'new-google@test.local', 'x',
   now(), now(), now(),
   '{"provider":"google","providers":["google"]}',
   '{"full_name":"Google Name","name":"Fallback Name"}');

select is(
  (select full_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
  null::text,
  'ONB-01 trigger để tên user mới trống');

select is(
  (select count(*) from user_stats where user_id = '33333333-3333-3333-3333-333333333333'),
  1::bigint,
  'ONB-02 trigger vẫn tạo user_stats');

select policies_are('public', 'profiles', array[
  'profiles: admin all',
  'profiles: own insert',
  'profiles: own read',
  'profiles: own update'
], 'ONB-03 profiles có đủ policy cần thiết');

set local role authenticated;
set local "request.jwt.claims" =
  '{"sub":"33333333-3333-3333-3333-333333333333","app_metadata":{"role":"user"}}';

select lives_ok(
  $$update profiles set full_name = '  Nguyễn Văn A  '
      where id = '33333333-3333-3333-3333-333333333333'$$,
  'ONB-04 user cập nhật profile của mình');

select is(
  (select full_name from profiles where id = '33333333-3333-3333-3333-333333333333'),
  '  Nguyễn Văn A  ',
  'ONB-05 database lưu giá trị client gửi; client chịu trách nhiệm trim');

select throws_ok(
  $$insert into profiles (id, email)
      values ('44444444-4444-4444-4444-444444444444', 'other@test.local')$$,
  '42501', null,
  'ONB-06 user không tạo profile cho id khác');

select throws_ok(
  $$update profiles set id = '44444444-4444-4444-4444-444444444444'
      where id = '33333333-3333-3333-3333-333333333333'$$,
  '42501', null,
  'ONB-07 WITH CHECK chặn đổi owner');

set local role postgres;
select is(
  has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE'),
  false,
  'ONB-08 anon không gọi trực tiếp handle_new_user');

select * from finish();
rollback;
```

- [ ] **Step 2: Chạy database test và xác nhận RED**

Run: `npm run test:db`

Expected: FAIL tại `ONB-01` vì trigger hiện tại copy `raw_user_meta_data.full_name`; có thể fail thêm `ONB-03`/`ONB-07` vì policy chưa có `own insert` hoặc `WITH CHECK`.

- [ ] **Step 3: Tạo migration tối thiểu**

Tạo `supabase/migrations/20260902000000_google_user_onboarding.sql`:

```sql
-- Backfill đúng một lần: chỉ các profile chưa có tên.
update public.profiles as p
set full_name = coalesce(
  nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
  nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
  p.email
)
from auth.users as u
where u.id = p.id
  and nullif(btrim(p.full_name), '') is null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, null);

  insert into public.user_stats (user_id)
  values (new.id);

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public;

drop policy if exists "profiles: own insert" on public.profiles;
create policy "profiles: own insert"
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

drop policy if exists "profiles: own update" on public.profiles;
create policy "profiles: own update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);
```

Không thay policy admin hoặc own read hiện có.

- [ ] **Step 4: Chạy database test và xác nhận GREEN**

Run: `npm run test:db`

Expected: PASS toàn bộ pgTAP, gồm 8 test `ONB-*` và các suite support hiện có.

- [ ] **Step 5: Kiểm tra backfill trên schema đã apply**

Run bằng SQL Editor/MCP trên môi trường đã apply migration:

```sql
select count(*) as blank_existing_profiles
from public.profiles
where nullif(btrim(full_name), '') is null
  and created_at < timestamptz '2026-09-02 00:00:00+00';
```

Expected: `0`. Sau đó kiểm tra mẫu không ghi đè:

```sql
select email, full_name
from public.profiles
where full_name is not null
order by created_at desc
limit 10;
```

Expected: tên đã có trước migration vẫn giữ nguyên; profile trống dùng `full_name`, `name`, rồi email theo thứ tự fallback.

- [ ] **Step 6: Kiểm tra scope và commit**

Run GitNexus `detect_changes({ scope: "staged" })` sau khi stage đúng hai file.

```bash
git add supabase/migrations/20260902000000_google_user_onboarding.sql \
  supabase/tests/profile_onboarding_test.sql
git commit -m "feat(auth): add profile onboarding database flow"
```

---

### Task 2: Logic thuần phân loại và validation tên

**Files:**
- Create: `src/lib/profileOnboarding.test.ts`
- Create: `src/lib/profileOnboarding.ts`

**Interfaces:**
- Produces: `needsProfileOnboarding(fullName: string | null | undefined): boolean`.
- Produces: `validateDisplayName(input: string): { value: string; error: null } | { value: null; error: string }`.
- Consumed by: `RegistrationPage.tsx` và `App.tsx`.

- [ ] **Step 1: Viết unit test thất bại**

Tạo `src/lib/profileOnboarding.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { needsProfileOnboarding, validateDisplayName } from "./profileOnboarding";

test("profile cần onboarding khi tên null, rỗng hoặc chỉ có khoảng trắng", () => {
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
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `node --import tsx --test src/lib/profileOnboarding.test.ts`

Expected: FAIL với `ERR_MODULE_NOT_FOUND` cho `profileOnboarding`.

- [ ] **Step 3: Viết implementation tối thiểu**

Tạo `src/lib/profileOnboarding.ts`:

```ts
export function needsProfileOnboarding(fullName: string | null | undefined): boolean {
  return !fullName?.trim();
}

export type DisplayNameResult =
  | { value: string; error: null }
  | { value: null; error: string };

export function validateDisplayName(input: string): DisplayNameResult {
  const value = input.trim();
  if (!value) return { value: null, error: "Vui lòng nhập tên hiển thị." };
  if (value.length < 2 || value.length > 80) {
    return { value: null, error: "Tên hiển thị phải có từ 2 đến 80 ký tự." };
  }
  return { value, error: null };
}
```

- [ ] **Step 4: Chạy test và xác nhận GREEN**

Run: `node --import tsx --test src/lib/profileOnboarding.test.ts`

Expected: 3 tests PASS.

- [ ] **Step 5: Kiểm tra scope và commit**

Run GitNexus `detect_changes({ scope: "staged" })` sau khi stage đúng hai file.

```bash
git add src/lib/profileOnboarding.ts src/lib/profileOnboarding.test.ts
git commit -m "feat(auth): add profile onboarding rules"
```

---

### Task 3: Trang hoàn tất đăng ký

**Files:**
- Create: `src/pages/RegistrationPage.test.tsx`
- Create: `src/pages/RegistrationPage.tsx`

**Interfaces:**
- Consumes: `validateDisplayName(input)` từ Task 2.
- Props: `email: string`, `onSubmit: (fullName: string) => Promise<string | null>`, `onLogout: () => void`.
- Produces: gọi `onSubmit` đúng một lần với tên đã trim; chuỗi lỗi trả về được hiển thị tại `role="alert"`.

- [ ] **Step 1: Viết component test thất bại**

Tạo `src/pages/RegistrationPage.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Chạy test và xác nhận RED**

Run: `node --import tsx --test src/pages/RegistrationPage.test.tsx`

Expected: FAIL với `ERR_MODULE_NOT_FOUND` cho `RegistrationPage`.

- [ ] **Step 3: Chạy impact analysis trước khi tạo component liên kết Login UI**

Không có symbol cũ bị sửa trong task này. Đọc `LoginPage`/`BrandLogo` chỉ để tái sử dụng pattern; không refactor chúng.

- [ ] **Step 4: Viết component tối thiểu**

Tạo `src/pages/RegistrationPage.tsx` với state cục bộ `fullName`, `error`, `isLoading`. Submit phải dùng contract sau:

```tsx
const handleSubmit = async (event: React.FormEvent) => {
  event.preventDefault();
  const result = validateDisplayName(fullName);
  if (result.error) {
    setError(result.error);
    return;
  }

  setError("");
  setIsLoading(true);
  const submitError = await onSubmit(result.value);
  if (submitError) {
    setError(submitError);
    setIsLoading(false);
  }
};
```

JSX phải dùng:

```tsx
<main className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
  <section className="grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200/60 bg-white shadow-xl md:grid-cols-2">
    <form onSubmit={handleSubmit} className="flex min-h-[600px] flex-col justify-center px-8 py-12 sm:px-14 lg:px-20">
      <BrandLogo size="lg" />
      <h1>Hoàn tất đăng ký</h1>
      <p>Chọn tên sẽ hiển thị trong DeutschSelbst.</p>
      <label htmlFor="registration-full-name">Tên hiển thị</label>
      <input
        id="registration-full-name"
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
        minLength={2}
        maxLength={80}
        disabled={isLoading}
        autoComplete="name"
      />
      {error && <div role="alert">{error}</div>}
      <button id="btn-complete-registration" type="submit" disabled={isLoading}>
        {isLoading ? "Đang lưu…" : "Bắt đầu học"}
      </button>
      <button type="button" onClick={onLogout} disabled={isLoading}>Đăng xuất</button>
      <span>{email}</span>
    </form>
    <div
      className="hidden min-h-[600px] bg-slate-950 bg-cover bg-center md:block"
      style={{ backgroundImage: 'url("/login-illustration.png")' }}
      role="img"
      aria-label="Học viên DeutschSelbst đang học tiếng Đức"
    />
  </section>
</main>
```

Hoàn thiện Tailwind spacing/typography bằng pattern hiện có của `LoginPage`; không thêm component abstraction hoặc dependency mới.

- [ ] **Step 5: Chạy test và xác nhận GREEN**

Run: `node --import tsx --test src/pages/RegistrationPage.test.tsx`

Expected: 2 tests PASS.

- [ ] **Step 6: Chạy lint**

Run: `npm run lint`

Expected: PASS, không lỗi TypeScript.

- [ ] **Step 7: Kiểm tra scope và commit**

Run GitNexus `detect_changes({ scope: "staged" })` sau khi stage đúng hai file.

```bash
git add src/pages/RegistrationPage.tsx src/pages/RegistrationPage.test.tsx
git commit -m "feat(auth): add registration completion page"
```

---

### Task 4: Tích hợp profile onboarding vào App auth flow

**Files:**
- Create: `src/App.auth.test.ts`
- Modify: `src/App.tsx:35-205, 279-352`

**Interfaces:**
- Consumes: `needsProfileOnboarding()` từ Task 2 và `RegistrationPage` từ Task 3.
- Consumes database contract: `.from("profiles").select("full_name").eq("id", user.id).maybeSingle()`.
- Produces: app user luôn lấy `fullName` từ `profiles.full_name`; pending identity có shape `{ id: string; email: string; role: string }`.

- [ ] **Step 1: Chạy impact analysis và báo blast radius**

Run GitNexus:

```text
impact({ target: "App", file_path: "src/App.tsx", kind: "Function", direction: "upstream", repo: "frontend-main" })
```

Expected: ghi lại direct callers, affected processes và risk. Nếu HIGH/CRITICAL, dừng và xin xác nhận trước khi sửa.

- [ ] **Step 2: Viết regression test thất bại cho App auth invariants**

Tạo `src/App.auth.test.ts`:

```ts
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
```

- [ ] **Step 3: Chạy test và xác nhận RED**

Run: `node --import tsx --test src/App.auth.test.ts`

Expected: cả 3 test FAIL vì App còn đọc `user_metadata` và chưa có onboarding state/page.

- [ ] **Step 4: Thêm state và helper hydrate session trong App**

Thêm imports:

```ts
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { RegistrationPage } from "./pages/RegistrationPage";
import { needsProfileOnboarding } from "./lib/profileOnboarding";
```

Thêm type/state cạnh auth state:

```ts
type AppUser = { id: string; email: string; fullName: string; role: string };
type PendingUser = Omit<AppUser, "fullName">;

const [user, setUser] = useState<AppUser | null>(null);
const [pendingUser, setPendingUser] = useState<PendingUser | null>(null);
const [profileError, setProfileError] = useState("");
```

Trong auth `useEffect`, thay hai đoạn dựng user từ metadata bằng một helper cục bộ:

```ts
const hydrateSessionUser = async (authUser: SupabaseUser) => {
  const identity: PendingUser = {
    id: authUser.id,
    email: authUser.email ?? "",
    role: (authUser.app_metadata?.role as string) ?? "user",
  };

  setProfileError("");
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", authUser.id)
    .maybeSingle();

  if (error) {
    setUser(null);
    setPendingUser(null);
    setProfileError("Không thể tải hồ sơ. Vui lòng thử lại.");
    return;
  }

  if (!profile) {
    const { error: insertError } = await supabase
      .from("profiles")
      .insert({ id: identity.id, email: identity.email, full_name: null });
    if (insertError) {
      setProfileError("Không thể khởi tạo hồ sơ. Vui lòng thử lại.");
      return;
    }
  }

  const fullName = profile?.full_name?.trim() ?? "";
  if (needsProfileOnboarding(fullName)) {
    setUser(null);
    setPendingUser(identity);
    return;
  }

  setPendingUser(null);
  setUser({ ...identity, fullName });
};
```

`getSession()` phải await `hydrateSessionUser()` trước `setAuthLoading(false)`. Listener gọi `void hydrateSessionUser(session.user)` để callback không chờ Supabase query bên trong. Khi session null, clear cả `user`, `pendingUser`, `profileError` và về landing.

- [ ] **Step 5: Thêm submit onboarding và điều hướng sau lưu**

Thêm handler:

```ts
const handleCompleteRegistration = async (fullName: string): Promise<string | null> => {
  if (!pendingUser) return "Phiên đăng ký không còn hợp lệ.";

  const { data, error } = await supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", pendingUser.id)
    .select("full_name")
    .single();

  if (error || !data?.full_name) return "Không thể lưu tên hiển thị. Vui lòng thử lại.";

  setUser({ ...pendingUser, fullName: data.full_name });
  setPendingUser(null);

  const route = parseRoute(window.location.pathname);
  if (route.page === "landing" || route.page === "login") {
    setCurrentPage("dashboard");
    window.history.replaceState(null, "", "/dashboard");
  }
  return null;
};
```

Khi user cũ hydrate thành công, giữ chính logic redirect `/`/`/login` sang dashboard. Deep-link protected không đổi URL.

- [ ] **Step 6: Render onboarding/error trước layout ứng dụng**

Sau `if (authLoading)`, thêm:

```tsx
if (profileError) {
  return (
    <main className="min-h-screen bg-slate-50 flex flex-col items-center justify-center gap-4 p-6 text-center">
      <p role="alert" className="text-sm text-red-600">{profileError}</p>
      <Button onClick={() => window.location.reload()}>Thử lại</Button>
      <Button variant="ghost" onClick={handleLogout}>Đăng xuất</Button>
    </main>
  );
}

if (pendingUser) {
  return (
    <RegistrationPage
      email={pendingUser.email}
      onSubmit={handleCompleteRegistration}
      onLogout={handleLogout}
    />
  );
}
```

Onboarding phải đứng trước tính `effectivePage`/nav để không render nội dung protected hoặc khởi chạy UI dashboard khi tên còn trống.

- [ ] **Step 7: Chạy targeted tests và xác nhận GREEN**

Run:

```bash
node --import tsx --test \
  src/App.auth.test.ts \
  src/lib/profileOnboarding.test.ts \
  src/pages/RegistrationPage.test.tsx
```

Expected: tất cả tests PASS.

- [ ] **Step 8: Chạy full frontend verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: toàn bộ tests PASS, TypeScript exit 0, Vite build exit 0. Ghi nhận riêng warning chunk-size nếu vẫn chỉ là warning hiện có.

- [ ] **Step 9: Browser verify desktop/mobile**

Khởi động Vite với Supabase env thật hoặc local stack. Kiểm tra:

1. User cũ có tên → Google callback → dashboard, nav hiện đúng `profiles.full_name`.
2. User mới → Google callback → “Hoàn tất đăng ký”.
3. Tên một ký tự bị chặn; tên có khoảng trắng được trim.
4. Submit thành công → dashboard hoặc deep-link ban đầu.
5. Reload giữa onboarding vẫn ở onboarding.
6. Desktop có illustration; mobile ẩn illustration.
7. Không có Vite overlay hoặc console error.

Nếu không có Google/local Supabase test account, dùng một browser fixture/dev-only mock chỉ trong test harness; không thêm bypass auth vào production code.

- [ ] **Step 10: Kiểm tra scope và commit**

Stage đúng các file của task, chạy GitNexus `detect_changes({ scope: "staged" })`, rồi:

```bash
git add src/App.tsx src/App.auth.test.ts
git commit -m "feat(auth): require display name after Google login"
```

---

### Task 5: Xác minh toàn bộ và bàn giao

**Files:**
- No production file changes expected.

**Interfaces:**
- Consumes: commits của Tasks 1–4.
- Produces: bằng chứng migration, frontend và browser cùng tuân thủ spec.

- [ ] **Step 1: Đọc lại spec và đối chiếu từng yêu cầu**

Run:

```bash
git diff main~4..HEAD --check
git status --short
```

Expected: không whitespace error; các thay đổi không liên quan của user vẫn không bị stage/commit.

- [ ] **Step 2: Chạy verification cuối cùng**

Run:

```bash
npm test
npm run lint
npm run build
npm run test:db
```

Expected: tất cả exit 0. Nếu database environment không kết nối được, báo blocker cụ thể và không tuyên bố DB verification đã pass.

- [ ] **Step 3: Chạy GitNexus regression scope**

Run:

```text
detect_changes({ scope: "compare", base_ref: "main", repo: "frontend-main" })
```

Expected: changed symbols chỉ thuộc onboarding/profile auth; affected processes phù hợp `App` auth flow. Nếu HIGH/CRITICAL hoặc có symbol ngoài scope, dừng để review.

- [ ] **Step 4: Security review ngắn**

Xác nhận bằng code/migration:

- Không có service role trong frontend.
- `profiles: own insert/update` ràng buộc `auth.uid() = id` bằng `WITH CHECK`.
- `handle_new_user()` vẫn revoke khỏi PUBLIC.
- App không dùng metadata làm quyền hạn hoặc làm tên hiển thị sau onboarding.
- Existing non-empty names không bị migration ghi đè.

- [ ] **Step 5: Chuẩn bị integration**

Không tự push/merge. Dùng `superpowers:finishing-a-development-branch`, trình bày lựa chọn integration và chỉ thực hiện lựa chọn của user.
