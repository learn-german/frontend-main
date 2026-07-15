# Admin Quiz Category Tabs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rework the admin "Quiz" management page into 3 category sub-tabs (Ngữ pháp/Nghe/Đọc), with names matching the current architecture, so admins can author Nghe/Đọc questions for any lesson (not just lessons that already have questions).

**Architecture:** `AdminQuizSection.tsx` keeps its single fetch-all-questions call (data volume is tiny, ~16 rows today) but restructures the lesson-group source from "lessons that already have questions" to "every lesson in the system" (via the already-fetched `lessons` table), then filters each group's questions to the active category tab at render time — no new network round-trips per tab switch. The admin sidebar/page labels are renamed to match the learner-facing "Bài tập ngữ pháp" naming already shipped in a prior branch.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Supabase.

## Global Constraints

- Không đổi cấu trúc CRUD/validate của modal tạo-sửa câu hỏi (loại câu hỏi, options, matching pairs, đáp án đúng, giải thích).
- Không đổi cách nhóm theo module/lesson (vẫn theo lesson).
- Không thêm phân trang.
- Không đổi bất kỳ gì phía học viên (`LessonDetailPage.tsx`, `QuizPage.tsx`).
- Node: `source ~/.nvm/nvm.sh && nvm use 20` trước khi chạy `npm run dev`/`npm run lint`.
- Dự án không có test runner — verification là `npm run lint` (tsc --noEmit) + kiểm tra thủ công trên browser.

---

### Task 1: Đổi nhãn sidebar Admin "Quiz" → "Bài tập"

**Files:**
- Modify: `src/pages/admin/AdminPage.tsx:29`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing consumed by later tasks (fully independent of Task 2).

- [ ] **Step 1: Đổi label**

Find:

```tsx
const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { id: "users", label: "Người dùng", Icon: Users },
  { id: "content", label: "Nội dung", Icon: BookOpen },
  { id: "quiz", label: "Quiz", Icon: HelpCircle },
];
```

Replace with:

```tsx
const NAV_ITEMS: { id: AdminSection; label: string; Icon: React.FC<{ className?: string }> }[] = [
  { id: "dashboard", label: "Tổng quan", Icon: LayoutDashboard },
  { id: "users", label: "Người dùng", Icon: Users },
  { id: "content", label: "Nội dung", Icon: BookOpen },
  { id: "quiz", label: "Bài tập", Icon: HelpCircle },
];
```

(Only the `label` string changes — `id: "quiz"` stays the same, no routing/state changes needed.)

- [ ] **Step 2: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/admin/AdminPage.tsx
git commit -m "feat: rename admin sidebar Quiz nav item to Bài tập"
```

---

### Task 2: Tách `AdminQuizSection.tsx` thành 3 tab theo category

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: existing `CATEGORY_LABELS: Record<string, string>` (already defined in this file), existing `QuizQuestion`/`LessonGroup` interfaces (unchanged shape).
- Produces: nothing consumed by other files (this is the last task).

- [ ] **Step 1: Thêm state `activeTab`**

Find:

```tsx
export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
```

Replace with:

```tsx
export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
```

- [ ] **Step 2: Dựng danh sách bài học từ TOÀN BỘ `lessons`, không chỉ bài đã có câu hỏi**

Find:

```tsx
  const fetchQuestions = async () => {
    const [questionsRes, lessonsRes] = await Promise.all([
      supabase.from("quiz_questions").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);

    const lessonMap = new Map(
      (lessonsRes.data ?? []).map((l) => [
        l.id,
        {
          lesson_title: l.title_vi,
          module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
        },
      ]),
    );

    const grouped: Record<string, LessonGroup> = {};
    for (const q of questionsRes.data ?? []) {
      if (!grouped[q.lesson_id]) {
        const meta = lessonMap.get(q.lesson_id) ?? { lesson_title: q.lesson_id, module_title: "" };
        grouped[q.lesson_id] = { lesson_id: q.lesson_id, ...meta, questions: [] };
      }
      grouped[q.lesson_id].questions.push(q as QuizQuestion);
    }

    setGroups(Object.values(grouped));
    setLoading(false);
  };
```

Replace with:

```tsx
  const fetchQuestions = async () => {
    const [questionsRes, lessonsRes] = await Promise.all([
      supabase.from("quiz_questions").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);

    const questionsByLesson: Record<string, QuizQuestion[]> = {};
    for (const q of questionsRes.data ?? []) {
      (questionsByLesson[q.lesson_id] ??= []).push(q as QuizQuestion);
    }

    // Build one group per lesson (ALL lessons, not just ones that already
    // have questions) so admins can add the first Nghe/Đọc question for
    // any lesson, not only lessons that already have Ngữ pháp questions.
    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      questions: questionsByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    setLoading(false);
  };
```

- [ ] **Step 3: `openCreate` mặc định category theo tab đang mở**

Find:

```tsx
  const openCreate = (lessonId: string, nextOrder: number) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setForm({ ...EMPTY_FORM, order_index: nextOrder });
    setModalOpen(true);
  };
```

Replace with:

```tsx
  const openCreate = (lessonId: string, nextOrder: number) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setForm({ ...EMPTY_FORM, category: activeTab, order_index: nextOrder });
    setModalOpen(true);
  };
```

- [ ] **Step 4: Đổi tiêu đề trang + thêm thanh tab**

Find:

```tsx
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý Quiz</h1>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">{group.module_title} · {group.questions.length} câu hỏi</p>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); openCreate(group.lesson_id, group.questions.length); }}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
              </span>
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-24">Dạng</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-28">Loại</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-40">Đáp án đúng</th>
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.questions.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/50 group">
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-500">
                            {CATEGORY_LABELS[q.category] ?? q.category}
                          </span>
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[q.type] ?? "bg-slate-100 text-slate-500"}`}>
                            {TYPE_LABELS[q.type] ?? q.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{q.question_text}</td>
                        <td className="px-4 py-2.5 text-green-700 font-mono text-xs max-w-[160px] truncate">{q.correct_answer}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(q)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                              title="Chỉnh sửa"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(q)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {group.questions.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
```

Replace with:

```tsx
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý bài tập</h1>

      <div className="flex gap-2 border-b border-slate-200/60">
        {(Object.keys(CATEGORY_LABELS) as ("nguphap" | "nghe" | "doc")[]).map((val) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-2.5 text-sm font-display font-bold border-b-2 transition-colors ${
              activeTab === val
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {CATEGORY_LABELS[val]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {groups.map((group) => {
          const filteredQuestions = group.questions.filter((q) => q.category === activeTab);
          return (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">{group.module_title} · {filteredQuestions.length} câu hỏi</p>
              </div>
              <span
                onClick={(e) => { e.stopPropagation(); openCreate(group.lesson_id, filteredQuestions.length); }}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
              </span>
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-28">Loại</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-40">Đáp án đúng</th>
                      <th className="px-4 py-2 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {filteredQuestions.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/50 group">
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
                        <td className="px-4 py-2.5">
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[q.type] ?? "bg-slate-100 text-slate-500"}`}>
                            {TYPE_LABELS[q.type] ?? q.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{q.question_text}</td>
                        <td className="px-4 py-2.5 text-green-700 font-mono text-xs max-w-[160px] truncate">{q.correct_answer}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => openEdit(q)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                              title="Chỉnh sửa"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setDeleteTarget(q)}
                              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                              title="Xóa"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredQuestions.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          );
        })}
      </div>
```

Lưu ý: khối JSX gốc kết thúc bằng `</div>\n\n      {/* Edit / Create modal */}` ngay sau `</div>` đóng của `<div className="space-y-3">` — khối "Replace with" ở trên cũng kết thúc bằng `</div>` đóng của `<div className="space-y-3">`, nên phần `{/* Edit / Create modal */}` phía sau (không nằm trong đoạn find/replace này) không bị ảnh hưởng, giữ nguyên như cũ.

- [ ] **Step 5: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manual browser verification**

Mount `AdminQuizSection` via a throwaway harness (`dbgtest.html`/`dbgtest.tsx` at repo root, importing `../src/index.css`, deleted after use) with mocked/stubbed Supabase data: 2-3 mock lessons, some with existing `category: "nguphap"` questions and NONE with `nghe`/`doc` questions (matching real current data). Confirm:
- Trang hiện tiêu đề "Quản lý bài tập" và 3 tab "Ngữ pháp" / "Nghe" / "Đọc".
- Tab "Ngữ pháp" (mặc định): các bài học có câu hỏi hiện đúng số lượng và nội dung như trước, bảng không còn cột "Dạng".
- Chuyển sang tab "Nghe": TẤT CẢ bài học (kể cả bài không có câu hỏi nghe nào) đều xuất hiện trong danh sách, mỗi bài hiện "0 câu hỏi", mở rộng ra thấy "Chưa có câu hỏi nào."
- Bấm "+ Thêm câu hỏi" ở 1 bài trong tab Nghe: modal mở với "Dạng bài tập" mặc định là "Nghe" (không phải "Ngữ pháp").
- Nếu có thể lưu thật (Supabase reachable): lưu câu hỏi, xác nhận nó xuất hiện đúng trong tab Nghe của đúng bài học đó, không xuất hiện ở tab Ngữ pháp/Đọc.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: split admin quiz management into Ngữ pháp/Nghe/Đọc category tabs"
```
