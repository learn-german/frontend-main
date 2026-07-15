import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, GripVertical } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  audio_text: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  questions: QuizQuestion[];
}

type EditForm = Omit<QuizQuestion, "id" | "lesson_id">;

const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  audio_text: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};

const TYPE_LABELS: Record<string, string> = {
  "multiple-choice": "Trắc nghiệm",
  "fill-blank": "Điền chỗ trống",
  "matching": "Ghép đôi",
  "listening": "Nghe hiểu",
};

const CATEGORY_LABELS: Record<string, string> = {
  "nguphap": "Ngữ pháp",
  "nghe": "Nghe",
  "doc": "Đọc",
};

const TYPE_COLORS: Record<string, string> = {
  "multiple-choice": "bg-blue-50 text-blue-700",
  "fill-blank": "bg-purple-50 text-purple-700",
  "matching": "bg-teal-50 text-teal-700",
  "listening": "bg-amber-50 text-amber-700",
};

export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = create
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuizQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  useEffect(() => { fetchQuestions(); }, []);

  const openCreate = (lessonId: string, nextOrder: number) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setForm({ ...EMPTY_FORM, category: activeTab, order_index: nextOrder });
    setModalOpen(true);
  };

  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      audio_text: q.audio_text,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (!form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }

    setSaving(true);

    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      audio_text: form.audio_text || null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("quiz_questions").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("quiz_questions").insert({ ...payload, lesson_id: editLessonId }));
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast(editId ? "Đã cập nhật câu hỏi." : "Đã thêm câu hỏi.", "success");
      setModalOpen(false);
      fetchQuestions();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("quiz_questions").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa câu hỏi.", "success");
      setDeleteTarget(null);
      fetchQuestions();
    }
  };

  // Helpers for form fields
  const setOption = (i: number, val: string) => {
    setForm((prev) => {
      const opts = [...(prev.options ?? [])];
      opts[i] = val;
      return { ...prev, options: opts };
    });
  };

  const addOption = () => setForm((prev) => ({ ...prev, options: [...(prev.options ?? []), ""] }));
  const removeOption = (i: number) =>
    setForm((prev) => ({ ...prev, options: (prev.options ?? []).filter((_, idx) => idx !== i) }));

  const setPair = (i: number, key: "de" | "vi", val: string) => {
    setForm((prev) => {
      const pairs = [...(prev.matching_pairs ?? [])];
      pairs[i] = { ...pairs[i], [key]: val };
      return { ...prev, matching_pairs: pairs };
    });
  };

  const addPair = () =>
    setForm((prev) => ({ ...prev, matching_pairs: [...(prev.matching_pairs ?? []), { de: "", vi: "" }] }));
  const removePair = (i: number) =>
    setForm((prev) => ({ ...prev, matching_pairs: (prev.matching_pairs ?? []).filter((_, idx) => idx !== i) }));

  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

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

      {/* Edit / Create modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">{editId ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi mới"}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category, Type & Order */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Dạng bài tập</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as EditForm["category"] }))}
                  className={inputCls}
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Loại câu hỏi</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EditForm["type"] }))}
                  className={inputCls}
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thứ tự (#)</label>
                <input
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                  className={inputCls}
                  min={0}
                />
              </div>
            </div>

            {/* Question text */}
            <div>
              <label className={labelCls}>Câu hỏi *</label>
              <textarea
                rows={2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Nhập nội dung câu hỏi..."
              />
            </div>

            {/* Audio text (listening) */}
            {form.type === "listening" && (
              <div>
                <label className={labelCls}>Nội dung nghe (audio_text)</label>
                <textarea
                  rows={2}
                  value={form.audio_text ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, audio_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Văn bản sẽ được đọc lên..."
                />
              </div>
            )}

            {/* Options (multiple-choice, listening) */}
            {(form.type === "multiple-choice" || form.type === "listening") && (
              <div>
                <label className={labelCls}>Các lựa chọn</label>
                <div className="space-y-2">
                  {(form.options ?? []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-5 text-center">{String.fromCharCode(65 + i)}</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder={`Lựa chọn ${String.fromCharCode(65 + i)}`}
                      />
                      {(form.options ?? []).length > 2 && (
                        <button onClick={() => removeOption(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addOption}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
                  </button>
                </div>
              </div>
            )}

            {/* Matching pairs */}
            {form.type === "matching" && (
              <div>
                <label className={labelCls}>Các cặp ghép đôi</label>
                <div className="space-y-2">
                  {(form.matching_pairs ?? []).map((pair, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <input
                        type="text"
                        value={pair.de}
                        onChange={(e) => setPair(i, "de", e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder="Tiếng Đức"
                      />
                      <span className="text-slate-300">↔</span>
                      <input
                        type="text"
                        value={pair.vi}
                        onChange={(e) => setPair(i, "vi", e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder="Tiếng Việt"
                      />
                      {(form.matching_pairs ?? []).length > 1 && (
                        <button onClick={() => removePair(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addPair}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm cặp
                  </button>
                </div>
              </div>
            )}

            {/* Correct answer */}
            <div>
              <label className={labelCls}>Đáp án đúng *</label>
              {(form.type === "multiple-choice" || form.type === "listening") && (form.options ?? []).some(Boolean) ? (
                <select
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- Chọn đáp án đúng --</option>
                  {(form.options ?? []).filter(Boolean).map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                  placeholder={form.type === "matching" ? 'JSON: [{"de":"...", "vi":"..."}]' : "Đáp án đúng..."}
                />
              )}
            </div>

            {/* Explanation */}
            <div>
              <label className={labelCls}>Giải thích</label>
              <textarea
                rows={2}
                value={form.explanation}
                onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Giải thích tại sao đáp án này đúng..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editId ? "Lưu thay đổi" : "Thêm câu hỏi"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa câu hỏi?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 line-clamp-2">
              {deleteTarget.question_text}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Hủy</Button>
              <button
                onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
