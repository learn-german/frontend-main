import React, { useState, useEffect } from "react";
import { Loader2, Plus, Pencil, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface AdminLesson {
  id: string;
  title: string;
  title_vi: string;
  duration: string;
  level: string;
  xp_reward: number;
  youtube_id: string | null;
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
  const [editLesson, setEditLesson] = useState<AdminLesson | null>(null);

  const fetchModules = () => {
    supabase
      .from("modules")
      .select(`id, title, title_vi, level, order_index, lessons(id, title, title_vi, duration, level, xp_reward, youtube_id, order_index)`)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules((data ?? []) as AdminModule[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchModules(); }, []);

  const handleSaveLesson = async () => {
    if (!editLesson) return;
    const { error } = await supabase
      .from("lessons")
      .update({
        title: editLesson.title,
        title_vi: editLesson.title_vi,
        duration: editLesson.duration,
        youtube_id: editLesson.youtube_id || null,
        xp_reward: editLesson.xp_reward,
      })
      .eq("id", editLesson.id);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu thay đổi bài học.", "success");
      setEditLesson(null);
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

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý Nội dung</h1>

      <div className="space-y-3">
        {modules.map((mod) => (
          <div key={mod.id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [mod.id]: !prev[mod.id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[mod.id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{mod.title_vi}</p>
                <p className="text-xs text-slate-400">{mod.title} · Level {mod.level} · {mod.lessons.length} bài học</p>
              </div>
            </button>

            {expanded[mod.id] && (
              <div className="border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Bài học</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Thời lượng</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">YouTube ID</th>
                      <th className="text-right px-4 py-2 text-xs font-bold text-slate-500">XP</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {mod.lessons.map((lesson) => (
                      <tr key={lesson.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-800">{lesson.title_vi}</p>
                          <p className="text-xs text-slate-400">{lesson.id}</p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500">{lesson.duration}</td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                          {lesson.youtube_id || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-blue-600">{lesson.xp_reward}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditLesson(lesson)}
                            className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit lesson modal */}
      {editLesson && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4">
            <h3 className="font-display font-bold text-slate-900">Chỉnh sửa bài học</h3>
            <p className="text-xs text-slate-400 font-mono">{editLesson.id}</p>

            {[
              { label: "Tiêu đề (DE)", key: "title" as const },
              { label: "Tiêu đề (VI)", key: "title_vi" as const },
              { label: "Thời lượng (VD: 05:40)", key: "duration" as const },
              { label: "YouTube ID", key: "youtube_id" as const },
            ].map(({ label, key }) => (
              <div key={key}>
                <label className="block text-xs font-bold text-slate-600 mb-1">{label}</label>
                <input
                  type="text"
                  value={(editLesson[key] as string) ?? ""}
                  onChange={(e) => setEditLesson((prev) => prev ? { ...prev, [key]: e.target.value } : prev)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>
            ))}

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">XP Reward</label>
              <input
                type="number"
                value={editLesson.xp_reward}
                onChange={(e) => setEditLesson((prev) => prev ? { ...prev, xp_reward: parseInt(e.target.value) || 0 } : prev)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditLesson(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveLesson}>Lưu thay đổi</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
