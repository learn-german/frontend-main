import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, GripVertical, Search, Headphones } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { uploadMedia } from "../../lib/uploadMedia";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
import { AdminModuleGroup } from "./AdminModuleGroup";

interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  answer_text: string | null;
  audio_text: string | null;
  audio_clip_id: string | null;
  reading_passage_id: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}

interface ListeningClip {
  id: string;
  lesson_id: string;
  r2_key: string;
  order_index: number;
}

interface ReadingPassage {
  id: string;
  lesson_id: string;
  text_de: string;
  order_index: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  questions: QuizQuestion[];
  clips: ListeningClip[];
  passages: ReadingPassage[];
}

type EditForm = Omit<QuizQuestion, "id" | "lesson_id">;

const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  answer_text: null,
  audio_text: null,
  audio_clip_id: null,
  reading_passage_id: null,
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

const hasBlankMarkers = (text: string): boolean => /\{\{[^}]*\}\}/.test(text);

const QuestionTable: React.FC<{
  questions: QuizQuestion[];
  onEdit: (q: QuizQuestion) => void;
  onDelete: (q: QuizQuestion) => void;
}> = ({ questions, onEdit, onDelete }) => (
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
      {questions.map((q) => (
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
                onClick={() => onEdit(q)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Chỉnh sửa"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(q)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ))}
      {questions.length === 0 && (
        <tr>
          <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
        </tr>
      )}
    </tbody>
  </table>
);

const ClipCard: React.FC<{
  lessonId: string;
  clip: ListeningClip;
  index: number;
  questions: QuizQuestion[];
  onDeleteClip: (clip: ListeningClip) => void;
  onAddQuestion: (lessonId: string, nextOrder: number, refId?: string) => void;
  onEditQuestion: (q: QuizQuestion) => void;
  onDeleteQuestion: (q: QuizQuestion) => void;
}> = ({ lessonId, clip, index, questions, onDeleteClip, onAddQuestion, onEditQuestion, onDeleteQuestion }) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2_key, clip.id);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-slate-50/60">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">File {index + 1}</span>
        <div className="flex-1 min-w-0">
          {playback.loading && <p className="text-[11px] text-slate-400">Đang tải...</p>}
          {playback.url && (
            <audio controls src={playback.url} className="w-full h-8">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
          {playback.error && <p className="text-[11px] text-red-500">Không tải được: {playback.error}</p>}
        </div>
        <button
          onClick={() => onAddQuestion(lessonId, questions.length, clip.id)}
          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Câu hỏi
        </button>
        <button
          onClick={() => onDeleteClip(clip)}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0"
          title="Xóa file mp3 này (xóa luôn các câu hỏi thuộc file)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <QuestionTable questions={questions} onEdit={onEditQuestion} onDelete={onDeleteQuestion} />
    </div>
  );
};

const PassageCard: React.FC<{
  lessonId: string;
  passage: ReadingPassage;
  index: number;
  questions: QuizQuestion[];
  saving: boolean;
  onSavePassage: (passageId: string, textDe: string) => void;
  onDeletePassage: (passage: ReadingPassage) => void;
  onAddQuestion: (lessonId: string, nextOrder: number, refId?: string) => void;
  onEditQuestion: (q: QuizQuestion) => void;
  onDeleteQuestion: (q: QuizQuestion) => void;
}> = ({ lessonId, passage, index, questions, saving, onSavePassage, onDeletePassage, onAddQuestion, onEditQuestion, onDeleteQuestion }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const dirty = textDe !== passage.text_de;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="p-3 bg-slate-50/60 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-display font-bold text-slate-600 shrink-0">Đoạn {index + 1}</span>
          <div className="flex items-center gap-2 shrink-0">
            {dirty && (
              <button
                onClick={() => onSavePassage(passage.id, textDe)}
                disabled={saving}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50"
              >
                {saving ? "Đang lưu..." : "Lưu đoạn văn"}
              </button>
            )}
            <button
              onClick={() => onAddQuestion(lessonId, questions.length, passage.id)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Câu hỏi
            </button>
            <button
              onClick={() => onDeletePassage(passage)}
              className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
              title="Xóa đoạn văn này (xóa luôn các câu hỏi thuộc đoạn)"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <textarea
          rows={4}
          value={textDe}
          onChange={(e) => setTextDe(e.target.value)}
          placeholder="Nhập đoạn văn tiếng Đức..."
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y"
        />
      </div>
      <QuestionTable questions={questions} onEdit={onEditQuestion} onDelete={onDeleteQuestion} />
    </div>
  );
};

export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const { modules: moduleOrder } = useModuleOrder();
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
  const [search, setSearch] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = create
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuizQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteClipTarget, setDeleteClipTarget] = useState<ListeningClip | null>(null);
  const [deletingClip, setDeletingClip] = useState(false);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);

  const isMultiBlank = form.type === "fill-blank" && hasBlankMarkers(form.answer_text ?? "");

  const fetchQuestions = async () => {
    const [questionsRes, lessonsRes, clipsRes, passagesRes] = await Promise.all([
      supabase.from("quiz_questions").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("listening_clips").select("*").order("lesson_id").order("order_index"),
      supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
    ]);

    const questionsByLesson: Record<string, QuizQuestion[]> = {};
    for (const q of questionsRes.data ?? []) {
      (questionsByLesson[q.lesson_id] ??= []).push(q as QuizQuestion);
    }

    const clipsByLesson: Record<string, ListeningClip[]> = {};
    for (const c of clipsRes.data ?? []) {
      (clipsByLesson[c.lesson_id] ??= []).push(c as ListeningClip);
    }

    const passagesByLesson: Record<string, ReadingPassage[]> = {};
    for (const p of passagesRes.data ?? []) {
      (passagesByLesson[p.lesson_id] ??= []).push(p as ReadingPassage);
    }

    // Build one group per lesson (ALL lessons, not just ones that already
    // have questions) so admins can add the first Nghe/Đọc question for
    // any lesson, not only lessons that already have Ngữ pháp questions.
    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      questions: questionsByLesson[l.id] ?? [],
      clips: clipsByLesson[l.id] ?? [],
      passages: passagesByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, []);

  const openCreate = (lessonId: string, nextOrder: number, refId?: string) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setForm({
      ...EMPTY_FORM,
      category: activeTab,
      order_index: nextOrder,
      audio_clip_id: activeTab === "nghe" ? (refId ?? null) : null,
      reading_passage_id: activeTab === "doc" ? (refId ?? null) : null,
    });
    setModalOpen(true);
  };

  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      answer_text: q.answer_text,
      audio_text: q.audio_text,
      audio_clip_id: q.audio_clip_id,
      reading_passage_id: q.reading_passage_id,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (form.type !== "fill-blank" && !form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (form.type === "fill-blank" && !(form.answer_text ?? "").trim()) {
      showToast("Câu trả lời không được để trống.", "warning");
      return;
    }
    if (!isMultiBlank && !form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }

    setSaving(true);

    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      answer_text: form.type === "fill-blank" ? form.answer_text : null,
      audio_text: form.audio_text || null,
      audio_clip_id: form.category === "nghe" ? form.audio_clip_id : null,
      reading_passage_id: form.category === "doc" ? form.reading_passage_id : null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: isMultiBlank ? "" : form.correct_answer,
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

  const handleUploadClip = async (lessonId: string, file: File) => {
    setUploadingFor(lessonId);
    setUploadPct(0);
    try {
      const clipId = crypto.randomUUID();
      const objectKey = await uploadMedia(file, lessonId, "audio", setUploadPct, clipId);
      const group = groups.find((g) => g.lesson_id === lessonId);
      const nextOrder = group?.clips.length ?? 0;
      const { error } = await supabase
        .from("listening_clips")
        .insert({ id: clipId, lesson_id: lessonId, r2_key: objectKey, order_index: nextOrder });
      if (error) throw new Error(error.message);
      showToast("Đã tải file mp3 lên.", "success");
      fetchQuestions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải file mp3 thất bại", "warning");
    } finally {
      setUploadingFor(null);
      setUploadPct(null);
    }
  };

  const handleDeleteClip = async () => {
    if (!deleteClipTarget) return;
    setDeletingClip(true);
    const { error } = await supabase.from("listening_clips").delete().eq("id", deleteClipTarget.id);
    setDeletingClip(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa file mp3 và các câu hỏi thuộc file.", "success");
      setDeleteClipTarget(null);
      fetchQuestions();
    }
  };

  const handleAddPassage = async (lessonId: string) => {
    const group = groups.find((g) => g.lesson_id === lessonId);
    const nextOrder = group?.passages.length ?? 0;
    const { error } = await supabase
      .from("reading_passages")
      .insert({ lesson_id: lessonId, text_de: "", order_index: nextOrder });
    if (error) {
      showToast("Thêm đoạn văn thất bại: " + error.message, "warning");
    } else {
      fetchQuestions();
    }
  };

  const handleSavePassage = async (passageId: string, textDe: string) => {
    setSavingPassageId(passageId);
    const { error } = await supabase.from("reading_passages").update({ text_de: textDe }).eq("id", passageId);
    setSavingPassageId(null);
    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu đoạn văn.", "success");
      fetchQuestions();
    }
  };

  const handleDeletePassage = async () => {
    if (!deletePassageTarget) return;
    setDeletingPassage(true);
    const { error } = await supabase.from("reading_passages").delete().eq("id", deletePassageTarget.id);
    setDeletingPassage(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa đoạn văn và các câu hỏi thuộc đoạn.", "success");
      setDeletePassageTarget(null);
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

  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  const moduleSections = moduleOrder
    .map((mod) => ({
      id: mod.id,
      level: mod.level,
      lessonGroups: mod.lessonIds
        .map((lid) => filteredGroups.find((g) => g.lesson_id === lid))
        .filter((g): g is LessonGroup => !!g),
    }))
    .filter((mod) => mod.lessonGroups.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {activeTab !== "nguphap" && (
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Quản lý bài tập</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm bài học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>
      )}

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

      {activeTab === "nguphap" ? (
        <AdminGrammarExerciseSection />
      ) : (
      <div className="space-y-3">
        {moduleSections.map((mod) => (
          <AdminModuleGroup
            key={mod.id}
            title={mod.level}
            subtitle={`${mod.lessonGroups.length} bài học`}
            expanded={!!moduleExpanded[mod.id]}
            onToggle={() => setModuleExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
          >
            {mod.lessonGroups.map((group) => {
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
                    <p className="text-xs text-slate-400">
                      {filteredQuestions.length} câu hỏi
                      {activeTab === "nghe" && ` · ${group.clips.length} file mp3`}
                      {activeTab === "doc" && ` · ${group.passages.length} đoạn văn`}
                    </p>
                  </div>
                  {activeTab !== "nghe" && activeTab !== "doc" && (
                    <span
                      onClick={(e) => { e.stopPropagation(); openCreate(group.lesson_id, filteredQuestions.length); }}
                      className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                    </span>
                  )}
                </button>

                {expanded[group.lesson_id] && (
                  <div className="border-t border-slate-100 p-4 space-y-3">
                    {activeTab === "nghe" ? (
                      <>
                        <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition w-fit">
                          <Headphones className="w-4 h-4 text-orange-500 shrink-0" />
                          <span className="text-xs font-bold text-slate-600">
                            {uploadingFor === group.lesson_id
                              ? `Đang tải lên... ${uploadPct}%`
                              : "Tải file mp3 mới (.mp3 / .m4a / .wav)"}
                          </span>
                          <input
                            type="file"
                            accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"
                            className="hidden"
                            disabled={uploadingFor !== null}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) handleUploadClip(group.lesson_id, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                        {group.clips.length === 0 ? (
                          <p className="text-center py-6 text-slate-400 text-sm">Chưa có file mp3 nào cho bài học này.</p>
                        ) : (
                          <div className="space-y-3">
                            {group.clips.map((clip, idx) => (
                              <ClipCard
                                key={clip.id}
                                lessonId={group.lesson_id}
                                clip={clip}
                                index={idx}
                                questions={filteredQuestions.filter((q) => q.audio_clip_id === clip.id)}
                                onDeleteClip={setDeleteClipTarget}
                                onAddQuestion={openCreate}
                                onEditQuestion={openEdit}
                                onDeleteQuestion={setDeleteTarget}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    ) : activeTab === "doc" ? (
                      <>
                        <button
                          onClick={() => handleAddPassage(group.lesson_id)}
                          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors w-fit"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm đoạn văn mới
                        </button>
                        {group.passages.length === 0 ? (
                          <p className="text-center py-6 text-slate-400 text-sm">Chưa có đoạn văn nào cho bài học này.</p>
                        ) : (
                          <div className="space-y-3">
                            {group.passages.map((passage, idx) => (
                              <PassageCard
                                key={passage.id}
                                lessonId={group.lesson_id}
                                passage={passage}
                                index={idx}
                                questions={filteredQuestions.filter((q) => q.reading_passage_id === passage.id)}
                                saving={savingPassageId === passage.id}
                                onSavePassage={handleSavePassage}
                                onDeletePassage={setDeletePassageTarget}
                                onAddQuestion={openCreate}
                                onEditQuestion={openEdit}
                                onDeleteQuestion={setDeleteTarget}
                              />
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <QuestionTable questions={filteredQuestions} onEdit={openEdit} onDelete={setDeleteTarget} />
                    )}
                  </div>
                )}
              </div>
              );
            })}
          </AdminModuleGroup>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>
      )}

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
              <label className={labelCls}>Câu hỏi{form.type === "fill-blank" ? "" : " *"}</label>
              <textarea
                rows={2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder={
                  form.type === "fill-blank"
                    ? "Hướng dẫn/câu dẫn (tùy chọn) — ví dụ: 'Chia động từ trong ngoặc'..."
                    : "Nhập nội dung câu hỏi..."
                }
              />
            </div>

            {/* Answer text (fill-blank only) */}
            {form.type === "fill-blank" && (
              <div>
                <label className={labelCls}>Câu trả lời *</label>
                <textarea
                  rows={4}
                  value={form.answer_text ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, answer_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Nhập câu/đoạn chứa chỗ trống, ví dụ: Ich {{bin|Bin}} Student."
                />
                <p className="text-[10px] text-slate-400 font-sans mt-1.5 leading-relaxed">
                  Đánh dấu chỗ trống bằng <code className="bg-slate-100 px-1 rounded">{"{{đáp_án}}"}</code>, nhiều biến thể đúng cách nhau bởi <code className="bg-slate-100 px-1 rounded">|</code> — ví dụ <code className="bg-slate-100 px-1 rounded">{"{{bin|Bin}}"}</code>. Có thể dùng nhiều chỗ trống trong 1 câu hoặc cả đoạn văn dài.
                </p>
              </div>
            )}

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
            {isMultiBlank ? (
              <div>
                <label className={labelCls}>Đáp án đúng</label>
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5">
                  Đáp án đã được đánh dấu trực tiếp trong nội dung câu hỏi bằng <code className="bg-white px-1 rounded border border-slate-200">{"{{...}}"}</code> — không cần nhập riêng.
                </p>
              </div>
            ) : (
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
            )}

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

      {/* Confirm delete question */}
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

      {/* Confirm delete clip */}
      {deleteClipTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa file mp3?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toàn bộ câu hỏi thuộc file này cũng sẽ bị xóa. Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteClipTarget(null)}>Hủy</Button>
              <button
                onClick={handleDeleteClip}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deletingClip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete passage */}
      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa đoạn văn?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toàn bộ câu hỏi thuộc đoạn này cũng sẽ bị xóa. Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeletePassageTarget(null)}>Hủy</Button>
              <button
                onClick={handleDeletePassage}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deletingPassage ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
