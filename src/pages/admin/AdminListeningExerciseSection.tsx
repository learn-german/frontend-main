import React, { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Loader2,
  Search,
  Headphones,
  X,
  Eye,
  Pencil,
  Trash2,
  GripVertical,
  Upload,
} from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabase";
import { AdminModuleGroup } from "./AdminModuleGroup";
import { showToast } from "../../lib/toast";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets, type ExerciseSet } from "../../lib/hooks/useExerciseSets";
import { type ListeningClip, ClipRow } from "./AdminExerciseSetMedia";
import { uploadMedia } from "../../lib/uploadMedia";
import {
  LISTENING_QUESTION_TYPES,
  LISTENING_TYPE_LABELS,
  type ListeningQuestionType,
} from "../../lib/listeningExerciseTypes";
import {
  validateListeningExercise,
  buildListeningPayload,
  type ListeningExerciseForm,
} from "../../lib/listeningExerciseForm";
import { syncBlankDefinitions, type BlankDefinition } from "../../lib/grammarFillInBlank";
import { optionLabel, parseCorrectIndex, normalizeOptionsFromDb } from "../../lib/grammarMultipleChoice";
import { ExerciseAnswerInput } from "../../components/ExerciseAnswerInput";
import type { GrammarExercise } from "../../lib/appTypes";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

interface GrammarExerciseSummary {
  id: string;
  set_id: string;
  type: string;
}

interface ListeningExerciseRow {
  id: string;
  lesson_id: string;
  set_id: string;
  group_id: string | null;
  type: string;
  prompt_text: string | null;
  correct_answer: string | null;
  options: string[] | null;
  blanks: BlankDefinition[] | null;
  audio_clip_id: string | null;
  order_index: number;
  explanation: string | null;
}

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
const labelCls = "block text-xs font-bold text-slate-600 mb-1";

const isListeningQuestionType = (type: string): type is ListeningQuestionType =>
  (LISTENING_QUESTION_TYPES as readonly string[]).includes(type);

const emptyForm = (type: ListeningQuestionType): ListeningExerciseForm => ({
  type,
  promptText: "",
  correctAnswer: null,
  correctOptionIndex: -1,
  options: type === "multiple_choice" ? ["", "", "", ""] : [],
  blanks: [],
});

const formFromRow = (row: ListeningExerciseRow): ListeningExerciseForm => {
  const type = isListeningQuestionType(row.type) ? row.type : "fill_in_the_blank";
  const options = normalizeOptionsFromDb(row.options) ?? (type === "multiple_choice" ? ["", "", "", ""] : []);
  return {
    type,
    promptText: row.prompt_text ?? "",
    correctAnswer:
      type === "richtig_falsch" && (row.correct_answer === "richtig" || row.correct_answer === "falsch")
        ? row.correct_answer
        : null,
    correctOptionIndex: parseCorrectIndex(row.correct_answer, options.length),
    options: type === "multiple_choice" ? (options.length > 0 ? options : ["", "", "", ""]) : [],
    blanks: row.blanks ?? [],
  };
};

const toClientExercise = (row: ListeningExerciseRow): GrammarExercise => ({
  id: row.id,
  lessonId: row.lesson_id,
  orderIndex: row.order_index,
  type: row.type as GrammarExercise["type"],
  groupId: row.group_id ?? undefined,
  promptText: row.prompt_text ?? undefined,
  options: normalizeOptionsFromDb(row.options),
  audioClipId: row.audio_clip_id ?? undefined,
  explanation: row.explanation ?? "",
});

const AdminListeningPageHeader: React.FC<{
  search: string;
  onSearchChange: (value: string) => void;
}> = ({ search, onSearchChange }) => (
  <div className="flex items-center justify-between gap-3 flex-wrap">
    <h1 className="text-xl font-display font-black text-slate-900">Bài tập nghe</h1>
    <div className="relative w-64">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        type="text"
        placeholder="Tìm bài học..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
      />
    </div>
  </div>
);

const ListeningQuestionFields: React.FC<{
  form: ListeningExerciseForm;
  onChange: (next: ListeningExerciseForm) => void;
}> = ({ form, onChange }) => {
  if (form.type === "richtig_falsch") {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Nhận định *</label>
          <textarea
            rows={2}
            value={form.promptText}
            onChange={(e) => onChange({ ...form, promptText: e.target.value })}
            className={inputCls + " resize-none"}
            placeholder="Anna kommt aus Deutschland."
          />
        </div>
        <div>
          <label className={labelCls}>Đáp án đúng *</label>
          <div className="flex gap-2">
            {(["richtig", "falsch"] as const).map((val) => (
              <label
                key={val}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border cursor-pointer text-sm font-bold ${
                  form.correctAnswer === val
                    ? "border-orange-500 bg-orange-50 text-orange-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <input
                  type="radio"
                  name="rf-correct"
                  checked={form.correctAnswer === val}
                  onChange={() => onChange({ ...form, correctAnswer: val })}
                  className="accent-orange-500"
                />
                {val === "richtig" ? "Richtig" : "Falsch"}
              </label>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (form.type === "multiple_choice") {
    return (
      <div className="space-y-3">
        <div>
          <label className={labelCls}>Câu hỏi *</label>
          <textarea
            rows={2}
            value={form.promptText}
            onChange={(e) => onChange({ ...form, promptText: e.target.value })}
            className={inputCls + " resize-none"}
            placeholder="Was macht Lisa?"
          />
        </div>
        <div>
          <label className={labelCls}>4 phương án * (radio = đáp án đúng)</label>
          <div className="space-y-2">
            {form.options.map((opt, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="radio"
                  name="mc-correct"
                  checked={form.correctOptionIndex === index}
                  onChange={() => onChange({ ...form, correctOptionIndex: index })}
                  className="h-4 w-4 accent-orange-500"
                  aria-label={`Đáp án đúng ${optionLabel(index)}`}
                />
                <span className="w-5 text-xs font-display font-bold text-slate-400">{optionLabel(index)}</span>
                <input
                  type="text"
                  value={opt}
                  onChange={(e) =>
                    onChange({
                      ...form,
                      options: form.options.map((o, i) => (i === index ? e.target.value : o)),
                    })
                  }
                  className={inputCls + " flex-1"}
                  placeholder={`Phương án ${optionLabel(index)}`}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className={labelCls}>Câu có ô trống *</label>
        <p className="mb-1.5 text-[11px] text-slate-400">Dùng ___ để đánh dấu từng ô trống.</p>
        <textarea
          rows={3}
          value={form.promptText}
          onChange={(e) =>
            onChange({
              ...form,
              promptText: e.target.value,
              blanks: syncBlankDefinitions(e.target.value, form.blanks),
            })
          }
          className={inputCls + " resize-y"}
          placeholder="Ich ___ nach Hause."
        />
      </div>
      <div className="space-y-3">
        {form.blanks.map((blank, blankIndex) => (
          <div key={blankIndex} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
            <label className={labelCls}>Đáp án ô {blankIndex + 1} *</label>
            <div className="space-y-2">
              {blank.acceptedAnswers.map((answer, answerIndex) => (
                <div key={answerIndex} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={answer}
                    onChange={(e) =>
                      onChange({
                        ...form,
                        blanks: form.blanks.map((item, i) =>
                          i === blankIndex
                            ? {
                                acceptedAnswers: item.acceptedAnswers.map((v, j) =>
                                  j === answerIndex ? e.target.value : v,
                                ),
                              }
                            : item,
                        ),
                      })
                    }
                    className={inputCls}
                    placeholder="gehe"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      onChange({
                        ...form,
                        blanks: form.blanks.map((item, i) =>
                          i === blankIndex
                            ? {
                                acceptedAnswers: item.acceptedAnswers.filter((_, j) => j !== answerIndex),
                              }
                            : item,
                        ),
                      })
                    }
                    className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    aria-label={`Xóa đáp án ô ${blankIndex + 1}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  onChange({
                    ...form,
                    blanks: form.blanks.map((item, i) =>
                      i === blankIndex
                        ? { acceptedAnswers: [...item.acceptedAnswers, ""] }
                        : item,
                    ),
                  })
                }
                className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
              >
                <Plus className="h-3.5 w-3.5" /> Thêm đáp án hợp lệ
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const SortableQuestionRow: React.FC<{
  exercise: ListeningExerciseRow;
  index: number;
  selected: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ exercise, index, selected, disabled, onToggle, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exercise.id,
    disabled,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-3 px-3 py-2.5 border-b border-slate-100 last:border-0 bg-white ${
        isDragging ? "z-10 opacity-60 shadow-lg" : ""
      }`}
    >
      <button
        type="button"
        className="cursor-grab p-1 text-slate-300 hover:text-slate-500 disabled:opacity-40"
        disabled={disabled}
        {...attributes}
        {...listeners}
        aria-label={`Kéo câu ${index + 1}`}
      >
        <GripVertical className="h-4 w-4" />
      </button>
      <input
        type="checkbox"
        checked={selected}
        onChange={onToggle}
        className="h-4 w-4 accent-orange-500"
      />
      <span className="w-8 shrink-0 text-xs font-bold text-slate-400">{index + 1}</span>
      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
        {exercise.prompt_text?.trim() || "(Chưa có nội dung)"}
      </span>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"
          title="Chỉnh sửa"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"
          title="Xóa"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

const ListeningSetEditor: React.FC<{
  set: ExerciseSet;
  lesson: LessonGroup;
  level: string;
  lessonCountInModule: number;
  setCountInLesson: number;
  questionType: ListeningQuestionType | null;
  onBack: () => void;
  onToggleStatus: (id: string, current: "draft" | "published") => Promise<{ error: string | null }>;
  onUpdateInstruction: (id: string, text: string) => Promise<{ error: string | null }>;
  onExercisesChanged: () => void;
  onQuestionTypeKnown: (setId: string, type: ListeningQuestionType) => void;
}> = ({
  set,
  lesson,
  level,
  lessonCountInModule,
  setCountInLesson,
  questionType,
  onBack,
  onToggleStatus,
  onUpdateInstruction,
  onExercisesChanged,
  onQuestionTypeKnown,
}) => {
  const [setExercises, setSetExercises] = useState<ListeningExerciseRow[]>([]);
  const [clips, setClips] = useState<ListeningClip[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignedClipId, setAssignedClipId] = useState<string | null>(null);
  const [clipPickerOpen, setClipPickerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [editingInstruction, setEditingInstruction] = useState(false);
  const [instructionDraft, setInstructionDraft] = useState(set.generalInstruction ?? "");
  const [savingInstruction, setSavingInstruction] = useState(false);
  const [questionModal, setQuestionModal] = useState<"create" | "edit" | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<ListeningExerciseForm>(emptyForm("fill_in_the_blank"));
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ListeningExerciseRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewText, setPreviewText] = useState<Record<string, string>>({});
  const [previewChoice, setPreviewChoice] = useState<Record<string, number>>({});
  const [previewBlanks, setPreviewBlanks] = useState<Record<string, string[]>>({});
  const [publishing, setPublishing] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const resolvedType: ListeningQuestionType | null =
    questionType ??
    (() => {
      const first = setExercises.find((ex) => isListeningQuestionType(ex.type));
      return first && isListeningQuestionType(first.type) ? first.type : null;
    })();

  const fetchSetData = async () => {
    setLoading(true);
    const [exRes, clipsRes] = await Promise.all([
      supabase
        .from("grammar_exercises")
        .select(
          "id, lesson_id, set_id, group_id, type, prompt_text, correct_answer, options, blanks, audio_clip_id, order_index, explanation",
        )
        .eq("set_id", set.id)
        .order("order_index"),
      supabase
        .from("listening_clips")
        .select("*")
        .eq("lesson_id", lesson.lesson_id)
        .order("order_index"),
    ]);
    const rows = (exRes.data ?? []) as ListeningExerciseRow[];
    setSetExercises(rows);
    setClips((clipsRes.data ?? []) as ListeningClip[]);
    const clipFromEx = rows.find((r) => r.audio_clip_id)?.audio_clip_id ?? null;
    setAssignedClipId(clipFromEx);
    const firstType = rows.find((r) => isListeningQuestionType(r.type));
    if (firstType && isListeningQuestionType(firstType.type)) {
      onQuestionTypeKnown(set.id, firstType.type);
    }
    setSelectedIds((prev) => new Set([...prev].filter((id) => rows.some((r) => r.id === id))));
    setLoading(false);
  };

  useEffect(() => {
    fetchSetData();
    setInstructionDraft(set.generalInstruction ?? "");
    setEditingInstruction(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id]);

  useEffect(() => {
    setInstructionDraft(set.generalInstruction ?? "");
  }, [set.generalInstruction]);

  const lessonClips = clips.filter((c) => c.lesson_id === lesson.lesson_id);
  const assignedClip = lessonClips.find((c) => c.id === assignedClipId) ?? null;
  const assignedClipIndex = assignedClip
    ? lessonClips.findIndex((c) => c.id === assignedClip.id)
    : -1;

  const assignClipToSet = async (clipId: string) => {
    setAssignedClipId(clipId);
    if (setExercises.length > 0) {
      const { error } = await supabase
        .from("grammar_exercises")
        .update({ audio_clip_id: clipId })
        .eq("set_id", set.id);
      if (error) {
        showToast("Gán file nghe thất bại: " + error.message, "warning");
        return;
      }
      setSetExercises((prev) => prev.map((ex) => ({ ...ex, audio_clip_id: clipId })));
    }
    setClipPickerOpen(false);
    showToast("Đã gán file nghe.", "success");
  };

  const handleUploadClip = async (file: File) => {
    setUploading(true);
    setUploadPct(0);
    try {
      const clipId = crypto.randomUUID();
      const objectKey = await uploadMedia(file, lesson.lesson_id, "audio", setUploadPct, clipId);
      const nextOrder = lessonClips.length;
      const { error } = await supabase
        .from("listening_clips")
        .insert({ id: clipId, lesson_id: lesson.lesson_id, r2_key: objectKey, order_index: nextOrder });
      if (error) throw new Error(error.message);
      const newClip: ListeningClip = {
        id: clipId,
        lesson_id: lesson.lesson_id,
        r2_key: objectKey,
        order_index: nextOrder,
      };
      setClips((prev) => [...prev, newClip]);
      await assignClipToSet(clipId);
      showToast("Đã tải file mp3 lên.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải file mp3 thất bại", "warning");
    } finally {
      setUploading(false);
      setUploadPct(null);
    }
  };

  const handleDeleteClip = async (clip: ListeningClip) => {
    const { error } = await supabase.from("listening_clips").delete().eq("id", clip.id);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
      return;
    }
    setClips((prev) => prev.filter((c) => c.id !== clip.id));
    if (assignedClipId === clip.id) {
      setAssignedClipId(null);
      if (setExercises.length > 0) {
        await supabase.from("grammar_exercises").update({ audio_clip_id: null }).eq("set_id", set.id);
        setSetExercises((prev) => prev.map((ex) => ({ ...ex, audio_clip_id: null })));
      }
    }
    showToast("Đã xóa file mp3.", "success");
  };

  const saveInstruction = async () => {
    setSavingInstruction(true);
    const { error } = await onUpdateInstruction(set.id, instructionDraft);
    setSavingInstruction(false);
    if (error) {
      showToast("Lưu yêu cầu chung thất bại: " + error, "warning");
      return;
    }
    setEditingInstruction(false);
    showToast("Đã lưu yêu cầu chung.", "success");
  };

  const openCreateQuestion = () => {
    if (!resolvedType) {
      showToast("Chưa xác định loại câu hỏi cho bài tập này.", "warning");
      return;
    }
    setForm(emptyForm(resolvedType));
    setEditId(null);
    setQuestionModal("create");
  };

  const openEditQuestion = (row: ListeningExerciseRow) => {
    setForm(formFromRow(row));
    setEditId(row.id);
    setQuestionModal("edit");
  };

  const saveQuestion = async () => {
    const errorMsg = validateListeningExercise(form);
    if (errorMsg) {
      showToast(errorMsg, "warning");
      return;
    }
    setSavingQuestion(true);
    const payload = buildListeningPayload(form);

    if (questionModal === "edit" && editId) {
      const { error } = await supabase.from("grammar_exercises").update(payload).eq("id", editId);
      setSavingQuestion(false);
      if (error) {
        showToast("Lưu thất bại: " + error.message, "warning");
        return;
      }
      showToast("Đã cập nhật câu hỏi.", "success");
    } else {
      const groupId = setExercises[0]?.group_id ?? crypto.randomUUID();
      if (setExercises.length > 0 && !setExercises[0].group_id) {
        await supabase
          .from("grammar_exercises")
          .update({ group_id: groupId })
          .eq("set_id", set.id);
      }
      const nextOrder =
        setExercises.reduce((max, ex) => Math.max(max, ex.order_index), -1) + 1;
      const { error } = await supabase.from("grammar_exercises").insert({
        ...payload,
        lesson_id: lesson.lesson_id,
        set_id: set.id,
        group_id: groupId,
        audio_clip_id: assignedClipId,
        order_index: nextOrder,
        explanation: "",
      });
      setSavingQuestion(false);
      if (error) {
        showToast("Thêm câu thất bại: " + error.message, "warning");
        return;
      }
      showToast("Đã thêm câu hỏi.", "success");
    }
    setQuestionModal(null);
    await fetchSetData();
    onExercisesChanged();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("grammar_exercises").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
      return;
    }
    showToast("Đã xóa câu hỏi.", "success");
    setDeleteTarget(null);
    await fetchSetData();
    onExercisesChanged();
  };

  const handleBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setDeleting(true);
    const { error } = await supabase.from("grammar_exercises").delete().in("id", ids);
    setDeleting(false);
    if (error) {
      showToast("Xóa hàng loạt thất bại: " + error.message, "warning");
      return;
    }
    showToast(`Đã xóa ${ids.length} câu.`, "success");
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    await fetchSetData();
    onExercisesChanged();
  };

  const handleReorder = async (activeId: string, overId: string) => {
    const oldIndex = setExercises.findIndex((ex) => ex.id === activeId);
    const newIndex = setExercises.findIndex((ex) => ex.id === overId);
    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) return;
    const reordered = arrayMove(setExercises, oldIndex, newIndex).map((ex, i) => ({
      ...ex,
      order_index: i,
    }));
    setSetExercises(reordered);
    setReorderSaving(true);
    const results = await Promise.all(
      reordered.map((ex) =>
        supabase.from("grammar_exercises").update({ order_index: ex.order_index }).eq("id", ex.id),
      ),
    );
    setReorderSaving(false);
    const failed = results.find((r) => r.error);
    if (failed?.error) {
      showToast("Đổi thứ tự thất bại: " + failed.error.message, "warning");
      await fetchSetData();
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) handleReorder(String(active.id), String(over.id));
  };

  const handleSaveDraft = async () => {
    if (set.status === "draft") {
      showToast("Bài tập đang ở trạng thái nháp.", "info");
      return;
    }
    const { error } = await onToggleStatus(set.id, set.status);
    if (error) showToast("Lưu nháp thất bại: " + error, "warning");
    else showToast("Đã chuyển về nháp.", "success");
  };

  const handlePublish = async () => {
    if (!assignedClipId) {
      showToast("Cần gán file nghe trước khi xuất bản.", "warning");
      return;
    }
    if (setExercises.length < 1) {
      showToast("Cần ít nhất 1 câu hỏi trước khi xuất bản.", "warning");
      return;
    }
    for (let i = 0; i < setExercises.length; i++) {
      const row = setExercises[i];
      if (!isListeningQuestionType(row.type)) {
        showToast(`Câu ${i + 1}: loại câu không hỗ trợ cho nghe.`, "warning");
        return;
      }
      const msg = validateListeningExercise(formFromRow(row));
      if (msg) {
        showToast(`Câu ${i + 1}: ${msg}`, "warning");
        return;
      }
    }
    if (set.status === "published") {
      showToast("Bài tập đã được xuất bản.", "info");
      return;
    }
    setPublishing(true);
    const { error } = await onToggleStatus(set.id, set.status);
    setPublishing(false);
    if (error) showToast("Xuất bản thất bại: " + error, "warning");
    else showToast("Đã xuất bản bài tập nghe.", "success");
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={onBack}
          className="text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          ← Quay lại danh sách
        </button>
        <span className="text-sm text-slate-500">
          <span className="font-display font-black text-slate-800">{level}</span>
          <span className="text-slate-400"> ({lessonCountInModule} bài học) › </span>
          <span className="font-display font-bold text-slate-800">{lesson.lesson_title}</span>
          <span className="text-slate-400">
            {" "}
            ({setCountInLesson} bài - {setExercises.length} câu)
          </span>
        </span>
        {resolvedType && (
          <span className="text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
            {LISTENING_TYPE_LABELS[resolvedType]}
          </span>
        )}
        <span role="button" onClick={() => onToggleStatus(set.id, set.status)}>
          <LessonStatusBadge status={set.status} />
        </span>
      </div>

      {/* §1 File nghe */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-black text-slate-900">1. File nghe</h2>
            <p className="text-xs text-slate-400 mt-0.5">Bài tập này sử dụng 1 file nghe</p>
          </div>
          <div className="relative">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setClipPickerOpen((o) => !o)}
            >
              Thay đổi file
            </Button>
            {clipPickerOpen && (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 rounded-xl border border-slate-200 bg-white shadow-lg p-2 space-y-1">
                {lessonClips.length === 0 && (
                  <p className="text-xs text-slate-400 px-2 py-1.5">Chưa có file nào. Tải lên bên dưới.</p>
                )}
                {lessonClips.map((clip, i) => (
                  <button
                    key={clip.id}
                    type="button"
                    onClick={() => assignClipToSet(clip.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-xs font-bold ${
                      assignedClipId === clip.id
                        ? "bg-orange-50 text-orange-700"
                        : "hover:bg-slate-50 text-slate-700"
                    }`}
                  >
                    File {i + 1}
                    {assignedClipId === clip.id ? " ✓" : ""}
                  </button>
                ))}
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-orange-600 hover:bg-orange-50 cursor-pointer">
                  <Upload className="w-3.5 h-3.5" />
                  {uploading ? `Đang tải ${uploadPct ?? 0}%` : "Tải file mới lên"}
                  <input
                    type="file"
                    accept="audio/mpeg,audio/mp3,.mp3"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadClip(f);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
            )}
          </div>
        </div>
        {assignedClip ? (
          <ClipRow
            lessonId={lesson.lesson_id}
            clip={assignedClip}
            index={Math.max(assignedClipIndex, 0)}
            onDelete={handleDeleteClip}
          />
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center space-y-2">
            <p className="text-sm text-slate-500">Chưa gán file nghe</p>
            <label className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 cursor-pointer">
              <Upload className="w-3.5 h-3.5" />
              {uploading ? `Đang tải ${uploadPct ?? 0}%` : "Tải file mp3 lên"}
              <input
                type="file"
                accept="audio/mpeg,audio/mp3,.mp3"
                className="hidden"
                disabled={uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleUploadClip(f);
                  e.target.value = "";
                }}
              />
            </label>
          </div>
        )}
      </section>

      {/* §2 Yêu cầu chung */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-display font-black text-slate-900">2. Yêu cầu chung</h2>
            <p className="text-xs text-slate-400 mt-0.5">Hướng dẫn chung cho toàn bộ bài tập</p>
          </div>
          {!editingInstruction ? (
            <button
              type="button"
              onClick={() => setEditingInstruction(true)}
              className="text-xs font-bold text-orange-600 hover:text-orange-700"
            >
              Sửa
            </button>
          ) : (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setInstructionDraft(set.generalInstruction ?? "");
                  setEditingInstruction(false);
                }}
                className="text-xs font-bold text-slate-500 hover:text-slate-700"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveInstruction}
                disabled={savingInstruction}
                className="text-xs font-bold text-orange-600 hover:text-orange-700 disabled:opacity-50"
              >
                {savingInstruction ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          )}
        </div>
        {editingInstruction ? (
          <textarea
            rows={3}
            value={instructionDraft}
            onChange={(e) => setInstructionDraft(e.target.value)}
            className={inputCls + " resize-y"}
            placeholder="Nghe đoạn hội thoại và trả lời các câu hỏi..."
          />
        ) : (
          <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap min-h-[2.5rem]">
            {set.generalInstruction?.trim()
              ? set.generalInstruction
              : <span className="text-slate-400 italic">Chưa có yêu cầu chung.</span>}
          </div>
        )}
      </section>

      {/* §3 Câu hỏi */}
      <section className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-display font-black text-slate-900">3. Câu hỏi</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Các câu hỏi trong bài tập (kéo thả để sắp xếp thứ tự)
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(true)}
                className="text-xs font-bold text-rose-600 hover:text-rose-700"
              >
                Xóa {selectedIds.size} câu
              </button>
            )}
            <button
              type="button"
              onClick={openCreateQuestion}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm câu
            </button>
          </div>
        </div>

        {setExercises.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-4 text-center">Chưa có câu hỏi nào.</p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={setExercises.map((ex) => ex.id)} strategy={verticalListSortingStrategy}>
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                {setExercises.map((ex, index) => (
                  <SortableQuestionRow
                    key={ex.id}
                    exercise={ex}
                    index={index}
                    selected={selectedIds.has(ex.id)}
                    disabled={reorderSaving}
                    onToggle={() =>
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (next.has(ex.id)) next.delete(ex.id);
                        else next.add(ex.id);
                        return next;
                      })
                    }
                    onEdit={() => openEditQuestion(ex)}
                    onDelete={() => setDeleteTarget(ex)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      {/* Sticky footer */}
      <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 backdrop-blur px-4 py-3 flex items-center justify-end gap-2 rounded-t-xl shadow-[0_-4px_12px_rgba(15,23,42,0.06)]">
        <Button type="button" variant="secondary" size="sm" onClick={() => setPreviewOpen(true)}>
          <Eye className="w-3.5 h-3.5 mr-1.5" /> Xem trước
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={handleSaveDraft}>
          Lưu nháp
        </Button>
        <Button type="button" variant="primary" size="sm" onClick={handlePublish} disabled={publishing}>
          {publishing ? "Đang xuất bản..." : "Xuất bản"}
        </Button>
      </div>

      {/* Question modal */}
      {questionModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-lg w-full my-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-black text-slate-800">
                {questionModal === "edit" ? "Sửa câu hỏi" : "Thêm câu hỏi"}
                {resolvedType ? ` — ${LISTENING_TYPE_LABELS[resolvedType]}` : ""}
              </h3>
              <button
                type="button"
                onClick={() => setQuestionModal(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ListeningQuestionFields form={form} onChange={setForm} />
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setQuestionModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={saveQuestion}
                disabled={savingQuestion}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50"
              >
                {savingQuestion ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800">Xóa câu hỏi?</h3>
            <p className="text-xs text-slate-500 truncate">{deleteTarget.prompt_text}</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800">
              Xóa {selectedIds.size} câu đã chọn?
            </h3>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setBulkDeleteOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={deleting}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 rounded-xl hover:bg-rose-700 disabled:opacity-50"
              >
                {deleting ? "Đang xóa..." : "Xóa tất cả"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview modal */}
      {previewOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-2xl w-full my-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-display font-black text-slate-800">Xem trước</h3>
              <button
                type="button"
                onClick={() => setPreviewOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {assignedClip && (
              <ClipRow
                lessonId={lesson.lesson_id}
                clip={assignedClip}
                index={Math.max(assignedClipIndex, 0)}
                onDelete={() => undefined}
              />
            )}
            {set.generalInstruction?.trim() && (
              <div className="rounded-xl bg-slate-50 border border-slate-200 px-3 py-2.5 text-sm text-slate-700 whitespace-pre-wrap">
                {set.generalInstruction}
              </div>
            )}
            {setExercises.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Chưa có câu hỏi.</p>
            ) : (
              <div className="space-y-3">
                {setExercises.map((row, i) => {
                  const exercise = toClientExercise(row);
                  return (
                    <ExerciseAnswerInput
                      key={row.id}
                      exercise={exercise}
                      numberLabel={String(i + 1)}
                      selectedTokens={[]}
                      onToggleToken={() => undefined}
                      onClearTokens={() => undefined}
                      textAnswer={previewText[row.id] ?? ""}
                      onTextAnswerChange={(v) => setPreviewText((prev) => ({ ...prev, [row.id]: v }))}
                      itemGroups={{}}
                      onItemGroupChange={() => undefined}
                      blankAnswers={
                        previewBlanks[row.id] ??
                        Array((row.prompt_text ?? "").split("___").length - 1).fill("")
                      }
                      onBlankFocus={() => undefined}
                      onBlankAnswerChange={(blankIndex, value) =>
                        setPreviewBlanks((prev) => {
                          const current =
                            prev[row.id] ??
                            Array((row.prompt_text ?? "").split("___").length - 1).fill("");
                          return {
                            ...prev,
                            [row.id]: current.map((v, j) => (j === blankIndex ? value : v)),
                          };
                        })
                      }
                      selectedChoice={previewChoice[row.id]}
                      onSelectChoice={(idx) =>
                        setPreviewChoice((prev) => ({ ...prev, [row.id]: idx }))
                      }
                      optionLayout="horizontal"
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export const AdminListeningExerciseSection: React.FC = () => {
  const [lessons, setLessons] = useState<LessonGroup[]>([]);
  const [exercises, setExercises] = useState<GrammarExerciseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null);
  const [setQuestionTypes, setSetQuestionTypes] = useState<Record<string, ListeningQuestionType>>({});
  const [createTypeModal, setCreateTypeModal] = useState<{ lessonId: string; nextOrder: number } | null>(null);
  const [pickedQuestionType, setPickedQuestionType] = useState<ListeningQuestionType>("fill_in_the_blank");
  const [creatingSet, setCreatingSet] = useState(false);

  const { modules: moduleOrder, loading: moduleOrderLoading } = useModuleOrder();
  const {
    sets,
    loading: setsLoading,
    createSet,
    toggleSetStatus,
    updateGeneralInstruction,
  } = useExerciseSets();

  const ngheSets = sets.filter((s) => s.category === "nghe");

  const fetchAll = async () => {
    setLoading(true);
    const [lessonsRes, setsRes] = await Promise.all([
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("exercise_sets").select("id").eq("category", "nghe"),
    ]);
    setLessons(
      (lessonsRes.data ?? []).map((l) => ({
        lesson_id: l.id,
        lesson_title: l.title_vi,
        module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      })),
    );
    const setIds = (setsRes.data ?? []).map((s) => s.id as string);
    if (setIds.length === 0) {
      setExercises([]);
      setLoading(false);
      return;
    }
    const exercisesRes = await supabase
      .from("grammar_exercises")
      .select("id, set_id, type")
      .in("set_id", setIds);
    setExercises((exercisesRes.data ?? []) as GrammarExerciseSummary[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchAll();
  }, []);

  useEffect(() => {
    const inferred: Record<string, ListeningQuestionType> = {};
    for (const set of sets.filter((s) => s.category === "nghe")) {
      const setExercises = exercises.filter((ex) => ex.set_id === set.id);
      const firstListeningType = setExercises.find((ex) => isListeningQuestionType(ex.type));
      if (firstListeningType && isListeningQuestionType(firstListeningType.type)) {
        inferred[set.id] = firstListeningType.type;
      }
    }
    setSetQuestionTypes((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [setId, type] of Object.entries(inferred)) {
        if (!next[setId]) {
          next[setId] = type;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [exercises, sets]);

  const questionCountForSet = (setId: string) =>
    exercises.filter((ex) => ex.set_id === setId).length;

  const inferQuestionType = (setId: string): ListeningQuestionType | null => {
    if (setQuestionTypes[setId]) return setQuestionTypes[setId];
    const first = exercises.find((ex) => ex.set_id === setId && isListeningQuestionType(ex.type));
    return first && isListeningQuestionType(first.type) ? first.type : null;
  };

  const handleCreateSet = async () => {
    if (!createTypeModal) return;
    setCreatingSet(true);
    const { lessonId, nextOrder } = createTypeModal;
    const { data, error } = await createSet(lessonId, "nghe", nextOrder);
    setCreatingSet(false);
    if (error) {
      showToast("Tạo bài tập thất bại: " + error, "warning");
      return;
    }
    if (data) {
      setSetQuestionTypes((prev) => ({ ...prev, [data.id]: pickedQuestionType }));
      setCreateTypeModal(null);
      setSelectedSetId(data.id);
      showToast("Đã tạo bài tập nghe.", "success");
    }
  };

  if (loading || moduleOrderLoading || setsLoading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    );
  }

  const selectedSet = selectedSetId ? ngheSets.find((s) => s.id === selectedSetId) : null;
  const selectedLesson = selectedSet
    ? lessons.find((l) => l.lesson_id === selectedSet.lessonId)
    : null;

  if (selectedSetId && selectedSet && selectedLesson) {
    const mod = moduleOrder.find((m) => m.lessonIds.includes(selectedLesson.lesson_id));
    const setCountInLesson = ngheSets.filter((s) => s.lessonId === selectedLesson.lesson_id).length;
    return (
      <ListeningSetEditor
        set={selectedSet}
        lesson={selectedLesson}
        level={mod?.level ?? selectedLesson.module_title}
        lessonCountInModule={mod?.lessonIds.length ?? 0}
        setCountInLesson={setCountInLesson}
        questionType={inferQuestionType(selectedSetId)}
        onBack={() => {
          setSelectedSetId(null);
          fetchAll();
        }}
        onToggleStatus={toggleSetStatus}
        onUpdateInstruction={updateGeneralInstruction}
        onExercisesChanged={fetchAll}
        onQuestionTypeKnown={(setId, type) =>
          setSetQuestionTypes((prev) => ({ ...prev, [setId]: type }))
        }
      />
    );
  }

  if (selectedSetId && selectedSet && !selectedLesson) {
    return (
      <div className="space-y-3">
        <button
          type="button"
          onClick={() => setSelectedSetId(null)}
          className="text-xs font-bold text-slate-500 hover:text-slate-800"
        >
          ← Quay lại danh sách
        </button>
        <p className="text-sm text-slate-500">Không tìm thấy bài học cho bộ bài tập này.</p>
      </div>
    );
  }

  const filteredLessons = lessons.filter(
    (l) =>
      l.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      l.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  const moduleSections = moduleOrder
    .map((mod) => ({
      id: mod.id,
      level: mod.level,
      lessonGroups: mod.lessonIds
        .map((lid) => filteredLessons.find((l) => l.lesson_id === lid))
        .filter((l): l is LessonGroup => !!l),
    }))
    .filter((mod) => mod.lessonGroups.length > 0);

  return (
    <div className="space-y-5">
      <AdminListeningPageHeader search={search} onSearchChange={setSearch} />

      <div className="space-y-3">
        {moduleSections.map((mod) => (
          <AdminModuleGroup
            key={mod.id}
            title={mod.level}
            subtitle={`${mod.lessonGroups.length} bài học`}
            expanded={!!moduleExpanded[mod.id]}
            onToggle={() => setModuleExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
          >
            {mod.lessonGroups.map((lesson) => {
              const lessonSets = ngheSets.filter((s) => s.lessonId === lesson.lesson_id);
              const isExpanded = expanded[lesson.lesson_id] ?? false;
              const lessonQuestionCount = lessonSets.reduce(
                (sum, set) => sum + questionCountForSet(set.id),
                0,
              );

              return (
                <div key={lesson.lesson_id} className="rounded-2xl border border-slate-200 bg-white">
                  <button
                    type="button"
                    onClick={() => setExpanded((prev) => ({ ...prev, [lesson.lesson_id]: !isExpanded }))}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 text-left rounded-t-2xl"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400" />
                    )}
                    <span className="text-sm font-display font-bold text-slate-700">{lesson.lesson_title}</span>
                    <span className="text-xs text-slate-400">{lesson.module_title}</span>
                    <span className="ml-auto text-xs text-slate-400">
                      {lessonSets.length} bài - {lessonQuestionCount} câu
                    </span>
                  </button>
                  {isExpanded && (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setPickedQuestionType("fill_in_the_blank");
                            setCreateTypeModal({
                              lessonId: lesson.lesson_id,
                              nextOrder: lessonSets.length,
                            });
                          }}
                          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                        >
                          <Plus className="w-3.5 h-3.5" /> Thêm bài tập
                        </button>
                      </div>
                      {lessonSets.length === 0 && (
                        <p className="text-xs text-slate-400 italic">Chưa có bài tập nghe nào.</p>
                      )}
                      {lessonSets.map((set) => {
                        const questionType = inferQuestionType(set.id);
                        const questionCount = questionCountForSet(set.id);
                        return (
                          <button
                            key={set.id}
                            type="button"
                            onClick={() => setSelectedSetId(set.id)}
                            className="w-full flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white hover:bg-orange-50/40 hover:border-orange-200 transition-colors text-left"
                          >
                            <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                              <Headphones className="w-4 h-4" />
                            </div>
                            <span className="text-sm font-display font-black text-slate-900">{set.title}</span>
                            {questionType && (
                              <span className="text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
                                {LISTENING_TYPE_LABELS[questionType]}
                              </span>
                            )}
                            <span
                              role="presentation"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleSetStatus(set.id, set.status);
                              }}
                            >
                              <LessonStatusBadge status={set.status} />
                            </span>
                            <span className="ml-auto text-xs text-slate-400">{questionCount} câu hỏi</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </AdminModuleGroup>
        ))}
        {moduleSections.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với &quot;{search}&quot;.
          </div>
        )}
      </div>

      {createTypeModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-[640px] w-full my-8 space-y-4">
            <div className="flex flex-col items-center text-center gap-1 relative pr-6">
              <h3 className="text-base font-display font-black text-slate-800">Chọn loại câu hỏi</h3>
              <p className="text-xs text-slate-500">Mỗi bài tập nghe chỉ có một loại câu hỏi.</p>
              <button
                type="button"
                onClick={() => setCreateTypeModal(null)}
                className="absolute right-0 top-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {LISTENING_QUESTION_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setPickedQuestionType(type)}
                  className={`relative text-left border-2 rounded-2xl p-4 flex flex-col gap-2 cursor-pointer transition-colors ${
                    pickedQuestionType === type
                      ? "border-orange-500 bg-orange-50/30"
                      : "border-slate-200 hover:border-slate-300"
                  }`}
                >
                  {pickedQuestionType === type && (
                    <span className="absolute top-3 right-3 w-5 h-5 rounded-full bg-orange-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </span>
                  )}
                  <span className="text-sm font-display font-black text-slate-800">
                    {LISTENING_TYPE_LABELS[type]}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setCreateTypeModal(null)}
                className="px-4 py-2 text-xs font-bold text-slate-500 rounded-xl hover:bg-slate-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleCreateSet}
                disabled={creatingSet}
                className="px-4 py-2 text-xs font-bold text-white bg-orange-600 rounded-xl hover:bg-orange-700 disabled:opacity-50"
              >
                {creatingSet ? "Đang tạo..." : "Tiếp tục"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
