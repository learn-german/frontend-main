import React, { useEffect, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { PRACTICE_CATEGORIES as CATEGORIES, practiceSearchKey } from "../../lib/practice";
import type { ExerciseSet } from "../../lib/hooks/useExerciseSets";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
import { AdminReadingExerciseSection } from "./AdminReadingExerciseSection";
import { AdminListeningExerciseSection } from "./AdminListeningExerciseSection";

const LEVELS = ["A1", "A2", "B1", "B2"];
const inputCls = "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm";

export interface PracticeTopic {
  id: string;
  title: string;
  title_vi: string;
  level: string;
  practice_category: keyof typeof CATEGORIES;
}

type TopicSummary = PracticeTopic & { exercise_sets: { id: string; status: string }[] };
type ActionResult = Promise<{ error: string | null }>;

export function PracticeSetControls({ topic, sets, onRename, onReorder }: {
  topic: PracticeTopic;
  sets: ExerciseSet[];
  onRename: (id: string, title: string) => ActionResult;
  onReorder: (lessonId: string, category: string, ids: string[]) => ActionResult;
}) {
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const topicSets = sets.filter((set) => set.lessonId === topic.id && set.category === topic.practice_category)
    .sort((a, b) => a.orderIndex - b.orderIndex);

  const save = async (action: () => ActionResult) => {
    setSaving(true);
    try {
      const { error } = await action();
      if (error) showToast(error, "warning");
    } catch {
      showToast("Không thể lưu thay đổi. Vui lòng thử lại.", "warning");
    } finally {
      setSaving(false);
    }
  };
  if (!topicSets.length) return null;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
    <h2 className="text-sm font-bold text-slate-800">Tên và thứ tự bài tập</h2>
    {topicSets.map((set, index) => <div key={set.id} className="flex flex-wrap items-center gap-2">
      <label className="min-w-40 flex-1">
        <span className="sr-only">Tên bài tập {index + 1}</span>
        <input className={inputCls} value={titles[set.id] ?? set.title} maxLength={200}
          onChange={(event) => setTitles((prev) => ({ ...prev, [set.id]: event.target.value }))} />
      </label>
      <button type="button" disabled={saving || !(titles[set.id] ?? set.title).trim() || (titles[set.id] ?? set.title) === set.title}
        onClick={() => save(() => onRename(set.id, titles[set.id].trim()))}
        className="rounded-lg px-2 py-2 text-xs font-bold text-orange-600 disabled:opacity-40">Lưu tên</button>
      {([-1, 1] as const).map((direction) => <button key={direction} type="button"
        aria-label={direction < 0 ? `Đưa ${set.title} lên` : `Đưa ${set.title} xuống`}
        disabled={saving || index + direction < 0 || index + direction >= topicSets.length}
        className="rounded-lg border border-slate-200 p-2 disabled:opacity-30"
        onClick={() => save(() => {
          const ids = topicSets.map((item) => item.id);
          [ids[index], ids[index + direction]] = [ids[index + direction], ids[index]];
          return onReorder(topic.id, topic.practice_category, ids);
        })}>{direction < 0 ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}</button>)}
    </div>)}
  </div>;
}

export function AdminPracticeSection() {
  const [topics, setTopics] = useState<TopicSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [category, setCategory] = useState<keyof typeof CATEGORIES>("nguphap");
  const [level, setLevel] = useState("A1");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PracticeTopic | null>(null);
  const [form, setForm] = useState<PracticeTopic | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TopicSummary | null>(null);

  const loadTopics = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from("lessons")
        .select("id, title, title_vi, level, practice_category, exercise_sets(id, status)")
        .eq("content_scope", "practice").order("order_index").order("title_vi");
      if (error) showToast("Không tải được chủ đề: " + error.message, "warning");
      else setTopics((data ?? []) as TopicSummary[]);
    } catch {
      showToast("Không tải được chủ đề. Vui lòng thử lại.", "warning");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void loadTopics(); }, []);

  const saveTopic = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form || !form.title_vi.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim() || form.title_vi.trim(), title_vi: form.title_vi.trim(),
        level: form.level, practice_category: form.practice_category,
        content_scope: "practice", module_id: null, next_lesson_id: null, xp_reward: 0, status: "published",
      };
      const { error } = form.id
        ? await supabase.from("lessons").update(payload).eq("id", form.id).eq("content_scope", "practice")
        : await supabase.from("lessons").insert({ ...payload, id: `practice-${crypto.randomUUID()}` });
      if (error) { showToast("Lưu chủ đề thất bại: " + error.message, "warning"); return; }
      setForm(null);
      await loadTopics();
      showToast("Đã lưu chủ đề.", "success");
    } catch {
      showToast("Không thể lưu chủ đề. Vui lòng thử lại.", "warning");
    } finally {
      setSaving(false);
    }
  };

  const deleteTopic = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("lessons").delete().eq("id", deleteTarget.id).eq("content_scope", "practice");
      if (error) { showToast("Xóa chủ đề thất bại: " + error.message, "warning"); return; }
      setDeleteTarget(null);
      await loadTopics();
      showToast("Đã xóa chủ đề và bài tập bên trong.", "success");
    } catch {
      showToast("Không thể xóa chủ đề. Vui lòng thử lại.", "warning");
    } finally {
      setSaving(false);
    }
  };

  if (selected) return <div className="space-y-4">
    <button type="button" onClick={() => { setSelected(null); void loadTopics(); }} className="flex items-center gap-2 text-sm font-bold text-slate-600">
      <ArrowLeft className="h-4 w-4" /> Danh sách chủ đề
    </button>
    <div><h1 className="text-xl font-black text-slate-900">Chủ đề: {selected.title_vi}</h1>
      <p className="text-sm text-slate-500">{CATEGORIES[selected.practice_category]} · {selected.level}</p></div>
    {selected.practice_category === "nguphap" ? <AdminGrammarExerciseSection key={selected.id} practiceTopic={selected} />
      : selected.practice_category === "doc" ? <AdminReadingExerciseSection key={selected.id} practiceTopic={selected} />
        : <AdminListeningExerciseSection key={selected.id} practiceTopic={selected} />}
  </div>;

  const visible = topics.filter((topic) => topic.practice_category === category && topic.level === level
    && practiceSearchKey(`${topic.title_vi} ${topic.title}`).includes(practiceSearchKey(search)));

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-black text-slate-900">Kho luyện tập</h1>
      <button type="button" className="flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2 text-sm font-bold text-white"
        onClick={() => setForm({ id: "", title: "", title_vi: "", level, practice_category: category })}><Plus className="h-4 w-4" /> Tạo chủ đề</button>
    </div>
    <div className="flex flex-wrap gap-3">
      <select aria-label="Loại bài" className={inputCls + " sm:w-auto"} value={category} onChange={(event) => setCategory(event.target.value as keyof typeof CATEGORIES)}>
        {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
      <select aria-label="Trình độ" className={inputCls + " sm:w-auto"} value={level} onChange={(event) => setLevel(event.target.value)}>
        {LEVELS.map((value) => <option key={value}>{value}</option>)}
      </select>
      <input aria-label="Tìm chủ đề" placeholder="Tìm chủ đề..." className={inputCls + " sm:w-64"} value={search} onChange={(event) => setSearch(event.target.value)} />
    </div>
    {loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin text-orange-500" /> : <div className="space-y-3">
      {visible.map((topic) => {
        const published = topic.exercise_sets.filter((set) => set.status === "published").length;
        return <div key={topic.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <div className="min-w-40 flex-1"><h2 className="font-bold text-slate-900">{topic.title_vi}</h2>
            <p className="text-xs text-slate-500">{topic.exercise_sets.length} bài · {published} đã xuất bản · {published > 0 ? "Đang hiển thị" : "Chưa hiển thị"}</p></div>
          <button type="button" onClick={() => setSelected(topic)} className="rounded-xl bg-orange-50 px-3 py-2 text-xs font-bold text-orange-700">Quản lý bài tập</button>
          <button type="button" aria-label={`Sửa chủ đề ${topic.title_vi}`} onClick={() => setForm(topic)} className="p-2 text-slate-500"><Pencil className="h-4 w-4" /></button>
          <button type="button" aria-label={`Xóa chủ đề ${topic.title_vi}`} onClick={() => setDeleteTarget(topic)} className="p-2 text-red-500"><Trash2 className="h-4 w-4" /></button>
        </div>;
      })}
      {!visible.length && <p className="py-8 text-center text-sm text-slate-500">Chưa có chủ đề phù hợp.</p>}
    </div>}
    {form && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={saveTopic} role="dialog" aria-modal="true" aria-label={form.id ? "Sửa chủ đề" : "Tạo chủ đề"} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
        <h2 className="text-lg font-bold">{form.id ? "Sửa chủ đề" : "Tạo chủ đề"}</h2>
        <label className="block text-sm font-bold">Tên chủ đề<input required maxLength={200} className={inputCls + " mt-1"} value={form.title_vi} onChange={(event) => setForm({ ...form, title_vi: event.target.value })} /></label>
        <label className="block text-sm font-bold">Tên tiếng Đức (tùy chọn)<input maxLength={200} className={inputCls + " mt-1"} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
        <label className="block text-sm font-bold">Loại bài<select disabled={!!form.id} className={inputCls + " mt-1"} value={form.practice_category} onChange={(event) => setForm({ ...form, practice_category: event.target.value as keyof typeof CATEGORIES })}>
          {Object.entries(CATEGORIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
        {form.id && <p className="text-xs text-slate-500">Loại bài và trình độ được giữ nguyên sau khi tạo chủ đề.</p>}
        <label className="block text-sm font-bold">Trình độ<select disabled={!!form.id} className={inputCls + " mt-1"} value={form.level} onChange={(event) => setForm({ ...form, level: event.target.value })}>{LEVELS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <div className="flex justify-end gap-3"><button type="button" disabled={saving} onClick={() => setForm(null)}>Hủy</button><button type="submit" disabled={saving || !form.title_vi.trim()} className="rounded-xl bg-orange-500 px-4 py-2 font-bold text-white disabled:opacity-50">{saving ? "Đang lưu..." : "Lưu chủ đề"}</button></div>
      </form>
    </div>}
    {deleteTarget && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div role="dialog" aria-modal="true" aria-label="Xóa chủ đề" className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6">
        <h2 className="font-bold">Xóa chủ đề {deleteTarget.title_vi}?</h2>
        <p className="text-sm text-slate-600">Thao tác sẽ xóa chủ đề cùng {deleteTarget.exercise_sets.length} bài tập và câu hỏi bên trong.</p>
        <div className="flex justify-end gap-3"><button disabled={saving} onClick={() => setDeleteTarget(null)}>Hủy</button><button disabled={saving} onClick={deleteTopic} className="rounded-xl bg-red-500 px-4 py-2 font-bold text-white">{saving ? "Đang xóa..." : "Xóa chủ đề"}</button></div>
      </div>
    </div>}
  </div>;
}
