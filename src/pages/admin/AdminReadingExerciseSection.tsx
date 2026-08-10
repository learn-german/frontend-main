import React, { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Plus, Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { showToast } from "../../lib/toast";
import { useModuleOrder } from "../../lib/hooks/useModuleOrder";
import { useExerciseSets } from "../../lib/hooks/useExerciseSets";
import { type ReadingPassage, PassageEditRow } from "./AdminExerciseSetMedia";

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
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

  const docSets = sets.filter((s) => s.category === "doc");

  const fetchAll = async () => {
    setLoading(true);
    const [lessonsRes, passagesRes] = await Promise.all([
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("reading_passages").select("*").order("lesson_id").order("order_index"),
    ]);
    setLessons(
      (lessonsRes.data ?? []).map((l) => ({
        lesson_id: l.id,
        lesson_title: l.title_vi,
        module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      })),
    );
    setPassages((passagesRes.data ?? []) as ReadingPassage[]);
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
    </div>
  );
};
