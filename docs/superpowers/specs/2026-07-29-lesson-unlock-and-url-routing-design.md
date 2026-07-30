# Sửa mở khóa bài học & thêm URL routing

Ngày: 2026-07-29

## Bối cảnh

Hai lỗi người dùng báo:

1. Làm xong bài tập Ngữ pháp nhưng bài học tiếp theo vẫn bị khóa.
2. Mỗi lần refresh, app quay về trang chủ.

## Quy tắc nghiệp vụ (đã chốt)

- Một bài học được tính "Đã xong" khi **mọi mục có câu hỏi** (Ngữ pháp, Nghe, Đọc) đều đạt `PASS_THRESHOLD` = 80.
- Mục nào **không có câu hỏi** thì được bỏ qua, coi như đã pass.
- Bài học không có câu hỏi ở bất kỳ mục nào → tính "Đã xong" ngay, mở khóa bài kế tiếp.

## Nguyên nhân gốc

### Lỗi 1 — mở khóa

`applicableCategories()` trong `src/lib/completion.ts` xác định "mục nào bắt buộc pass" dựa trên **có nội dung**, không phải **có câu hỏi**:

| Mục | Code hiện tại | Đúng ra |
|---|---|---|
| Ngữ pháp | luôn bắt buộc | có row trong `grammar_exercises_public` |
| Nghe | có `listening_clips` | có `quiz_questions_public` với `category = 'nghe'` |
| Đọc | có `reading_passages` | có `quiz_questions_public` với `category = 'doc'` |

Bài học có file nghe hoặc đoạn đọc nhưng chưa soạn câu hỏi cho mục đó ⇒ mục đó vĩnh viễn không đạt 80đ ⇒ bài không bao giờ `completed` ⇒ bài kế tiếp khóa vĩnh viễn.

Hai lỗi cùng triệu chứng, sửa chung:

- **Draft chặn chuỗi.** `RoadmapPage.tsx` xét khóa dựa trên *item liền trước*, mà item đó có thể là bài `draft`. Draft không bao giờ nằm trong `completedLessons` ⇒ mọi bài sau nó khóa vĩnh viễn.
- **Nút "Bài tiếp theo" nhảy sai.** `handleNextLesson` trong `App.tsx` chạy trên `flatLessons` (tất cả module kể cả level chưa unlock, thứ tự theo module, bỏ qua draft) — lệch với thứ tự hiển thị của Lộ trình.

### Lỗi 2 — refresh

App không có URL routing. Trang nằm trong `useState` (`currentPage`, khởi tạo `"landing"`), và `App.tsx` còn ép `setCurrentPage("dashboard")` vô điều kiện khi khôi phục session. `vercel.json` đã rewrite mọi path về `/`.

---

## Phần A — Sửa logic mở khóa

### A1. Nguồn dữ liệu "mục nào có câu hỏi"

`useModules` đã fetch `grammar_exercises_public` để dựng `hasNguphapQuestions`. Thêm truy vấn thứ ba vào cùng `Promise.all` (không thêm round-trip):

```
supabase.from("quiz_questions_public").select("lesson_id, category")
```

Dựng `Map<lessonId, Set<category>>`, gắn vào `Lesson` (trong `src/lib/appTypes.ts`) hai trường mới cạnh `hasNguphapQuestions`:

- `hasNgheQuestions?: boolean`
- `hasDocQuestions?: boolean`

Chỉ select 2 cột; số row bị chặn bởi tổng số câu hỏi trong hệ thống.

### A2. `applicableCategories` xét câu hỏi thay vì nội dung

Trong `src/lib/completion.ts`, đổi interface `LessonContentFlags` (đang mang `listeningClips` / `readingPassages`) thành `LessonQuizFlags`:

```ts
export interface LessonQuizFlags {
  id: string;
  hasNguphapQuestions?: boolean;
  hasNgheQuestions?: boolean;
  hasDocQuestions?: boolean;
}
```

`applicableCategories(lesson)` trả về những mục có cờ tương ứng `=== true`.

**Quy ước bắt buộc:** chỉ `=== true` mới tính là bắt buộc. `undefined` (mock data, test cũ, lesson dựng tay) coi như *không có câu hỏi* — nếu coi `undefined` là "có", lỗi khóa cứng sẽ tái diễn.

Hệ quả tự động, không cần code thêm: bài không có câu hỏi ở mục nào → `applicableCategories` trả `[]` → `.every()` trả `true` → "Đã xong" ngay. Đúng quy tắc đã chốt.

**Điểm phải sửa kèm:** `src/pages/admin/AdminUsersSection.tsx` (dòng ~218, ~237, ~465) dùng chung `completion.ts` để tính tiến độ học viên. Phải truyền cờ mới vào, nếu không màn hình admin tính lệch so với app.

### A3. Ẩn nút bài tập khi mục chưa có câu hỏi

`LessonDetailPage.tsx` bật tab Nghe/Đọc theo có clip/passage — **giữ nguyên**, người học vẫn nghe/đọc nội dung được. Chỉ nút "Bắt đầu bài tập" bên trong tab đó mới ẩn khi mục chưa có câu hỏi, tránh dẫn học viên vào bài tập rỗng.

### A4. Draft không chặn chuỗi

Tách module logic thuần mới `src/lib/lessonOrder.ts`:

```ts
buildRoadmapItems(modules, positions, unlockedLevels): {
  items: RoadmapItem[];        // lesson + draft, đã sort — dùng để render
  orderedLessons: Lesson[];    // CHỈ lesson, đã sort — dùng để tính khóa
}
```

Chuỗi khóa tính trên `orderedLessons` bằng `computeLessonStatuses` **đã có sẵn** trong `completion.ts` ⇒ draft bị bỏ qua hoàn toàn.

`RoadmapPage.tsx` xóa `getLessonStatus` và logic gộp/sort nội bộ (dòng ~33–62), chỉ còn nhận kết quả và render.

Tách file riêng vì `App.tsx` cũng cần đúng danh sách này (A5), và logic thuần thì test được mà không cần render.

### A5. "Bài tiếp theo" đi đúng thứ tự Lộ trình

`handleNextLesson` trong `App.tsx` bỏ `flatLessons`, dùng `orderedLessons` từ A4 (đã lọc level chưa unlock, sort theo `orderIndex`, bỏ draft). Hết bài → giữ nguyên toast + về dashboard như hiện tại.

---

## Phần B — URL routing

### B1. `src/lib/router.ts` — parse/serialize thuần

```ts
type AppRoute =
  | { page: "landing" | "login" | "dashboard" | "roadmap" | "leaderboard" }
  | { page: "lesson-detail"; lessonId: string; tab?: BottomTab }
  | { page: "quiz"; lessonId: string; category: QuizCategory };

parseRoute(pathname: string): AppRoute   // không khớp → landing
serializeRoute(route: AppRoute): string
```

| Đường dẫn | Trang |
|---|---|
| `/` | landing |
| `/login` | login |
| `/dashboard` | dashboard |
| `/roadmap` | roadmap |
| `/leaderboard` | leaderboard |
| `/lesson/:lessonId` | lesson-detail |
| `/lesson/:lessonId/:tab` | lesson-detail + tab |
| `/quiz/:lessonId/:category` | quiz |
| `/reset-password` | login (xem B7) |

Hàm thuần, không đụng `window`.

### B2. Đồng bộ hai chiều trong `App.tsx`

Giữ nguyên 4 state hiện có (`currentPage`, `selectedLessonId`, `initialLessonTab`, `activeExerciseCategory`) làm source of truth; URL là hình chiếu.

- **Khởi tạo:** 4 state đọc từ `parseRoute(location.pathname)` thay vì hằng `"landing"` / `"a1-l1"`.
- **State → URL:** một `useEffect` tính `serializeRoute(...)`; khác `location.pathname` thì `history.pushState`.
- **URL → state:** listener `popstate` parse rồi set lại 4 state.

Không cần cờ chống lặp: sau khi `popstate` set state xong, `serializeRoute` bằng đúng `pathname` nên effect không push lại. Nút Back/Forward hoạt động miễn phí.

### B3. Deep-link khi chưa login — URL chính là bộ nhớ

**Không** đẩy URL sang `/login`. Vào `/lesson/a1-l3` khi chưa đăng nhập thì URL giữ nguyên, chỉ *render* màn hình đăng nhập:

```ts
effectivePage = (!user && isProtected(route)) ? "login" : route.page
```

Login xong → `user` có giá trị → URL vẫn là `/lesson/a1-l3` → vào thẳng đúng bài.

Lý do chọn cách này thay vì lưu `redirectTo`: codebase **không có `safeStorage`** (CLAUDE.md có nhắc nhưng chưa được viết; không chỗ nào trong `src/` dùng `localStorage`). Lưu `redirectTo` trong state React sẽ mất khi đăng nhập Google vì OAuth reload cả trang. URL sống sót qua reload, không cần storage mới.

**Sửa kèm bắt buộc:** `src/lib/auth.ts` — `signInWithGoogle` đang đặt `redirectTo: window.location.origin`, đổi thành `window.location.href`; nếu không, Google vẫn ném người dùng về `/`.

### B4. Bỏ ép về dashboard khi khôi phục session

`App.tsx` trong `getSession().then(...)` hiện gọi `setCurrentPage("dashboard")` vô điều kiện — nguyên nhân trực tiếp của lỗi 2.

Thay bằng: chỉ khi route đang là `/` hoặc `/login` mới chuyển sang dashboard, và dùng `history.replaceState` (không phải `pushState`) để nút Back không kẹt vòng lặp. Chỉ áp dụng cho lần khôi phục session đầu tiên.

Nhánh `onAuthStateChange` đã có điều kiện đúng (`prev === "landing" || prev === "login"`), giữ nguyên.

### B5. Deep-link vào bài đang bị khóa

Chặn: khi `modules` đã tải xong và bài ở trạng thái `locked` (theo `computeLessonStatuses` từ A4) → `showToast` báo cần hoàn thành bài trước, rồi chuyển về `/roadmap`.

Không chặn thì URL trở thành đường vòng qua toàn bộ cơ chế khóa mà phần A vừa sửa. `lessonOrder.ts` đã tính sẵn status nên chi phí gần như bằng không.

Điều kiện kích hoạt: **chỉ sau khi `modulesLoading === false`**, để không chặn nhầm lúc dữ liệu chưa về.

### B6. Đổi tab trong bài học cập nhật URL

`LessonDetailPage` nhận thêm callback `onTabChange(tab)`; `App.tsx` cập nhật `initialLessonTab` ⇒ URL thành `/lesson/a1-l3/nghe`. Refresh giữ nguyên tab đang xem.

### B7. `/reset-password`

`src/lib/auth.ts` — `resetPassword` trỏ `redirectTo` về `/reset-password` nhưng app **không có trang này** (hiện rewrite về landing nên không ai thấy lỗi).

Quyết định: map `/reset-password` → màn hình login, giữ nguyên hành vi hiện tại, không làm vỡ thêm. Dựng luồng đặt lại mật khẩu đầy đủ là task riêng, ngoài scope.

### B8. Hạ tầng

Không đụng gì. `vercel.json` đã rewrite `/(.*) → /` nên deep-link production chạy ngay; Vite dev server có sẵn SPA fallback.

### B9. Refresh giữa lúc dữ liệu chưa về

Nhánh "Bài học không khả dụng" trong `App.tsx` đã chặn bằng `!modulesLoading`, và `showModulesLoader` đã phủ trạng thái chờ. Deep-link `/lesson/:id` sẽ hiện spinner rồi mới kết luận. Phần này chỉ cần verify, không sửa.

---

## Kiểm thử

`completion.ts`, `lessonOrder.ts`, `router.ts` đều thuần → test bằng `node:test`, cùng kiểu với `src/lib/grammarFillInBlank.test.ts`.

Ca cần phủ:

**Mở khóa**
- Chỉ có câu hỏi Ngữ pháp, đạt 80 → completed.
- Có clip nghe nhưng **không** có câu hỏi nghe, ngữ pháp đạt 80 → completed *(chính là bug đã báo)*.
- Có câu hỏi nghe, chưa làm → chưa completed.
- Không có câu hỏi ở mục nào → completed ngay.
- Cờ `undefined` → coi như không có câu hỏi.

**Thứ tự & khóa**
- Draft nằm giữa chuỗi → bài sau draft không bị khóa.
- Draft nằm đầu chuỗi → bài lesson đầu tiên là `current`.
- Level chưa unlock không lọt vào `orderedLessons`.
- `handleNextLesson` từ bài cuối → toast + dashboard.

**Router**
- Round-trip `parseRoute(serializeRoute(r)) === r` cho mọi biến thể route.
- Path không khớp → landing.

Kiểm thử thủ công: refresh trên từng route; Back/Forward; deep-link khi chưa login (cả email lẫn Google); deep-link vào bài khóa; đổi tab rồi refresh.

## Ghi chú vận hành

`package.json` **không có script `test`** — các file `.test.ts` hiện chạy thủ công bằng `npx tsx --test`. Spec này không thêm script hay dependency mới (theo ràng buộc trong CLAUDE.md).

## Ngoài scope

- Dựng luồng đặt lại mật khẩu (`/reset-password`).
- Viết helper `safeStorage`.
- Thêm `react-router-dom` — đã cân nhắc và loại: bề mặt route quá nhỏ (7 trang), refactor `App.tsx` sâu, rủi ro regression cao cho một lần sửa bug.
