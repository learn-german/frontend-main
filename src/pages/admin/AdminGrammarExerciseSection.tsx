import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, Search } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

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
  status: "draft" | "published";
  prompt_text: string | null;
  transformation_hint: string | null;
  correct_answer: string | null;
  tokens: string[] | null;
  classification_groups: string[] | null;
  classification_items: { item: string; group: string }[] | null;
  explanation: string;
  order_index: number;
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

const previewContent = (ex: GrammarExercise): string => {
  if (ex.type === "classification") {
    return `${ex.classification_items?.length ?? 0} item · ${ex.classification_groups?.length ?? 0} nhóm`;
  }
  if (ex.type === "word_reorder") {
    return ex.correct_answer ?? "";
  }
  return ex.prompt_text ?? "";
};

const ExerciseTable: React.FC<{
  exercises: GrammarExercise[];
  onEdit: (ex: GrammarExercise) => void;
  onDelete: (ex: GrammarExercise) => void;
}> = ({ exercises, onEdit, onDelete }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-slate-50">
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-32">Loại</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Nội dung</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-24">Trạng thái</th>
        <th className="px-4 py-2 w-20"></th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-50">
      {exercises.map((ex) => (
        <tr key={ex.id} className="hover:bg-slate-50/50 group">
          <td className="px-4 py-2.5 text-slate-400 text-xs">{ex.order_index}</td>
          <td className="px-4 py-2.5">
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[ex.type]}`}>
              {TYPE_LABELS[ex.type]}
            </span>
          </td>
          <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{previewContent(ex)}</td>
          <td className="px-4 py-2.5">
            <span
              className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${
                ex.status === "published" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
              }`}
            >
              {ex.status === "published" ? "Đã publish" : "Nháp"}
            </span>
          </td>
          <td className="px-4 py-2.5">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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
          </td>
        </tr>
      ))}
    </tbody>
  </table>
);

export const AdminGrammarExerciseSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  const fetchExercises = async () => {
    const [exercisesRes, lessonsRes] = await Promise.all([
      supabase.from("grammar_exercises").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);

    const exercisesByLesson: Record<string, GrammarExercise[]> = {};
    for (const ex of exercisesRes.data ?? []) {
      (exercisesByLesson[ex.lesson_id] ??= []).push(ex as GrammarExercise);
    }

    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      exercises: exercisesByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => {
    fetchExercises();
  }, []);

  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
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

      <div className="space-y-3">
        {filteredGroups.map((group) => (
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
                  {group.module_title} · {group.exercises.length} bài tập
                </p>
              </div>
              <span
                onClick={(e) => {
                  e.stopPropagation();
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
                  <ExerciseTable exercises={group.exercises} onEdit={() => {}} onDelete={() => {}} />
                )}
              </div>
            )}
          </div>
        ))}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>
    </div>
  );
};
