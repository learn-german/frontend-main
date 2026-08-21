# Dashboard Redesign — Rebrand DeutschSelbst + Daily Progress Report (Phase B)

## Bối cảnh

Yêu cầu redesign Dashboard theo 1 mockup mới (ảnh chụp), gồm 3 mảng gộp chung:

1. Đổi brand hiển thị từ "DeutschPath" sang "DeutschSelbst".
2. Thu gọn Header, mở rộng Sidebar đủ 6 mục điều hướng.
3. Viết lại nội dung Dashboard: card Tổng quan mới hiển thị tiến độ thực tế
   so với kỳ vọng, card Bài học hiện tại rút gọn, card XP, Kết quả kiểm tra
   gần đây, Kế hoạch học tập lấy 4 bài thật thay vì list hardcode.

Mảng 3 chính là **Phase B** đã được note trước trong
`2026-08-07-daily-progress-report-backend-design.md` ("Phase B (sau) —
frontend: hook + `DailyProgressReportCard` trên Dashboard, cần API thật từ
Phase A để test"). Phase A (backend) đã xong: bảng `daily_progress_reports`,
`level_enrollments`, edge function `daily-progress-report`
(`supabase/functions/daily-progress-report/index.ts`) đã deploy và tính đúng
mọi số liệu cần — nhưng **chưa có nơi nào trong frontend gọi edge function
này** (`grep` xác nhận chỉ có trong `database.types.ts`, tức chỉ tồn tại ở
tầng type sinh tự động). Spec này là phần frontend còn thiếu của Phase B,
cộng thêm phần rebrand/shell không nằm trong phạm vi Phase A.

## Quyết định đã chốt (qua trao đổi)

- **Gói học / Trợ giúp học tập**: chưa có page thật, chỉ thêm sidebar link +
  1 trang placeholder dùng chung ("Đang phát triển"). Nội dung thật để task
  khác.
- **Rebrand**: đổi toàn bộ 8 file có chữ "DeutschPath" (không chỉ Header) để
  tránh lẫn 2 tên thương hiệu trong cùng app.
- **Kế hoạch học tập** (4 bài gần nhất): lấy theo `orderIndex` thật của
  level hiện tại, tái dùng `buildRoadmapItems`/`computeLessonStatuses` đã có
  ở `App.tsx`, không thêm nguồn dữ liệu mới.
- **Tiến độ kỳ vọng / cảnh báo lệch kế hoạch**: dùng thẳng response của edge
  function `daily-progress-report` đã có, không thêm migration DB.
- **Slogan banner**: đổi thành "Hôm nay là một ngày tuyệt vời để chinh phục
  tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!", bỏ câu "Mục tiêu hàng ngày...
  40%" (số liệu không có thật, không còn card tương ứng trong thiết kế mới).

## Kiến trúc

### 1. Rebrand toàn app

Thay chuỗi `"DeutschPath"` → `"DeutschSelbst"` (text thuần, không có logic):

- `src/components/Navigation.tsx:67` (brand logo Header)
- `src/App.tsx:265` (toast "hoàn thành toàn bộ kho bài học của...")
- `src/data/mockData.ts:414,420` (2 testimonial)
- `src/pages/LoginPage.tsx:111,122,248`
- `src/pages/LeaderboardPage.tsx:40`
- `src/pages/LandingPage.tsx:195,405,520,533`
- `src/pages/RoadmapPage.tsx:72`
- `src/pages/admin/AdminApp.tsx:138,196`

### 2. Header (`Navbar` trong `Navigation.tsx`)

Nhánh `user` (logged-in) của `<nav>` desktop: xoá streak pill (`#nav-streak`),
XP pill (`#nav-xp`), 3 nav-link (`#nav-dashboard`, `#nav-roadmap`,
`#nav-leaderboard`), và khối `DE | VI` globe indicator. Giữ lại: brand logo,
`NotificationBell`, khối avatar/tên/nút đăng xuất (`#btn-nav-logout`).

`streak`/`xp` không còn được đọc ở đâu trong `Navbar` sau khi xoá pill →
xoá luôn 2 field khỏi `NavigationProps` và bỏ truyền ở call site
(`App.tsx`), thay vì giữ prop chết. Nhánh logged-out và mobile drawer giữ
nguyên (không thuộc phạm vi acceptance criteria, chỉ nói Header desktop
logged-in).

### 3. Sidebar (`Sidebar` trong `Navigation.tsx`)

Thêm vào mảng `links`:

```ts
{ id: "leaderboard", label: "Bảng xếp hạng", desc: "Thành tích học tập", icon: Trophy },
{ id: "packages", label: "Gói học", desc: "Xem gói & quyền lợi", icon: Gift },
{ id: "help", label: "Trợ giúp học tập", desc: "Giải đáp thắc mắc", icon: HelpCircle },
```

(`leaderboard` route đã tồn tại, chỉ thiếu trong sidebar; `packages`/`help`
là route mới.) Card Streak hằng ngày ở cuối sidebar giữ nguyên.

`SidebarProps.onNavigate` hiện có type hẹp hơn `AppState["currentPage"]`
(thiếu `leaderboard`) — mở rộng type cho khớp, thêm `packages` | `help`.

### 4. Route mới: `packages`, `help`

- `src/lib/router.ts`: thêm `"packages" | "help"` vào `AppPage` và
  `AppRoute` (nhánh đơn giản, không có param), thêm case trong
  `parseRoute`/`serializeRoute` theo đúng pattern `roadmap`/`leaderboard`
  hiện có, thêm vào `PROTECTED_PAGES`.
- Component mới `src/pages/ComingSoonPage.tsx`: nhận prop `title` (VD "Gói
  học" / "Trợ giúp học tập"), render 1 card trống rỗng "Tính năng đang được
  phát triển, quay lại sau nhé!" — dùng chung cho cả 2 route, không tạo 2
  file gần giống nhau.
- `App.tsx`: thêm 2 nhánh `effectivePage === "packages"` /
  `"help"` render `<ComingSoonPage title="..." />`, thêm vào điều kiện
  `showSidebar` (dòng có `dashboard || roadmap || lesson-detail`) để sidebar
  vẫn hiện trên 2 trang này.

### 5. Banner chào mừng (`DashboardPage.tsx`)

Đổi cứng đoạn text mô tả (dòng 82-84 hiện tại) sang: *"Hôm nay là một ngày
tuyệt vời để chinh phục tiếng Đức. Hãy bắt đầu từ một bài học nhỏ!"*. Giữ
nguyên phần còn lại của banner (tên user, card Streak bên phải, nền tối).

### 6. Data layer: gọi `daily-progress-report`

Trong `DashboardPage.tsx`, thêm state + effect theo đúng pattern đang dùng ở
`LeaderboardPage.tsx:21-27` (không tạo hook riêng — chỉ 1 nơi tiêu thụ):

```ts
const [report, setReport] = useState<DailyProgressReport | null>(null);
useEffect(() => {
  supabase.functions.invoke("daily-progress-report", { method: "GET" })
    .then(({ data }) => setReport(data));
}, []);
```

Type `DailyProgressReport` (field snake_case khớp response edge function,
định nghĩa cục bộ trong `DashboardPage.tsx` hoặc thêm vào `appTypes.ts` nếu
cần dùng lại nơi khác — hiện chỉ 1 nơi dùng nên định nghĩa cục bộ):

```ts
interface DailyProgressReport {
  report_date: string;
  level_id: string;
  current_lesson_id: string | null;
  completed_required_lessons: number;
  total_required_lessons: number;
  actual_progress_percentage: number;
  expected_progress_percentage: number | null;
  progress_gap_percentage_point: number | null;
  progress_status: "on_track" | "attention" | "behind" | null;
  package_remaining_days: number | null;
  generation_status: "success" | "insufficient_data" | "empty";
}
```

### 7. Card Tổng quan (thay 2 card "Bài học tiếp theo" + "Tiến độ cấp độ")

Map response sang UI:

| Field | Hiển thị |
|---|---|
| `report_date` | "Ngày báo cáo: DD/MM/YYYY" (format bằng cách có sẵn trong repo nếu có, không thêm date lib mới) |
| `completed_required_lessons`/`total_required_lessons` | "Bài học hoàn tất: N/M" |
| `actual_progress_percentage` | "Tiến độ hiện tại: N%" + `ProgressBar` (component có sẵn ở `DesignSystem.tsx`) |
| `expected_progress_percentage` | "Tiến độ kỳ vọng: N%" |
| `progress_gap_percentage_point` | dòng phụ "-N điểm %" (chỉ hiện khi > 0; âm/0 nghĩa là đang vượt kế hoạch, không hiện cảnh báo) |
| `progress_status` | badge: `on_track` → xanh "Đúng tiến độ"; `attention` → vàng "⚠ Cần chú ý"; `behind` → đỏ "⚠ Chậm tiến độ" |
| `package_remaining_days` | "Thời gian còn lại: N ngày" |

Dòng "Cần hoàn thành thêm N bài để bắt kịp" **không có trong response**,
tính ở frontend bằng 1 hàm thuần (export riêng để unit test được):

```ts
// src/lib/dashboardProgress.ts
export function lessonsNeededToCatchUp(
  gapPercentagePoint: number | null,
  totalRequiredLessons: number
): number {
  if (!gapPercentagePoint || gapPercentagePoint <= 0) return 0;
  return Math.ceil((gapPercentagePoint / 100) * totalRequiredLessons);
}
```

Chỉ hiện dòng này khi kết quả > 0.

**Khi `generation_status !== "success"`** (chưa có `level_enrollments`,
tức user/level chưa được admin set kế hoạch, hoặc gói hết hạn/không có
level unlock): ẩn toàn bộ phần kỳ vọng/gap/badge/thời gian còn lại, card chỉ
còn hiện tiến độ thực tế (`actual_progress_percentage`,
`completed_required_lessons`/`total_required_lessons`) — không throw lỗi,
không hiện thông báo lỗi, chỉ đơn giản là ít thông tin hơn.

**Khi `report` còn `null`** (đang tải): giữ nguyên layout cũ hiện có
("Bài học tiếp theo") làm skeleton tạm thời, tránh nháy layout — cách đơn
giản nhất là dùng thẳng `nextSuggestedLesson` đã có sẵn trong component để
render phần lesson/level trong lúc chờ, phần số liệu progress để trống/loading
dot.

### 8. Card Bài học hiện tại

Tách khỏi card Tổng quan, đặt ngay dưới. Nội dung: `LevelBadge`, tên lesson,
module, thời lượng, nút "Tiếp tục học" full-width (giữ logic
`onNavigateLesson(nextSuggestedLesson.id)` hiện có, không đổi).

### 9. Card XP

Giữ nguyên logic (`stats.xp`, mốc 500 XP), chỉnh lại style/kích thước cho
khớp mockup (số to bên trái, icon cúp bên phải) — thuần CSS, không đổi data.

### 10. Kết quả kiểm tra gần đây

Không đổi — giữ nguyên logic `recentScores` hiện tại.

### 11. Kế hoạch học tập

Thay list hardcode (dòng 246-249 hiện tại) bằng 4 bài thật:

- `App.tsx` đã tính sẵn `orderedLessons` (qua `buildRoadmapItems`) và
  `lessonStatuses` (qua `computeLessonStatuses`) cho toàn bộ roadmap đã mở
  khoá. Truyền 2 giá trị này xuống `DashboardPage` như prop mới
  (`orderedLessons: Lesson[]`, `lessonStatuses: Record<string, "completed" | "current" | "locked">`).
- Trong `DashboardPage`: tìm index của lesson có status `"current"` trong
  `orderedLessons`, lấy slice 4 phần tử bắt đầu từ đó (`current` + 3 bài kế
  tiếp theo `orderIndex`).
- Hiển thị trạng thái: phần tử đầu (status `current`) → badge "Đang học";
  phần tử thứ 2 → "Tiếp theo"; phần tử 3-4 → "Sắp học". (Vị trí trong list
  quyết định badge, không dựa vào `lessonStatuses` trực tiếp cho 3 bài sau vì
  chúng đều là `locked`/chưa xác định trong hệ thống hiện tại — thứ tự
  `orderIndex` mới là "kế hoạch".)
- Nếu không tìm thấy lesson `current` (VD đã hoàn thành hết) → fallback lấy
  4 bài đầu tiên chưa hoàn thành, hoặc ẩn card nếu rỗng.

### 12. Bố cục 2 cột (giữ nguyên `lg:col-span-8` / `lg:col-span-4`)

- Trái: Banner → Tổng quan (mục 7) → Bài học hiện tại (mục 8) → XP (mục 9).
- Phải: Kết quả kiểm tra gần đây (mục 10) → Kế hoạch học tập (mục 11).

## Không đổi

- Không đổi Header/Sidebar/Dashboard trên mobile drawer ngoài phần đã nêu.
- Không thêm migration DB mới — Phase A đã đủ dữ liệu cần.
- Không tự động hoá `level_enrollments`/`subscription_end_date` — vẫn do
  admin set tay (đúng như Phase A), spec này chỉ tiêu thụ dữ liệu đã có.
- Không đổi logic `recentScores`, `applyLessonCompleteReward`,
  `applyQuizResult`.
- Không thêm npm package mới (date format dùng cách có sẵn trong repo, hoặc
  `Intl.DateTimeFormat` built-in nếu chưa có).
- Không xây nội dung thật cho "Gói học"/"Trợ giúp học tập" — chỉ placeholder.

## Testing

- `lessonsNeededToCatchUp` (mục 7): unit test biên `gap <= 0` → 0, `gap`
  dương → làm tròn lên đúng, `gapPercentagePoint = null` → 0.
- `npm run lint` sau khi sửa type (`router.ts`, `NavigationProps`,
  `SidebarProps`, `DashboardPageProps`).
- Test thủ công trên browser (theo CLAUDE.md workflow): kiểm tra Header chỉ
  còn logo + chuông + user, Sidebar đủ 6 mục, Dashboard hiện đúng data thật
  (không hard-code), 2 route `packages`/`help` vào được từ sidebar, card
  Tổng quan xử lý đúng cả 2 trường hợp `generation_status = success` và
  `insufficient_data`.

## Rủi ro

- Edge function `daily-progress-report` yêu cầu user có `is_premium=true`
  và `level_enrollments` hợp lệ mới trả `generation_status: "success"` —
  phần lớn user test hiện tại (không có gói/enrollment do admin set) sẽ rơi
  vào nhánh `insufficient_data`/`empty`. Cần ít nhất 1 user test đã được
  admin set gói + level_enrollments để xác minh nhánh "success" hoạt động
  đúng trên UI thật.
- Xoá `streak`/`xp` khỏi `NavigationProps` là thay đổi interface — cần
  `grep` lại toàn bộ call site trước khi xoá để chắc không còn nơi nào khác
  dùng (hiện tại chỉ `App.tsx` truyền vào `Navbar`).
