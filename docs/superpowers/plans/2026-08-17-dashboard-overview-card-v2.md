# Dashboard — Card Tổng quan v2, Lịch hỗ trợ trực tiếp, bỏ sticky header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cập nhật Dashboard theo mockup HTML đã duyệt — viết lại card "Tổng quan", thêm card "Lịch hỗ trợ trực tiếp" (data tĩnh), bỏ sticky Header toàn app + sửa Sidebar offset cho khớp, và cân bằng 2 cột nội dung để đáy 2 cột khớp nhau.

**Architecture:** Pure frontend, chỉ đụng 3 file (`src/components/DesignSystem.tsx`, `src/pages/DashboardPage.tsx`, `src/components/Navigation.tsx`). Không thêm DB/migration/API, không thêm npm package. Toàn bộ dữ liệu_NEED đã có qua edge function `daily-progress-report` (đã deploy), phần lịch hỗ trợ dùng data tĩnh hardcoded trong `DashboardPage.tsx`. `ProgressBar` thêm 1 prop optional (`markerValue`) — backward compatible với mọi caller (Dashboard 3 chỗ, Roadmap 1 chỗ). Phần còn lại là tái cấu trúc JSX/Tailwind class thuần.

**Tech Stack:** React 19 + TypeScript, Tailwind CSS v4, lucide-react icons, Supabase JS client (đã dùng sẵn). Gate duy nhất: `npm run lint` (== `tsc --noEmit`) + test thủ công trên browser.

## Global Constraints

- Ngôn ngữ code: English (biến/hàm/type). Nội dung hiển thị cho user: Tiếng Việt.
- Không dùng `window.alert()`/`window.confirm()`.
- Không thêm npm package mới.
- Không thêm migration DB mới, không thêm bảng Supabase, không gọi API mới.
- "Lịch hỗ trợ trực tiếp" là data tĩnh (hardcode đúng 2 dòng như trong spec), chưa nối
  hành vi thật cho nút "Tham gia" và link "Xem lịch đầy đủ" — KHÔNG dùng `disabled`,
  giữ nguyên màu/hình dạng mockup, chỉ đơn giản chưa gắn `onClick`.
- Sau mỗi task: chạy `npm run lint` và phải pass trước khi commit.
- Test thủ công trên browser ở width desktop (≥1024px) cho các thay đổi UI Dashboard,
  width desktop + mobile cho Navigation.
- Conventional Commits cho mọi commit (`feat(dashboard):`, `refactor(ui):`, v.v.).
- GitNexus impact đã chạy cho `ProgressBar` (LOW, 3 impacted: DashboardPage, RoadmapPage),
  `DashboardPage` (LOW, 1 impacted: App), `Navbar` (LOW, 1 impacted) và `Sidebar` (LOW, 1
  impacted) — không có HIGH/CRITICAL, an toàn triển khai.

---

## File Structure

| File | Vai trò trong plan này |
|------|------------------------|
| `src/components/DesignSystem.tsx:131-155` | `ProgressBar` component — thêm optional prop `markerValue` + đổi `overflow-hidden` → `overflow-visible` (Task 1). Không tạo file mới. |
| `src/pages/DashboardPage.tsx:7-20` | Import lucide-react — thêm icon `Calendar` (Task 3). |
| `src/pages/DashboardPage.tsx:52-56` | Khai báo `PROGRESS_STATUS_BADGE` — chèn ngay sau đó hằng số `LIVE_SESSIONS_THIS_WEEK` (Task 3). |
| `src/pages/DashboardPage.tsx:193` | Wrapper cột trái — đổi `space-y-4` → `flex flex-col gap-4 justify-between` (Task 5). |
| `src/pages/DashboardPage.tsx:195-260` | Toàn bộ card "Tổng quan học tập" hiện tại — viết lại thành card "Tổng quan" theo mockup v2 (Task 2). |
| `src/pages/DashboardPage.tsx:19,72-77,108-114` | `Clock` import + `formatStudyTime` + `todayStudyMinutes`/`totalStudyMinutes` — thành dead code sau Task 2, xoá cùng lúc (Task 2 Step 2). |
| `src/pages/DashboardPage.tsx:425-427` | Sau khối `planLessons` (the `)}` rồi `</div>` cột phải) — chèn card "Lịch hỗ trợ trực tiếp" vào trước `</div>` cột phải (Task 3). |
| `src/pages/DashboardPage.tsx:337` | Wrapper cột phải — đổi `space-y-4` → `flex flex-col gap-4 justify-between` (Task 5). |
| `src/components/Navigation.tsx:57` | `<header>` — bỏ `sticky top-0 z-50` (Task 4). |
| `src/components/Navigation.tsx:299` | `<aside>` (Sidebar) — đổi `sticky top-[73px] h-[calc(100vh-73px)]` → `sticky top-0 h-screen` (Task 4). |

---

### Task 1: `ProgressBar` — thêm optional `markerValue`, đổi overflow

**Files:**
- Modify: `src/components/DesignSystem.tsx:131-155`

**Interfaces:**
- Consumes: nothing new (existing `ProgressBar` API).
- Produces: `ProgressBar` thêm optional prop `markerValue?: number`. Khi `markerValue`
  được truyền, render thêm 1 vạch dọc màu cam ở vị trí %
  `Math.min(Math.max(Math.round((markerValue/max)*100),0),100)`. Khi không truyền,
  render y hệt hiện tại (xác nhận backward-compat bằng mắt: DashboardPage.tsx:221,
  DashboardPage.tsx:285, DashboardPage.tsx:328, RoadmapPage.tsx:82).

- [ ] **Step 1: Sửa component `ProgressBar`**

Tại `src/components/DesignSystem.tsx:131-155`, thay toàn bộ khối bằng:

```tsx
// Progress Bar Component
export const ProgressBar: React.FC<{
  value: number;
  max?: number;
  className?: string;
  showText?: boolean;
  markerValue?: number; // optional: vẽ vạch mốc (VD: tiến độ kỳ vọng)
}> = ({ value, max = 100, className = "", showText = false, markerValue }) => {
  const percent = Math.min(Math.max(Math.round((value / max) * 100), 0), 100);
  const markerPercent = markerValue !== undefined
    ? Math.min(Math.max(Math.round((markerValue / max) * 100), 0), 100)
    : null;

  return (
    <div className={`w-full ${className}`}>
      {showText && (
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-xs font-display font-semibold text-slate-500">Tiến trình</span>
          <span className="text-xs font-display font-bold text-slate-800">{percent}%</span>
        </div>
      )}
      <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-visible border border-slate-200/40">
        <div
          className="h-full bg-green-600 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%` }}
        />
        {markerPercent !== null && (
          <div
            className="absolute -top-0.5 w-0.5 h-3 rounded-sm bg-orange-600"
            style={{ left: `${markerPercent}%` }}
            title={`Kỳ vọng ${markerPercent}%`}
          />
        )}
      </div>
    </div>
  );
};
```

Lý do 2 thay đổi đi kèm: (1) `overflow-hidden` → `overflow-visible` để vạch marker
không bị clip khi nằm sát mép; (2) `relative` được thêm vào container để marker absolute
refer tới container chứ không phải phần tử cha xa hơn. Fill bar vẫn bo tròn nhờ
`rounded-full` ở div con.

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: no errors (chỉ thêm prop optional, không đổi existing call sites).

- [ ] **Step 3: Kiểm tra bằng mắt trên browser — backward compatibility**

Run: `npm run dev`, mở `/dashboard` và `/roadmap`.
Expected:
- Thanh progress ở mọi nơi (Dashboard: "Tiến độ khóa học", "Tiến độ bài học", "Tổng
  điểm tích lũy"; Roadmap: thanh tổng quan) vẫn bo tròn, không xuất hiện vạch cam
  (vì chưa truyền `markerValue`), không có clipping lạ, kích thước không đổi.
- Không có vạch cam nào ở bất kỳ call site hiện tại.

- [ ] **Step 4: Commit**

```bash
git add src/components/DesignSystem.tsx
git commit -m "feat(ProgressBar): add optional markerValue + overflow-visible"
```

---

### Task 2: Card "Tổng quan" — viết lại theo mockup v2

**Files:**
- Modify: `src/pages/DashboardPage.tsx:195-260` (thay card)
- Modify: `src/pages/DashboardPage.tsx:19,72-77,108-114` (xoá dead code, Step 2)

**Interfaces:**
- Consumes:
  - Trong scope component `DashboardPage`: `report` (`DailyProgressReport | null`),
    `nextSuggestedLesson` (`Lesson`), `progressLevelPercentage` (number 0-100),
    `completedLessonsInLevel` (number), `totalLessonsInLevel` (number),
    `catchUpLessons` (number), `PROGRESS_STATUS_BADGE` (Record).
  - Từ Task 1: prop `markerValue` của `ProgressBar`.
  - lucide icon `TrendingUp`, `BookOpen` (đã import ở `DashboardPage.tsx:8-20`).
- Produces: JSX mới cho card ("Tổng quan" thay "Tổng quan học tập"), không đổi API
  của component. Card cũ là nơi DUY NHẤT dùng `Clock` (icon import), `formatStudyTime`
  (hàm, dòng 72-77), `todayStudyMinutes` (dòng 112-114), `totalStudyMinutes`
  (dòng 108-110) — cả 4 thành dead code sau khi thay card, phải xoá ở Step 2 (nếu
  không, chúng lọt qua `npm run lint` vì tsconfig không bật `noUnusedLocals`).

- [ ] **Step 1: Thay toàn bộ khối card "Tổng quan học tập" hiện tại**

Tại `src/pages/DashboardPage.tsx:195-260` (từ dòng comment
`{/* Tổng quan học tập: ... */}` đến `</div>` đóng card ngay trước dòng
`{/* Bài học hiện tại + Tổng điểm tích lũy: */}`), thay bằng:

```tsx
{/* Card "Tổng quan" (v2 — mockup đã duyệt) */}
<div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
  {/* Header: icon + "Tổng quan" + "Ngày báo cáo" — CHỈ hiện khi generation_status
      === "success". Edge function trả về object KHÔNG có field report_date ở
      nhánh "empty"/"error" (supabase/functions/daily-progress-report/index.ts:
      40,99,144) — gate lỏng hơn (chỉ `report &&`) sẽ ra "Invalid Date" cho phần
      lớn user test hiện tại (chưa có level_enrollments, xem risk note trong
      2026-08-17-dashboard-redesign-design.md). Đây đúng loại bug repo đã fix
      trước đó (branch claude/dashboard-nan-invalid-date-fix) — không được lặp lại. */}
  <div className="flex items-center justify-between flex-wrap gap-2">
    <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
      <TrendingUp className="w-3.5 h-3.5 text-orange-600" /> Tổng quan
    </h3>
    {report && report.generation_status === "success" && (
      <span className="text-[11px] text-slate-400">
        Ngày báo cáo: <b className="text-slate-700">{new Date(report.report_date).toLocaleDateString("vi-VN")}</b>
      </span>
    )}
  </div>

  {/* Hàng 2 cột: Level hiện tại + Lesson hiện tại */}
  <div className="grid grid-cols-2 gap-3">
    <div>
      <span className="text-[11px] text-slate-400">Level hiện tại</span>
      <div className="mt-1"><LevelBadge level={nextSuggestedLesson.level} /></div>
    </div>
    <div>
      <span className="text-[11px] text-slate-400">Lesson hiện tại</span>
      <p className="text-sm font-display font-bold text-slate-800 mt-1 flex items-center gap-1.5 leading-tight">
        <BookOpen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
        <span className="truncate">{nextSuggestedLesson.title}</span>
      </p>
    </div>
  </div>

  {/* Nhánh success: đầy đủ trạng thái + marker + 4 ô. `report &&
      report.generation_status === "success"` để TypeScript narrow `report`
      non-null (cùng pattern code cũ dòng 233) VÀ tránh Invalid Date (xem
      comment ở header phía trên — đây là cùng 1 điều kiện, bắt buộc khớp nhau). */}
  {report && report.generation_status === "success" && (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2.5">
        <span className="text-xs text-slate-500">Trạng thái tiến độ:</span>
        {report.progress_status && (
          <span className={`text-xs font-display font-bold px-2 py-0.5 rounded-lg ${PROGRESS_STATUS_BADGE[report.progress_status].className}`}>
            {PROGRESS_STATUS_BADGE[report.progress_status].label}
          </span>
        )}
        {report.progress_gap_percentage_point !== null && report.progress_gap_percentage_point > 0 && (
          <span className="text-xs text-red-600 font-display font-bold">
            -{Math.round(report.progress_gap_percentage_point)} điểm %
          </span>
        )}
      </div>

      <ProgressBar
        value={report.actual_progress_percentage}
        markerValue={report.expected_progress_percentage ?? undefined}
      />

      {/* Mỗi ô có nền/viền (bg-slate-50/50 + border-slate-100/60) — đúng "ô"
          trong mockup, tái dùng pattern đã có ở card "Kết quả kiểm tra gần đây"
          (dòng 368 hiện tại: bg-slate-50/50 rounded-xl border border-slate-100/60).
          KHÔNG dùng <div> trần — mockup không phải chữ nổi tự do, là chữ trong ô. */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-slate-50/50 rounded-xl border border-slate-100/60 p-3">
          <span className="text-[11px] text-slate-400">Thời gian còn lại</span>
          <p className="text-2xl font-display font-black text-slate-800 mt-1 leading-none">
            {report.package_remaining_days ?? "—"}
            {report.package_remaining_days !== null && (
              <span className="text-sm text-slate-400 font-bold ml-1">ngày</span>
            )}
          </p>
        </div>
        <div className="bg-slate-50/50 rounded-xl border border-slate-100/60 p-3">
          <span className="text-[11px] text-slate-400">Bài học hoàn tất</span>
          <p className="text-2xl font-display font-black text-slate-800 mt-1 leading-none">
            {completedLessonsInLevel}<span className="text-sm text-slate-400 font-bold mx-0.5">/</span>{totalLessonsInLevel}
          </p>
        </div>
        <div className="bg-slate-50/50 rounded-xl border border-slate-100/60 p-3">
          <span className="text-[11px] text-slate-400">Tiến độ hiện tại</span>
          <p className="text-2xl font-display font-black text-green-600 mt-1 leading-none">
            {progressLevelPercentage}<span className="text-sm text-slate-400 font-bold ml-0.5">%</span>
          </p>
        </div>
        <div className="bg-slate-50/50 rounded-xl border border-slate-100/60 p-3">
          <span className="text-[11px] text-slate-400">Tiến độ kỳ vọng</span>
          <p className="text-2xl font-display font-black text-slate-800 mt-1 leading-none">
            {Math.round(report.expected_progress_percentage ?? 0)}<span className="text-sm text-slate-400 font-bold ml-0.5">%</span>
          </p>
        </div>
      </div>

      {catchUpLessons > 0 && (
        <p className="text-[11px] text-slate-500 leading-relaxed">
          Hiện tại <b className="text-slate-800">{progressLevelPercentage}%</b> · Kỳ vọng{" "}
          <b className="text-slate-800">{Math.round(report.expected_progress_percentage ?? 0)}%</b> · Cần hoàn thành thêm{" "}
          <b className="text-slate-800">{catchUpLessons}</b> bài để bắt kịp.
        </p>
      )}
    </div>
  )}

  {/* Nhánh non-success: chỉ Level/Lesson header + 2 ô (luôn tính được từ local).
      Bao gồm cả `!report` (null/loading) và mọi generation_status khác "success"
      (thực tế edge function chỉ trả "empty"/"error" ngoài "success" — xem
      supabase/functions/daily-progress-report/index.ts). */}
  {(!report || report.generation_status !== "success") && (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-slate-50/50 rounded-xl border border-slate-100/60 p-3">
        <span className="text-[11px] text-slate-400">Bài học hoàn tất</span>
        <p className="text-2xl font-display font-black text-slate-800 mt-1 leading-none">
          {completedLessonsInLevel}<span className="text-sm text-slate-400 font-bold mx-0.5">/</span>{totalLessonsInLevel}
        </p>
      </div>
      <div className="bg-slate-50/50 rounded-xl border border-slate-100/60 p-3">
        <span className="text-[11px] text-slate-400">Tiến độ hiện tại</span>
        <p className="text-2xl font-display font-black text-green-600 mt-1 leading-none">
          {progressLevelPercentage}<span className="text-sm text-slate-400 font-bold ml-0.5">%</span>
        </p>
      </div>
    </div>
  )}
</div>
```

Lý do các quyết định:
- 2 nhánh (`success` vs không) chia nhau render, không phải `&&` lồng — tránh
  loading spinner và message lỗi, đúng spec.
- Điều kiện hiện "Ngày báo cáo" ở header PHẢI khớp y hệt điều kiện mở nhánh
  success (`report && report.generation_status === "success"`) — không được
  nới lỏng thành chỉ `report &&`, vì object ở nhánh "empty"/"error" không có
  `report_date` (sẽ ra "Invalid Date").
- Mỗi ô trong lưới 4-ô/2-ô có nền `bg-slate-50/50` + viền `border-slate-100/60`
  (tái dùng class đã có trong file, không bịa class mới) — đúng "ô" trong mockup,
  không phải chữ nổi trần.
- `package_remaining_days ?? "—"`: khi `null` hiện gạch ngang thay vì "0 ngày"
  (0 ngày dễ hiểu nhầm là "hết hạn hôm nay"; gạch ngang rõ ràng là "không có
  dữ liệu"). Chỉ hiện chữ "ngày" khi giá trị không null.
- Bỏ vạch cam top (`absolute ... bg-orange-600`) và `relative overflow-hidden`
  của card cũ — mockup đã duyệt không có vạch này trên card "Tổng quan".
- Không thêm state/effect mới; mọi giá trị đã tính sẵn ở phần đầu component
  (lines 91-141).

- [ ] **Step 2: Xoá dead code phát sinh từ Step 1**

Card cũ là nơi duy nhất dùng 4 thứ sau — sau Step 1 chúng không còn call site
nào, phải xoá hết (không xoá sẽ để lại dead code, `tsc --noEmit` không báo vì
tsconfig không bật `noUnusedLocals`/`noUnusedParameters`):

1. Tại `src/pages/DashboardPage.tsx:7-20` (import lucide-react), xoá dòng `Clock,`
   (dòng 19) khỏi danh sách import — còn lại `Trophy, Flame, BookOpen, PlayCircle,
   CheckCircle, TrendingUp, Plus, ArrowRight, ListRestart, HeartCrack, Award`.
2. Tại dòng 72-77, xoá toàn bộ hàm:
   ```ts
   const formatStudyTime = (totalMinutes: number): string => {
     const mins = Math.round(totalMinutes);
     const h = Math.floor(mins / 60);
     const m = mins % 60;
     return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`;
   };
   ```
3. Tại dòng 108-114 (trong component, ngay sau khai báo `progressLevelPercentage`),
   xoá:
   ```ts
   const totalStudyMinutes = currentLevelLessons
     .filter(l => stats.completedLessons.includes(l.id))
     .reduce((sum, l) => sum + parseDurationMinutes(l.duration), 0);

   const todayStudyMinutes = allLessons
     .filter(l => lessonIdsCompletedToday.includes(l.id))
     .reduce((sum, l) => sum + parseDurationMinutes(l.duration), 0);
   ```
   (Giữ nguyên `progressLevelPercentage`/`completedLessonsInLevel`/`totalLessonsInLevel`
   ngay phía trên — vẫn được dùng trong card mới.)

`lessonIdsCompletedToday` là prop của component (`DashboardPageProps`) — sau khi
xoá bước 3 nó không còn dùng ở đâu trong file. KHÔNG xoá khỏi
`DashboardPageProps`/call site ở `App.tsx` trong task này (ngoài phạm vi spec,
để task riêng nếu cần) — chỉ xoá phần dùng cục bộ trong `DashboardPage.tsx`.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors. (`report && report.generation_status === "success"` đã được
TypeScript narrow `report` về non-null trong nhánh success — cùng pattern với code
cũ ở line 233. Nhánh non-success không reference `report.*`, chỉ dùng các giá trị
local đã tính sẵn. Không còn cảnh báo/lỗi liên quan `Clock`/`formatStudyTime`/
`todayStudyMinutes`/`totalStudyMinutes` vì đã xoá ở Step 2.)

- [ ] **Step 4: Browser-check nhánh success**

Run: `npm run dev`, đăng nhập user có report `generation_status === "success"`
(user thật đã có `level_enrollments` set qua admin — xem risk note trong spec).
Expected:
- Card header hiện "Tổng quan" + "Ngày báo cáo: <formatted date>".
- Hàng Level hiện tại/Lesson hiện tại đầy đủ.
- Dòng "Trạng thái tiến độ:" + pill + badge gap (nếu gap>0).
- ProgressBar có vạch cam ở đúng `expected_progress_percentage` (chưa bị clip
  ở mép 100%).
- Lưới 4 ô lớn (`text-2xl`), MỖI Ô có nền xám nhạt + viền (không phải chữ nổi
  trần): ngày còn lại, X/total, % tiến độ (xanh), % kỳ vọng.
- Footnote "Hiện tại N% · Kỳ vọng M% · Cần hoàn thành thêm K bài để bắt kịp" chỉ
  hiện khi `catchUpLessons > 0`.
- Card không còn vạch cam ở mép trên.

- [ ] **Step 5: Browser-check nhánh non-success**

Có 2 cách tái hiện, cần cả 2 (chặn network chỉ mô phỏng `report === null`, không
mô phỏng được trường hợp `report = { generation_status: "empty" }` — đúng
trường hợp gây bug Invalid Date nếu Step 1 làm sai):

1. DevTools Network → block request tới `daily-progress-report`, reload
   (mô phỏng `report === null`, đang tải/lỗi mạng).
2. Đăng nhập bằng 1 user THẬT chưa được admin set `level_enrollments`/gói (đa số
   user test hiện tại — xem risk note trong spec) → `report` sẽ là
   `{ generation_status: "empty" }` (object có thật, không có `report_date`).

Expected (cả 2 cách):
- Card header chỉ hiện "Tổng quan" — **không có dòng "Ngày báo cáo", không có
  chữ "Invalid Date" ở đâu cả**.
- Hàng Level/Lesson vẫn đầy đủ.
- Không có dòng "Trạng thái tiến độ" / pill / gap badge / footnote.
- Chỉ có lưới 2 ô (có nền/viền): Bài học hoàn tất (X/total) + Tiến độ hiện tại
  (X% xanh).
- Không có thông báo lỗi, không có spinner.

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "refactor(dashboard): rewrite Tổng quan card v2 (marker, 4-grid, non-success branch)"
```

---

### Task 3: Card mới "Lịch hỗ trợ trực tiếp (tuần này)"

**Files:**
- Modify: `src/pages/DashboardPage.tsx:7-20` (thêm icon `Calendar` vào import)
- Modify: `src/pages/DashboardPage.tsx:56` (sau `PROGRESS_STATUS_BADGE`, thêm
  const `LIVE_SESSIONS_THIS_WEEK`)
- Modify: `src/pages/DashboardPage.tsx:425-427` (chèn JSX card mới vào cột phải,
  sau khối `planLessons`)

**Interfaces:**
- Consumes: hằng số `LIVE_SESSIONS_THIS_WEEK` khai báo trong chính task này, icon
  `Calendar` từ lucide-react.
- Produces: 1 card mới render trong cột phải Dashboard, luôn render (không phụ thuộc
  `planLessons.length`). Không export gì ra ngoài file.

- [ ] **Step 1: Thêm icon `Calendar` vào import lucide-react**

Tại `src/pages/DashboardPage.tsx:7-20` — LƯU Ý: Task 2 Step 2 đã chạy trước và
xoá `Clock` khỏi danh sách import này, nên tại thời điểm này import block
KHÔNG còn `Clock`. Sửa thành:

```tsx
import {
  Trophy,
  Flame,
  BookOpen,
  PlayCircle,
  CheckCircle,
  TrendingUp,
  Plus,
  ArrowRight,
  ListRestart,
  HeartCrack,
  Award,
  Calendar
} from "lucide-react";
```

- [ ] **Step 2: Thêm hằng số `LIVE_SESSIONS_THIS_WEEK`**

Ngay sau dòng `};` đóng `PROGRESS_STATUS_BADGE` (line 56), chèn:

```ts
// Data tĩnh cho card "Lịch hỗ trợ trực tiếp (tuần này)" — chưa nối với backend,
// chờ tính năng lịch học trực tiếp thật (separate task).
const LIVE_SESSIONS_THIS_WEEK = [
  { dow: "T2", date: 26, title: "Hỏi đáp ngữ pháp A1", time: "19:30 - 20:15", teacher: "N.P." },
  { dow: "T4", date: 28, title: "Luyện nói theo chủ đề", time: "19:30 - 20:15", teacher: "L.H." },
];
```

- [ ] **Step 3: Chèn JSX card mới trong cột phải**

Tại `src/pages/DashboardPage.tsx`, ngay sau dòng `)}` đóng khối `{planLessons.length > 0 && (...)}` (hiện line ~425), và trước dòng `</div>` đóng cột phải (hiện line ~427), chèn:

```tsx
{/* Lịch hỗ trợ trực tiếp (tuần này) — data tĩnh, chờ tính năng thật */}
<div className="bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm space-y-3">
  <div className="flex items-center justify-between gap-2">
    <h3 className="text-xs font-display font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
      <Calendar className="w-3.5 h-3.5 text-orange-600" /> Lịch hỗ trợ trực tiếp (tuần này)
    </h3>
    <span className="text-orange-600 text-[11px] font-display font-bold cursor-pointer shrink-0">
      Xem lịch đầy đủ
    </span>
  </div>

  <div className="space-y-2">
    {LIVE_SESSIONS_THIS_WEEK.map((s, i) => (
      <div key={i} className="flex items-center gap-3 border-b border-slate-50 pb-2 last:border-0 last:pb-0">
        <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex flex-col items-center justify-center shrink-0">
          <span className="text-[10px] font-display font-bold text-slate-400 uppercase leading-none">{s.dow}</span>
          <span className="text-lg font-display font-black text-slate-800 leading-none mt-0.5">{s.date}</span>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-xs font-display font-bold text-slate-800 leading-snug truncate">{s.title}</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">{s.time} · GV {s.teacher}</p>
        </div>
        <button
          type="button"
          className="text-[11px] font-display font-bold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 px-2.5 py-1.5 rounded-lg cursor-pointer shrink-0"
        >
          Tham gia
        </button>
      </div>
    ))}
  </div>
</div>
```

Lý do các quyết định:
- Card luôn render (không bọc `&&` điều kiện), nằm ngoài `{planLessons.length > 0 && ...}`
  — spec yêu cầu thêm "sau card Kế hoạch học tập", không yêu cầu chỉ khi có plan.
- "Xem lịch đầy đủ" và "Tham gia" KHÔNG có `onClick` — giữ màu/hình dạng như mockup,
  đúng spec ("không dùng `disabled`"). `<button>` với `type="button"` để tránh submit
  form vô tình.
- "Xem lịch đầy đủ" KHÔNG có icon mũi tên — khác với "Xem lộ trình" (card Kế hoạch
  học tập) có `<ArrowRight>`. Mockup đã duyệt chỉ "Xem lộ trình" mới có mũi tên.
- Ô ngày (`w-12 h-12`) dùng viền/chữ trung tính (`border-slate-200`, `text-slate-400`
  cho thứ, `text-slate-800` cho số) — KHÔNG tô cam. Nút "Tham gia" dùng pill nhạt
  `bg-red-50 text-red-700 border-red-200` (tái dùng đúng class đã có ở badge điểm
  quiz trong file này, dòng ~379-380) — KHÔNG dùng nút cam đặc `bg-orange-600
  text-white`. Mockup gốc (`.date-badge`/`.btn-join`) dùng tông trung tính/pill nhạt,
  không phải màu nhấn đặc — xem `--accent-tint: #fff0f3` / `--accent-ink: #cc0029`
  trong file mockup, tương đương `red-50`/`red-700` chuẩn của Tailwind trong app này
  (không phải `orange-*`, vốn đã bị remap sang màu đỏ thương hiệu ở `src/index.css`).

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: no errors. `LIVE_SESSIONS_THIS_WEEK` có kiểu suy luận đúng; `s` có kiểu
union của các field, không có lỗi TS.

- [ ] **Step 5: Browser-check**

Run: `npm run dev`, mở `/dashboard` (desktop width ≥1024px).
Expected:
- Cột phải có card mới ngay dưới card "Kế hoạch học tập" (hoặc ngay dưới "Kết quả
  kiểm tra gần đây" nếu không có plan).
- Header: icon `Calendar` + "Lịch hỗ trợ trực tiếp (tuần này)" + link "Xem lịch đầy đủ"
  (không có icon mũi tên).
- 2 dòng session: ô ngày (T2/26 và T4/28) viền/chữ xám trung tính (không tô cam),
  tiêu đề + giờ + giáo viên, nút "Tham gia" pill hồng nhạt/chữ đỏ (`bg-red-50
  text-red-700`) ở bên phải — không phải nút đặc màu cam.
- Hover "Tham gia" đổi nền hồng đậm hơn 1 chút (`hover:bg-red-100`); click không
  có phản hồi (đúng — chưa nối hành vi).
- Click "Xem lịch đầy đủ" không có phản hồi (đúng).

- [ ] **Step 6: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): add Lịch hỗ trợ trực tiếp card (static data)"
```

---

### Task 4: Bỏ sticky Header + Sidebar offset

**Files:**
- Modify: `src/components/Navigation.tsx:57` (bỏ `sticky top-0 z-50` khỏi `<header>`)
- Modify: `src/components/Navigation.tsx:299` (đổi `<aside>` sticky/h)

**Interfaces:**
- Consumes: nothing new.
- Produces: `<header>` trong `Navbar` không sticky nữa — cuộn theo trang. `<aside>`
  trong `Sidebar` sticky từ `top: 0`, cao `100vh` (thay vì `top: 73px, calc(100vh - 73px)`).

- [ ] **Step 1: Bỏ sticky trên `<header>`**

Tại `src/components/Navigation.tsx:57`, đổi:

```tsx
<header className="sticky top-0 z-50 w-full bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 py-3.5 flex justify-between items-center">
```

thành:

```tsx
<header className="w-full bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 py-3.5 flex justify-between items-center">
```

(Giữ `bg-white/95 backdrop-blur border-b border-slate-200 px-4 md:px-8 py-3.5 flex justify-between items-center`.)

- [ ] **Step 2: Đổi `<aside>` Sidebar offset**

Tại `src/components/Navigation.tsx:299`, đổi:

```tsx
<aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 p-5 shrink-0 sticky top-[73px] h-[calc(100vh-73px)]">
```

thành:

```tsx
<aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200 p-5 shrink-0 sticky top-0 h-screen">
```

Lý do: khi Header hết sticky, sidebar không cần trừ 73px phía trên khi cuộn nữa —
sidebar sticky từ đúng `top: 0` và kéo dài full viewport height.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (chỉ đổi string className, không có thay đổi TypeScript).

- [ ] **Step 4: Browser-check**

Run: `npm run dev`, mở các trang: `/dashboard`, `/roadmap`, và 1 trang dài (vd.
`/lesson-detail`).
Expected:
- Header cuộn theo trang (không dính đầu trang khi scroll xuống).
- Sidebar sticky dính từ đúng `top: 0` — không hở khoảng trắng 73px phía trên
  sidebar khi cuộn xuống giữa trang.
- Trên trang Dashboard: khi cuộn, sidebar cao đúng `100vh`, không bị tràn/không
  bị cụt.
- Trên trang có scrollbar dài (vd. lesson-detail): sidebar sticky hoạt động đúng,
  không reset khi header đi ra khỏi viewport.
- Mobile drawer (toggler `<lg` breakpoint) không bị ảnh hưởng (header vẫn bình
  thường ở chế độ bị ẩn sidebar).

- [ ] **Step 5: Commit**

```bash
git add src/components/Navigation.tsx
git commit -m "refactor(ui): drop sticky header + rebase sidebar to top-0/h-screen"
```

---

### Task 5: Cân bằng 2 cột nội dung Dashboard

**Files:**
- Modify: `src/pages/DashboardPage.tsx:193` (wrapper cột trái `lg:col-span-8`)
- Modify: `src/pages/DashboardPage.tsx:337` (wrapper cột phải `lg:col-span-4`)

**Interfaces:**
- Consumes: nothing new.
- Produces: 2 cột Dashboard dùng `flex flex-col gap-4 justify-between` thay vì
  `space-y-4`, kết hợp với CSS Grid `align-items: stretch` (mặc định) trên grid cha
  (`grid grid-cols-1 lg:grid-cols-12 gap-4`, line 190) để đáy 2 cột khớp nhau.

- [ ] **Step 1: Đổi wrapper cột trái**

Tại `src/pages/DashboardPage.tsx:193`, đổi:

```tsx
<div className="lg:col-span-8 space-y-4">
```

thành:

```tsx
<div className="lg:col-span-8 flex flex-col gap-4 justify-between">
```

- [ ] **Step 2: Đổi wrapper cột phải**

Tại `src/pages/DashboardPage.tsx:337`, đổi:

```tsx
<div className="lg:col-span-4 space-y-4">
```

thành:

```tsx
<div className="lg:col-span-4 flex flex-col gap-4 justify-between">
```

Lý do: `justify-between` sẽ đẩy đáy của cột dài hơn xuống đáy của cột ngắn hơn.
Grid cha giữ `align-items: stretch` mặc định (line 190 không có override), nên 2
wrapper sẽ được stretch cùng chiều cao, và `justify-between` phân phối khoảng
cách giữa các card trong mỗi cột — đúng kỹ thuật đã kiểm chứng trong mockup.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (đổi string className).

- [ ] **Step 4: Browser-check**

Run: `npm run dev`, mở `/dashboard` ở width desktop ≥1024px.
Expected:
- Đáy cột trái (hiện tại kết thúc ở grid "Bài học hiện tại / Tổng điểm tích lũy")
  và đáy cột phải (hiện tại kết thúc ở "Kế hoạch học tập" hoặc "Lịch hỗ trợ trực
  tiếp" sau Task 3) nằm trên cùng 1 đường ngang.
- Khoảng cách giữa các card trong cột trái (Tổng quan → grid Bài học/XP) và trong
  cột phải (Kết quả kiểm tra → Kế hoạch học tập → Lịch hỗ trợ) giãn đều, không
  dồn cục.
- Mobile width (<1024px): cột phải xuống dưới cột trái, không có khoảng trắng
  thừa (vì `lg:col-span-*` chỉ áp dụng ở ≥1024px, mobile dùng `grid-cols-1`).

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "refactor(dashboard): balance 2-col layout via flex/justify-between"
```
