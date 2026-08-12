# Lộ trình nền tảng bài tập & Daily Progress Report

Ngày: 2026-07-30

Tài liệu này là **roadmap cấp trên**, không phải spec triển khai. Nó chốt thứ tự
phase, các quyết định kiến trúc xuyên suốt và ranh giới phạm vi. Mỗi phase sẽ có
spec + plan riêng.

## Nguồn yêu cầu

`requirement.md` gộp năm hạng mục độc lập:

| # | Hạng mục | Phase |
|---|---|---|
| 1 | Grammar: pass 80%, mở lời giải khi đúng hết hoặc đến lần 5 | Phase 2 |
| 2 | Daily Progress Report | Phase 5b |
| 3 | Lưu đáp án đang làm dở, chưa submit | Phase 3 |
| 4 | Bug admin bài tập phân loại không thêm được từ | Phase 0 |
| 5 | Port toàn bộ 8 dạng câu hỏi Grammar sang Nghe và Đọc | Phase 4 |

Không hạng mục nào gộp chung spec được. Thứ tự dưới đây sắp theo dependency, để
phase sau không phải migrate lại thứ phase trước vừa dựng.

## Giả định nền

> Hệ thống đang ở giai đoạn phát triển, **chưa có người dùng thật**. Mọi migration
> được phép xoá và tạo lại dữ liệu học viên (`grammar_attempts`, câu hỏi lẻ) mà
> không cần đường migrate bảo toàn hay backup.
>
> **Giả định này hết hiệu lực ngay khi có user thật.** Từ thời điểm đó, mọi phase
> còn lại phải quay về lối migrate bảo toàn dữ liệu. Đừng đọc lại tài liệu này
> sáu tháng sau rồi vô tư `DROP TABLE` trên production.

## Hiện trạng codebase

| Sự thật hiện tại | Hệ quả |
|---|---|
| `grammar_exercises` — mỗi row là **một câu hỏi**; gom nhóm lỏng bằng `group_id` | Chưa có thực thể "bài tập" mà requirement cần |
| `grammar_attempts` UNIQUE `(lesson_id, user_id)` | Attempt đang tính cho cả lesson, không phải từng bài tập |
| View `grammar_exercises_public` **đang trả `explanation`** (`20260729000001`) | Vi phạm AC "chưa mở khoá thì không trả giải thích", ngay ở tầng DB |
| `correct_answer` chưa từng ra client | Cần đường trả về mới, chỉ qua Edge Function |
| `lesson_progress (user_id, lesson_id, category, completed_at, quiz_score)` | Nơi ghi "đã hoàn thành"; Phase 5b đọc từ đây |
| Không có bảng gói cước / kế hoạch level | Phase 5b chạy ở chế độ rút gọn |

## Nguyên tắc xuyên suốt

1. **Chốt đơn vị "bài tập" một lần, sớm nhất.** Đây là lý do Phase 1 tồn tại và
   phải đứng trước Phase 2, 3, 4.
2. **Category-agnostic từ đầu.** Mọi bảng và hàm mới mang `category`
   (`nguphap | nghe | doc`) ngay cả khi phase đó chỉ chạy cho ngữ pháp. Đây là
   đòn bẩy khiến Phase 4 gần như chỉ là mở rộng loader.
3. **Trạng thái "đã mở lời giải" suy ra từ server** (`attempt_count`,
   `best_score`), không lưu localStorage — AC yêu cầu giữ được qua reload và qua
   làm lại.
4. **`correct_answer` và `explanation` không bao giờ đi qua PostgREST.** Chúng chỉ
   được phép nằm trong response của Edge Function, sau khi hàm đó tự kiểm tra
   điều kiện mở khoá.

## Mô hình dữ liệu đích

```
lesson (video)
  └─ exercise_set        ← đơn vị pass 80% / attempt / khoá tuần tự
       └─ group          ← khối câu cùng dạng, chung hint (tuỳ chọn)
            └─ exercise  ← 1 câu hỏi
```

### Ba quyết định đã chốt cho Phase 1

**Q1 — `group_id` giữ song song với `set_id`, không thay thế.**

Hai khái niệm khác nhau ở ba điểm:

| | `group_id` (đang có) | `set_id` (thêm mới) |
|---|---|---|
| Là gì | Khối câu **cùng một dạng**, một accordion, **chung một `hint`** | Đơn vị **chấm điểm / pass / attempt** |
| Ràng buộc type | Có — group key là `group:${groupId}:${type}` (`src/lib/grammarExerciseGroups.ts:17`) | Không — một set được chứa nhiều dạng |
| Ai dùng | UI hiển thị + admin authoring | Business rule 80%, attempt, khoá tuần tự |

Bỏ `group_id` sẽ kéo theo: mất `hint` chung theo nhóm
(`src/components/GrammarExerciseHint.tsx` lấy hint từ `group.exercises[0].hint`),
phá luồng admin vừa xây ở hai vòng feature ngày 2026-07-22, và trói set vào ràng
buộc "thuần một dạng" mà requirement không hề đòi. Chi phí giữ lại chỉ là một cột
nullable.

Ràng buộc bắt buộc kèm theo:

- Một `group_id` không được trải qua hai set — nếu không, một khối câu bị cắt đôi
  giữa hai đơn vị chấm điểm. Cưỡng chế ở tầng DB (trigger hoặc unique
  `(group_id, set_id)` + chặn ghi); cách cụ thể chốt ở spec Phase 1.
- `set_id` NOT NULL sau backfill. Không có câu mồ côi nằm ngoài mọi đơn vị chấm.
- Admin UI hiển thị set là cấp ngoài cùng, group chỉ là "khối câu cùng dạng, chung
  gợi ý" bên trong. Không để hai khái niệm trông ngang hàng.

**Q2 — Giữ nguyên tên bảng `grammar_exercises`.**

Phase 4 dùng chung bảng cho Nghe/Đọc thì tên hơi lệch ngữ nghĩa, đổi lại tránh
được một lần rename đụng `database.types.ts`, hai Edge Function, admin section
1000+ dòng và toàn bộ hook. Nếu sau muốn đổi, làm một PR rename thuần tuý.

Hệ quả: `category` nằm trên `exercise_sets`; `grammar_exercises` **suy ra**
category từ set, không mang cột riêng. Một nguồn sự thật.

**Q3 — Xoá hết câu lẻ (`group_id IS NULL`) trong Phase 1.**

Mô hình sạch hơn, và tránh kịch bản học viên phải pass lần lượt một chuỗi "bài
tập" mỗi cái đúng một câu. Không cần backup, không cần kiểm kê chờ xác nhận, theo
giả định nền ở trên.

---

## Phase 0 — Sửa bug admin bài tập phân loại

**Yêu cầu #4.** Cô lập, không đụng schema. Đứng đầu vì các phase sau cần admin
nhập được dữ liệu thật để test.

- Reproduce trước, dùng skill `systematic-debugging`, không đoán.
- Nghi vấn ban đầu ở `src/pages/admin/AdminGrammarExerciseSection.tsx`:
  `addItemToForm` gán `group: classification_groups[0] ?? ""`, trong khi validate
  chặn `!groups.includes(it.group)` — thêm từ khi chưa tạo nhóm sẽ luôn fail. Đây
  là giả thuyết, phải xác minh.
- Xong khi: admin thêm/sửa/xoá nhóm và từ ở dạng phân loại chạy đúng, có test cho
  hàm reducer form.

Rủi ro với phase sau: không có.

## Phase 1 — Nền: thực thể "bộ bài tập"

Phase quyết định. Làm sai hoặc làm muộn thì Phase 2, 3, 4 đều phải migrate lần hai.

**Migration (2 bước, không còn 5 nhờ giả định nền):**

1. Tạo `exercise_sets`: `id`, `lesson_id`, `category`, `title`, `order_index`,
   `status`. Thêm `grammar_exercises.set_id` nullable.
2. Backfill mỗi `group_id` thành một set, xoá hết câu `group_id IS NULL`, đặt
   `set_id` NOT NULL — cùng một migration.

**Admin:** UI quản lý set (tạo, đổi tên, sắp thứ tự, gán câu hỏi vào set).

**Học viên:** không thấy thay đổi gì. Trang ngữ pháp render y hệt.

Xong khi: dữ liệu backfill đủ, regression test xác nhận trang học viên không đổi,
admin quản lý được set.

## Phase 2 — Pass 80%, gate lời giải, attempt theo set

**Yêu cầu #1.**

**Bảo mật trước:** bỏ `explanation` khỏi `grammar_exercises_public`. Từ đây giải
thích chỉ đi ra từ response của `grammar-submit`.

**Dữ liệu:**

- `DROP TABLE grammar_attempts`, tạo mới `exercise_set_attempts`: UNIQUE
  `(user_id, set_id)`, kèm `category`, `attempt_count`, `best_score`, `is_passed`,
  `revealed`, `last_submission_id`, snapshot bài nộp gần nhất, `submitted_at`.
  Chỉ service_role được ghi.
- Idempotency: client sinh `submission_id`; server thấy trùng `last_submission_id`
  thì trả lại kết quả cũ và **không tăng attempt**. Phục vụ trực tiếp AC
  "double-click hoặc retry không tăng attempt".

**Backend — `grammar-submit` v2:**

- Chấm theo set. Dùng `correctCount × 100 >= totalQuestions × 80` (số nguyên,
  không làm tròn) đúng BR-02.
- `attempt_count` chỉ tăng khi chấm **và** ghi thành công.
- Điều kiện mở khoá: `correctCount === total` **hoặc** `attempt_count >= 5`. Chỉ
  khi đó response mới kèm `correct_answer` và `explanation`. Đã mở thì mở vĩnh
  viễn.
- `is_passed` và `revealed` độc lập nhau. Lần 5 đạt 60% thì mở lời giải nhưng
  không pass.

**Frontend:**

- Card kết quả: đúng/sai từng câu, `x/y`, tỷ lệ, badge Đạt / Chưa đạt.
- Chưa đạt → chỉ có **Làm lại**. Đạt → **Tiếp tục** mở set kế tiếp.
- Set kế tiếp khoá cho tới khi set trước pass, thứ tự theo `order_index` (BR-01).
- Trạng thái mở lời giải hydrate từ server khi mount.

**Rủi ro cần canh:** đây đúng vùng vừa có loạt commit sửa lỗi hydrate và ghi đè
(`23c7760`, `3db99a7`). Phải có test cho đường hydrate, không chỉ đường submit.

Xong khi: sáu test case trong bảng của requirement pass, và `explanation` /
`correct_answer` không xuất hiện trong bất kỳ response PostgREST nào.

## Phase 3 — Lưu đáp án đang làm dở

**Yêu cầu #3.**

- Bảng `exercise_set_drafts`: UNIQUE `(user_id, set_id)`, `answers` JSONB,
  `updated_at`. Học viên tự đọc/ghi được (RLS `user_id = auth.uid()`) — draft
  không chứa gì nhạy cảm.
- **Tách bạch tuyệt đối với snapshot bài đã nộp.** Thứ tự ưu tiên hiển thị: đang
  có kết quả chưa bấm "Làm lại" → hiện snapshot đã nộp; đang ở trạng thái làm bài
  → hiện draft.
- Autosave debounce, kèm nút lưu tường minh. Xoá draft sau khi submit thành công.
- Áp dụng cho cả ba category ngay, vì mô hình Phase 1 đã category-agnostic.

Vì sao sau Phase 2: draft key theo `set_id`. Làm trước Phase 1 thì phải key theo
`lesson_id` rồi migrate lại.

## Phase 4 — Port 8 dạng câu hỏi sang Nghe và Đọc

**Yêu cầu #5.**

- Mở rộng `exercise_sets` sang `category = 'nghe' | 'doc'`. Câu hỏi dùng chung
  bảng `grammar_exercises` (tên giữ nguyên theo Q2).
- Gắn set với `listening_clips` / `reading_passages` đang có.
- Admin: tab Nghe/Đọc dùng lại đúng editor của ngữ pháp.
- Edge Function submit tổng quát hoá theo category — **một hàm**, không copy-paste
  ba bản.
- Quiz cũ dạng `listening` trong `quiz_questions`: chốt migrate hay để song song
  khi viết spec phase này.

Nếu Phase 1–2 tuân thủ nguyên tắc category-agnostic, phase này gần như không đụng
gì đã có.

## Phase 5b — Daily Progress Report, bản rút gọn

**Yêu cầu #2.** Phase 5a (nền gói cước và kế hoạch level) **bị bỏ** theo quyết
định của product owner. Điều đó thu hẹp phạm vi thật sự, ghi rõ ở đây để không bị
hiểu là làm thiếu.

**Làm được với dữ liệu hiện có:**

- `actual_progress` = lesson bắt buộc đã hoàn thành / tổng. Cần thêm cờ
  `lessons.is_required`.
- Level hiện tại, current lesson, `x/y` lesson, progress bar, nút **Tiếp tục học**.
- Bảng `daily_progress_reports` với unique `(user_id, level_id, report_date)` và
  index `(user_id, report_date)`. Cập nhật lại report trong ngày khi học viên hoàn
  thành lesson.
- API lấy report mới nhất và lịch sử. RLS: user chỉ xem của chính mình.
- Scheduled job: `pg_cron` gọi Edge Function. Timezone cần chốt (dự kiến
  `Asia/Ho_Chi_Minh`).

**Không làm được nếu thiếu 5a — trả `insufficient_data`:**

- `expected_progress`, `progress_gap`, và ba trạng thái `Đúng tiến độ` /
  `Cần chú ý` / `Chậm tiến độ`. Thiếu `level_started_at` và
  `planned_completion_date`.
- `package_remaining_days`. Thiếu `subscription_end_date`.
- Điều kiện "chỉ tạo report cho user có package active".

UI phải hiển thị đúng nhánh `Chưa đủ dữ liệu để đánh giá tiến độ`. Các cột tương
ứng vẫn tạo trong schema và để null, nên khi có 5a chỉ cần bật lên, không phải sửa
lại bảng.

Vì sao để cuối: `actual_progress` đếm lesson bắt buộc đã hoàn thành, mà định nghĩa
"hoàn thành" bị Phase 2–4 thay đổi (pass 80% mới tính). Làm 5b trước Phase 2 thì
công thức sai ngay sau đó.

## Phase 6 — Bài đọc phong phú (thay thế "Đọc" hiện tại)

**Nguồn:** yêu cầu 2026-08-10, brainstorm riêng (không nằm trong `requirement.md` gốc
của roadmap này). Thêm vào đây để giữ một nơi duy nhất theo dõi thứ tự phase.

Tách làm hai spec độc lập, không gộp:

- **Phase 6a — Admin tạo/sửa bài đọc.** Bảng mới `reading_exercises` (không mở
  rộng `grammar_exercises` — cấu trúc lồng nhau statements/sub_questions không
  hợp với shape phẳng hiện có), vẫn gắn `exercise_sets` để tái dùng draft/publish +
  sắp xếp. 4 loại văn bản (`plain_text`, `message_text`, `short_notice`,
  `multi_text`) × 2 dạng câu hỏi (`richtig_falsch`, `multiple_choice`) phối tự do.
  Tab "Đọc" trong Admin chuyển hẳn sang UI mới; dữ liệu "Đọc" kiểu cũ
  (`grammar_exercises` category `doc`) **xoá bỏ**, không cần migrate — theo đúng
  giả định nền "chưa có người dùng thật" ở đầu roadmap này. Preview mô phỏng
  tương tác học viên, chưa cần trang học viên thật.
- **Phase 6b — Học viên làm bài + chấm điểm.** `grammar-submit` hiện gắn chặt vào
  bảng `grammar_exercises` (query cứng tên bảng, rollup dựa trên
  `grammar_exercises` không rỗng) — cần tách phần chấm điểm để nhánh sang
  `reading_exercises` khi `category = doc`, hoặc Edge Function riêng tái dùng
  `exercise_set_attempts`/XP/rollup. Chốt cách tiếp cận khi viết spec phase này.

Rủi ro cần canh ở 6b: đụng đúng vùng logic rollup lesson/XP/idempotency đang chạy
ổn cho Ngữ pháp — không được phá khi thêm nhánh category doc.

## Phase 6c — Làm bài đọc từng đoạn + admin reorg (đã xong)

**Nguồn:** yêu cầu 2026-08-12, tiếp nối Phase 6a/6b ở trên. Spec:
[2026-08-12-reading-exercise-per-passage-flow-design.md](2026-08-12-reading-exercise-per-passage-flow-design.md),
plan: [2026-08-12-reading-exercise-per-passage-flow.md](../plans/2026-08-12-reading-exercise-per-passage-flow.md).

- Màn làm bài đọc tách theo từng đoạn văn (1 đoạn/màn, chấm + hiện đáp án ngay sau
  mỗi đoạn, điểm tổng cuối cùng vẫn là tổng đúng/tổng câu cả set) — `reading-submit`
  thêm nhánh `passage_id` chấm tạm không ghi DB.
- Tab "Lesen" (`LessonDetailPage`) bỏ preview toàn bộ văn bản, chỉ còn CTA giống tab
  "Nghe".
- Admin "Đọc" nhóm theo Level (A1/A2/B1/B2) giống "Ngữ pháp"/"Nghe" (tái dùng
  `AdminModuleGroup`), thêm ô tìm kiếm.
- Preview văn bản trong `PassageEditRow` (đã có từ trước, dễ bị bỏ sót vì chỉ có
  icon) — thêm nhãn chữ "Xem trước"/"Chỉnh sửa".

## Việc tiếp theo — backlog nhỏ, quy trình bắt buộc

Các mục dưới đây là yêu cầu rời rạc, chưa thuộc phase nào ở trên và **chưa triển
khai**. Khi bắt đầu bất kỳ mục nào, phải đi đúng 3 bước, theo thứ tự:

1. `/superpowers:brainstorming` — làm rõ yêu cầu, chốt phạm vi + design, viết spec
   trước khi đụng code (kể cả khi mục nhìn có vẻ đơn giản).
2. `/ponytail:ponytail` — khi implement, giữ giải pháp tối giản, không thêm
   abstraction/thư viện không cần thiết.
3. `/gitnexus-cli` (bộ công cụ GitNexus nói chung — `impact`, `context`, `query`) —
   chạy impact analysis trước khi sửa hoặc xoá bất kỳ symbol nào đang được dùng ở
   nhiều nơi, xác nhận không phá luồng khác trước khi commit.

### Task 1 — Xoá dạng bài "Điền vào chỗ trống"

**Nguồn:** yêu cầu 2026-08-12, kèm ảnh chụp modal "Thêm bài tập mới" trong Admin
Ngữ pháp (`AdminGrammarExerciseSection.tsx`) — dropdown "Loại bài tập" đang có lựa
chọn "Điền vào chỗ trống" (`fill_in_the_blank`).

Xoá dạng bài tập này khỏi hệ thống — không còn là lựa chọn khi admin tạo bài tập
mới. Phạm vi cụ thể **chưa chốt**, brainstorm khi bắt đầu task này, tối thiểu cần
trả lời:

- Bài tập `fill_in_the_blank` đang tồn tại trong DB: xoá thẳng hay giữ lại
  (chỉ ẩn lựa chọn tạo mới, học viên cũ vẫn thấy bài cũ nếu có)?
- `src/lib/grammarFillInBlank.ts` (`normalizeWordBank`, `syncBlankDefinitions`,
  `BlankDefinition`, `WordBank`) và UI nhập liệu tương ứng trong
  `AdminGrammarExerciseSection.tsx` (`ExerciseEntryFields`, khối
  `entry.type === "fill_in_the_blank"`) — xoá hẳn hay giữ lại phòng dùng lại sau?
- `word_bank` liên quan đến cả `text_fill_blank` (dạng khác, đang dùng chung field
  `word_bank`?) — cần `impact`/`context` xác nhận trước khi xoá, tránh xoá nhầm
  logic dùng chung.
- Ảnh hưởng `GrammarExerciseHint`, `grammar-submit` (chấm điểm `fill_in_the_blank`),
  và dữ liệu học viên đã làm dạng này (nếu có).

## Ngoài phạm vi toàn bộ roadmap

- Thay đổi nội dung câu hỏi, đáp án hoặc giải thích do admin đã tạo.
- Tính điểm chung cho toàn bộ video.
- Cho phép bỏ qua bài tập chưa pass.
- Gửi Daily Report qua email hoặc push notification.
- Báo cáo tuần/tháng, biểu đồ xu hướng, AI phân tích nguyên nhân học chậm.
- Đổi tên `grammar_exercises` (nếu cần, làm PR rename riêng).

## Câu hỏi còn mở

- Phase 1: cưỡng chế "một `group_id` không trải qua hai set" bằng trigger hay
  unique constraint?
- Phase 4: `quiz_questions` dạng `listening` — migrate sang mô hình set hay để
  song song?
- Phase 5b: timezone của scheduled job.

Ba câu này chốt trong spec của phase tương ứng, không chặn việc bắt đầu Phase 0.
