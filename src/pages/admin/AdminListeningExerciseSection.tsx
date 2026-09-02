import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2, Search, Headphones, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminModuleGroup } from "./AdminModuleGroup";
import { showToast } from "../../lib/toast";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets } from "../../lib/hooks/useExerciseSets";
import {
  LISTENING_QUESTION_TYPES,
  LISTENING_TYPE_LABELS,
  type ListeningQuestionType,
} from "../../lib/listeningExerciseTypes";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
}

interface GrammarExerciseRow {
  id: string;
  set_id: string;
  type: string;
}

const isListeningQuestionType = (type: string): type is ListeningQuestionType =>
  (LISTENING_QUESTION_TYPES as readonly string[]).includes(type);

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

export const AdminListeningExerciseSection: React.FC = () => {
  const [lessons, setLessons] = useState<LessonGroup[]>([]);
  const [exercises, setExercises] = useState<GrammarExerciseRow[]>([]);
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
  const { sets, loading: setsLoading, createSet, toggleSetStatus } = useExerciseSets();

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
    setExercises((exercisesRes.data ?? []) as GrammarExerciseRow[]);
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

  if (selectedSetId && selectedSet) {
    const questionType = inferQuestionType(selectedSetId);
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setSelectedSetId(null)}
            className="text-xs font-bold text-slate-500 hover:text-slate-800"
          >
            ← Quay lại danh sách
          </button>
          <span className="text-sm font-display font-black text-slate-900">{selectedSet.title}</span>
          {questionType && (
            <span className="text-[10.5px] font-bold text-slate-500 border border-slate-200 rounded-full px-2 py-0.5">
              {LISTENING_TYPE_LABELS[questionType]}
            </span>
          )}
          <span
            role="button"
            onClick={() => toggleSetStatus(selectedSet.id, selectedSet.status)}
          >
            <LessonStatusBadge status={selectedSet.status} />
          </span>
          <span className="text-xs text-slate-400">
            {questionCountForSet(selectedSetId)} câu hỏi
          </span>
        </div>
        {selectedLesson && (
          <p className="text-xs text-slate-400">
            {selectedLesson.module_title} · {selectedLesson.lesson_title}
          </p>
        )}
        <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-10 text-center">
          <p className="text-sm text-slate-500">Chọn bài tập để chỉnh sửa</p>
        </div>
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
