# Dashboard — Card Tổng quan v2, Lịch hỗ trợ trực tiếp, bỏ sticky header

## Bối cảnh

Tiếp nối `2026-08-17-dashboard-redesign-design.md` (đã implement: card Tổng quan
đọc từ `daily-progress-report`, Sidebar 6 mục, Kế hoạch học tập lấy dữ liệu
thật). Spec này là **v2** — chỉnh lại UI theo 1 mockup HTML đã review/duyệt
trực tiếp với user (không phải ảnh chụp bên ngoài), gồm 4 phần:

1. Viết lại cấu trúc card "Tổng quan" (khác bố cục hiện tại, vẫn dùng đúng
   field dữ liệu đã có từ `daily-progress-report`).
2. Thêm card mới "Lịch hỗ trợ trực tiếp (tuần này)".
3. Bỏ sticky ở Header toàn app, sửa lại offset của Sidebar cho khớp.
4. Đổi cách bố cục 2 cột để đáy 2 cột khớp nhau, khoảng cách giữa các card
   giãn đều thay vì dồn vào 1 chỗ (kỹ thuật CSS đã kiểm chứng trong mockup).

## Quyết định đã chốt (qua trao đổi)

- **Lịch hỗ trợ trực tiếp**: dữ liệu **tĩnh (hardcode)**, không thêm bảng
  Supabase/API. Nếu sau này cần dữ liệu thật, đó là task riêng.
- **Bỏ sticky header**: áp dụng cho **toàn app** (sửa thẳng trong
  `Navigation.tsx`, không thêm điều kiện theo trang).
- **Kế hoạch học tập**: giữ nguyên 4 bài, không thêm bài thứ 5 (đã thử nghiệm
  trong mockup — thêm dòng khiến việc canh đáy 2 cột kém đều hơn, không phải
  tốt hơn).
- **Card Bài học hiện tại / Tổng điểm tích lũy / Kết quả kiểm tra gần đây**:
  không đổi logic, không đổi cấu trúc — mockup chỉ chỉnh nhẹ khoảng cách,
  không đáng để sửa code.

## Kiến trúc

### 1. `ProgressBar` — thêm marker cho % kỳ vọng

`src/components/DesignSystem.tsx:131`. Thêm prop optional, không đổi hành vi
của các nơi đang dùng `ProgressBar` (chỉ hiện marker khi truyền
`markerValue`):

```tsx
export const ProgressBar: React.FC<{
  value: number;
  max?: number;
  className?: string;
  showText?: boolean;
  markerValue?: number; // vị trí % để vẽ vạch mốc (VD: tiến độ kỳ vọng)
}> = ({ value, max = 100, className = "", showText = false, markerValue }) => {
  const percent = Math.min(Math.max(Math.round((value / max) * 100), 0), 100);
  const markerPercent = markerValue !== undefined
    ? Math.min(Math.max(Math.round((markerValue / max) * 100), 0), 100)
    : null;

  return (
    <div className={`w-full ${className}`}>
      {showText && ( /* giữ nguyên */ )}
      <div className="relative w-full h-2 bg-slate-100 rounded-full overflow-visible border border-slate-200/40">
        <div className="h-full bg-green-600 rounded-full transition-all duration-500 ease-out" style={{ width: `${percent}%` }} />
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

(`overflow-hidden` → `overflow-visible` để vạch marker không bị cắt khi nằm
sát mép; fill % vẫn cần bo tròn riêng nên giữ `rounded-full` ở div con thay
vì container.)

### 2. Card "Tổng quan" — viết lại (`DashboardPage.tsx:196-260`)

Thay toàn bộ khối hiện tại bằng cấu trúc mới, cùng dùng các giá trị đã tính
sẵn trong component (`report`, `nextSuggestedLesson`, `progressLevelPercentage`,
`completedLessonsInLevel`/`totalLessonsInLevel`, `catchUpLessons`,
`PROGRESS_STATUS_BADGE`) — không thêm state/effect mới:

- Header: icon `TrendingUp` (đã import) + "Tổng quan", bên phải
  `Ngày báo cáo: {format(report.report_date)}` (chỉ hiện khi có `report`).
- Hàng 2 cột: "Level hiện tại" → `<LevelBadge level={nextSuggestedLesson.level} />`;
  "Lesson hiện tại" → icon `BookOpen` (đã import) + `nextSuggestedLesson.title`.
- Nếu `report?.generation_status === "success"`:
  - Dòng "Trạng thái tiến độ: …" + badge gap (`-N điểm %`, chỉ hiện khi
    `progress_gap_percentage_point > 0`).
  - `<ProgressBar value={actual_progress_percentage} markerValue={expected_progress_percentage} />`.
  - Hàng "Trạng thái" + pill từ `PROGRESS_STATUS_BADGE[report.progress_status]`.
  - Lưới 4 ô: Thời gian còn lại (`package_remaining_days` ngày) / Bài học
    hoàn tất (`completedLessonsInLevel`/`totalLessonsInLevel`) / Tiến độ hiện
    tại (`progressLevelPercentage`%, xanh) / Tiến độ kỳ vọng
    (`expected_progress_percentage`%). Số dùng cỡ lớn hơn hiện tại
    (`text-2xl` thay vì `text-lg`) để khớp mockup.
  - Footnote: "Hiện tại N% · Kỳ vọng M% · Cần hoàn thành thêm K bài để bắt
    kịp." — chỉ hiện khi `catchUpLessons > 0`.
- Nếu KHÔNG phải `"success"` (đang tải, hoặc `insufficient_data`/`empty`):
  chỉ render Level/Lesson header + lưới 2 ô (Bài học hoàn tất, Tiến độ hiện
  tại — cả 2 luôn tính được từ local, không phụ thuộc `report`), ẩn hoàn
  toàn phần thanh trạng thái/pill/2 ô còn lại/footnote. Không hiện thông báo
  lỗi, không có state loading riêng.

### 3. Card mới: "Lịch hỗ trợ trực tiếp (tuần này)"

Thêm sau card "Kế hoạch học tập" trong cột phải. Component nội bộ
(không tách file riêng, chỉ 1 nơi dùng), data tĩnh khai báo ngay trong
`DashboardPage.tsx`:

```ts
const LIVE_SESSIONS_THIS_WEEK = [
  { dow: "T2", date: 26, title: "Hỏi đáp ngữ pháp A1", time: "19:30 - 20:15", teacher: "N.P." },
  { dow: "T4", date: 28, title: "Luyện nói theo chủ đề", time: "19:30 - 20:15", teacher: "L.H." },
];
```

UI: header (icon `Calendar` — cần thêm vào import lucide-react — + "Lịch hỗ
trợ trực tiếp (tuần này)", link "Xem lịch đầy đủ" bên phải). Mỗi dòng: ô
ngày (thứ + số), tên buổi + giờ + giáo viên, nút "Tham gia" bên phải.

Cả "Xem lịch đầy đủ" và "Tham gia" đều **không gắn `onClick`** (không dùng
`disabled` — giữ nguyên màu sắc/hình dạng giống mockup, chỉ đơn giản là
chưa nối hành vi thật, vì chưa có trang lịch/luồng tham gia buổi học). Thêm
1 dòng comment ngắn tại chỗ khai báo `LIVE_SESSIONS_THIS_WEEK` ghi rõ đây là
data tĩnh chờ tính năng thật.

### 4. Header hết sticky + Sidebar offset

- `src/components/Navigation.tsx:57`: bỏ `sticky top-0 z-50` khỏi
  `<header>` (giữ `w-full bg-white/95 backdrop-blur border-b ...`).
- `src/components/Navigation.tsx:299` (`Sidebar`): đổi
  `sticky top-[73px] h-[calc(100vh-73px)]` → `sticky top-0 h-screen` (do
  header không còn chiếm chỗ cố định phía trên khi cuộn).

### 5. Cân bằng 2 cột nội dung

`DashboardPage.tsx` — 2 div bọc nội dung cột trái/phải hiện tại
(`className="lg:col-span-8 space-y-4"` và `"lg:col-span-4 space-y-4"`, dòng
193 và 337) đổi từ `space-y-4` sang `flex flex-col gap-4 justify-between`:

```tsx
<div className="lg:col-span-8 flex flex-col gap-4 justify-between">
...
<div className="lg:col-span-4 flex flex-col gap-4 justify-between">
```

Grid cha (`grid grid-cols-1 lg:grid-cols-12 gap-4`, dòng 190) không cần sửa
— `align-items: stretch` đã là default của CSS Grid, không có override nào
hiện tại. Đây đúng là kỹ thuật đã kiểm chứng trong mockup (đáy 2 cột khớp,
khoảng cách giữa các card trong 1 cột giãn đều khi cần bù chênh lệch, thay
vì dồn hết vào 1 chỗ).

## Không đổi

- Không đổi logic card Bài học hiện tại, Tổng điểm tích lũy, Kết quả kiểm
  tra gần đây, Kế hoạch học tập.
- Không thêm bảng/migration DB cho lịch hỗ trợ trực tiếp.
- Không thêm npm package mới.
- Không đổi hành vi sticky của bất kỳ phần tử nào khác ngoài Header/Sidebar.
- Không đổi mobile drawer.

## Testing

- `npm run lint` sau khi đổi prop `ProgressBar` và các JSX liên quan.
- Test thủ công trên browser: card Tổng quan hiện đúng cả 2 nhánh
  (`generation_status = success` và không phải success), marker trên thanh
  tiến độ đúng vị trí, header cuộn theo trang, sidebar không hở khoảng trắng
  phía trên khi cuộn, 2 cột dashboard khớp đáy ở độ rộng desktop.

## Rủi ro

- Đổi `Sidebar` sang `h-screen` thay vì `h-[calc(100vh-73px)]`: cần xác
  nhận lại header thật (có border-bottom + flag stripe) không tạo double
  offset — kiểm tra trực quan sau khi sửa, không suy luận suông.
- `ProgressBar` được dùng ở nhiều nơi khác trong app (roadmap, lesson...) —
  đổi `overflow-hidden` → `overflow-visible` trên container có thể ảnh
  hưởng bo góc ở các chỗ dùng khác nếu chúng phụ thuộc việc bar bị clip;
  cần kiểm tra nhanh các call site khác sau khi sửa (`grep ProgressBar`).
