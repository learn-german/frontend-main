# Quản lý nội dung (Module/Lesson) + Mở khóa level theo user + Roadmap phẳng

## Bối cảnh

Yêu cầu ban đầu là cho phép admin thêm/sửa/xóa module và lesson trong [AdminContentSection.tsx](../../../src/pages/admin/AdminContentSection.tsx). Qua trao đổi, phạm vi thực tế rộng hơn và có 1 thay đổi kiến trúc quan trọng ở cách người học nhìn thấy nội dung:

- **Module cố định 1-1 với level** (A1/A2/B1/B2), không phải "chủ đề" tùy ý — xác nhận qua dữ liệu thật (`m-a1-1`, `m-a2-1`, `m-b1-1`, thiếu `m-b2-1`). Module **không có title/title_vi hiển thị** — admin không sửa/thêm/xóa module, chỉ thấy 4 nhóm cố định gắn nhãn theo level.
- **Người học không thấy nhãn level (A1/A2/...) ở đâu cả** — chỉ thấy 1 danh sách lesson liên tục theo thứ tự, không chia đoạn theo level/module.
- **Level được mở theo từng user** (không phải mở toàn hệ thống) — admin tick chọn A1/A2/B1/B2 nào user được học, trong trang **Người dùng**, không phải trang Nội dung.
- **Nếu user chỉ mở A2 (không mở A1)**, danh sách lesson của user đó bắt đầu thẳng từ lesson đầu tiên của A2 — không cần "hoàn thành A1" vì A1 không nằm trong danh sách của user đó.
- **Cơ chế "học xong bài trước mới mở bài sau" giữ nguyên** — logic này đã có sẵn trong [RoadmapPage.tsx](../../../src/pages/RoadmapPage.tsx) (`getLessonStatus`), chỉ cần áp dụng đúng trên danh sách đã lọc theo level được mở của từng user, không cần viết lại.

## Khảo sát kỹ thuật (đã xác nhận qua Supabase MCP)

**Modules/Lessons** (giữ từ khảo sát trước):
- `lessons.module_id → modules.id` CASCADE; `lessons.next_lesson_id → lessons.id` NO ACTION (phải null hóa trước khi xóa lesson bị trỏ tới); `quiz_questions.lesson_id → lessons.id` CASCADE.
- Id pattern: module `m-{level}-{k}`, lesson `{level}-l{n}` (n theo thứ tự trong module).
- RLS `modules`/`lessons`: `authenticated` đọc tất cả, `admin` insert/update/delete — đủ dùng, không cần đổi.

**Profiles** (mới khảo sát):
- RLS `profiles`: `SELECT`/`UPDATE` cho phép nếu `auth.uid() = id` **HOẶC** JWT có `app_metadata.role = admin` — admin sửa được `profiles` của bất kỳ user khác, user tự đọc được hồ sơ chính mình. **Đủ dùng, không cần đổi RLS.**
- Hiện chưa có cột lưu "level nào được mở cho user này".

**Nguồn dữ liệu hiện tại của RoadmapPage:**
- `useUserStats.ts` fetch `user_stats` (xp, streak) + `lesson_progress` (completedLessons, quizScores) theo `userId` — **chưa fetch `profiles`**, cần mở rộng.
- `RoadmapPage.tsx`: `allLessons` hiện flatten **toàn bộ** module (không lọc), rồi `getLessonStatus` check lesson trước đã `completedLessons` chưa để quyết định "current"/"locked". UI bọc mỗi level trong 1 "Level Group Header Card" riêng (màu + tiêu đề "Cấp độ A1...").

## Thiết kế chi tiết

### 1. Migration: seed module B2

```sql
INSERT INTO modules (id, level, title, title_vi, description, order_index)
VALUES ('m-b2-1', 'B2', 'Vertiefung & Diskussion', 'Nâng cao & Tranh biện', 'Tranh biện học thuật, viết luận, giao tiếp chuyên sâu', 4)
ON CONFLICT (id) DO NOTHING;
```

(Giữ `title`/`title_vi` trong DB cho mọi module — không xóa cột, chỉ đơn giản là **frontend không hiển thị/sửa các field này nữa**. Xóa cột là thay đổi schema không cần thiết cho mục tiêu này.)

### 2. Migration: thêm `profiles.unlocked_levels` + backfill an toàn cho user cũ

```sql
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS unlocked_levels TEXT[] NOT NULL DEFAULT ARRAY['A1']::text[];
```

**Rủi ro cần xử lý:** `DEFAULT ARRAY['A1']` áp dụng cho mọi row hiện có, kể cả user đã học tới A2/B1 — nếu không backfill, họ sẽ bị "khóa ngược" các level đã học. Backfill ngay sau ALTER TABLE, mở thêm level nào user đã có **ít nhất 1 lesson completed** thuộc level đó:

```sql
UPDATE profiles p
SET unlocked_levels = (
  SELECT array_agg(DISTINCT l.level)
  FROM lesson_progress lp
  JOIN lessons l ON l.id = lp.lesson_id
  WHERE lp.user_id = p.id
) || ARRAY['A1']  -- luôn giữ A1 làm baseline
WHERE EXISTS (
  SELECT 1 FROM lesson_progress lp WHERE lp.user_id = p.id
);
```

(User chưa học gì thì giữ default `['A1']` từ `ALTER TABLE`, không cần touch.)

### 3. `appTypes.ts`

- `Level` đổi từ `"A1" | "A2" | "B1"` thành `"A1" | "A2" | "B1" | "B2"`.
- `UserStats` thêm `unlockedLevels: Level[]`.

### 4. `useUserStats.ts` — fetch thêm `unlocked_levels`

Thêm 1 query `profiles.select("unlocked_levels").eq("id", userId).single()` vào `Promise.all` hiện có, map vào `unlockedLevels` trong `EMPTY_STATS`/kết quả trả về (`EMPTY_STATS.unlockedLevels = []` khi chưa đăng nhập).

### 5. `AdminContentSection.tsx` — bỏ sửa module, giữ thêm/xóa lesson

- **Bỏ hoàn toàn UI sửa title/title_vi module** (không còn tính năng "Sửa module" nữa) — header mỗi nhóm chỉ hiện label lấy từ `level` (ví dụ chữ "A1" to, không kèm title/title_vi).
- **Thêm lesson**: nút "+ Thêm bài học" trong mỗi nhóm module đã mở rộng — giữ nguyên hành vi đã spec trước (tạo lesson với title tạm "Bài học mới", id sinh `{level}-l{n}`, `n` = số lesson hiện có trong module + 1, mở ngay `AdminLessonEditor` để điền tiếp).
- **Xóa lesson**: giữ nguyên — modal xác nhận đơn giản (Hủy/Xóa), tự null hóa `next_lesson_id` đang trỏ tới lesson bị xóa trước khi `DELETE`, quiz cascade tự xóa theo.

### 6. `AdminUsersSection.tsx` — thêm cột "Cấp độ mở" (mới)

- `fetchUsers()`: thêm `unlocked_levels` vào `.select(...)` của `profiles`.
- Thêm 1 cột mới trong bảng, giữa "Role" và "XP": 4 checkbox nhỏ nhãn A1/A2/B1/B2 (dùng `LEVELS: Level[] = ["A1","A2","B1","B2"]` lặp qua để render).
- Tick/bỏ tick 1 checkbox → gọi ngay `supabase.from("profiles").update({ unlocked_levels: newArray }).eq("id", u.id)`, cập nhật local state `users` optimistic (không cần đợi refetch toàn bộ danh sách), hiện toast lỗi nếu update thất bại (rollback lại checkbox).

### 7. `RoadmapPage.tsx` — bỏ swimlane theo level, hiển thị danh sách phẳng

- Bỏ mảng `levels` (title/desc/color/ringColor) — không còn dùng để render header nữa.
- `allLessons` đổi từ "flatten toàn bộ module" thành **chỉ lấy module có `level` nằm trong `stats.unlockedLevels`**, giữ nguyên thứ tự hiện có (`modules` đã sort theo `order_index` từ `useModules.ts`, tương ứng đúng thứ tự A1→A2→B1→B2 vì `order_index` của 4 module là 1,2,3,4).
- `getLessonStatus` **giữ nguyên logic** (so completedLessons của lesson liền trước trong danh sách đã lọc) — hoạt động đúng luôn vì nó chỉ nhìn vào `indexInAll` và `allLessons`, không quan tâm level.
- UI: bỏ "Level Group Header Card" bọc từng level; thay bằng 1 danh sách lesson liên tục duy nhất (giữ nguyên phần hiển thị từng lesson item hiện có bên trong card — icon trạng thái Completed/Current/Locked, tên bài, XP — chỉ bỏ phần bọc ngoài chia theo level).
- **Bỏ luôn `{lesson.moduleTitle}` khỏi label mỗi lesson card** (dòng `Bài {overallIdx + 1} • {lesson.moduleTitle}` hiện tại) — đây đang trực tiếp lộ tên module (tiếng Đức, ví dụ "Einführung & Begrüßung") trên từng thẻ bài học, đúng thứ thông tin cần ẩn theo yêu cầu. Label mới chỉ còn `Bài {overallIdx + 1}`.
- Banner tổng tiến trình ở đầu trang (`Tổng tiến trình`, dòng "Hoàn thành A1 để mở khóa bứt tốc A2!") — bỏ câu gợi ý nhắc tên level cụ thể đó (không còn đúng ngữ cảnh khi user có thể không bắt đầu từ A1); có thể đổi thành câu chung không nhắc level, ví dụ "Hoàn thành bài học trước để mở bài tiếp theo!".
- Trường hợp `unlockedLevels` rỗng (về lý thuyết không xảy ra vì default luôn có A1, nhưng vẫn nên xử lý) — hiện 1 empty state ngắn, ví dụ "Chưa có level nào được mở, liên hệ quản trị viên."

## Phạm vi thay đổi

- 2 migration (seed B2, thêm `profiles.unlocked_levels` + backfill).
- `src/lib/appTypes.ts` — mở rộng `Level`, thêm `UserStats.unlockedLevels`.
- `src/lib/hooks/useUserStats.ts` — fetch thêm `unlocked_levels`.
- `src/pages/admin/AdminContentSection.tsx` — bỏ sửa module, giữ thêm/xóa lesson.
- `src/pages/admin/AdminUsersSection.tsx` — thêm cột tick chọn level mở.
- `src/pages/RoadmapPage.tsx` — bỏ chia theo level, lọc theo `unlockedLevels`, hiển thị danh sách phẳng.

Không đổi RLS, không cần Vercel Function/Edge Function mới.

## Testing / verification

- `npm run lint` pass.
- Sau migration: `modules` có đúng 4 module (A1-B2); `profiles` mọi row có `unlocked_levels` không null, user đã học A2 trước migration vẫn có `'A2'` trong `unlocked_levels` sau migration (không bị khóa ngược).
- User mới tạo (chưa có `lesson_progress`) → `unlocked_levels = ['A1']` đúng default.
- Admin tick mở A2 cho 1 user (không tick A1) → đăng nhập user đó, xác nhận Roadmap hiển thị đúng bắt đầu từ `a2-l1`, trạng thái "current" (không "locked").
- Admin bỏ tick hết mọi level 1 user → xác nhận Roadmap hiện empty state, không crash (chia 0 ở `overAllProgress`/`levelProgressPercent` cần guard — đã có guard `levelTotal > 0` sẵn cho phần theo-level cũ, cần kiểm tra lại `overAllProgress` tổng cũng phải guard chia 0 khi `totalLessons === 0`).
- Thêm/xóa lesson trong Admin Content vẫn hoạt động đúng như spec trước (id sinh đúng theo module, xóa gỡ `next_lesson_id` trước).
- Xác nhận UI người học (Roadmap) không còn hiển thị chữ "A1"/"A2"/"Cấp độ..." ở đâu cả.
- Test qua browser: toggle level trong trang Người dùng → mở Roadmap kiểm tra danh sách bài học thay đổi đúng theo tick.

## Ngoài phạm vi (không làm)

- Không cho admin thêm/xóa module, không sửa `level`/title của module — module cố định 1-1 theo level.
- Không làm hệ thống "gói khóa học" phức tạp (hết hạn theo thời gian, thanh toán...) — chỉ là danh sách level mở/khóa vĩnh viễn do admin tick tay.
- Không làm kéo-thả sắp xếp lại thứ tự lesson (order_index) — vẫn tự tính khi tạo mới.
- Không dọn dữ liệu "mồ côi" trong `lesson_progress`/`completedLessons` khi xóa lesson hoặc khi user bị khóa lại 1 level đã học (tiến trình cũ vẫn giữ, chỉ ẩn khỏi danh sách hiển thị nếu level bị khóa lại sau này).
