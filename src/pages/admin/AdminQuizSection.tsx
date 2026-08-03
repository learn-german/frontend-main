import React, { useEffect, useMemo, useState } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, Headphones, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { uploadMedia } from "../../lib/uploadMedia";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets, type ExerciseSet } from "../../lib/hooks/useExerciseSets";
import { serializeMatching } from "../../lib/quizAnswerCodec";
import { AdminGrammarExerciseSection } from "./AdminGrammarExerciseSection";
import { AdminModuleGroup } from "./AdminModuleGroup";

interface QuizExercise {
  id: string;
  lesson_id: string;
  set_id: string;
  type: "multiple_choice" | "text_fill_blank" | "matching";
  prompt_text: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string | null;
  explanation: string;
  audio_clip_id: string | null;
  reading_passage_id: string | null;
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

interface LessonInfo {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

type EditForm = {
  type: QuizExercise["type"];
  prompt_text: string;
  options: string[];
  matching_pairs: { de: string; vi: string }[];
  correct_answer: string;
  explanation: string;
  order_index: number;
  audio_clip_id: string | null;
  reading_passage_id: string | null;
};

const EMPTY_FORM = (): EditForm => ({
  type: "multiple_choice",
  prompt_text: "",
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
  audio_clip_id: null,
  reading_passage_id: null,
});

const TYPE_LABELS: Record<QuizExercise["type"], string> = {
  multiple_choice: "Trắc nghiệm",
  text_fill_blank: "Điền vào chỗ trống",
  matching: "Ghép cặp",
};

const TYPE_COLORS: Record<QuizExercise["type"], string> = {
  multiple_choice: "bg-blue-50 text-blue-700",
  text_fill_blank: "bg-purple-50 text-purple-700",
  matching: "bg-teal-50 text-teal-700",
};

const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
const labelCls = "block text-xs font-bold text-slate-600 mb-1";

const QuestionTable: React.FC<{
  exercises: QuizExercise[];
  onEdit: (e: QuizExercise) => void;
  onDelete: (e: QuizExercise) => void;
}> = ({ exercises, onEdit, onDelete }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-slate-50">
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-32">Loại</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Nội dung</th>
        <th className="px-4 py-2 w-20"></th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-50">
      {exercises.map((e) => (
        <tr key={e.id} className="hover:bg-slate-50/50 group">
          <td className="px-4 py-2.5 text-slate-400 text-xs">{e.order_index}</td>
          <td className="px-4 py-2.5">
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[e.type]}`}>
              {TYPE_LABELS[e.type]}
            </span>
          </td>
          <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{e.prompt_text}</td>
          <td className="px-4 py-2.5">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={() => onEdit(e)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors" title="Chỉnh sửa">
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(e)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Xóa">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ))}
      {exercises.length === 0 && (
        <tr>
          <td colSpan={4} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
        </tr>
      )}
    </tbody>
  </table>
);

const ClipRow: React.FC<{ lessonId: string; clip: ListeningClip; index: number; onDelete: (c: ListeningClip) => void }> = ({
  lessonId,
  clip,
  index,
  onDelete,
}) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2_key, clip.id);
  return (
    <div className="flex items-center gap-3 p-2.5 bg-slate-50/60 rounded-xl">
      <span className="text-xs font-display font-bold text-slate-600 shrink-0">File {index + 1}</span>
      <div className="flex-1 min-w-0">
        {playback.loading && <p className="text-[11px] text-slate-400">Đang tải...</p>}
        {playback.url && <audio controls src={playback.url} className="w-full h-8">Trình duyệt không hỗ trợ audio.</audio>}
        {playback.error && <p className="text-[11px] text-red-500">Không tải được: {playback.error}</p>}
      </div>
      <button onClick={() => onDelete(clip)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0" title="Xóa file mp3">
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
};

const PassageEditRow: React.FC<{
  passage: ReadingPassage;
  index: number;
  saving: boolean;
  onSave: (id: string, textDe: string) => void;
  onDelete: (p: ReadingPassage) => void;
}> = ({ passage, index, saving, onSave, onDelete }) => {
  const [textDe, setTextDe] = useState(passage.text_de);
  const dirty = textDe !== passage.text_de;
  return (
    <div className="p-2.5 bg-slate-50/60 rounded-xl space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">Đoạn {index + 1}</span>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <button onClick={() => onSave(passage.id, textDe)} disabled={saving} className="text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors disabled:opacity-50">
              {saving ? "Đang lưu..." : "Lưu đoạn văn"}
            </button>
          )}
          <button onClick={() => onDelete(passage)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors" title="Xóa đoạn văn">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      <textarea
        rows={3}
        value={textDe}
        onChange={(e) => setTextDe(e.target.value)}
        placeholder="Nhập đoạn văn tiếng Đức..."
        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-y"
      />
    </div>
  );
};

export const AdminQuizSection: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
  const [search, setSearch] = useState("");
  const { modules: moduleOrder, loading: moduleOrderLoading } = useModuleOrder();
  const { sets: allSets, loading: setsLoading, createSet, renameSet, toggleSetStatus } = useExerciseSets();

  const [lessons, setLessons] = useState<LessonInfo[]>([]);
  const [exercises, setExercises] = useState<QuizExercise[]>([]);
  const [clips, setClips] = useState<ListeningClip[]>([]);
  const [passages, setPassages] = useState<ReadingPassage[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const [expandedLesson, setExpandedLesson] = useState<Record<string, boolean>>({});
  const [expandedSet, setExpandedSet] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});

  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);
  const [deleteClipTarget, setDeleteClipTarget] = useState<ListeningClip | null>(null);
  const [deletingClip, setDeletingClip] = useState(false);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);

  const [modalOpen, setModalOpen] = useState(false);
  const [editExerciseId, setEditExerciseId] = useState<string | null>(null);
  const [modalLessonId, setModalLessonId] = useState<string>("");
  const [modalSetId, setModalSetId] = useState<string | null>(null);
  const [form, setForm] = useState<EditForm>(EMPTY_FORM());
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuizExercise | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [renamingSetId, setRenamingSetId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const quizSetIds = useMemo(
    () => allSets.filter((s) => s.category === "nghe" || s.category === "doc").map((s) => s.id),
    [allSets],
  );

  const fetchData = async () => {
    const [lessonsRes, clipsRes, passagesRes, exercisesRes] = await Promise.all([
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("listening_clips").select("*").order("lesson_id").order("order_index"),
      supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
      quizSetIds.length > 0
        ? supabase
            .from("grammar_exercises")
            .select("id, lesson_id, set_id, type, prompt_text, options, matching_pairs, correct_answer, explanation, audio_clip_id, reading_passage_id, order_index")
            .in("set_id", quizSetIds)
            .order("order_index")
        : Promise.resolve({ data: [] as QuizExercise[] }),
    ]);

    setLessons(
      (lessonsRes.data ?? []).map((l) => ({
        lesson_id: l.id as string,
        lesson_title: l.title_vi as string,
        module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      })),
    );
    setClips((clipsRes.data ?? []) as ListeningClip[]);
    setPassages((passagesRes.data ?? []) as ReadingPassage[]);
    setExercises((exercisesRes.data ?? []) as QuizExercise[]);
    setDataLoading(false);
  };

  useEffect(() => {
    if (!setsLoading) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setsLoading, quizSetIds.join(",")]);

  const handleUploadClip = async (lessonId: string, file: File) => {
    setUploadingFor(lessonId);
    setUploadPct(0);
    try {
      const clipId = crypto.randomUUID();
      const objectKey = await uploadMedia(file, lessonId, "audio", setUploadPct, clipId);
      const nextOrder = clips.filter((c) => c.lesson_id === lessonId).length;
      const { error } = await supabase
        .from("listening_clips")
        .insert({ id: clipId, lesson_id: lessonId, r2_key: objectKey, order_index: nextOrder });
      if (error) throw new Error(error.message);
      showToast("Đã tải file mp3 lên.", "success");
      fetchData();
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
      showToast("Đã xóa file mp3.", "success");
      setDeleteClipTarget(null);
      fetchData();
    }
  };

  const handleAddPassage = async (lessonId: string) => {
    const nextOrder = passages.filter((p) => p.lesson_id === lessonId).length;
    const { error } = await supabase
      .from("reading_passages")
      .insert({ lesson_id: lessonId, text_de: "", order_index: nextOrder });
    if (error) {
      showToast("Thêm đoạn văn thất bại: " + error.message, "warning");
    } else {
      fetchData();
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
      fetchData();
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
      showToast("Đã xóa đoạn văn.", "success");
      setDeletePassageTarget(null);
      fetchData();
    }
  };

  /** Set chưa có câu hỏi nào chưa suy ra được clip/đoạn văn — trả về undefined. */
  const getSetMediaId = (setId: string, category: "nghe" | "doc"): string | undefined => {
    const first = exercises.find((e) => e.set_id === setId);
    if (!first) return undefined;
    return category === "nghe" ? (first.audio_clip_id ?? undefined) : (first.reading_passage_id ?? undefined);
  };

  const openCreateInSet = (lessonId: string, set: ExerciseSet) => {
    const setExercises = exercises.filter((e) => e.set_id === set.id);
    const mediaId = getSetMediaId(set.id, set.category as "nghe" | "doc");
    setEditExerciseId(null);
    setModalLessonId(lessonId);
    setModalSetId(set.id);
    setForm({
      ...EMPTY_FORM(),
      order_index: setExercises.length,
      audio_clip_id: set.category === "nghe" ? (mediaId ?? null) : null,
      reading_passage_id: set.category === "doc" ? (mediaId ?? null) : null,
    });
    setModalOpen(true);
  };

  const openCreateNewSet = (lessonId: string) => {
    setEditExerciseId(null);
    setModalLessonId(lessonId);
    setModalSetId(null);
    setForm({ ...EMPTY_FORM(), order_index: 0 });
    setModalOpen(true);
  };

  const openEdit = (exercise: QuizExercise) => {
    setEditExerciseId(exercise.id);
    setModalLessonId(exercise.lesson_id);
    setModalSetId(exercise.set_id);
    setForm({
      type: exercise.type,
      prompt_text: exercise.prompt_text ?? "",
      options: exercise.options ?? ["", "", "", ""],
      matching_pairs: exercise.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: exercise.correct_answer ?? "",
      explanation: exercise.explanation,
      order_index: exercise.order_index,
      audio_clip_id: exercise.audio_clip_id,
      reading_passage_id: exercise.reading_passage_id,
    });
    setModalOpen(true);
  };

  const setOption = (i: number, val: string) => {
    setForm((prev) => {
      const opts = [...prev.options];
      opts[i] = val;
      return { ...prev, options: opts };
    });
  };
  const addOption = () => setForm((prev) => ({ ...prev, options: [...prev.options, ""] }));
  const removeOption = (i: number) =>
    setForm((prev) => ({ ...prev, options: prev.options.filter((_, idx) => idx !== i) }));

  const setPair = (i: number, key: "de" | "vi", val: string) => {
    setForm((prev) => {
      const pairs = [...prev.matching_pairs];
      pairs[i] = { ...pairs[i], [key]: val };
      return { ...prev, matching_pairs: pairs };
    });
  };
  const addPair = () =>
    setForm((prev) => ({ ...prev, matching_pairs: [...prev.matching_pairs, { de: "", vi: "" }] }));
  const removePair = (i: number) =>
    setForm((prev) => ({ ...prev, matching_pairs: prev.matching_pairs.filter((_, idx) => idx !== i) }));

  const handleSave = async () => {
    if (!form.prompt_text.trim()) {
      showToast("Nội dung câu hỏi không được để trống.", "warning");
      return;
    }
    if (form.type === "multiple_choice" && !form.correct_answer) {
      showToast("Chưa chọn đáp án đúng.", "warning");
      return;
    }
    if (form.type === "matching" && form.matching_pairs.filter((p) => p.de.trim() && p.vi.trim()).length === 0) {
      showToast("Cần ít nhất 1 cặp ghép hợp lệ.", "warning");
      return;
    }
    if (!editExerciseId && !modalSetId && !form.audio_clip_id && !form.reading_passage_id) {
      showToast("Chưa chọn file mp3 hoặc đoạn văn cho bộ bài tập mới.", "warning");
      return;
    }

    setSaving(true);

    const validPairs = form.matching_pairs.filter((p) => p.de.trim() && p.vi.trim());
    const payload = {
      type: form.type,
      prompt_text: form.prompt_text,
      options: form.type === "multiple_choice" ? form.options.filter(Boolean) : null,
      matching_pairs: form.type === "matching" ? validPairs : null,
      correct_answer:
        form.type === "matching"
          ? serializeMatching(Object.fromEntries(validPairs.map((p) => [p.de, p.vi])))
          : form.type === "multiple_choice"
            ? form.correct_answer
            : null,
      explanation: form.explanation,
      order_index: form.order_index,
      audio_clip_id: form.audio_clip_id,
      reading_passage_id: form.reading_passage_id,
    };

    let error: { message: string } | null = null;

    if (editExerciseId) {
      ({ error } = await supabase.from("grammar_exercises").update(payload).eq("id", editExerciseId));
    } else {
      let setId = modalSetId;
      if (!setId) {
        const category = activeTab as "nghe" | "doc"; // modal chỉ mở khi activeTab là 1 trong 2 giá trị này
        const setResult = await createSet(modalLessonId, category, 0);
        if (setResult.error || !setResult.data) {
          setSaving(false);
          showToast(setResult.error ?? "Không tạo được bộ bài tập.", "warning");
          return;
        }
        setId = setResult.data.id;
      }
      ({ error } = await supabase
        .from("grammar_exercises")
        .insert({ ...payload, lesson_id: modalLessonId, set_id: setId }));
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast(editExerciseId ? "Đã cập nhật câu hỏi." : "Đã thêm câu hỏi.", "success");
      setModalOpen(false);
      fetchData();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("grammar_exercises").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa câu hỏi.", "success");
      setDeleteTarget(null);
      fetchData();
    }
  };

  const lessonGroups = lessons.map((l) => ({
    ...l,
    sets: allSets.filter((s) => s.lessonId === l.lesson_id && s.category === activeTab),
    clips: clips.filter((c) => c.lesson_id === l.lesson_id),
    passages: passages.filter((p) => p.lesson_id === l.lesson_id),
  }));

  const filteredGroups = lessonGroups.filter(
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
        .filter((g): g is (typeof filteredGroups)[number] => !!g),
    }))
    .filter((mod) => mod.lessonGroups.length > 0);

  if (dataLoading || moduleOrderLoading || setsLoading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-1 border-b border-slate-200">
        {(["nguphap", "nghe", "doc"] as const).map((val) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-2.5 text-sm font-display font-bold border-b-2 transition-colors ${
              activeTab === val ? "border-orange-500 text-orange-600" : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {val === "nguphap" ? "Ngữ pháp" : val === "nghe" ? "Nghe" : "Đọc"}
          </button>
        ))}
      </div>

      {activeTab === "nguphap" ? (
        <AdminGrammarExerciseSection />
      ) : (
        <>
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

          <div className="space-y-3">
            {moduleSections.map((mod) => (
              <AdminModuleGroup
                key={mod.id}
                title={mod.level}
                subtitle={`${mod.lessonGroups.length} bài học`}
                expanded={!!moduleExpanded[mod.id]}
                onToggle={() => setModuleExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
              >
                {mod.lessonGroups.map((group) => (
                  <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
                    <button
                      onClick={() => setExpandedLesson((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
                      className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                    >
                      {expandedLesson[group.lesson_id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                      <div className="flex-1">
                        <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                        <p className="text-xs text-slate-400">
                          {group.sets.length} bộ bài tập
                          {activeTab === "nghe" && ` · ${group.clips.length} file mp3`}
                          {activeTab === "doc" && ` · ${group.passages.length} đoạn văn`}
                        </p>
                      </div>
                      <span
                        onClick={(e) => { e.stopPropagation(); openCreateNewSet(group.lesson_id); }}
                        className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                      >
                        <Plus className="w-3.5 h-3.5" /> Thêm bộ bài tập
                      </span>
                    </button>

                    {expandedLesson[group.lesson_id] && (
                      <div className="border-t border-slate-100 p-4 space-y-4">
                        {activeTab === "nghe" && (
                          <div className="space-y-2">
                            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition w-fit">
                              <Headphones className="w-4 h-4 text-orange-500 shrink-0" />
                              <span className="text-xs font-bold text-slate-600">
                                {uploadingFor === group.lesson_id ? `Đang tải lên... ${uploadPct}%` : "Tải file mp3 mới"}
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
                            {group.clips.map((clip, idx) => (
                              <ClipRow key={clip.id} lessonId={group.lesson_id} clip={clip} index={idx} onDelete={setDeleteClipTarget} />
                            ))}
                          </div>
                        )}

                        {activeTab === "doc" && (
                          <div className="space-y-2">
                            <button
                              onClick={() => handleAddPassage(group.lesson_id)}
                              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors w-fit"
                            >
                              <Plus className="w-3.5 h-3.5" /> Thêm đoạn văn
                            </button>
                            {group.passages.map((passage, idx) => (
                              <PassageEditRow
                                key={passage.id}
                                passage={passage}
                                index={idx}
                                saving={savingPassageId === passage.id}
                                onSave={handleSavePassage}
                                onDelete={setDeletePassageTarget}
                              />
                            ))}
                          </div>
                        )}

                        {group.sets.length === 0 ? (
                          <p className="text-center py-6 text-slate-400 text-sm">Chưa có bộ bài tập nào.</p>
                        ) : (
                          group.sets
                            .slice()
                            .sort((a, b) => a.orderIndex - b.orderIndex)
                            .map((set) => {
                              const setExercises = exercises.filter((e) => e.set_id === set.id);
                              const mediaId = getSetMediaId(set.id, set.category as "nghe" | "doc");
                              const clip = activeTab === "nghe" ? clips.find((c) => c.id === mediaId) : undefined;
                              const passage = activeTab === "doc" ? passages.find((p) => p.id === mediaId) : undefined;
                              return (
                                <div key={set.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                  <button
                                    onClick={() => setExpandedSet((prev) => ({ ...prev, [set.id]: !prev[set.id] }))}
                                    className="w-full flex items-center gap-3 p-3 bg-slate-50/60 text-left"
                                  >
                                    {expandedSet[set.id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                    {renamingSetId === set.id ? (
                                      <input
                                        autoFocus
                                        value={renameValue}
                                        onClick={(e) => e.stopPropagation()}
                                        onChange={(e) => setRenameValue(e.target.value)}
                                        onBlur={() => { renameSet(set.id, renameValue); setRenamingSetId(null); }}
                                        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                                        className="flex-1 px-2 py-1 text-sm border border-orange-300 rounded-lg focus:outline-none"
                                      />
                                    ) : (
                                      <span
                                        onClick={(e) => { e.stopPropagation(); setRenamingSetId(set.id); setRenameValue(set.title); }}
                                        className="flex-1 text-sm font-display font-bold text-slate-800 hover:text-orange-600"
                                      >
                                        {set.title}
                                      </span>
                                    )}
                                    <span
                                      onClick={(e) => { e.stopPropagation(); toggleSetStatus(set.id, set.status); }}
                                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${
                                        set.status === "published" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                                      }`}
                                    >
                                      {set.status === "published" ? "Đã public" : "Nháp"}
                                    </span>
                                  </button>
                                  {expandedSet[set.id] && (
                                    <div className="p-3 space-y-2">
                                      {activeTab === "nghe" && clip && (
                                        <p className="text-xs text-slate-400">Gắn với: File mp3 #{group.clips.findIndex((c) => c.id === clip.id) + 1}</p>
                                      )}
                                      {activeTab === "doc" && passage && (
                                        <p className="text-xs text-slate-400 line-clamp-1">Gắn với: {passage.text_de || "(đoạn văn trống)"}</p>
                                      )}
                                      <QuestionTable exercises={setExercises} onEdit={openEdit} onDelete={setDeleteTarget} />
                                      <button
                                        onClick={() => openCreateInSet(group.lesson_id, set)}
                                        className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                                      >
                                        <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </AdminModuleGroup>
            ))}
            {filteredGroups.length === 0 && (
              <div className="text-center py-10 text-slate-400 text-sm">Không tìm thấy bài học nào khớp với "{search}".</div>
            )}
          </div>
        </>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">{editExerciseId ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi mới"}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {!editExerciseId && !modalSetId && (
              <div>
                <label className={labelCls}>{activeTab === "nghe" ? "Chọn file mp3 cho bộ bài tập mới" : "Chọn đoạn văn cho bộ bài tập mới"} *</label>
                {activeTab === "nghe" ? (
                  <select
                    value={form.audio_clip_id ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, audio_clip_id: e.target.value || null }))}
                    className={inputCls}
                  >
                    <option value="">-- Chọn file mp3 --</option>
                    {clips.filter((c) => c.lesson_id === modalLessonId).map((c, i) => (
                      <option key={c.id} value={c.id}>File {i + 1}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={form.reading_passage_id ?? ""}
                    onChange={(e) => setForm((prev) => ({ ...prev, reading_passage_id: e.target.value || null }))}
                    className={inputCls}
                  >
                    <option value="">-- Chọn đoạn văn --</option>
                    {passages.filter((p) => p.lesson_id === modalLessonId).map((p, i) => (
                      <option key={p.id} value={p.id}>Đoạn {i + 1}{p.text_de ? `: ${p.text_de.slice(0, 30)}...` : ""}</option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-slate-400 mt-1">Chưa có file/đoạn văn? Đóng modal này, tải/thêm ở khu vực phía trên trước.</p>
              </div>
            )}

            <div>
              <label className={labelCls}>Loại câu hỏi</label>
              <select
                value={form.type}
                onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EditForm["type"] }))}
                className={inputCls}
              >
                <option value="multiple_choice">Trắc nghiệm</option>
                <option value="text_fill_blank">Điền vào chỗ trống</option>
                <option value="matching">Ghép cặp</option>
              </select>
            </div>

            {form.type === "text_fill_blank" ? (
              <div>
                <label className={labelCls}>Nội dung câu (có chỗ trống) *</label>
                <textarea
                  rows={4}
                  value={form.prompt_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, prompt_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Ich {{bin|Bin}} Student."
                />
                <p className="text-[10px] text-slate-400 mt-1.5 leading-relaxed">
                  Đánh dấu chỗ trống bằng <code className="bg-slate-100 px-1 rounded">{"{{đáp_án}}"}</code>, nhiều biến thể đúng cách nhau bởi <code className="bg-slate-100 px-1 rounded">|</code>.
                </p>
              </div>
            ) : (
              <div>
                <label className={labelCls}>Nội dung câu hỏi *</label>
                <textarea
                  rows={2}
                  value={form.prompt_text}
                  onChange={(e) => setForm((prev) => ({ ...prev, prompt_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Nhập nội dung câu hỏi..."
                />
              </div>
            )}

            {form.type === "multiple_choice" && (
              <div>
                <label className={labelCls}>Các lựa chọn</label>
                <div className="space-y-2">
                  {form.options.map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-5 text-center">{String.fromCharCode(65 + i)}</span>
                      <input type="text" value={opt} onChange={(e) => setOption(i, e.target.value)} className={inputCls + " flex-1"} placeholder={`Lựa chọn ${String.fromCharCode(65 + i)}`} />
                      {form.options.length > 2 && (
                        <button onClick={() => removeOption(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addOption} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
                  </button>
                </div>
                <div className="mt-2">
                  <label className={labelCls}>Đáp án đúng *</label>
                  <select
                    value={form.correct_answer}
                    onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                    className={inputCls}
                  >
                    <option value="">-- Chọn đáp án đúng --</option>
                    {form.options.map((opt, i) => opt.trim() && (
                      <option key={i} value={String(i)}>{opt}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {form.type === "matching" && (
              <div>
                <label className={labelCls}>Các cặp ghép đôi</label>
                <div className="space-y-2">
                  {form.matching_pairs.map((pair, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input type="text" value={pair.de} onChange={(e) => setPair(i, "de", e.target.value)} className={inputCls + " flex-1"} placeholder="Tiếng Đức" />
                      <span className="text-slate-300">↔</span>
                      <input type="text" value={pair.vi} onChange={(e) => setPair(i, "vi", e.target.value)} className={inputCls + " flex-1"} placeholder="Tiếng Việt" />
                      {form.matching_pairs.length > 1 && (
                        <button onClick={() => removePair(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={addPair} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors">
                    <Plus className="w-3.5 h-3.5" /> Thêm cặp
                  </button>
                </div>
              </div>
            )}

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
                {editExerciseId ? "Lưu thay đổi" : "Thêm câu hỏi"}
              </Button>
            </div>
          </div>
        </div>
      )}

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
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 line-clamp-2">{deleteTarget.prompt_text}</div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Hủy</Button>
              <button onClick={handleDelete} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors">
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteClipTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa file mp3?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Câu hỏi đang gắn với file này sẽ mất audio hiển thị (không tự xoá câu hỏi). Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteClipTarget(null)}>Hủy</Button>
              <button onClick={handleDeleteClip} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors">
                {deletingClip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa đoạn văn?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Câu hỏi đang gắn với đoạn này sẽ mất nội dung hiển thị (không tự xoá câu hỏi). Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeletePassageTarget(null)}>Hủy</Button>
              <button onClick={handleDeletePassage} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors">
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
