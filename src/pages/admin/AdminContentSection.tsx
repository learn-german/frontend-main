import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, Plus, Trash2, X, GripVertical } from "lucide-react";
import {
  DndContext, closestCenter, PointerSensor, useSensor, useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";
import { LessonStatusBadge } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface AdminLesson extends LessonEditable {
  order_index: number;
}

interface AdminModule {
  id: string;
  title: string;
  title_vi: string;
  level: string;
  order_index: number;
  lessons: AdminLesson[];
}

const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index, status`;

const SortableLessonRow: React.FC<{
  lesson: AdminLesson;
  onEdit: () => void;
  onDelete: () => void;
}> = ({ lesson, onEdit, onDelete }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: lesson.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors group">
      <button {...attributes} {...listeners} className="p-1 text-slate-300 hover:text-slate-500 cursor-grab active:cursor-grabbing shrink-0" title="Kéo để sắp xếp">
        <GripVertical className="w-4 h-4" />
      </button>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-slate-800 truncate">{lesson.title_vi}</p>
        <p className="text-xs text-slate-400 truncate">
          {lesson.objective || <span className="italic text-slate-300">Chưa có mục tiêu</span>}
        </p>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <LessonStatusBadge status={lesson.status} />
        <span className="text-xs font-mono text-slate-400">{lesson.youtube_id || "—"}</span>
        <span className="text-xs font-bold text-blue-600">{lesson.xp_reward} XP</span>
        <button
          onClick={onEdit}
          className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
          title="Chỉnh sửa bài học"
        >
          <Pencil className="w-4 h-4" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
          title="Xóa bài học"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export const AdminContentSection: React.FC = () => {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AdminLesson | null>(null);
  const [adding, setAdding] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminLesson | null>(null);
  const [deleting, setDeleting] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const handleDragEnd = async (mod: AdminModule, event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = mod.lessons.findIndex(l => l.id === active.id);
    const newIndex = mod.lessons.findIndex(l => l.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(mod.lessons, oldIndex, newIndex);
    setModules(prev => prev.map(m => (m.id === mod.id ? { ...m, lessons: reordered } : m)));

    const results = await Promise.all(
      reordered.map((lesson, i) => supabase.from("lessons").update({ order_index: i + 1 }).eq("id", lesson.id))
    );
    const failed = results.find(r => r.error);
    if (failed?.error) {
      showToast("Cập nhật thứ tự thất bại: " + failed.error.message, "warning");
      fetchModules();
    }
  };

  const fetchModules = () => {
    supabase
      .from("modules")
      .select(`id, title, title_vi, level, order_index, lessons(${LESSON_SELECT})`)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules((data ?? []) as unknown as AdminModule[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchModules(); }, []);

  const emptyVocabGrammar = (row: unknown): Pick<AdminLesson, "vocabulary" | "grammar"> => ({
    vocabulary: Array.isArray((row as AdminLesson).vocabulary) ? (row as AdminLesson).vocabulary : [],
    grammar: (row as AdminLesson).grammar && typeof (row as AdminLesson).grammar === "object"
      ? (row as AdminLesson).grammar
      : { title: "", rule: "", examples: [] },
  });

  const handleAddLesson = async (mod: AdminModule) => {
    setAdding(true);
    const levelLower = mod.level.toLowerCase();
    const n = mod.lessons.length + 1;
    const id = `${levelLower}-l${n}`;

    const { data, error } = await supabase
      .from("lessons")
      .insert({
        id,
        module_id: mod.id,
        level: mod.level,
        title: "Bài học mới",
        title_vi: "Bài học mới",
        duration: "10 phút",
        xp_reward: 10,
        order_index: n,
        vocabulary: [],
        grammar: { title: "", rule: "", examples: [] },
        status: "draft",
      })
      .select(LESSON_SELECT)
      .single();

    setAdding(false);

    if (error || !data) {
      showToast("Tạo bài học thất bại: " + (error?.message ?? "unknown error"), "warning");
      return;
    }

    setEditing({ ...(data as unknown as AdminLesson), ...emptyVocabGrammar(data) });
  };

  const handleDeleteLesson = async () => {
    if (!deleteTarget) return;
    setDeleting(true);

    await supabase.from("lessons").update({ next_lesson_id: null }).eq("next_lesson_id", deleteTarget.id);
    const { error } = await supabase.from("lessons").delete().eq("id", deleteTarget.id);

    setDeleting(false);

    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa bài học.", "success");
      setDeleteTarget(null);
      fetchModules();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  // Full-page lesson editor — replaces module list
  if (editing) {
    return (
      <AdminLessonEditor
        lesson={editing}
        onBack={() => { setEditing(null); fetchModules(); }}
        onSaved={() => { setEditing(null); fetchModules(); }}
      />
    );
  }

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý Nội dung</h1>

      <div className="space-y-3">
        {modules.map((mod) => (
          <div key={mod.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [mod.id]: !prev[mod.id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[mod.id]
                ? <ChevronDown className="w-4 h-4 text-slate-400" />
                : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-black text-slate-900 text-sm">{mod.level}</p>
                <p className="text-xs text-slate-400">{mod.lessons.length} bài học</p>
              </div>
            </button>

            {expanded[mod.id] && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(mod, e)}>
                  <SortableContext items={mod.lessons.map(l => l.id)} strategy={verticalListSortingStrategy}>
                    {mod.lessons.map((lesson) => (
                      <SortableLessonRow
                        key={lesson.id}
                        lesson={lesson}
                        onEdit={() => setEditing({ ...lesson, ...emptyVocabGrammar(lesson) })}
                        onDelete={() => setDeleteTarget(lesson)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
                <div className="px-4 py-3">
                  <button
                    onClick={() => handleAddLesson(mod)}
                    disabled={adding}
                    className="flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 px-3 py-1.5 rounded-xl hover:bg-orange-50 border border-orange-200 transition-colors disabled:opacity-50"
                  >
                    {adding ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Thêm bài học
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">Xóa bài học?</h3>
              <button onClick={() => setDeleteTarget(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-sm text-slate-600">
              Xóa bài học <span className="font-bold">{deleteTarget.title_vi}</span>? Hành động này không thể hoàn tác.
            </p>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-display font-bold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handleDeleteLesson}
                disabled={deleting}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
