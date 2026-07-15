# Speaking (Nói) Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Nói" (Speaking) tab to the learner-facing lesson page and a matching Markdown editor in the admin lesson editor — a static reference block (no scoring, no separate page), structurally identical to the existing "Ngữ pháp then chốt" Markdown mechanism.

**Architecture:** A new nullable `speaking_md` column on `lessons`, threaded through the exact same path `grammar_md` already uses: `useModules.ts`'s Supabase select/mapping → `Lesson.speakingMd` → `LessonDetailPage.tsx` renders it via `MarkdownBlock` in a new bottom tab → `AdminLessonEditor.tsx` gets a second Markdown edit/preview block (its own local `LessonEditable.speaking_md`, independent of the `Lesson` type) so admins can author it. No new tables, no quiz/category involvement.

**Tech Stack:** React 19, TypeScript 5.8, Tailwind CSS v4, Supabase, lucide-react.

## Global Constraints

- Không thêm bài tập chấm điểm cho "Nói" — không liên quan `quiz_questions`/category.
- Không thêm ghi âm/nhận diện giọng nói — chỉ nội dung tham khảo tĩnh (Markdown).
- Không đổi cơ chế Nghe/Đọc/Ngữ pháp/Từ vựng hiện có.
- Vị trí tab: Từ vựng → **Nói** → Bài tập ngữ pháp → Nghe → Đọc.
- Khi chưa có nội dung: hiện "Sắp có" giống Nghe/Đọc (không ẩn tab).
- Node: `source ~/.nvm/nvm.sh && nvm use 20` trước khi chạy `npm run dev`/`npm run lint`.
- Dự án không có test runner — verification là `npm run lint` (tsc --noEmit) + kiểm tra thủ công trên browser.

---

### Task 1: Migration — cột `speaking_md` + nội dung mẫu cho `a1-l1`

**Files:**
- Create: `supabase/migrations/20260715000013_add_speaking_md.sql`

**Interfaces:**
- Produces: `lessons.speaking_md TEXT` (nullable) — consumed by Task 2 (`useModules.ts`'s select) and Task 4 (`AdminLessonEditor.tsx`'s save payload).

- [ ] **Step 1: Viết migration**

```sql
ALTER TABLE lessons ADD COLUMN speaking_md TEXT;

UPDATE lessons
SET speaking_md = '## Luyện nói: Giới thiệu bản thân

Hãy tập nói to các câu sau, dựa theo mẫu hội thoại đã học:

- **Chào hỏi**: "Guten Tag! Ich heiße [tên bạn]."
- **Giới thiệu quê quán**: "Ich komme aus Vietnam."
- **Hỏi lại người khác**: "Und du? Wie heißt du?"

### Gợi ý luyện tập
1. Nói to từng câu, chú ý phát âm chữ "ch" trong "ich".
2. Ghép các câu trên thành 1 đoạn giới thiệu bản thân hoàn chỉnh (3-4 câu).
3. Thử đổi tên/quê quán của bạn vào mẫu câu và nói lại.'
WHERE id = 'a1-l1';
```

- [ ] **Step 2: Áp dụng migration**

Load Supabase MCP tools nếu chưa có (`ToolSearch` với query `"select:mcp__6c5f47ff-759a-40a7-ae05-33e169423511__apply_migration,mcp__6c5f47ff-759a-40a7-ae05-33e169423511__execute_sql"`), rồi áp dụng qua `apply_migration` (project_id: `awdhqlgxnjwymwgxltlw`, name: `add_speaking_md`).

- [ ] **Step 3: Xác nhận**

```sql
SELECT id, speaking_md IS NOT NULL AS has_speaking FROM lessons ORDER BY id;
```

Expected: `a1-l1` có `has_speaking = true`, các bài khác `false` (cột mới toàn NULL trừ a1-l1).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260715000013_add_speaking_md.sql
git commit -m "feat: add speaking_md column to lessons, seed sample content for a1-l1"
```

---

### Task 2: Types — `Lesson.speakingMd` + `useModules.ts`

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useModules.ts`

**Interfaces:**
- Consumes: Task 1's `lessons.speaking_md` column.
- Produces: `Lesson.speakingMd?: string` — consumed by Task 3 (`LessonDetailPage.tsx`).

- [ ] **Step 1: Thêm `speakingMd` vào `Lesson`**

Find (trong `src/lib/appTypes.ts`):

```ts
  vocabulary: VocabularyItem[];
  grammar: GrammarExplanation;
  grammarMd?: string;
  listeningUrl?: string;
```

Replace:

```ts
  vocabulary: VocabularyItem[];
  grammar: GrammarExplanation;
  grammarMd?: string;
  speakingMd?: string;
  listeningUrl?: string;
```

- [ ] **Step 2: Thêm `speaking_md` vào `SupabaseLesson` type**

Find (trong `src/lib/hooks/useModules.ts`):

```ts
  grammar_md: string | null;
  listening_url: string | null;
```

Replace:

```ts
  grammar_md: string | null;
  speaking_md: string | null;
  listening_url: string | null;
```

- [ ] **Step 3: Thêm `speaking_md` vào câu `select`**

Find:

```ts
          grammar_md, listening_url, video_r2_key, audio_r2_key,
```

Replace:

```ts
          grammar_md, speaking_md, listening_url, video_r2_key, audio_r2_key,
```

- [ ] **Step 4: Map `speaking_md` → `speakingMd` trong `transformModule`**

Find:

```ts
      grammarMd: l.grammar_md ?? undefined,
      listeningUrl: l.listening_url ?? undefined,
```

Replace:

```ts
      grammarMd: l.grammar_md ?? undefined,
      speakingMd: l.speaking_md ?? undefined,
      listeningUrl: l.listening_url ?? undefined,
```

- [ ] **Step 5: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useModules.ts
git commit -m "feat: add speakingMd to Lesson type and useModules fetch"
```

---

### Task 3: `LessonDetailPage.tsx` — tab "Nói"

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: Task 2's `Lesson.speakingMd`.
- Produces: nothing consumed by other tasks (Task 4 is independent).

- [ ] **Step 1: Import icon `Mic`**

Find:

```tsx
import {
  ArrowLeft,
  Volume2,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
} from "lucide-react";
```

Replace:

```tsx
import {
  ArrowLeft,
  Volume2,
  CheckCircle,
  ArrowRight,
  BookOpen,
  GraduationCap,
  PlayCircle,
  Video,
  Headphones,
  FileText,
  HelpCircle,
  Mic,
} from "lucide-react";
```

- [ ] **Step 2: Thêm `"noi"` vào `BottomTab`**

Find:

```tsx
type BottomTab = "quiz" | "nghe" | "doc" | "tuvung";
```

Replace:

```tsx
type BottomTab = "quiz" | "nghe" | "doc" | "tuvung" | "noi";
```

- [ ] **Step 3: Chèn tab "Nói" vào `BOTTOM_TABS`, ngay sau "Từ vựng"**

Find:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
    { id: "quiz", label: "Bài tập ngữ pháp", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
  ];
```

Replace:

```tsx
  const BOTTOM_TABS: { id: BottomTab; label: string; Icon: React.FC<{ className?: string }> }[] = [
    { id: "tuvung", label: "Từ vựng", Icon: BookOpen },
    { id: "noi", label: "Nói", Icon: Mic },
    { id: "quiz", label: "Bài tập ngữ pháp", Icon: HelpCircle },
    { id: "nghe", label: "Nghe", Icon: Headphones },
    { id: "doc", label: "Đọc", Icon: FileText },
  ];
```

- [ ] **Step 4: Thêm nội dung tab "Nói"**

Find:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
```

Replace:

```tsx
          {/* Nói tab */}
          {bottomTab === "noi" && (
            <div className="space-y-4">
              {lesson.speakingMd ? (
                <MarkdownBlock content={lesson.speakingMd} />
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Mic className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Nội dung luyện nói cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
            </div>
          )}

          {/* Nghe tab */}
          {bottomTab === "nghe" && (
```

- [ ] **Step 5: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Manual browser verification**

Mount `LessonDetailPage` via throwaway harness (`dbgtest.html`/`dbgtest.tsx` at repo root, importing `../src/index.css`, deleted after use):
- Mock lesson với `speakingMd` set (dùng đúng nội dung markdown ở Task 1): tab "Nói" xuất hiện ở vị trí thứ 2 (sau Từ vựng, trước Bài tập ngữ pháp); nội dung markdown render đúng qua `MarkdownBlock`.
- Mock lesson KHÔNG có `speakingMd`: tab "Nói" hiện "Sắp có" + text "Nội dung luyện nói cho bài học này đang được chuẩn bị."
- Xác nhận các tab khác (Từ vựng/Bài tập ngữ pháp/Nghe/Đọc) không bị ảnh hưởng.

- [ ] **Step 7: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: add Nói (Speaking) tab to lesson page"
```

---

### Task 4: `AdminLessonEditor.tsx` — soạn thảo Markdown cho "Nói"

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx`

**Interfaces:**
- Consumes: Task 1's `lessons.speaking_md` column (via direct Supabase update, not via the `Lesson`/`useModules` path — this file has its own local `LessonEditable` interface, independent of Task 2/3).
- Produces: nothing consumed by other tasks (last task in this plan).

- [ ] **Step 1: Thêm `speaking_md` vào `LessonEditable`**

Find:

```tsx
  grammar_md?: string | null;
  listening_url?: string | null;
```

Replace:

```tsx
  grammar_md?: string | null;
  speaking_md?: string | null;
  listening_url?: string | null;
```

- [ ] **Step 2: Thêm state `speakingTab`**

Find:

```tsx
  const [grammarTab, setGrammarTab] = useState<"edit" | "preview">("edit");
```

Replace:

```tsx
  const [grammarTab, setGrammarTab] = useState<"edit" | "preview">("edit");
  const [speakingTab, setSpeakingTab] = useState<"edit" | "preview">("edit");
```

- [ ] **Step 3: Thêm `speaking_md` vào payload của `handleSave`**

Find:

```tsx
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      onSaved();
    }
  };
```

Replace:

```tsx
  const handleSave = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu bài học.", "success");
      onSaved();
    }
  };
```

- [ ] **Step 4: Thêm `speaking_md` vào payload của `handlePublish`**

Find:

```tsx
  const handlePublish = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
    } else {
      showToast("Đã public bài học.", "success");
      onSaved();
    }
  };
```

Replace:

```tsx
  const handlePublish = async () => {
    setSaving(true);
    const { error } = await supabase.from("lessons").update({
      title: data.title,
      title_vi: data.title_vi,
      duration: data.duration,
      youtube_id: data.youtube_id || null,
      xp_reward: data.xp_reward,
      objective: data.objective || null,
      summary: data.summary || null,
      vocabulary: data.vocabulary,
      grammar: data.grammar,
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
    } else {
      showToast("Đã public bài học.", "success");
      onSaved();
    }
  };
```

- [ ] **Step 5: Thêm khối soạn thảo Markdown "Nói", ngay sau khối Ngữ pháp**

Find:

```tsx
            )}
          </div>

          {/* Vocabulary */}
```

Replace:

```tsx
            )}
          </div>

          {/* Nói — Markdown editor */}
          <div className="bg-slate-50/50 border border-slate-200/80 rounded-3xl p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Nói
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setSpeakingTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${speakingTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>

            {speakingTab === "edit" ? (
              <>
                <p className="text-[10px] text-slate-400">Hỗ trợ Markdown: # Tiêu đề, **đậm**, *nghiêng*, `code`, - danh sách (lồng nhau được), - [ ] checkbox, bảng, ```code block```, blockquote, và callout 💡 ⚠️ ❗ ✅ ℹ️</p>
                <textarea
                  rows={12}
                  value={data.speaking_md ?? ""}
                  onChange={e => upd({ speaking_md: e.target.value })}
                  placeholder={"## Luyện nói: Giới thiệu bản thân\n\nHãy tập nói to các câu sau:\n- \"Guten Tag! Ich heiße ...\"\n- \"Ich komme aus ...\""}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
              </>
            ) : (
              <div className="min-h-32 bg-white border border-slate-200 rounded-xl p-4">
                {data.speaking_md ? (
                  <MarkdownBlock content={data.speaking_md} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có nội dung luyện nói.</p>
                )}
              </div>
            )}
          </div>

          {/* Vocabulary */}
```

- [ ] **Step 6: Typecheck**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Manual browser verification**

Mount `AdminLessonEditor` via throwaway harness (deleted after use) with a mock `LessonEditable` (include `speaking_md` set to some markdown). Confirm:
- Khối "Nói" xuất hiện ngay sau khối "Ngữ pháp then chốt", trước "Từ vựng then chốt".
- Toggle "Chỉnh sửa"/"Xem trước" hoạt động độc lập với toggle của khối Ngữ pháp (đổi 1 bên không ảnh hưởng bên kia).
- Sửa nội dung trong textarea, chuyển sang "Xem trước": nội dung render đúng qua `MarkdownBlock`.
- Nếu Supabase reachable: bấm "Lưu bài học", xác nhận `speaking_md` được lưu (reload thấy đúng nội dung).

- [ ] **Step 8: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx
git commit -m "feat: add Nói (Speaking) Markdown editor to admin lesson editor"
```
