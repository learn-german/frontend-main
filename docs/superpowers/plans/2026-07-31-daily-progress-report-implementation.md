# Phase 5b (rút gọn) — Daily Progress Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Card "Tiến độ cấp độ" trên `DashboardPage.tsx` hiện đúng level hiện tại của học viên (không hard-code A1), kèm tên lesson hiện tại và "mục tiêu tiếp theo" động.

**Architecture:** Refactor thuần JSX/logic trong 1 file, không đổi props/API, không DB/backend mới.

**Tech Stack:** React 19 + TypeScript — không đổi.

## Global Constraints

- Không tạo bảng, Edge Function, hay scheduled job.
- Không đổi `DashboardPageProps` (props nhận từ `App.tsx` giữ nguyên).
- Không đụng "Kế hoạch bài học nổi bật" (danh sách tĩnh trang trí) và "Recent Quiz Scores" — ngoài phạm vi.

---

### Task 1: Level hiện tại động + card tiến độ + mục tiêu tiếp theo

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

- [ ] **Step 1: Thay logic tính level/tiến độ**

Tìm:

```tsx
  const a1Module = modules.find(m => m.level === "A1");
  const allLessons = modules.flatMap(m => m.lessons);

  const totalLessonsInA1 = a1Module?.lessons.length ?? 0;
  const completedA1Lessons = a1Module?.lessons.filter(l => stats.completedLessons.includes(l.id)).length ?? 0;
  const progressA1Percentage = totalLessonsInA1 > 0 ? Math.round((completedA1Lessons / totalLessonsInA1) * 100) : 0;

  // Find current next lesson to suggest
  const nextSuggestedLesson: Lesson | undefined = allLessons.find(l => !stats.completedLessons.includes(l.id)) ?? allLessons[0];
```

Thay bằng:

```tsx
  const allLessons = modules.flatMap(m => m.lessons);

  // Find current next lesson to suggest
  const nextSuggestedLesson: Lesson | undefined = allLessons.find(l => !stats.completedLessons.includes(l.id)) ?? allLessons[0];

  // Tiến độ tính theo level của nextSuggestedLesson (level học viên đang
  // học dở) — gộp mọi module cùng level (hiện mỗi level chỉ có 1 module,
  // nhưng .filter() đúng hơn .find() nếu sau này có nhiều module/level).
  const currentLevel = nextSuggestedLesson?.level;
  const currentLevelLessons = currentLevel
    ? modules.filter(m => m.level === currentLevel).flatMap(m => m.lessons)
    : [];
  const totalLessonsInLevel = currentLevelLessons.length;
  const completedLessonsInLevel = currentLevelLessons.filter(l => stats.completedLessons.includes(l.id)).length;
  const progressLevelPercentage = totalLessonsInLevel > 0
    ? Math.round((completedLessonsInLevel / totalLessonsInLevel) * 100)
    : 0;

  const LEVEL_ORDER: readonly string[] = ["A1", "A2", "B1", "B2"];
  const nextLevel = currentLevel
    ? LEVEL_ORDER[LEVEL_ORDER.indexOf(currentLevel) + 1]
    : undefined;
```

- [ ] **Step 2: Card "Tiến độ cấp độ" — tiêu đề + số liệu động + tên lesson hiện tại**

Tìm:

```tsx
            {/* Level progress */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Tiến độ cấp độ A1</span>
                <div className="flex justify-between items-baseline pt-1">
                  <h4 className="text-2xl font-display font-black text-green-600">{progressA1Percentage}%</h4>
                  <span className="text-xs text-slate-500">{completedA1Lessons}/{totalLessonsInA1} bài hoàn tất</span>
                </div>
                <ProgressBar value={progressA1Percentage} className="pt-2 text-xs" />
              </div>
              <div className="pt-4 border-t border-slate-100/80 mt-4 flex justify-between items-center text-xs">
                <span className="text-slate-500">Mục tiêu tiếp theo là khóa <b>A2</b></span>
                <button 
                  id="btn-dash-view-road"
                  onClick={onNavigateRoadmap} 
                  className="text-orange-600 font-display font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  Mở bản đồ <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
```

Thay bằng:

```tsx
            {/* Level progress */}
            <div className="bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm flex flex-col justify-between">
              <div className="space-y-2">
                <span className="text-xs font-display font-bold text-slate-400 uppercase tracking-wider">Tiến độ cấp độ {currentLevel}</span>
                <div className="flex justify-between items-baseline pt-1">
                  <h4 className="text-2xl font-display font-black text-green-600">{progressLevelPercentage}%</h4>
                  <span className="text-xs text-slate-500">{completedLessonsInLevel}/{totalLessonsInLevel} bài hoàn tất</span>
                </div>
                <ProgressBar value={progressLevelPercentage} className="pt-2 text-xs" />
                <p className="text-[11px] text-slate-400 truncate">Đang học: <b className="text-slate-600">{nextSuggestedLesson.titleVi}</b></p>
              </div>
              <div className="pt-4 border-t border-slate-100/80 mt-4 flex justify-between items-center text-xs">
                {nextLevel ? (
                  <span className="text-slate-500">Mục tiêu tiếp theo là khóa <b>{nextLevel}</b></span>
                ) : (
                  <span className="text-slate-500">Bạn đang ở cấp độ cao nhất 🎉</span>
                )}
                <button 
                  id="btn-dash-view-road"
                  onClick={onNavigateRoadmap} 
                  className="text-orange-600 font-display font-bold hover:underline cursor-pointer flex items-center gap-0.5"
                >
                  Mở bản đồ <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
```

- [ ] **Step 3: Kiểm tra không còn tham chiếu tên biến cũ**

```bash
grep -n "a1Module\|totalLessonsInA1\|completedA1Lessons\|progressA1Percentage" src/pages/DashboardPage.tsx
```
Kỳ vọng: không có kết quả nào.

- [ ] **Step 4: `npm run lint`**

Kỳ vọng: sạch.

- [ ] **Step 5: Commit**

```bash
git add src/pages/DashboardPage.tsx
git commit -m "feat(dashboard): tiến độ cấp độ động theo level hiện tại thay vì hard-code A1"
```

---

### Task 2: Regression

- [ ] **Step 1: Test suite**

```bash
npx tsx --test "src/**/*.test.ts" "src/**/*.test.tsx" "supabase/functions/**/*.test.ts" tests/e2e/admin-classification-fields.playwright.test.ts
```

- [ ] **Step 2: Build**

```bash
npm run build
```

- [ ] **Step 3: Test tay qua Browser pane**

Chạy `npm run dev`, đăng nhập (nếu có tài khoản test sẵn), mở Dashboard, xác nhận card hiện đúng level/tiến độ/lesson hiện tại, nút "Mở bản đồ" và "Tiếp tục học" vẫn hoạt động. Nếu không đăng nhập được, xác nhận bằng cách đọc code + kết quả build/lint là đủ, ghi rõ trong báo cáo là chưa test tay được UI thật.
