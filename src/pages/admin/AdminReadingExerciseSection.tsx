import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2, Pencil, X, Eye, FileText } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets } from "../../lib/hooks/useExerciseSets";
import { type ReadingPassage, PassageEditRow } from "./AdminExerciseSetMedia";
import {
  createEmptyReadingForm,
  buildReadingPayload,
  addStatement,
  setStatementText,
  setStatementAnswer,
  addSubQuestion,
  setSubQuestionField,
  setSubQuestionOptions,
  type ReadingQuestionGroupForm,
} from "../../lib/readingExerciseForm";
import { addOption, setOption, removeOption, optionLabel, validateChoiceForm, buildMultipleChoicePayload } from "../../lib/grammarMultipleChoice";
import { uploadMedia } from "../../lib/uploadMedia";
import { MarkdownBlock } from "../../components/MarkdownBlock";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

type ReadingStatementRow = { text: string; correct_answer: "richtig" | "falsch" };
type ReadingSubQuestionRow = { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string };

interface ReadingQuestionGroupRowData {
  id: string;
  passage_id: string;
  set_id: string;
  order_index: number;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: ReadingStatementRow[] | null;
  sub_questions: ReadingSubQuestionRow[] | null;
  explanation: string | null;
}

const QUESTION_TYPE_LABEL: Record<"richtig_falsch" | "multiple_choice", string> = {
  richtig_falsch: "Đúng / Sai",
  multiple_choice: "Trắc nghiệm",
};

const itemCount = (group: ReadingQuestionGroupRowData): number =>
  group.question_type === "richtig_falsch" ? (group.statements ?? []).length : (group.sub_questions ?? []).length;

const ReadingGroupPreview: React.FC<{ group: ReadingQuestionGroupRowData; passageText: string; lessonId: string }> = ({ group, passageText, lessonId }) => {
  const [picked, setPicked] = useState<Record<number, "richtig" | "falsch">>({});
  const [chosenOption, setChosenOption] = useState<Record<number, number>>({});

  return (
    <div className="space-y-3">
      {group.title && <p className="text-sm font-display font-bold text-slate-800">{group.title}</p>}
      {group.question_intro && <p className="text-xs text-slate-500">{group.question_intro}</p>}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
        <MarkdownBlock content={passageText} lessonId={lessonId} />
      </div>
      {group.question_type === "richtig_falsch" && (group.statements ?? []).map((s, i) => (
        <div key={i} className="flex items-center gap-2 p-2 bg-white border border-slate-200 rounded-xl">
          <span className="flex-1 text-sm text-slate-700">{s.text}</span>
          {(["richtig", "falsch"] as const).map((val) => (
            <button
              key={val}
              onClick={() => setPicked((prev) => ({ ...prev, [i]: val }))}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${picked[i] === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
            >
              {val === "richtig" ? "Richtig" : "Falsch"}
            </button>
          ))}
        </div>
      ))}
      {group.question_type === "multiple_choice" && (group.sub_questions ?? []).map((q, qi) => (
        <div key={qi} className="p-3 bg-white border border-slate-200 rounded-xl space-y-2">
          {q.text_snippet && <p className="text-xs text-slate-500">{q.text_snippet}</p>}
          <p className="text-sm font-medium text-slate-700">{q.question}</p>
          <div className="space-y-1">
            {q.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => setChosenOption((prev) => ({ ...prev, [qi]: oi }))}
                className={`w-full text-left px-3 py-1.5 text-sm rounded-lg border ${chosenOption[qi] === oi ? "bg-orange-50 border-orange-400 text-orange-700" : "bg-white border-slate-200 text-slate-700"}`}
              >
                {optionLabel(oi)}. {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

interface ItemModalState {
  setId: string;
  lessonId: string;
  questionType: "richtig_falsch" | "multiple_choice";
  groupId: string | null;
  itemIndex: number | null;
}

export const AdminReadingExerciseSection: React.FC = () => {
  const [lessons, setLessons] = useState<LessonGroup[]>([]);
  const [passages, setPassages] = useState<ReadingPassage[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [savingPassageId, setSavingPassageId] = useState<string | null>(null);
  const [deletePassageTarget, setDeletePassageTarget] = useState<ReadingPassage | null>(null);
  const [deletingPassage, setDeletingPassage] = useState(false);
  const { modules: moduleOrder, loading: moduleOrderLoading } = useModuleOrder();
  const { sets, toggleSetStatus, createSet } = useExerciseSets();

  const [groups, setGroups] = useState<ReadingQuestionGroupRowData[]>([]);
  const [previewTarget, setPreviewTarget] = useState<ReadingQuestionGroupRowData | null>(null);
  const [expandedTypeSections, setExpandedTypeSections] = useState<Set<string>>(new Set());

  const [addTypeSetId, setAddTypeSetId] = useState<string | null>(null);
  const [itemModal, setItemModal] = useState<ItemModalState | null>(null);
  const [itemForm, setItemForm] = useState<ReadingQuestionGroupForm>(createEmptyReadingForm());
  const [savingItem, setSavingItem] = useState(false);
  const [subQuestionUploading, setSubQuestionUploading] = useState(false);
  const [deleteItemTarget, setDeleteItemTarget] = useState<{ group: ReadingQuestionGroupRowData; index: number } | null>(null);
  const [deletingItem, setDeletingItem] = useState(false);

  const docSets = sets.filter((s) => s.category === "doc");

  const fetchAll = async () => {
    setLoading(true);
    const [lessonsRes, passagesRes, groupsRes] = await Promise.all([
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
      supabase.from("reading_question_groups").select("*").order("set_id").order("order_index"),
    ]);
    setLessons(
      (lessonsRes.data ?? []).map((l) => ({
        lesson_id: l.id,
        lesson_title: l.title_vi,
        module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      })),
    );
    setPassages((passagesRes.data ?? []) as ReadingPassage[]);
    setGroups((groupsRes.data ?? []) as ReadingQuestionGroupRowData[]);
    setLoading(false);
  };

  useEffect(() => { fetchAll(); }, []);

  const handleAddPassage = async (lessonId: string) => {
    const nextOrder = passages.filter((p) => p.lesson_id === lessonId).length;
    const { error } = await supabase.from("reading_passages").insert({ lesson_id: lessonId, text_de: "", order_index: nextOrder });
    if (error) showToast("Thêm văn bản thất bại: " + error.message, "warning");
    else fetchAll();
  };

  const handleSavePassage = async (passageId: string, textDe: string) => {
    setSavingPassageId(passageId);
    const { error } = await supabase.from("reading_passages").update({ text_de: textDe }).eq("id", passageId);
    setSavingPassageId(null);
    if (error) showToast("Lưu thất bại: " + error.message, "warning");
    else { showToast("Đã lưu văn bản.", "success"); fetchAll(); }
  };

  const handleDeletePassage = async () => {
    if (!deletePassageTarget) return;
    setDeletingPassage(true);
    const { error } = await supabase.from("reading_passages").delete().eq("id", deletePassageTarget.id);
    setDeletingPassage(false);
    if (error) showToast("Xóa thất bại: " + error.message, "warning");
    else { showToast("Đã xóa văn bản (mọi loại câu hỏi gắn theo cũng bị xoá).", "success"); setDeletePassageTarget(null); fetchAll(); }
  };

  const handleCreateSet = async (lessonId: string, nextOrder: number) => {
    const { error } = await createSet(lessonId, "doc", nextOrder);
    if (error) { showToast("Tạo bài đọc thất bại: " + error, "warning"); return; }
    fetchAll();
  };

  // ---- Thêm/sửa/xoá TỪNG câu hỏi — lưu ngay khi bấm Lưu, không gộp nhiều
  // thay đổi vào 1 form rồi mới lưu 1 lần (nguồn gốc bug mất dữ liệu/xoá lỗi
  // ở bản modal-gộp-cả-nhóm trước đây).

  const openAddType = (setId: string, lessonId: string, questionType: "richtig_falsch" | "multiple_choice", passageId: string) => {
    let f: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), questionType, passageId };
    f = questionType === "richtig_falsch" ? addStatement(f) : addSubQuestion(f);
    setItemForm(f);
    setItemModal({ setId, lessonId, questionType, groupId: null, itemIndex: null });
    setAddTypeSetId(null);
  };

  const openAddItem = (group: ReadingQuestionGroupRowData, lessonId: string) => {
    let f: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), questionType: group.question_type, passageId: group.passage_id };
    f = group.question_type === "richtig_falsch" ? addStatement(f) : addSubQuestion(f);
    setItemForm(f);
    setItemModal({ setId: group.set_id, lessonId, questionType: group.question_type, groupId: group.id, itemIndex: null });
  };

  const openEditItem = (group: ReadingQuestionGroupRowData, index: number, lessonId: string) => {
    let f: ReadingQuestionGroupForm = { ...createEmptyReadingForm(), questionType: group.question_type, passageId: group.passage_id };
    if (group.question_type === "richtig_falsch") {
      const s = (group.statements ?? [])[index];
      f = addStatement(f);
      const id = f.statements[0].id;
      f = setStatementText(f, id, s.text);
      f = setStatementAnswer(f, id, s.correct_answer);
    } else {
      const q = (group.sub_questions ?? [])[index];
      f = addSubQuestion(f);
      const id = f.subQuestions[0].id;
      f = setSubQuestionField(f, id, "textSnippet", q.text_snippet ?? "");
      f = setSubQuestionField(f, id, "imageKey", q.image_key);
      f = setSubQuestionField(f, id, "question", q.question);
      const correctIndex = q.options.findIndex((_, i) => String(i) === q.correct_option_id);
      f = setSubQuestionOptions(f, id, { options: q.options, correctIndex });
    }
    setItemForm(f);
    setItemModal({ setId: group.set_id, lessonId, questionType: group.question_type, groupId: group.id, itemIndex: index });
  };

  const handleItemImageUpload = async (lessonId: string, subQuestionId: string, file: File) => {
    setSubQuestionUploading(true);
    try {
      const objectKey = await uploadMedia(file, lessonId, "image", () => {});
      setItemForm((prev) => setSubQuestionField(prev, subQuestionId, "imageKey", objectKey));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
    } finally {
      setSubQuestionUploading(false);
    }
  };

  const handleSaveItem = async () => {
    if (!itemModal) return;

    if (itemModal.questionType === "richtig_falsch") {
      const s = itemForm.statements[0];
      if (!s?.text.trim()) { showToast("Nhận định không được để trống.", "warning"); return; }
      if (!s.correctAnswer) { showToast("Cần chọn Đúng hoặc Sai.", "warning"); return; }
    } else {
      const q = itemForm.subQuestions[0];
      if (!q?.question.trim()) { showToast("Câu hỏi không được để trống.", "warning"); return; }
      const optionError = validateChoiceForm(q.question, { options: q.options, correctIndex: q.correctIndex });
      if (optionError) { showToast(optionError, "warning"); return; }
    }

    setSavingItem(true);

    if (itemModal.groupId === null) {
      const orderIndex = groups.filter((g) => g.set_id === itemModal.setId).length;
      const payload = buildReadingPayload(itemForm, itemModal.setId, orderIndex);
      const { error } = await supabase.from("reading_question_groups").insert(payload);
      setSavingItem(false);
      if (error) { showToast("Lưu thất bại: " + error.message, "warning"); return; }
    } else {
      const group = groups.find((g) => g.id === itemModal.groupId);
      if (!group) { setSavingItem(false); return; }
      let updatePayload: Record<string, unknown>;
      if (itemModal.questionType === "richtig_falsch") {
        const s = itemForm.statements[0];
        const newItem: ReadingStatementRow = { text: s.text, correct_answer: s.correctAnswer as "richtig" | "falsch" };
        const current = group.statements ?? [];
        const nextArray = itemModal.itemIndex === null
          ? [...current, newItem]
          : current.map((item, i) => (i === itemModal.itemIndex ? newItem : item));
        updatePayload = { statements: nextArray };
      } else {
        const q = itemForm.subQuestions[0];
        const choicePayload = buildMultipleChoicePayload({ options: q.options, correctIndex: q.correctIndex });
        const newItem: ReadingSubQuestionRow = {
          text_snippet: q.textSnippet.trim() || null,
          image_key: q.imageKey,
          question: q.question,
          options: choicePayload.options ?? q.options,
          correct_option_id: choicePayload.correct_answer,
        };
        const current = group.sub_questions ?? [];
        const nextArray = itemModal.itemIndex === null
          ? [...current, newItem]
          : current.map((item, i) => (i === itemModal.itemIndex ? newItem : item));
        updatePayload = { sub_questions: nextArray };
      }
      const { error } = await supabase.from("reading_question_groups").update(updatePayload).eq("id", group.id);
      setSavingItem(false);
      if (error) { showToast("Lưu thất bại: " + error.message, "warning"); return; }
    }

    showToast("Đã lưu câu hỏi.", "success");
    setItemModal(null);
    fetchAll();
  };

  const handleDeleteItem = async () => {
    if (!deleteItemTarget) return;
    const { group, index } = deleteItemTarget;
    setDeletingItem(true);

    if (group.question_type === "richtig_falsch") {
      const nextArray = (group.statements ?? []).filter((_, i) => i !== index);
      const { error } = nextArray.length === 0
        ? await supabase.from("reading_question_groups").delete().eq("id", group.id)
        : await supabase.from("reading_question_groups").update({ statements: nextArray }).eq("id", group.id);
      setDeletingItem(false);
      if (error) { showToast("Xóa thất bại: " + error.message, "warning"); return; }
    } else {
      const nextArray = (group.sub_questions ?? []).filter((_, i) => i !== index);
      const { error } = nextArray.length === 0
        ? await supabase.from("reading_question_groups").delete().eq("id", group.id)
        : await supabase.from("reading_question_groups").update({ sub_questions: nextArray }).eq("id", group.id);
      setDeletingItem(false);
      if (error) { showToast("Xóa thất bại: " + error.message, "warning"); return; }
    }

    showToast("Đã xóa câu hỏi.", "success");
    setDeleteItemTarget(null);
    fetchAll();
  };

  if (loading || moduleOrderLoading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-orange-500" /></div>;

  const orderedLessons = moduleOrder
    .flatMap((mod) => mod.lessonIds)
    .map((lid) => lessons.find((l) => l.lesson_id === lid))
    .filter((l): l is LessonGroup => !!l);

  return (
    <div className="space-y-3">
      {orderedLessons.map((lesson) => {
        const lessonPassages = passages.filter((p) => p.lesson_id === lesson.lesson_id);
        const lessonSets = docSets.filter((s) => s.lessonId === lesson.lesson_id);
        const isExpanded = expanded[lesson.lesson_id] ?? false;
        return (
          <div key={lesson.lesson_id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded((prev) => ({ ...prev, [lesson.lesson_id]: !isExpanded }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-slate-50 text-left"
            >
              {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className="text-sm font-display font-bold text-slate-700">{lesson.lesson_title}</span>
              <span className="text-xs text-slate-400">{lesson.module_title}</span>
              <span className="ml-auto text-xs text-slate-400">{lessonPassages.length} văn bản · {lessonSets.length} bài đọc</span>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold text-slate-500 uppercase">Văn bản có thể dùng</span>
                    <button type="button" onClick={() => handleAddPassage(lesson.lesson_id)} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
                      <Plus className="w-3.5 h-3.5" /> Thêm văn bản
                    </button>
                  </div>
                  {lessonPassages.map((passage, i) => (
                    <PassageEditRow
                      key={passage.id}
                      passage={passage}
                      lessonId={lesson.lesson_id}
                      index={i}
                      saving={savingPassageId === passage.id}
                      onSave={handleSavePassage}
                      onDelete={setDeletePassageTarget}
                    />
                  ))}
                  {lessonPassages.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có văn bản nào.</p>}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs font-display font-bold text-slate-500 uppercase">Bài đọc</span>
                  <button
                    type="button"
                    disabled={lessonPassages.length === 0}
                    onClick={() => handleCreateSet(lesson.lesson_id, lessonSets.length)}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm bài đọc
                  </button>
                </div>
                {lessonPassages.length === 0 && <p className="text-xs text-slate-400 italic">Cần thêm văn bản trước khi tạo bài đọc.</p>}

                {lessonSets.map((set) => {
                  const setGroups = groups.filter((g) => g.set_id === set.id).sort((a, b) => a.order_index - b.order_index);
                  const usedPassageIds = [...new Set(setGroups.map((g) => g.passage_id))];
                  const usedPassages = usedPassageIds.map((pid) => passages.find((p) => p.id === pid)).filter((p): p is ReadingPassage => !!p);
                  const totalItems = setGroups.reduce((sum, g) => sum + itemCount(g), 0);
                  const missingTypes = (["multiple_choice", "richtig_falsch"] as const).filter(
                    (qt) => !setGroups.some((g) => g.question_type === qt),
                  );

                  return (
                    <div key={set.id} className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                      <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
                        <div className="w-9 h-9 rounded-lg bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                          <FileText className="w-4 h-4" />
                        </div>
                        <span className="text-sm font-display font-black text-slate-900">{set.title}</span>
                        <span role="button" onClick={() => toggleSetStatus(set.id, set.status)}>
                          <LessonStatusBadge status={set.status} />
                        </span>
                        <span className="ml-auto text-xs text-slate-400">
                          {usedPassages.length} văn bản · {setGroups.length} loại câu hỏi · {totalItems} câu hỏi
                        </span>
                      </div>

                      <div className="p-4 space-y-4">
                        {usedPassages.map((passage, i) => (
                          <div key={passage.id} className="border border-slate-200 rounded-xl p-3 space-y-1.5">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-display font-bold text-slate-500">Văn bản {i + 1}</span>
                              <div className="flex items-center gap-1">
                                <button onClick={() => setPreviewTarget(setGroups.find((g) => g.passage_id === passage.id) ?? null)} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600"><Eye className="w-3.5 h-3.5" /></button>
                              </div>
                            </div>
                            <MarkdownBlock content={passage.text_de} lessonId={lesson.lesson_id} />
                          </div>
                        ))}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-display font-bold text-slate-500 uppercase">Các loại câu hỏi</span>
                            {missingTypes.length > 0 && (usedPassages[0] ?? lessonPassages[0]) && (
                              <div className="relative">
                                <button
                                  type="button"
                                  onClick={() => setAddTypeSetId((prev) => (prev === set.id ? null : set.id))}
                                  className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                                >
                                  <Plus className="w-3.5 h-3.5" /> Thêm loại câu hỏi
                                </button>
                                {addTypeSetId === set.id && (
                                  <div className="absolute right-0 top-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                                    {missingTypes.map((qt) => (
                                      <button
                                        key={qt}
                                        type="button"
                                        onClick={() => openAddType(set.id, lesson.lesson_id, qt, usedPassages[0]?.id ?? lessonPassages[0].id)}
                                        className="block w-full text-left px-3 py-2 text-xs font-bold text-slate-600 hover:bg-orange-50 hover:text-orange-600 whitespace-nowrap"
                                      >
                                        {QUESTION_TYPE_LABEL[qt]}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>

                          {setGroups.map((group) => {
                            const sectionKey = group.id;
                            const sectionExpanded = expandedTypeSections.has(sectionKey);
                            return (
                              <div key={group.id} className="border border-slate-200 rounded-xl overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => setExpandedTypeSections((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(sectionKey)) next.delete(sectionKey); else next.add(sectionKey);
                                    return next;
                                  })}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 bg-slate-50 text-left"
                                >
                                  {group.question_type === "richtig_falsch"
                                    ? <span className="w-5 h-5 rounded border border-orange-300 text-orange-500 flex items-center justify-center text-[10px] font-black shrink-0">✓✗</span>
                                    : <span className="w-5 h-5 rounded border border-orange-300 text-orange-500 flex items-center justify-center text-[10px] font-black shrink-0">≡</span>}
                                  <span className="text-sm font-display font-bold text-slate-700">{QUESTION_TYPE_LABEL[group.question_type]}</span>
                                  <span className="text-[11px] font-bold text-slate-400 bg-white border border-slate-200 rounded-full px-2 py-0.5">{itemCount(group)} câu hỏi</span>
                                  <span className="ml-auto flex items-center gap-2">
                                    <span
                                      role="button"
                                      onClick={(e) => { e.stopPropagation(); openAddItem(group, lesson.lesson_id); }}
                                      className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700"
                                    >
                                      <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                                    </span>
                                    {sectionExpanded ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                  </span>
                                </button>
                                {sectionExpanded && (
                                  <div className="divide-y divide-slate-100">
                                    {group.question_type === "richtig_falsch"
                                      ? (group.statements ?? []).map((s, i) => (
                                          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                            <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                                            <span className="text-sm text-slate-700 flex-1 truncate">{s.text}</span>
                                            <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">Đúng / Sai</span>
                                            <button onClick={() => openEditItem(group, i, lesson.lesson_id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => setDeleteItemTarget({ group, index: i })} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                          </div>
                                        ))
                                      : (group.sub_questions ?? []).map((q, i) => (
                                          <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                                            <span className="text-xs font-bold text-slate-400 w-5 shrink-0">{i + 1}</span>
                                            <span className="text-sm text-slate-700 flex-1 truncate">{i + 1}. {q.question}</span>
                                            <span className="text-[11px] font-bold text-slate-400 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5 shrink-0">Một đáp án</span>
                                            <button onClick={() => openEditItem(group, i, lesson.lesson_id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 shrink-0"><Pencil className="w-3.5 h-3.5" /></button>
                                            <button onClick={() => setDeleteItemTarget({ group, index: i })} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 shrink-0"><Trash2 className="w-3.5 h-3.5" /></button>
                                          </div>
                                        ))}
                                    {itemCount(group) === 0 && <p className="text-xs text-slate-400 italic px-3 py-2.5">Chưa có câu hỏi nào.</p>}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {setGroups.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có loại câu hỏi nào.</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa văn bản này? Mọi loại câu hỏi đang dựa vào văn bản này sẽ bị xoá theo.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletePassageTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeletePassage} disabled={deletingPassage} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingPassage ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {itemModal && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-xl w-full my-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-800">
                {itemModal.itemIndex === null ? "Thêm câu hỏi" : "Sửa câu hỏi"} — {QUESTION_TYPE_LABEL[itemModal.questionType]}
              </h3>
              <button onClick={() => setItemModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>

            {itemModal.questionType === "richtig_falsch" ? (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500">Nhận định *</label>
                <textarea
                  rows={2}
                  value={itemForm.statements[0]?.text ?? ""}
                  onChange={(e) => setItemForm((prev) => setStatementText(prev, prev.statements[0].id, e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                  placeholder="Nhận định..."
                />
                <div className="flex gap-2">
                  {(["richtig", "falsch"] as const).map((val) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setItemForm((prev) => setStatementAnswer(prev, prev.statements[0].id, val))}
                      className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${itemForm.statements[0]?.correctAnswer === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
                    >
                      {val === "richtig" ? "Đúng (Richtig)" : "Sai (Falsch)"}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <textarea
                  rows={2}
                  value={itemForm.subQuestions[0]?.textSnippet ?? ""}
                  onChange={(e) => setItemForm((prev) => setSubQuestionField(prev, prev.subQuestions[0].id, "textSnippet", e.target.value))}
                  placeholder="Văn bản ngắn (tuỳ chọn)..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50">
                    {subQuestionUploading ? "Đang tải..." : "Thêm ảnh"}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      disabled={subQuestionUploading}
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) handleItemImageUpload(itemModal.lessonId, itemForm.subQuestions[0].id, f); e.target.value = ""; }}
                    />
                  </label>
                  {itemForm.subQuestions[0]?.imageKey && <span className="text-[11px] text-emerald-600">Đã có ảnh</span>}
                </div>
                <label className="block text-xs font-bold text-slate-500">Câu hỏi *</label>
                <input
                  type="text"
                  value={itemForm.subQuestions[0]?.question ?? ""}
                  onChange={(e) => setItemForm((prev) => setSubQuestionField(prev, prev.subQuestions[0].id, "question", e.target.value))}
                  placeholder="Câu hỏi..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                />
                <label className="block text-xs font-bold text-slate-500">Phương án *</label>
                <div className="space-y-1.5">
                  {(itemForm.subQuestions[0]?.options ?? []).map((opt, oi) => {
                    const q = itemForm.subQuestions[0];
                    return (
                      <div key={oi} className="flex items-center gap-2">
                        <span className="w-5 text-center text-xs font-display font-bold text-slate-400">{optionLabel(oi)}</span>
                        <input
                          type="radio"
                          checked={q.correctIndex === oi}
                          onChange={() => setItemForm((prev) => setSubQuestionOptions(prev, q.id, { options: q.options, correctIndex: oi }))}
                          className="h-4 w-4 accent-orange-500"
                        />
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) => setItemForm((prev) => setSubQuestionOptions(prev, q.id, setOption({ options: q.options, correctIndex: q.correctIndex }, oi, e.target.value)))}
                          className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                          placeholder={`Phương án ${optionLabel(oi)}`}
                        />
                        <button onClick={() => setItemForm((prev) => setSubQuestionOptions(prev, q.id, removeOption({ options: q.options, correctIndex: q.correctIndex }, oi)))} className="p-1 text-slate-300 hover:text-rose-500">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setItemForm((prev) => setSubQuestionOptions(prev, prev.subQuestions[0].id, addOption({ options: prev.subQuestions[0].options, correctIndex: prev.subQuestions[0].correctIndex })))}
                    className="text-xs font-bold text-orange-600 hover:text-orange-700"
                  >
                    + Thêm phương án
                  </button>
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setItemModal(null)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Hủy</button>
              <button onClick={handleSaveItem} disabled={savingItem} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl disabled:opacity-50">
                {savingItem ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteItemTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa câu hỏi này?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteItemTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeleteItem} disabled={deletingItem} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingItem ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-xl w-full my-8 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-800">Xem trước</h3>
              <button onClick={() => setPreviewTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <ReadingGroupPreview
              group={previewTarget}
              passageText={passages.find((p) => p.id === previewTarget.passage_id)?.text_de ?? ""}
              lessonId={passages.find((p) => p.id === previewTarget.passage_id)?.lesson_id ?? ""}
            />
          </div>
        </div>
      )}
    </div>
  );
};
