import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, Search, Eye } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { AdminModuleGroup } from "./AdminModuleGroup";
import {
  getGroupSelectionState,
  groupGrammarExercises,
  toggleGroupSelection,
} from "../../lib/grammarExerciseGroups";

interface GrammarExercise {
  id: string;
  lesson_id: string;
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification";
  group_id: string | null;
  status: "draft" | "published";
  prompt_text: string | null;
  transformation_hint: string | null;
  correct_answer: string | null;
  tokens: string[] | null;
  classification_groups: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  explanation: string;
  order_index: number;
  groupId: string | null;
  orderIndex: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  exercises: GrammarExercise[];
}

const TYPE_LABELS: Record<GrammarExercise["type"], string> = {
  word_reorder: "Sắp xếp từ",
  error_correction: "Sửa câu sai",
  translation: "Dịch",
  sentence_transformation: "Biến đổi câu",
  guided_sentence_writing: "Viết câu gợi ý",
  classification: "Phân loại",
};

const TYPE_COLORS: Record<GrammarExercise["type"], string> = {
  word_reorder: "bg-blue-50 text-blue-700",
  error_correction: "bg-rose-50 text-rose-700",
  translation: "bg-emerald-50 text-emerald-700",
  sentence_transformation: "bg-purple-50 text-purple-700",
  guided_sentence_writing: "bg-amber-50 text-amber-700",
  classification: "bg-teal-50 text-teal-700",
};

interface EditForm {
  type: GrammarExercise["type"];
  status: "draft" | "published";
  prompt_text: string;
  transformation_hint: string;
  correct_answer: string;
  tokens_input: string;
  classification_groups: string[];
  classification_items: { item: string; group: string }[];
  explanation: string;
  order_index: number;
}

const EMPTY_FORM: EditForm = {
  type: "word_reorder",
  status: "draft",
  prompt_text: "",
  transformation_hint: "",
  correct_answer: "",
  tokens_input: "",
  classification_groups: [],
  classification_items: [],
  explanation: "",
  order_index: 0,
};

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
const labelCls = "block text-xs font-bold text-slate-600 mb-1";

const normalizeWord = (s: string): string => s.toLowerCase().replace(/[.,!?]/g, "").trim();

const validateForm = (f: EditForm): string | null => {
  if (f.type === "word_reorder") {
    const tokens = f.tokens_input.split("/").map((t) => t.trim()).filter(Boolean);
    if (tokens.length < 2) return "Cần ít nhất 2 từ.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    const answerWords = f.correct_answer.split(/\s+/).map(normalizeWord).filter(Boolean).sort();
    const tokenWords = tokens.flatMap((t) => t.split(/\s+/)).map(normalizeWord).filter(Boolean).sort();
    if (JSON.stringify(answerWords) !== JSON.stringify(tokenWords)) {
      return "Các từ cho sẵn không khớp với câu đúng — kiểm tra lại chính tả.";
    }
    return null;
  }
  if (f.type === "error_correction") {
    if (!f.prompt_text.trim()) return "Câu sai không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    if (f.prompt_text.trim() === f.correct_answer.trim()) return "Câu sai và câu đúng giống nhau — không có lỗi để sửa.";
    return null;
  }
  if (f.type === "translation") {
    if (!f.prompt_text.trim()) return "Câu tiếng Việt không được để trống.";
    if (!f.correct_answer.trim()) return "Câu tiếng Đức không được để trống.";
    return null;
  }
  if (f.type === "sentence_transformation") {
    if (!f.prompt_text.trim()) return "Câu gốc không được để trống.";
    if (!f.transformation_hint.trim()) return "Yêu cầu biến đổi không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng sau biến đổi không được để trống.";
    return null;
  }
  if (f.type === "guided_sentence_writing") {
    if (!f.prompt_text.trim()) return "Dữ liệu gợi ý không được để trống.";
    if (!f.correct_answer.trim()) return "Câu đúng không được để trống.";
    return null;
  }
  // classification
  const groups = f.classification_groups.map((g) => g.trim()).filter(Boolean);
  const uniqueGroups = new Set(groups.map((g) => g.toLowerCase()));
  if (groups.length < 2 || uniqueGroups.size !== groups.length) {
    return "Cần ít nhất 2 nhóm phân loại, không trùng tên.";
  }
  if (f.classification_items.length === 0 || f.classification_items.some((it) => !it.item.trim())) {
    return "Cần ít nhất 1 item để phân loại.";
  }
  if (f.classification_items.some((it) => !groups.includes(it.group))) {
    return "Mỗi item phải thuộc một nhóm hợp lệ.";
  }
  return null;
};

const buildPayload = (form: EditForm) => ({
  type: form.type,
  status: form.status,
  prompt_text: form.type === "word_reorder" || form.type === "classification" ? null : form.prompt_text,
  transformation_hint: form.type === "sentence_transformation" ? form.transformation_hint : null,
  correct_answer: form.type === "classification" ? null : form.correct_answer,
  tokens:
    form.type === "word_reorder"
      ? form.tokens_input.split("/").map((t) => t.trim()).filter(Boolean)
      : null,
  classification_groups:
    form.type === "classification" ? form.classification_groups.map((g) => g.trim()).filter(Boolean) : null,
  classification_items:
    form.type === "classification" ? form.classification_items.filter((it) => it.item.trim()) : null,
  explanation: form.explanation,
  order_index: form.order_index,
});

const addGroupToForm = (f: EditForm): EditForm => ({ ...f, classification_groups: [...f.classification_groups, ""] });

const setGroupInForm = (f: EditForm, i: number, val: string): EditForm => {
  const groups = [...f.classification_groups];
  const oldVal = groups[i];
  groups[i] = val;
  return {
    ...f,
    classification_groups: groups,
    classification_items: f.classification_items.map((it) => (it.group === oldVal ? { ...it, group: val } : it)),
  };
};

const removeGroupFromForm = (f: EditForm, i: number): EditForm => {
  const removed = f.classification_groups[i];
  return {
    ...f,
    classification_groups: f.classification_groups.filter((_, idx) => idx !== i),
    classification_items: f.classification_items.map((it) => (it.group === removed ? { ...it, group: "" } : it)),
  };
};

const addItemToForm = (f: EditForm): EditForm => ({
  ...f,
  classification_items: [...f.classification_items, { item: "", group: f.classification_groups[0] ?? "" }],
});

const setItemInForm = (f: EditForm, i: number, key: "item" | "group", val: string): EditForm => {
  const items = [...f.classification_items];
  items[i] = { ...items[i], [key]: val };
  return { ...f, classification_items: items };
};

const removeItemFromForm = (f: EditForm, i: number): EditForm => ({
  ...f,
  classification_items: f.classification_items.filter((_, idx) => idx !== i),
});

const previewContent = (ex: GrammarExercise): string => {
  if (ex.type === "classification") {
    return `${ex.classification_items?.length ?? 0} item · ${ex.classification_groups?.length ?? 0} nhóm`;
  }
  if (ex.type === "word_reorder") {
    return ex.correct_answer ?? "";
  }
  return ex.prompt_text ?? "";
};

const GroupCheckbox: React.FC<{
  state: "none" | "some" | "all";
  onChange: () => void;
}> = ({ state, onChange }) => {
  const ref = React.useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = state === "some";
  }, [state]);
  return <input ref={ref} type="checkbox" checked={state === "all"} onChange={onChange} className="h-4 w-4 accent-orange-500" />;
};

const ExerciseGroupList: React.FC<{
  exercises: GrammarExercise[];
  expandedKeys: ReadonlySet<string>;
  selectedIds: ReadonlySet<string>;
  onToggleExpanded: (key: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onToggleExercise: (id: string) => void;
  onEdit: (ex: GrammarExercise) => void;
  onDelete: (ex: GrammarExercise) => void;
  onPreview: (ex: GrammarExercise) => void;
}> = ({ exercises, expandedKeys, selectedIds, onToggleExpanded, onToggleGroup, onToggleExercise, onEdit, onDelete, onPreview }) => {
  const exerciseGroups = groupGrammarExercises(exercises);
  return (
    <div className="space-y-2">
      {exerciseGroups.map((exerciseGroup, groupIndex) => {
        const ids = exerciseGroup.exercises.map((exercise) => exercise.id);
        const selectionState = getGroupSelectionState(ids, selectedIds);
        const isExpanded = expandedKeys.has(exerciseGroup.key);
        return (
          <div key={exerciseGroup.key} className="overflow-hidden rounded-xl border border-slate-200">
            <div className="flex items-center gap-3 bg-slate-50 px-3 py-2.5">
              <GroupCheckbox state={selectionState} onChange={() => onToggleGroup(ids)} />
              <button type="button" onClick={() => onToggleExpanded(exerciseGroup.key)} className="flex flex-1 items-center gap-3 text-left">
                {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                <span className="text-sm font-black text-slate-700">{groupIndex + 1}</span>
                <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLORS[exerciseGroup.type]}`}>
                  {TYPE_LABELS[exerciseGroup.type]}
                </span>
                <span className="text-xs text-slate-400">{exerciseGroup.exercises.length} câu con</span>
              </button>
            </div>
            {isExpanded && (
              <div className="divide-y divide-slate-100">
                {exerciseGroup.exercises.map((ex, childIndex) => (
                  <div key={ex.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/50">
                    <input type="checkbox" checked={selectedIds.has(ex.id)} onChange={() => onToggleExercise(ex.id)} className="h-4 w-4 accent-orange-500" />
                    <span className="w-10 shrink-0 text-xs font-bold text-slate-400">{groupIndex + 1}.{childIndex + 1}</span>
                    <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{previewContent(ex)}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ex.status === "published" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {ex.status === "published" ? "Đã publish" : "Nháp"}
                    </span>
                    <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button
                onClick={() => onPreview(ex)}
                className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
                title="Preview"
              >
                <Eye className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onEdit(ex)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Chỉnh sửa"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(ex)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

const ExerciseEntryFields: React.FC<{
  entry: EditForm;
  onChange: (updater: (prev: EditForm) => EditForm) => void;
}> = ({ entry, onChange }) => (
  <>
    {entry.type === "word_reorder" && (
      <>
        <div>
          <label className={labelCls}>Các từ cho sẵn *</label>
          <input
            type="text"
            value={entry.tokens_input}
            onChange={(e) => onChange((prev) => ({ ...prev, tokens_input: e.target.value }))}
            className={inputCls}
            placeholder="am Abend / ich / Musik / höre"
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich höre am Abend Musik."
          />
        </div>
      </>
    )}

    {entry.type === "error_correction" && (
      <>
        <div>
          <label className={labelCls}>Câu sai *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich stehe auf um 7 Uhr."
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich stehe um 7 Uhr auf."
          />
        </div>
      </>
    )}

    {entry.type === "translation" && (
      <>
        <div>
          <label className={labelCls}>Câu tiếng Việt *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Tôi học tiếng Đức."
          />
        </div>
        <div>
          <label className={labelCls}>Câu tiếng Đức *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich lerne Deutsch."
          />
        </div>
      </>
    )}

    {entry.type === "sentence_transformation" && (
      <>
        <div>
          <label className={labelCls}>Câu gốc *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Du kommst heute."
          />
        </div>
        <div>
          <label className={labelCls}>Yêu cầu biến đổi *</label>
          <input
            type="text"
            value={entry.transformation_hint}
            onChange={(e) => onChange((prev) => ({ ...prev, transformation_hint: e.target.value }))}
            className={inputCls}
            placeholder="Ja/Nein-Frage"
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng sau biến đổi *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Kommst du heute?"
          />
        </div>
      </>
    )}

    {entry.type === "guided_sentence_writing" && (
      <>
        <div>
          <label className={labelCls}>Dữ liệu gợi ý *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich bin müde. Ich arbeite. + aber"
          />
        </div>
        <div>
          <label className={labelCls}>Câu đúng *</label>
          <textarea
            rows={2}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich bin müde, aber ich arbeite."
          />
        </div>
      </>
    )}

    {entry.type === "classification" && (
      <>
        <div>
          <label className={labelCls}>Nhóm phân loại *</label>
          <div className="space-y-2">
            {entry.classification_groups.map((g, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={g}
                  onChange={(e) => onChange((prev) => setGroupInForm(prev, i, e.target.value))}
                  className={inputCls + " flex-1"}
                  placeholder={`Nhóm ${i + 1}`}
                />
                <button
                  onClick={() => onChange((prev) => removeGroupFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onChange(addGroupToForm)}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm nhóm
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Items *</label>
          <div className="space-y-2">
            {entry.classification_items.map((it, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  value={it.item}
                  onChange={(e) => onChange((prev) => setItemInForm(prev, i, "item", e.target.value))}
                  className={inputCls + " flex-1"}
                  placeholder="Tisch"
                />
                <select
                  value={it.group}
                  onChange={(e) => onChange((prev) => setItemInForm(prev, i, "group", e.target.value))}
                  className={inputCls + " w-28"}
                >
                  <option value="">--</option>
                  {entry.classification_groups.filter(Boolean).map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => onChange((prev) => removeItemFromForm(prev, i))}
                  className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button
              onClick={() => onChange(addItemToForm)}
              disabled={entry.classification_groups.filter(Boolean).length === 0}
              className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm item
            </button>
          </div>
        </div>
      </>
    )}

    <div>
      <label className={labelCls}>Giải thích</label>
      <textarea
        rows={2}
        value={entry.explanation}
        onChange={(e) => onChange((prev) => ({ ...prev, explanation: e.target.value }))}
        className={inputCls + " resize-none"}
        placeholder="Giải thích tại sao đáp án này đúng..."
      />
    </div>
  </>
);

export const AdminGrammarExerciseSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const { modules: moduleOrder, loading: moduleOrderLoading } = useModuleOrder();

  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [entries, setEntries] = useState<EditForm[]>([EMPTY_FORM]);
  const [createStartOrder, setCreateStartOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GrammarExercise | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedExerciseGroups, setExpandedExerciseGroups] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [previewTarget, setPreviewTarget] = useState<GrammarExercise | null>(null);

  const fetchExercises = async () => {
    const [exercisesRes, lessonsRes] = await Promise.all([
      supabase.from("grammar_exercises").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);

    const exercisesByLesson: Record<string, GrammarExercise[]> = {};
    for (const ex of exercisesRes.data ?? []) {
      const exercise = ex as Omit<GrammarExercise, "groupId" | "orderIndex">;
      (exercisesByLesson[ex.lesson_id] ??= []).push({
        ...exercise,
        groupId: exercise.group_id,
        orderIndex: exercise.order_index,
      });
    }

    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      exercises: exercisesByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    const validIds = new Set(Object.values(exercisesByLesson).flat().map((exercise) => exercise.id));
    setSelectedIds((previous) => new Set([...previous].filter((id) => validIds.has(id))));
    setLoading(false);
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const openCreate = (lessonId: string, nextOrder: number) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setCreateStartOrder(nextOrder);
    setEntries([{ ...EMPTY_FORM, order_index: nextOrder }]);
    setModalOpen(true);
  };

  const openEdit = (ex: GrammarExercise) => {
    setEditId(ex.id);
    setEditLessonId(ex.lesson_id);
    setEntries([
      {
        type: ex.type,
        status: ex.status,
        prompt_text: ex.prompt_text ?? "",
        transformation_hint: ex.transformation_hint ?? "",
        correct_answer: ex.correct_answer ?? "",
        tokens_input: (ex.tokens ?? []).join(" / "),
        classification_groups: ex.classification_groups ?? [],
        classification_items: ex.classification_items ?? [],
        explanation: ex.explanation,
        order_index: ex.order_index,
      },
    ]);
    setModalOpen(true);
  };

  const handleTypeChange = (newType: EditForm["type"]) =>
    setEntries((prev) => [{ ...EMPTY_FORM, order_index: prev[0]?.order_index ?? 0, status: prev[0]?.status ?? "draft", type: newType }]);

  const addEntry = () =>
    setEntries((prev) => [
      ...prev,
      { ...EMPTY_FORM, type: prev[0].type, status: prev[0].status, order_index: (prev[prev.length - 1]?.order_index ?? 0) + 1 },
    ]);

  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));

  const updateEntry = (idx: number, updater: (prev: EditForm) => EditForm) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? updater(e) : e)));

  const handleSave = async () => {
    for (let i = 0; i < entries.length; i++) {
      const errorMsg = validateForm(entries[i]);
      if (errorMsg) {
        showToast(entries.length > 1 ? `Câu ${i + 1}: ${errorMsg}` : errorMsg, "warning");
        return;
      }
    }

    setSaving(true);

    let error;
    if (editId) {
      ({ error } = await supabase.from("grammar_exercises").update(buildPayload(entries[0])).eq("id", editId));
    } else {
      const groupId = crypto.randomUUID();
      const payloads = entries.map((entry, index) => ({
        ...buildPayload(entry),
        lesson_id: editLessonId,
        group_id: groupId,
        order_index: createStartOrder + index,
      }));
      ({ error } = await supabase.from("grammar_exercises").insert(payloads));
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast(editId ? "Đã cập nhật bài tập." : `Đã thêm ${entries.length} bài tập.`, "success");
      setModalOpen(false);
      fetchExercises();
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
      showToast("Đã xóa bài tập.", "success");
      setDeleteTarget(null);
      fetchExercises();
    }
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
    showToast(`Đã xóa ${ids.length} câu hỏi.`, "success");
    setBulkDeleteOpen(false);
    setSelectedIds(new Set());
    fetchExercises();
  };

  const toggleExerciseSelection = (id: string) =>
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const handlePublish = async () => {
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase.from("grammar_exercises").update({ status: "published" }).eq("id", editId);
    setSaving(false);
    if (error) {
      showToast("Publish thất bại: " + error.message, "warning");
    } else {
      showToast("Đã publish bài tập.", "success");
      setEntries((prev) => [{ ...prev[0], status: "published" }]);
      fetchExercises();
    }
  };

  const handleRevertToDraft = async () => {
    if (!editId) return;
    setSaving(true);
    const { error } = await supabase.from("grammar_exercises").update({ status: "draft" }).eq("id", editId);
    setSaving(false);
    if (error) {
      showToast("Chuyển về Nháp thất bại: " + error.message, "warning");
    } else {
      showToast("Đã chuyển về Nháp.", "success");
      setEntries((prev) => [{ ...prev[0], status: "draft" }]);
      fetchExercises();
    }
  };

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

  if (loading || moduleOrderLoading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Bài tập ngữ pháp</h1>
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

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <span className="text-sm font-bold text-red-700">Đã chọn {selectedIds.size} câu hỏi</span>
          <button onClick={() => setBulkDeleteOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-red-500 px-3 py-2 text-xs font-bold text-white hover:bg-red-600">
            <Trash2 className="h-3.5 w-3.5" /> Xóa các câu đã chọn
          </button>
        </div>
      )}

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
                  onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
                  className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
                >
                  {expanded[group.lesson_id] ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                  <div className="flex-1">
                    <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                    <p className="text-xs text-slate-400">
                      {group.exercises.length} bài tập
                    </p>
                  </div>
                  <span
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextOrder = group.exercises.reduce((max, exercise) => Math.max(max, exercise.order_index), -1) + 1;
                      openCreate(group.lesson_id, nextOrder);
                    }}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm bài tập
                  </span>
                </button>

                {expanded[group.lesson_id] && (
                  <div className="border-t border-slate-100 p-4 space-y-3">
                    {group.exercises.length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-sm">Chưa có bài tập nào cho bài học này.</p>
                    ) : (
                      <ExerciseGroupList
                        exercises={group.exercises}
                        expandedKeys={expandedExerciseGroups}
                        selectedIds={selectedIds}
                        onToggleExpanded={(key) => setExpandedExerciseGroups((previous) => {
                          const next = new Set(previous);
                          if (next.has(key)) next.delete(key);
                          else next.add(key);
                          return next;
                        })}
                        onToggleGroup={(ids) => setSelectedIds((previous) => toggleGroupSelection(ids, previous))}
                        onToggleExercise={toggleExerciseSelection}
                        onEdit={openEdit}
                        onDelete={setDeleteTarget}
                        onPreview={setPreviewTarget}
                      />
                    )}
                  </div>
                )}
              </div>
            ))}
          </AdminModuleGroup>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h3 className="font-display font-bold text-slate-900">{editId ? "Chỉnh sửa bài tập" : "Thêm bài tập mới"}</h3>
                {editId && <LessonStatusBadge status={entries[0].status} />}
              </div>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className={labelCls}>Loại bài tập</label>
              <select
                value={entries[0].type}
                onChange={(e) => handleTypeChange(e.target.value as EditForm["type"])}
                className={inputCls}
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {entries.map((entry, idx) => (
              <div key={idx} className="border border-slate-100 rounded-xl p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase">Câu {idx + 1}</span>
                  <div className="flex items-center gap-2">
                    {entries.length > 1 && (
                      <button
                        onClick={() => removeEntry(idx)}
                        className="p-1 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <ExerciseEntryFields entry={entry} onChange={(updater) => updateEntry(idx, updater)} />
              </div>
            ))}

            {!editId && (
              <button
                onClick={addEntry}
                className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm câu cùng loại
              </button>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>
                Hủy
              </Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editId ? "Lưu thay đổi" : entries.length > 1 ? `Thêm ${entries.length} bài tập` : "Thêm bài tập"}
              </Button>
              {editId &&
                (entries[0].status === "draft" ? (
                  <Button variant="ghost" size="sm" onClick={handlePublish} className="w-full" disabled={saving}>
                    Publish
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" onClick={handleRevertToDraft} className="w-full" disabled={saving}>
                    Chuyển về Nháp
                  </Button>
                ))}
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
                <h3 className="font-display font-bold text-slate-900">Xóa bài tập?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 line-clamp-2">
              {previewContent(deleteTarget)}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>
                Hủy
              </Button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkDeleteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa {selectedIds.size} câu hỏi?</h3>
                <p className="mt-0.5 text-xs text-slate-500">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setBulkDeleteOpen(false)}>Hủy</Button>
              <button onClick={handleBulkDelete} disabled={deleting} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-display font-bold text-white hover:bg-red-600 disabled:opacity-50">
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {previewTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">Xem trước — {TYPE_LABELS[previewTarget.type]}</h3>
              <button onClick={() => setPreviewTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {previewTarget.type === "word_reorder" && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  {(previewTarget.tokens ?? []).map((t, i) => (
                    <span key={i} className="px-3 py-1.5 bg-slate-100 rounded-lg text-sm font-mono">
                      {t}
                    </span>
                  ))}
                </div>
                <p className="text-sm text-green-700 font-medium">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "error_correction" && (
              <div className="space-y-2">
                <p className="text-sm text-red-600 bg-red-50 rounded-xl px-3 py-2 line-through">{previewTarget.prompt_text}</p>
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "translation" && (
              <div className="flex items-center gap-3">
                <p className="text-sm text-slate-700 flex-1">{previewTarget.prompt_text}</p>
                <span className="text-slate-300">→</span>
                <p className="text-sm text-green-700 flex-1">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "sentence_transformation" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">{previewTarget.prompt_text}</p>
                <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700 uppercase">
                  Yêu cầu: {previewTarget.transformation_hint}
                </span>
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "guided_sentence_writing" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700 bg-slate-50 rounded-xl px-3 py-2">{previewTarget.prompt_text}</p>
                <p className="text-sm text-green-700 bg-green-50 rounded-xl px-3 py-2">{previewTarget.correct_answer}</p>
              </div>
            )}

            {previewTarget.type === "classification" && (
              <div
                className="grid gap-3"
                style={{
                  gridTemplateColumns: `repeat(${(previewTarget.classification_groups ?? []).length || 1}, minmax(0, 1fr))`,
                }}
              >
                {(previewTarget.classification_groups ?? []).map((g) => (
                  <div key={g} className="space-y-1.5">
                    <p className="text-xs font-bold text-slate-500 uppercase text-center">{g}</p>
                    {(previewTarget.classification_items ?? [])
                      .filter((it) => it.group === g)
                      .map((it, i) => (
                        <p key={i} className="text-sm text-center bg-slate-50 rounded-lg px-2 py-1">
                          {it.item}
                        </p>
                      ))}
                  </div>
                ))}
              </div>
            )}

            {previewTarget.explanation && (
              <p className="text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-200">
                {previewTarget.explanation}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
