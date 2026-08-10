import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2, Trash2, Pencil, X, ChevronUp, Eye } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets } from "../../lib/hooks/useExerciseSets";
import { type ReadingPassage, PassageEditRow } from "./AdminExerciseSetMedia";
import {
  createEmptyReadingForm,
  parseReadingRow,
  buildReadingPayload,
  validateReadingForm,
  addStatement,
  removeStatement,
  setStatementText,
  setStatementAnswer,
  moveStatement,
  addSubQuestion,
  removeSubQuestion,
  setSubQuestionField,
  setSubQuestionOptions,
  moveSubQuestion,
  type ReadingQuestionGroupForm,
} from "../../lib/readingExerciseForm";
import { addOption, setOption, removeOption, optionLabel } from "../../lib/grammarMultipleChoice";
import { uploadMedia } from "../../lib/uploadMedia";
import { MarkdownBlock } from "../../components/MarkdownBlock";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

interface ReadingQuestionGroupRowData {
  id: string;
  passage_id: string;
  set_id: string;
  order_index: number;
  title: string | null;
  question_intro: string | null;
  question_type: "richtig_falsch" | "multiple_choice";
  statements: { text: string; correct_answer: "richtig" | "falsch" }[] | null;
  sub_questions:
    | { text_snippet: string | null; image_key: string | null; question: string; options: string[]; correct_option_id: string }[]
    | null;
  explanation: string | null;
}

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSetId, setEditingSetId] = useState<string>("");
  const [form, setForm] = useState<ReadingQuestionGroupForm>(createEmptyReadingForm());
  const [saving, setSaving] = useState(false);
  const [deleteGroupTarget, setDeleteGroupTarget] = useState<ReadingQuestionGroupRowData | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);
  const [modalLessonId, setModalLessonId] = useState("");
  const [subQuestionUploadId, setSubQuestionUploadId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<ReadingQuestionGroupRowData | null>(null);

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
    else { showToast("Đã xóa văn bản (mọi nhóm câu hỏi gắn theo cũng bị xoá).", "success"); setDeletePassageTarget(null); fetchAll(); }
  };

  const openCreateGroup = (setId: string, lessonId: string) => {
    setEditingId(null);
    setEditingSetId(setId);
    setModalLessonId(lessonId);
    setForm(createEmptyReadingForm());
    setModalOpen(true);
  };

  const openEditGroup = (group: ReadingQuestionGroupRowData, lessonId: string) => {
    setEditingId(group.id);
    setEditingSetId(group.set_id);
    setModalLessonId(lessonId);
    setForm(parseReadingRow(group));
    setModalOpen(true);
  };

  const handleSubQuestionImageUpload = async (lessonId: string, subQuestionId: string, file: File) => {
    setSubQuestionUploadId(subQuestionId);
    try {
      const objectKey = await uploadMedia(file, lessonId, "image", () => {});
      setForm((prev) => setSubQuestionField(prev, subQuestionId, "imageKey", objectKey));
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
    } finally {
      setSubQuestionUploadId(null);
    }
  };

  const handleSaveGroup = async () => {
    const error = validateReadingForm(form);
    if (error) { showToast(error, "warning"); return; }
    setSaving(true);
    const existingInSet = groups.filter((g) => g.set_id === editingSetId);
    const orderIndex = editingId
      ? existingInSet.find((g) => g.id === editingId)?.order_index ?? existingInSet.length
      : existingInSet.length;
    const payload = buildReadingPayload(form, editingSetId, orderIndex);
    const { error: dbError } = editingId
      ? await supabase.from("reading_question_groups").update(payload).eq("id", editingId)
      : await supabase.from("reading_question_groups").insert(payload);
    setSaving(false);
    if (dbError) { showToast("Lưu thất bại: " + dbError.message, "warning"); return; }
    showToast("Đã lưu nhóm câu hỏi.", "success");
    setModalOpen(false);
    fetchAll();
  };

  const handleDeleteGroup = async () => {
    if (!deleteGroupTarget) return;
    setDeletingGroup(true);
    const { error } = await supabase.from("reading_question_groups").delete().eq("id", deleteGroupTarget.id);
    setDeletingGroup(false);
    if (error) showToast("Xóa thất bại: " + error.message, "warning");
    else { showToast("Đã xóa nhóm câu hỏi.", "success"); setDeleteGroupTarget(null); fetchAll(); }
  };

  const handleCreateSet = async (lessonId: string, nextOrder: number) => {
    const { data, error } = await createSet(lessonId, "doc", nextOrder);
    if (error || !data) { showToast("Tạo nhóm bài thất bại: " + error, "warning"); return; }
    openCreateGroup(data.id, lessonId);
  };

  const handleMoveGroup = async (setId: string, index: number, direction: -1 | 1) => {
    const setGroups = groups.filter((g) => g.set_id === setId).sort((a, b) => a.order_index - b.order_index);
    const target = index + direction;
    if (target < 0 || target >= setGroups.length) return;
    const a = setGroups[index];
    const b = setGroups[target];
    const [{ error: err1 }, { error: err2 }] = await Promise.all([
      supabase.from("reading_question_groups").update({ order_index: b.order_index }).eq("id", a.id),
      supabase.from("reading_question_groups").update({ order_index: a.order_index }).eq("id", b.id),
    ]);
    if (err1 || err2) showToast("Sắp xếp thất bại: " + (err1?.message ?? err2?.message), "warning");
    else fetchAll();
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
              <span className="ml-auto text-xs text-slate-400">{lessonPassages.length} văn bản · {lessonSets.length} nhóm bài</span>
            </button>
            {isExpanded && (
              <div className="p-4 space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold text-slate-500 uppercase">Văn bản</span>
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-display font-bold text-slate-500 uppercase">Nhóm bài</span>
                    <button type="button" onClick={() => handleCreateSet(lesson.lesson_id, lessonSets.length)} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
                      <Plus className="w-3.5 h-3.5" /> Thêm nhóm bài
                    </button>
                  </div>
                  {lessonSets.map((set) => {
                    const setGroups = groups.filter((g) => g.set_id === set.id).sort((a, b) => a.order_index - b.order_index);
                    return (
                      <div key={set.id} className="rounded-xl border border-slate-200 bg-white overflow-hidden">
                        <div className="flex items-center gap-3 bg-slate-50 px-3 py-2.5">
                          <span className="text-sm font-black text-slate-700">{set.title}</span>
                          <span role="button" onClick={() => toggleSetStatus(set.id, set.status)}>
                            <LessonStatusBadge status={set.status} />
                          </span>
                          <button type="button" onClick={() => openCreateGroup(set.id, lesson.lesson_id)} className="ml-auto flex items-center gap-1 text-xs font-bold text-orange-600 hover:bg-orange-50 px-2 py-1 rounded-lg">
                            <Plus className="w-3.5 h-3.5" /> Thêm nhóm câu hỏi
                          </button>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {setGroups.map((group, i) => (
                            <div key={group.id} className="flex items-center gap-3 px-3 py-2.5">
                              <div className="flex flex-col items-center gap-0.5 shrink-0">
                                <button type="button" disabled={i === 0} onClick={() => handleMoveGroup(set.id, i, -1)} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa nhóm câu hỏi lên trên"><ChevronUp className="w-3.5 h-3.5" /></button>
                                <button type="button" disabled={i === setGroups.length - 1} onClick={() => handleMoveGroup(set.id, i, 1)} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa nhóm câu hỏi xuống dưới"><ChevronDown className="w-3.5 h-3.5" /></button>
                              </div>
                              <span className="text-xs font-bold text-slate-400 w-6">{i + 1}</span>
                              <span className="text-sm text-slate-700 flex-1 truncate">{group.title || (group.question_type === "richtig_falsch" ? "Richtig/Falsch" : "Trắc nghiệm")}</span>
                              <button onClick={() => setPreviewTarget(group)} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600"><Eye className="w-3.5 h-3.5" /></button>
                              <button onClick={() => openEditGroup(group, lesson.lesson_id)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => setDeleteGroupTarget(group)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                          ))}
                          {setGroups.length === 0 && <p className="text-xs text-slate-400 italic px-3 py-2.5">Chưa có nhóm câu hỏi nào.</p>}
                        </div>
                      </div>
                    );
                  })}
                  {lessonSets.length === 0 && <p className="text-xs text-slate-400 italic">Chưa có nhóm bài nào.</p>}
                </div>
              </div>
            )}
          </div>
        );
      })}
      {deletePassageTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa văn bản này? Mọi nhóm câu hỏi đang dựa vào văn bản này sẽ bị xoá theo.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeletePassageTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeletePassage} disabled={deletingPassage} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingPassage ? "Đang xóa..." : "Xóa"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl p-5 max-w-2xl w-full my-8 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-display font-bold text-slate-800">{editingId ? "Sửa nhóm câu hỏi" : "Thêm nhóm câu hỏi"}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Văn bản *</label>
              <select
                value={form.passageId}
                onChange={(e) => setForm((prev) => ({ ...prev, passageId: e.target.value }))}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
              >
                <option value="">-- Chọn văn bản --</option>
                {passages.map((p) => (
                  <option key={p.id} value={p.id}>{p.text_de.slice(0, 60) || `Văn bản ${p.id.slice(0, 8)}`}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Tiêu đề</label>
              <input type="text" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Câu hỏi chung</label>
              <textarea rows={2} value={form.questionIntro} onChange={(e) => setForm((prev) => ({ ...prev, questionIntro: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Dạng câu hỏi *</label>
              <div className="flex gap-2">
                {(["richtig_falsch", "multiple_choice"] as const).map((qt) => (
                  <button
                    key={qt}
                    type="button"
                    onClick={() => setForm((prev) => ({ ...prev, questionType: qt }))}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border ${form.questionType === qt ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-600 border-slate-200"}`}
                  >
                    {qt === "richtig_falsch" ? "Richtig/Falsch" : "Trắc nghiệm"}
                  </button>
                ))}
              </div>
            </div>

            {form.questionType === "richtig_falsch" && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-500">Nhận định *</label>
                {form.statements.map((s, i) => (
                  <div key={s.id} className="flex items-start gap-2 p-2 bg-slate-50/60 rounded-xl">
                    <div className="flex flex-col items-center gap-0.5 shrink-0 mt-1">
                      <button type="button" disabled={i === 0} onClick={() => setForm((prev) => moveStatement(prev, i, i - 1))} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:hover:text-slate-300" aria-label="Đưa nhận định lên trên"><ChevronUp className="w-3.5 h-3.5" /></button>
                      <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                      <button type="button" disabled={i === form.statements.length - 1} onClick={() => setForm((prev) => moveStatement(prev, i, i + 1))} className="p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-20 disabled:hover:text-slate-300" aria-label="Đưa nhận định xuống dưới"><ChevronDown className="w-3.5 h-3.5" /></button>
                    </div>
                    <textarea
                      rows={2}
                      value={s.text}
                      onChange={(e) => setForm((prev) => setStatementText(prev, s.id, e.target.value))}
                      className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                      placeholder="Nhận định..."
                    />
                    <div className="flex flex-col gap-1 shrink-0">
                      {(["richtig", "falsch"] as const).map((val) => (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setForm((prev) => setStatementAnswer(prev, s.id, val))}
                          className={`px-2 py-1 text-[11px] font-bold rounded-lg border ${s.correctAnswer === val ? "bg-orange-500 text-white border-orange-500" : "bg-white text-slate-500 border-slate-200"}`}
                        >
                          {val === "richtig" ? "Richtig" : "Falsch"}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setForm((prev) => removeStatement(prev, s.id))} className="p-1.5 text-slate-300 hover:text-rose-500 shrink-0"><X className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" onClick={() => setForm((prev) => addStatement(prev))} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
                  <Plus className="w-3.5 h-3.5" /> Thêm nhận định
                </button>
              </div>
            )}

            {form.questionType === "multiple_choice" && (
              <div className="space-y-3">
                <label className="block text-xs font-bold text-slate-500">Câu hỏi *</label>
                {form.subQuestions.map((q, qi) => (
                  <div key={q.id} className="p-3 bg-slate-50/60 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-400">Câu {qi + 1}</span>
                      <div className="flex items-center gap-1">
                        <button type="button" disabled={qi === 0} onClick={() => setForm((prev) => moveSubQuestion(prev, qi, qi - 1))} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa câu hỏi lên trên"><ChevronUp className="w-3.5 h-3.5" /></button>
                        <button type="button" disabled={qi === form.subQuestions.length - 1} onClick={() => setForm((prev) => moveSubQuestion(prev, qi, qi + 1))} className="p-1 text-slate-300 hover:text-slate-600 disabled:opacity-20" aria-label="Đưa câu hỏi xuống dưới"><ChevronDown className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setForm((prev) => removeSubQuestion(prev, q.id))} className="p-1 text-slate-300 hover:text-rose-500"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <textarea
                      rows={2}
                      value={q.textSnippet}
                      onChange={(e) => setForm((prev) => setSubQuestionField(prev, q.id, "textSnippet", e.target.value))}
                      placeholder="Văn bản ngắn (tuỳ chọn)..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2 py-1 cursor-pointer hover:bg-slate-50">
                        {subQuestionUploadId === q.id ? "Đang tải..." : "Thêm ảnh"}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          disabled={subQuestionUploadId !== null}
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleSubQuestionImageUpload(modalLessonId, q.id, f); e.target.value = ""; }}
                        />
                      </label>
                      {q.imageKey && <span className="text-[11px] text-emerald-600">Đã có ảnh</span>}
                    </div>
                    <input
                      type="text"
                      value={q.question}
                      onChange={(e) => setForm((prev) => setSubQuestionField(prev, q.id, "question", e.target.value))}
                      placeholder="Câu hỏi..."
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl"
                    />
                    <div className="space-y-1.5">
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex items-center gap-2">
                          <span className="w-5 text-center text-xs font-display font-bold text-slate-400">{optionLabel(oi)}</span>
                          <input
                            type="radio"
                            checked={q.correctIndex === oi}
                            onChange={() => setForm((prev) => setSubQuestionOptions(prev, q.id, { options: q.options, correctIndex: oi }))}
                            className="h-4 w-4 accent-orange-500"
                          />
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => setForm((prev) => setSubQuestionOptions(prev, q.id, setOption({ options: q.options, correctIndex: q.correctIndex }, oi, e.target.value)))}
                            className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg"
                            placeholder={`Phương án ${optionLabel(oi)}`}
                          />
                          <button
                            onClick={() => setForm((prev) => setSubQuestionOptions(prev, q.id, removeOption({ options: q.options, correctIndex: q.correctIndex }, oi)))}
                            className="p-1 text-slate-300 hover:text-rose-500"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setForm((prev) => setSubQuestionOptions(prev, q.id, addOption({ options: q.options, correctIndex: q.correctIndex })))}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700"
                      >
                        + Thêm phương án
                      </button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setForm((prev) => addSubQuestion(prev))} className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700">
                  <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-slate-500 mb-1">Giải thích</label>
              <textarea rows={2} value={form.explanation} onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))} className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl resize-none" />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button onClick={() => setModalOpen(false)} className="px-4 py-2 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-xl">Hủy</button>
              <button onClick={handleSaveGroup} disabled={saving} className="px-4 py-2 text-xs font-bold text-white bg-orange-600 hover:bg-orange-700 rounded-xl disabled:opacity-50">
                {saving ? "Đang lưu..." : "Lưu"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteGroupTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-3">
            <p className="text-sm text-slate-700">Xóa nhóm câu hỏi này?</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setDeleteGroupTarget(null)} className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50 rounded-lg">Hủy</button>
              <button onClick={handleDeleteGroup} disabled={deletingGroup} className="px-3 py-1.5 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg disabled:opacity-50">
                {deletingGroup ? "Đang xóa..." : "Xóa"}
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
