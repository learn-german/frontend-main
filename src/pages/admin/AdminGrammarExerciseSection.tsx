import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, Search, Eye, GripVertical } from "lucide-react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import {
  GRAMMAR_EXERCISE_HINT_MAX_LENGTH,
  normalizeGrammarHint,
  validateGrammarHint,
} from "../../lib/grammarExerciseHint";
import { AdminModuleGroup } from "./AdminModuleGroup";
import {
  getGroupSelectionState,
  flattenGroupsWithOrder,
  groupGrammarExercises,
  moveGroup,
  resolveAppendGroupId,
  toggleGroupSelection,
  type GrammarExerciseGroup,
} from "../../lib/grammarExerciseGroups";
import {
  countBlankMarkers,
  normalizeBlankDefinitions,
  normalizeWordBank,
  syncBlankDefinitions,
  type BlankDefinition,
  type WordBank,
  type WordBankMode,
} from "../../lib/grammarFillInBlank";
import {
  addOption,
  buildMultipleChoicePayload,
  createEmptyChoiceForm,
  moveOption,
  optionLabel,
  parseCorrectIndex,
  removeOption,
  setOption,
  validateChoiceForm,
} from "../../lib/grammarMultipleChoice";

interface GrammarExercise {
  id: string;
  lesson_id: string;
  type:
    | "word_reorder"
    | "error_correction"
    | "translation"
    | "sentence_transformation"
    | "guided_sentence_writing"
    | "classification"
    | "fill_in_the_blank"
    | "multiple_choice";
  group_id: string | null;
  status: "draft" | "published";
  prompt_text: string | null;
  transformation_hint: string | null;
  correct_answer: string | null;
  acceptable_answers: string[] | null;
  tokens: string[] | null;
  classification_groups: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  blanks: BlankDefinition[] | null;
  word_bank: WordBank | null;
  options: string[] | null;
  explanation: string;
  hint: string | null;
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
  fill_in_the_blank: "Điền vào ô trống",
  multiple_choice: "Trắc nghiệm",
};

const TYPE_COLORS: Record<GrammarExercise["type"], string> = {
  word_reorder: "bg-blue-50 text-blue-700",
  error_correction: "bg-rose-50 text-rose-700",
  translation: "bg-emerald-50 text-emerald-700",
  sentence_transformation: "bg-purple-50 text-purple-700",
  guided_sentence_writing: "bg-amber-50 text-amber-700",
  classification: "bg-teal-50 text-teal-700",
  fill_in_the_blank: "bg-orange-50 text-orange-700",
  multiple_choice: "bg-indigo-50 text-indigo-700",
};

interface EditForm {
  type: GrammarExercise["type"];
  status: "draft" | "published";
  prompt_text: string;
  transformation_hint: string;
  correct_answer: string;
  acceptable_answers: string[];
  tokens_input: string;
  classification_groups: string[];
  classification_items: { item: string; group: string }[];
  blanks: BlankDefinition[];
  options: string[];
  correct_option_index: number;
  explanation: string;
  order_index: number;
}

type ModalMode = "create-group" | "append-children" | "edit";

interface AppendContext {
  groupId: string | null;
  legacyExerciseIds: string[];
  groupNumber: number;
}

const EMPTY_FORM: EditForm = {
  type: "word_reorder",
  status: "draft",
  prompt_text: "",
  transformation_hint: "",
  correct_answer: "",
  acceptable_answers: [],
  tokens_input: "",
  classification_groups: [],
  classification_items: [],
  blanks: [],
  options: createEmptyChoiceForm().options,
  correct_option_index: -1,
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
  if (f.type === "multiple_choice") {
    return validateChoiceForm(f.prompt_text, { options: f.options, correctIndex: f.correct_option_index });
  }
  if (f.type === "fill_in_the_blank") {
    const blankCount = countBlankMarkers(f.prompt_text);
    if (blankCount < 1) return "Cần ít nhất 1 marker ___.";
    if (f.blanks.length !== blankCount) return "Số editor đáp án phải khớp số marker ___.";
    if (!normalizeBlankDefinitions(f.blanks)) return "Mỗi ô trống cần ít nhất 1 đáp án hợp lệ.";
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

const buildPayload = (form: EditForm) => {
  const choicePayload = buildMultipleChoicePayload({
    options: form.options,
    correctIndex: form.correct_option_index,
  });
  return {
    type: form.type,
    status: form.status,
    prompt_text: form.type === "word_reorder" || form.type === "classification" ? null : form.prompt_text,
    transformation_hint: form.type === "sentence_transformation" ? form.transformation_hint : null,
    correct_answer:
      form.type === "classification" || form.type === "fill_in_the_blank"
        ? null
        : form.type === "multiple_choice"
          ? choicePayload.correct_answer
          : form.correct_answer,
    acceptable_answers:
      form.type === "translation"
        ? form.acceptable_answers.map((a) => a.trim()).filter(Boolean)
        : null,
    tokens:
      form.type === "word_reorder"
        ? form.tokens_input.split("/").map((t) => t.trim()).filter(Boolean)
        : null,
    classification_groups:
      form.type === "classification" ? form.classification_groups.map((g) => g.trim()).filter(Boolean) : null,
    classification_items:
      form.type === "classification" ? form.classification_items.filter((it) => it.item.trim()) : null,
    blanks: form.type === "fill_in_the_blank" ? normalizeBlankDefinitions(form.blanks) : null,
    options: form.type === "multiple_choice" ? choicePayload.options : null,
    explanation: form.explanation,
    order_index: form.order_index,
  };
};

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

interface ExerciseGroupRowProps {
  exerciseGroup: GrammarExerciseGroup<GrammarExercise>;
  groupIndex: number;
  isExpanded: boolean;
  selectedIds: ReadonlySet<string>;
  disabled: boolean;
  onToggleExpanded: (key: string) => void;
  onToggleGroup: (ids: string[]) => void;
  onToggleExercise: (id: string) => void;
  onEdit: (ex: GrammarExercise) => void;
  onDelete: (ex: GrammarExercise) => void;
  onPreview: (ex: GrammarExercise) => void;
  onAddChildren: (group: GrammarExerciseGroup<GrammarExercise>, groupIndex: number) => void;
}

const SortableExerciseGroupRow: React.FC<ExerciseGroupRowProps> = ({
  exerciseGroup, groupIndex, isExpanded, selectedIds, disabled, onToggleExpanded,
  onToggleGroup, onToggleExercise, onEdit, onDelete, onPreview, onAddChildren,
}) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: exerciseGroup.key,
    disabled,
  });
  const ids = exerciseGroup.exercises.map((exercise) => exercise.id);
  const selectionState = getGroupSelectionState(ids, selectedIds);
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={`overflow-hidden rounded-xl border border-slate-200 bg-white ${isDragging ? "z-10 opacity-60 shadow-lg" : ""}`}>
      <div className="flex items-center gap-3 bg-slate-50 px-3 py-2.5">
        <button type="button" {...attributes} {...listeners} disabled={disabled} className="cursor-grab touch-none text-slate-300 hover:text-slate-500 disabled:cursor-wait" title="Kéo để đổi thứ tự">
          {disabled ? <Loader2 className="h-4 w-4 animate-spin" /> : <GripVertical className="h-4 w-4" />}
        </button>
        <GroupCheckbox state={selectionState} onChange={() => onToggleGroup(ids)} />
        <button type="button" onClick={() => onToggleExpanded(exerciseGroup.key)} className="flex flex-1 items-center gap-3 text-left">
          {isExpanded ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
          <span className="text-sm font-black text-slate-700">Bài {groupIndex + 1}</span>
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${TYPE_COLORS[exerciseGroup.type]}`}>{TYPE_LABELS[exerciseGroup.type]}</span>
          <span className="text-xs text-slate-400">{exerciseGroup.exercises.length} câu</span>
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={(event) => {
            event.stopPropagation();
            onAddChildren(exerciseGroup, groupIndex);
          }}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-orange-600 hover:bg-orange-50 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm câu
        </button>
      </div>
      {isExpanded && (
        <div className="divide-y divide-slate-100">
          {exerciseGroup.exercises.map((ex, childIndex) => (
            <div key={ex.id} className="group flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50/50">
              <input type="checkbox" checked={selectedIds.has(ex.id)} onChange={() => onToggleExercise(ex.id)} className="h-4 w-4 accent-orange-500" />
              <span className="w-10 shrink-0 text-xs font-bold text-slate-400">{groupIndex + 1}.{childIndex + 1}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{previewContent(ex)}</span>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${ex.status === "published" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>{ex.status === "published" ? "Đã publish" : "Nháp"}</span>
              <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <button onClick={() => onPreview(ex)} className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600" title="Preview"><Eye className="w-3.5 h-3.5" /></button>
                <button onClick={() => onEdit(ex)} className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600" title="Chỉnh sửa"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => onDelete(ex)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600" title="Xóa"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  onReorder: (activeKey: string, overKey: string) => void;
  reorderSaving: boolean;
  onAddChildren: (group: GrammarExerciseGroup<GrammarExercise>, groupIndex: number) => void;
}> = ({ exercises, expandedKeys, selectedIds, onToggleExpanded, onToggleGroup, onToggleExercise, onEdit, onDelete, onPreview, onReorder, reorderSaving, onAddChildren }) => {
  const exerciseGroups = groupGrammarExercises(exercises);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) onReorder(String(active.id), String(over.id));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={exerciseGroups.map((group) => group.key)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {exerciseGroups.map((exerciseGroup, groupIndex) => (
            <SortableExerciseGroupRow key={exerciseGroup.key} exerciseGroup={exerciseGroup} groupIndex={groupIndex} isExpanded={expandedKeys.has(exerciseGroup.key)} selectedIds={selectedIds} disabled={reorderSaving} onToggleExpanded={onToggleExpanded} onToggleGroup={onToggleGroup} onToggleExercise={onToggleExercise} onEdit={onEdit} onDelete={onDelete} onPreview={onPreview} onAddChildren={onAddChildren} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
};

const SortableOptionRow: React.FC<{
  id: string;
  index: number;
  value: string;
  checked: boolean;
  onChangeValue: (value: string) => void;
  onSelectCorrect: () => void;
  onRemove: () => void;
}> = ({ id, index, value, checked, onChangeValue, onSelectCorrect, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border border-slate-100 bg-white p-2 ${isDragging ? "z-10 opacity-60 shadow-lg" : ""}`}
    >
      <button type="button" className="cursor-grab p-1 text-slate-300 hover:text-slate-500" {...attributes} {...listeners} aria-label={`Kéo phương án ${optionLabel(index)}`}>
        <GripVertical className="h-4 w-4" />
      </button>
      <span className="w-5 shrink-0 text-center text-xs font-display font-bold text-slate-400">{optionLabel(index)}</span>
      <input
        type="radio"
        checked={checked}
        onChange={onSelectCorrect}
        className="h-4 w-4 accent-orange-500"
        aria-label={`Đáp án đúng là phương án ${optionLabel(index)}`}
      />
      <input
        type="text"
        value={value}
        onChange={(event) => onChangeValue(event.target.value)}
        className={inputCls + " flex-1"}
        placeholder={`Phương án ${optionLabel(index)}`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-400"
        aria-label={`Xóa phương án ${optionLabel(index)}`}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};

const ExerciseEntryFields: React.FC<{
  entry: EditForm;
  onChange: (updater: (prev: EditForm) => EditForm) => void;
}> = ({ entry, onChange }) => {
  const optionSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));
  return (
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
            rows={3}
            value={entry.prompt_text}
            onChange={(e) => onChange((prev) => ({ ...prev, prompt_text: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Tôi học tiếng Đức."
          />
        </div>
        <div>
          <label className={labelCls}>Câu tiếng Đức *</label>
          <textarea
            rows={3}
            value={entry.correct_answer}
            onChange={(e) => onChange((prev) => ({ ...prev, correct_answer: e.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Ich lerne Deutsch."
          />
        </div>
        <div>
          <label className={labelCls}>Đáp án khác chấp nhận được</label>
          <p className="text-[11px] text-slate-400 mb-1.5">Các câu tiếng Đức khác cũng được tính đúng (không phân biệt hoa thường, dấu câu).</p>
          <div className="space-y-2">
            {entry.acceptable_answers.map((ans, i) => (
              <div key={i} className="flex items-start gap-2">
                <textarea
                  rows={3}
                  value={ans}
                  onChange={(e) =>
                    onChange((prev) => ({
                      ...prev,
                      acceptable_answers: prev.acceptable_answers.map((a, j) => (j === i ? e.target.value : a)),
                    }))
                  }
                  className={inputCls + " resize-none"}
                  placeholder="Ich studiere Deutsch."
                />
                <button
                  type="button"
                  onClick={() =>
                    onChange((prev) => ({
                      ...prev,
                      acceptable_answers: prev.acceptable_answers.filter((_, j) => j !== i),
                    }))
                  }
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition"
                  aria-label="Xóa đáp án"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onChange((prev) => ({ ...prev, acceptable_answers: [...prev.acceptable_answers, ""] }))}
              className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
            >
              <Plus className="w-3.5 h-3.5" /> Thêm đáp án
            </button>
          </div>
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

    {entry.type === "fill_in_the_blank" && (
      <>
        <div>
          <label className={labelCls}>Câu có ô trống *</label>
          <p className="mb-1.5 text-[11px] text-slate-400">Dùng ___ để đánh dấu từng ô trống.</p>
          <textarea
            rows={3}
            value={entry.prompt_text}
            onChange={(event) => onChange((prev) => ({
              ...prev,
              prompt_text: event.target.value,
              blanks: syncBlankDefinitions(event.target.value, prev.blanks),
            }))}
            className={inputCls + " resize-y"}
            placeholder="Das ist ___ Computer. ___ Computer ist teuer."
          />
        </div>
        <div className="space-y-3">
          {entry.blanks.map((blank, blankIndex) => (
            <div key={blankIndex} className="rounded-xl border border-slate-100 bg-slate-50/50 p-3">
              <label className={labelCls}>Đáp án ô {blankIndex + 1} *</label>
              <div className="space-y-2">
                {blank.acceptedAnswers.map((answer, answerIndex) => (
                  <div key={answerIndex} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={answer}
                      onChange={(event) => onChange((prev) => ({
                        ...prev,
                        blanks: prev.blanks.map((item, itemIndex) => itemIndex === blankIndex
                          ? {
                              acceptedAnswers: item.acceptedAnswers.map((value, valueIndex) =>
                                valueIndex === answerIndex ? event.target.value : value),
                            }
                          : item),
                      }))}
                      className={inputCls}
                      placeholder="lerne"
                    />
                    <button
                      type="button"
                      onClick={() => onChange((prev) => ({
                        ...prev,
                        blanks: prev.blanks.map((item, itemIndex) => itemIndex === blankIndex
                          ? { acceptedAnswers: item.acceptedAnswers.filter((_, valueIndex) => valueIndex !== answerIndex) }
                          : item),
                      }))}
                      className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                      aria-label={`Xóa đáp án ô ${blankIndex + 1}`}
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => onChange((prev) => ({
                    ...prev,
                    blanks: prev.blanks.map((item, itemIndex) => itemIndex === blankIndex
                      ? { acceptedAnswers: [...item.acceptedAnswers, ""] }
                      : item),
                  }))}
                  className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
                >
                  <Plus className="h-3.5 w-3.5" /> Thêm đáp án hợp lệ
                </button>
              </div>
            </div>
          ))}
        </div>
      </>
    )}

    {entry.type === "multiple_choice" && (
      <>
        <div>
          <label className={labelCls}>Nội dung câu hỏi *</label>
          <textarea
            rows={2}
            value={entry.prompt_text}
            onChange={(event) => onChange((prev) => ({ ...prev, prompt_text: event.target.value }))}
            className={inputCls + " resize-none"}
            placeholder="Das ist ___ Computer."
          />
        </div>
        <div>
          <label className={labelCls}>Phương án * (chọn radio để đánh dấu đáp án đúng)</label>
          <p className="mb-1.5 text-[11px] text-slate-400">Tối thiểu 2 phương án. Kéo để đổi thứ tự; nhãn A/B/C tự sinh theo vị trí.</p>
          <DndContext
            sensors={optionSensors}
            collisionDetection={closestCenter}
            onDragEnd={(event: DragEndEvent) => {
              const { active, over } = event;
              if (!over || active.id === over.id) return;
              onChange((prev) => {
                const from = prev.options.findIndex((_, i) => `option-${i}` === active.id);
                const to = prev.options.findIndex((_, i) => `option-${i}` === over.id);
                const moved = moveOption({ options: prev.options, correctIndex: prev.correct_option_index }, from, to);
                return { ...prev, options: moved.options, correct_option_index: moved.correctIndex };
              });
            }}
          >
            <SortableContext items={entry.options.map((_, i) => `option-${i}`)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {entry.options.map((option, index) => (
                  <SortableOptionRow
                    key={`option-${index}`}
                    id={`option-${index}`}
                    index={index}
                    value={option}
                    checked={entry.correct_option_index === index}
                    onChangeValue={(value) => onChange((prev) => ({
                      ...prev,
                      options: setOption({ options: prev.options, correctIndex: prev.correct_option_index }, index, value).options,
                    }))}
                    onSelectCorrect={() => onChange((prev) => ({ ...prev, correct_option_index: index }))}
                    onRemove={() => onChange((prev) => {
                      const next = removeOption({ options: prev.options, correctIndex: prev.correct_option_index }, index);
                      return { ...prev, options: next.options, correct_option_index: next.correctIndex };
                    })}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
          <button
            type="button"
            onClick={() => onChange((prev) => ({
              ...prev,
              options: addOption({ options: prev.options, correctIndex: prev.correct_option_index }).options,
            }))}
            className="mt-2 flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> Thêm phương án
          </button>
          {entry.correct_option_index < 0 && (
            <p className="mt-1.5 text-[11px] font-bold text-rose-500">Chưa chọn đáp án đúng.</p>
          )}
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
};

export const AdminGrammarExerciseSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [moduleExpanded, setModuleExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const { modules: moduleOrder, loading: moduleOrderLoading } = useModuleOrder();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("create-group");
  const [appendContext, setAppendContext] = useState<AppendContext | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [hint, setHint] = useState("");
  const [wordBankEnabled, setWordBankEnabled] = useState(false);
  const [wordBankWords, setWordBankWords] = useState<string[]>([]);
  const [wordBankMode, setWordBankMode] = useState<WordBankMode>("single_use");
  const [entries, setEntries] = useState<EditForm[]>([EMPTY_FORM]);
  const [createStartOrder, setCreateStartOrder] = useState(0);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<GrammarExercise | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedExerciseGroups, setExpandedExerciseGroups] = useState<Set<string>>(new Set());
  const [reorderSavingLessonId, setReorderSavingLessonId] = useState<string | null>(null);
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
    setModalMode("create-group");
    setAppendContext(null);
    setEditId(null);
    setEditGroupId(null);
    setEditLessonId(lessonId);
    setHint("");
    setWordBankEnabled(false);
    setWordBankWords([]);
    setWordBankMode("single_use");
    setCreateStartOrder(nextOrder);
    setEntries([{ ...EMPTY_FORM, order_index: nextOrder }]);
    setModalOpen(true);
  };

  const openEdit = (ex: GrammarExercise) => {
    setModalMode("edit");
    setAppendContext(null);
    setEditId(ex.id);
    setEditGroupId(ex.group_id);
    setEditLessonId(ex.lesson_id);
    setHint(ex.hint ?? "");
    setWordBankEnabled(!!ex.word_bank);
    setWordBankWords(ex.word_bank?.words ?? []);
    setWordBankMode(ex.word_bank?.mode ?? "single_use");
    setEntries([
      {
        type: ex.type,
        status: ex.status,
        prompt_text: ex.prompt_text ?? "",
        transformation_hint: ex.transformation_hint ?? "",
        correct_answer: ex.correct_answer ?? "",
        acceptable_answers: ex.acceptable_answers ?? [],
        tokens_input: (ex.tokens ?? []).join(" / "),
        classification_groups: ex.classification_groups ?? [],
        classification_items: ex.classification_items ?? [],
        blanks: ex.blanks ?? [],
        options: ex.options ?? [],
        correct_option_index: parseCorrectIndex(ex.correct_answer, (ex.options ?? []).length),
        explanation: ex.explanation,
        order_index: ex.order_index,
      },
    ]);
    setModalOpen(true);
  };

  const openAppendChildren = (
    lessonId: string,
    exerciseGroup: GrammarExerciseGroup<GrammarExercise>,
    groupNumber: number,
  ) => {
    const lesson = groups.find((group) => group.lesson_id === lessonId);
    const nextOrder = (lesson?.exercises ?? []).reduce(
      (max, exercise) => Math.max(max, exercise.order_index),
      -1,
    ) + 1;
    const firstExercise = exerciseGroup.exercises[0];
    setModalMode("append-children");
    setAppendContext({
      groupId: firstExercise.groupId,
      legacyExerciseIds: firstExercise.groupId ? [] : exerciseGroup.exercises.map((exercise) => exercise.id),
      groupNumber,
    });
    setEditId(null);
    setEditGroupId(firstExercise.groupId);
    setEditLessonId(lessonId);
    setHint(firstExercise.hint ?? "");
    setWordBankEnabled(!!firstExercise.word_bank);
    setWordBankWords(firstExercise.word_bank?.words ?? []);
    setWordBankMode(firstExercise.word_bank?.mode ?? "single_use");
    setCreateStartOrder(nextOrder);
    setEntries([{ ...EMPTY_FORM, type: exerciseGroup.type, order_index: nextOrder }]);
    setModalOpen(true);
  };

  const handleTypeChange = (newType: EditForm["type"]) => {
    setEntries((prev) => [{ ...EMPTY_FORM, order_index: prev[0]?.order_index ?? 0, status: prev[0]?.status ?? "draft", type: newType }]);
    if (newType !== "fill_in_the_blank") {
      setWordBankEnabled(false);
      setWordBankWords([]);
    }
  };

  const addEntry = () =>
    setEntries((prev) => [
      ...prev,
      { ...EMPTY_FORM, type: prev[0].type, status: prev[0].status, order_index: (prev[prev.length - 1]?.order_index ?? 0) + 1 },
    ]);

  const removeEntry = (idx: number) => setEntries((prev) => prev.filter((_, i) => i !== idx));

  const updateEntry = (idx: number, updater: (prev: EditForm) => EditForm) =>
    setEntries((prev) => prev.map((e, i) => (i === idx ? updater(e) : e)));

  const handleSave = async () => {
    const hintError = validateGrammarHint(hint);
    if (hintError) {
      showToast(hintError, "warning");
      return;
    }

    for (let i = 0; i < entries.length; i++) {
      const errorMsg = validateForm(entries[i]);
      if (errorMsg) {
        showToast(entries.length > 1 ? `Câu ${i + 1}: ${errorMsg}` : errorMsg, "warning");
        return;
      }
    }
    const sharedWordBank = entries[0]?.type === "fill_in_the_blank"
      ? normalizeWordBank(wordBankEnabled, wordBankWords, wordBankMode)
      : null;
    if (entries[0]?.type === "fill_in_the_blank" && wordBankEnabled && !sharedWordBank) {
      showToast("Word bank đã bật nên cần ít nhất 1 từ.", "warning");
      return;
    }

    setSaving(true);

    const normalizedHint = normalizeGrammarHint(hint);
    let error: { message: string } | null = null;
    if (modalMode === "edit" && editId) {
      ({ error } = await supabase
        .from("grammar_exercises")
        .update({
          ...buildPayload(entries[0]),
          word_bank: sharedWordBank,
          ...(editGroupId ? {} : { hint: normalizedHint }),
        })
        .eq("id", editId));

      if (!error && editGroupId) {
        ({ error } = await supabase
          .from("grammar_exercises")
          .update({ hint: normalizedHint, word_bank: sharedWordBank })
          .eq("group_id", editGroupId));
      }
    } else if (modalMode === "create-group") {
      const groupId = crypto.randomUUID();
      const payloads = entries.map((entry, index) => ({
        ...buildPayload(entry),
        lesson_id: editLessonId,
        group_id: groupId,
        hint: normalizedHint,
        word_bank: sharedWordBank,
        order_index: createStartOrder + index,
      }));
      ({ error } = await supabase.from("grammar_exercises").insert(payloads));
    } else if (appendContext) {
      const resolved = resolveAppendGroupId(appendContext.groupId, () => crypto.randomUUID());
      if (resolved.assignedLegacyId) {
        const legacyUpdate = await supabase
          .from("grammar_exercises")
          .update({ group_id: resolved.groupId })
          .in("id", appendContext.legacyExerciseIds);
        error = legacyUpdate.error;
      }

      if (!error) {
        const hintUpdate = await supabase
          .from("grammar_exercises")
          .update({ hint: normalizedHint, word_bank: sharedWordBank })
          .eq("group_id", resolved.groupId);
        error = hintUpdate.error;
      }

      if (!error) {
        const payloads = entries.map((entry, index) => ({
          ...buildPayload(entry),
          lesson_id: editLessonId,
          group_id: resolved.groupId,
          hint: normalizedHint,
          word_bank: sharedWordBank,
          order_index: createStartOrder + index,
        }));
        const insertResult = await supabase.from("grammar_exercises").insert(payloads);
        error = insertResult.error;

        if (error && resolved.assignedLegacyId) {
          const rollback = await supabase
            .from("grammar_exercises")
            .update({ group_id: null })
            .in("id", appendContext.legacyExerciseIds);
          if (rollback.error) {
            error = { message: `${error.message}. Rollback nhóm cũ thất bại: ${rollback.error.message}` };
            await fetchExercises();
          }
        }
      }
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      const successMessage = modalMode === "edit"
        ? "Đã cập nhật bài tập."
        : modalMode === "append-children"
          ? `Đã thêm ${entries.length} câu.`
          : `Đã thêm ${entries.length} bài tập.`;
      showToast(successMessage, "success");
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

  const handleReorderGroups = async (lessonId: string, activeKey: string, overKey: string) => {
    const lessonGroup = groups.find((group) => group.lesson_id === lessonId);
    if (!lessonGroup || reorderSavingLessonId) return;
    const previousExercises = lessonGroup.exercises;
    const exerciseGroups = groupGrammarExercises(previousExercises);
    const reorderedKeys = moveGroup(exerciseGroups.map((group) => group.key), activeKey, overKey);
    const reorderedGroups = reorderedKeys
      .map((key) => exerciseGroups.find((group) => group.key === key))
      .filter((group): group is GrammarExerciseGroup<GrammarExercise> => !!group);
    const ordered = flattenGroupsWithOrder(reorderedGroups);
    const nextExercises = ordered.map(({ exercise, orderIndex }) => ({
      ...exercise,
      order_index: orderIndex,
      orderIndex,
    }));

    setGroups((previous) => previous.map((group) => group.lesson_id === lessonId ? { ...group, exercises: nextExercises } : group));
    setReorderSavingLessonId(lessonId);
    const results = await Promise.all(
      ordered.map(({ exercise, orderIndex }) =>
        supabase.from("grammar_exercises").update({ order_index: orderIndex }).eq("id", exercise.id),
      ),
    );
    const firstError = results.find((result) => result.error)?.error;
    if (firstError) {
      await Promise.all(
        previousExercises.map((exercise) =>
          supabase.from("grammar_exercises").update({ order_index: exercise.order_index }).eq("id", exercise.id),
        ),
      );
      setGroups((previous) => previous.map((group) => group.lesson_id === lessonId ? { ...group, exercises: previousExercises } : group));
      showToast("Không thể lưu thứ tự mới: " + firstError.message, "warning");
      setReorderSavingLessonId(null);
      return;
    }
    await fetchExercises();
    setReorderSavingLessonId(null);
    showToast("Đã cập nhật thứ tự câu hỏi.", "success");
  };

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
                      {groupGrammarExercises(group.exercises).length} bài - {group.exercises.length} câu
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
                        onReorder={(activeKey, overKey) => handleReorderGroups(group.lesson_id, activeKey, overKey)}
                        reorderSaving={reorderSavingLessonId === group.lesson_id}
                        onAddChildren={(exerciseGroup, groupIndex) => openAppendChildren(group.lesson_id, exerciseGroup, groupIndex + 1)}
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
                <h3 className="font-display font-bold text-slate-900">
                  {modalMode === "edit"
                    ? "Chỉnh sửa bài tập"
                    : modalMode === "append-children"
                      ? `Thêm câu vào Bài ${appendContext?.groupNumber ?? ""}`
                      : "Thêm bài tập mới"}
                </h3>
                {modalMode === "edit" && <LessonStatusBadge status={entries[0].status} />}
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
                disabled={modalMode === "append-children"}
                className={`${inputCls} disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500`}
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className={labelCls}>Gợi ý</label>
              <textarea
                rows={3}
                value={hint}
                onChange={(e) => setHint(e.target.value)}
                className={`${inputCls} resize-y`}
                placeholder="Nhắc lại quy tắc hoặc hướng dẫn cách làm cho học viên..."
              />
              <p
                className={`mt-1 text-right text-[11px] ${
                  hint.length > GRAMMAR_EXERCISE_HINT_MAX_LENGTH ? "font-bold text-red-500" : "text-slate-400"
                }`}
              >
                {hint.length}/{GRAMMAR_EXERCISE_HINT_MAX_LENGTH}
              </p>
            </div>

            {entries[0].type === "fill_in_the_blank" && (
              <div className="space-y-3 rounded-xl border border-orange-100 bg-orange-50/40 p-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={wordBankEnabled}
                    onChange={(event) => {
                      setWordBankEnabled(event.target.checked);
                      if (event.target.checked && wordBankWords.length === 0) setWordBankWords([""]);
                    }}
                    className="h-4 w-4 accent-orange-500"
                  />
                  Bật word bank dùng chung cho nhóm
                </label>
                {wordBankEnabled && (
                  <>
                    <div className="space-y-2">
                      {wordBankWords.map((word, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={word}
                            onChange={(event) => setWordBankWords((previous) =>
                              previous.map((value, valueIndex) => valueIndex === index ? event.target.value : value))}
                            className={inputCls}
                            placeholder="lerne"
                          />
                          <button
                            type="button"
                            onClick={() => setWordBankWords((previous) => previous.filter((_, valueIndex) => valueIndex !== index))}
                            className="rounded-lg p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                            aria-label="Xóa từ trong word bank"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setWordBankWords((previous) => [...previous, ""])}
                        className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700"
                      >
                        <Plus className="h-3.5 w-3.5" /> Thêm từ
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      {(["single_use", "multiple_use"] as const).map((mode) => (
                        <label key={mode} className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="radio"
                            name="word-bank-mode"
                            checked={wordBankMode === mode}
                            onChange={() => setWordBankMode(mode)}
                            className="accent-orange-500"
                          />
                          {mode === "single_use" ? "Mỗi chip dùng một lần" : "Chip được dùng nhiều lần"}
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

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

            {modalMode !== "edit" && (
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
              <Button variant="primary" className="flex-1" onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {modalMode === "edit"
                  ? "Lưu thay đổi"
                  : modalMode === "append-children"
                    ? `Thêm ${entries.length} câu`
                    : entries.length > 1
                      ? `Thêm ${entries.length} bài tập`
                      : "Thêm bài tập"}
              </Button>
              {modalMode === "edit" && editId &&
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

            {previewTarget.type === "fill_in_the_blank" && (
              <div className="space-y-3">
                {previewTarget.word_bank && (
                  <div className="flex flex-wrap gap-2 rounded-xl bg-orange-50 p-3">
                    {previewTarget.word_bank.words.map((word, index) => (
                      <span key={`${index}:${word}`} className="rounded-full border border-orange-200 bg-white px-3 py-1 text-xs font-bold text-orange-700">
                        {word}
                      </span>
                    ))}
                  </div>
                )}
                <div className="text-sm leading-10 text-slate-700">
                  {(previewTarget.prompt_text ?? "").split("___").map((segment, index, segments) => (
                    <React.Fragment key={`${index}:${segment}`}>
                      <span className="whitespace-pre-wrap">{segment}</span>
                      {index < segments.length - 1 && (
                        <input
                          type="text"
                          readOnly
                          className="mx-1 inline-block w-28 rounded-lg border border-slate-200 px-2 py-1.5"
                          aria-label={`Ô trống ${index + 1}`}
                        />
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>
            )}

            {previewTarget.type === "multiple_choice" && (
              <div className="space-y-2">
                <p className="text-sm text-slate-700">{previewTarget.prompt_text}</p>
                <div className="space-y-1.5">
                  {(previewTarget.options ?? []).map((option, index) => (
                    <div key={index} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold">
                        {optionLabel(index)}
                      </span>
                      <span>{option}</span>
                    </div>
                  ))}
                </div>
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
