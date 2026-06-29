import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { AdminLessonEditor, LessonEditable } from "./AdminLessonEditor";

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

export const AdminContentSection: React.FC = () => {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editing, setEditing] = useState<AdminLesson | null>(null);

  const fetchModules = () => {
    supabase
      .from("modules")
      .select(`id, title, title_vi, level, order_index,
        lessons(id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, order_index)`)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules((data ?? []) as unknown as AdminModule[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchModules(); }, []);

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
        onBack={() => setEditing(null)}
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
                <p className="font-display font-bold text-slate-900 text-sm">{mod.title_vi}</p>
                <p className="text-xs text-slate-400">{mod.title} · Level {mod.level} · {mod.lessons.length} bài học</p>
              </div>
            </button>

            {expanded[mod.id] && (
              <div className="border-t border-slate-100 divide-y divide-slate-50">
                {mod.lessons.map((lesson) => (
                  <div key={lesson.id} className="flex items-center gap-4 px-4 py-3 hover:bg-slate-50/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">{lesson.title_vi}</p>
                      <p className="text-xs text-slate-400 truncate">
                        {lesson.objective || <span className="italic text-slate-300">Chưa có mục tiêu</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs font-mono text-slate-400">{lesson.youtube_id || "—"}</span>
                      <span className="text-xs font-bold text-blue-600">{lesson.xp_reward} XP</span>
                      <button
                        onClick={() => setEditing({
                          ...lesson,
                          vocabulary: Array.isArray(lesson.vocabulary) ? lesson.vocabulary as AdminLesson["vocabulary"] : [],
                          grammar: (lesson.grammar && typeof lesson.grammar === "object")
                            ? lesson.grammar as AdminLesson["grammar"]
                            : { title: "", rule: "", examples: [] },
                        })}
                        className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
                        title="Chỉnh sửa bài học"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
