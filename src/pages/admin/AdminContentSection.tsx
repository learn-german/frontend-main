import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight, BookOpen, Plus, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface VocabItem {
  de: string;
  pronunciation: string;
  vi: string;
  exampleDe: string;
  exampleVi: string;
}

interface GrammarExample {
  de: string;
  vi: string;
}

interface Grammar {
  title: string;
  rule: string;
  examples: GrammarExample[];
}

interface AdminLesson {
  id: string;
  title: string;
  title_vi: string;
  duration: string;
  level: string;
  xp_reward: number;
  youtube_id: string | null;
  objective: string | null;
  vocabulary: VocabItem[];
  grammar: Grammar;
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

const EMPTY_GRAMMAR: Grammar = { title: "", rule: "", examples: [] };

export const AdminContentSection: React.FC = () => {
  const [modules, setModules] = useState<AdminModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editLesson, setEditLesson] = useState<AdminLesson | null>(null);
  const [editContent, setEditContent] = useState<AdminLesson | null>(null);

  const fetchModules = () => {
    supabase
      .from("modules")
      .select(`id, title, title_vi, level, order_index, lessons(id, title, title_vi, duration, level, xp_reward, youtube_id, objective, vocabulary, grammar, order_index)`)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules((data ?? []) as unknown as AdminModule[]);
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
        objective: editLesson.objective || null,
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

  const handleSaveContent = async () => {
    if (!editContent) return;
    const { error } = await supabase
      .from("lessons")
      .update({
        vocabulary: editContent.vocabulary,
        grammar: editContent.grammar,
      })
      .eq("id", editContent.id);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu từ vựng & ngữ pháp.", "success");
      setEditContent(null);
      fetchModules();
    }
  };

  const updateVocab = (idx: number, field: keyof VocabItem, value: string) => {
    setEditContent(prev => {
      if (!prev) return prev;
      const vocab = [...prev.vocabulary];
      vocab[idx] = { ...vocab[idx], [field]: value };
      return { ...prev, vocabulary: vocab };
    });
  };

  const addVocab = () => {
    setEditContent(prev => prev ? {
      ...prev,
      vocabulary: [...prev.vocabulary, { de: "", pronunciation: "", vi: "", exampleDe: "", exampleVi: "" }],
    } : prev);
  };

  const removeVocab = (idx: number) => {
    setEditContent(prev => prev ? {
      ...prev,
      vocabulary: prev.vocabulary.filter((_, i) => i !== idx),
    } : prev);
  };

  const updateGrammarExample = (idx: number, field: "de" | "vi", value: string) => {
    setEditContent(prev => {
      if (!prev) return prev;
      const examples = [...prev.grammar.examples];
      examples[idx] = { ...examples[idx], [field]: value };
      return { ...prev, grammar: { ...prev.grammar, examples } };
    });
  };

  const addGrammarExample = () => {
    setEditContent(prev => prev ? {
      ...prev,
      grammar: { ...prev.grammar, examples: [...prev.grammar.examples, { de: "", vi: "" }] },
    } : prev);
  };

  const removeGrammarExample = (idx: number) => {
    setEditContent(prev => prev ? {
      ...prev,
      grammar: { ...prev.grammar, examples: prev.grammar.examples.filter((_, i) => i !== idx) },
    } : prev);
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
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">YouTube ID</th>
                      <th className="text-right px-4 py-2 text-xs font-bold text-slate-500">XP</th>
                      <th className="px-4 py-2 text-xs font-bold text-slate-500 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {mod.lessons.map((lesson) => (
                      <tr key={lesson.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5">
                          <p className="font-medium text-slate-800">{lesson.title_vi}</p>
                          <p className="text-xs text-slate-400 truncate max-w-xs">{lesson.objective || <span className="italic text-slate-300">Chưa có mục tiêu</span>}</p>
                        </td>
                        <td className="px-4 py-2.5 text-slate-500 font-mono text-xs">
                          {lesson.youtube_id || <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right font-bold text-blue-600">{lesson.xp_reward}</td>
                        <td className="px-4 py-2.5 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() => setEditLesson(lesson)}
                              className="p-1.5 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors"
                              title="Chỉnh sửa thông tin cơ bản"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditContent({
                                ...lesson,
                                vocabulary: Array.isArray(lesson.vocabulary) ? lesson.vocabulary : [],
                                grammar: lesson.grammar && typeof lesson.grammar === "object" ? lesson.grammar as Grammar : EMPTY_GRAMMAR,
                              })}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                              title="Chỉnh sửa từ vựng & ngữ pháp"
                            >
                              <BookOpen className="w-3.5 h-3.5" />
                            </button>
                          </div>
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

      {/* Edit basic info modal */}
      {editLesson && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="font-display font-bold text-slate-900">Chỉnh sửa bài học</h3>
            <p className="text-xs text-slate-400 font-mono">{editLesson.id}</p>

            {([
              { label: "Tiêu đề (DE)", key: "title" as const },
              { label: "Tiêu đề (VI)", key: "title_vi" as const },
              { label: "Thời lượng (VD: 05:40)", key: "duration" as const },
              { label: "YouTube ID", key: "youtube_id" as const },
            ] as { label: string; key: keyof AdminLesson }[]).map(({ label, key }) => (
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
              <label className="block text-xs font-bold text-slate-600 mb-1">Mục tiêu bài học</label>
              <textarea
                rows={3}
                value={editLesson.objective ?? ""}
                onChange={(e) => setEditLesson(prev => prev ? { ...prev, objective: e.target.value } : prev)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
              />
            </div>

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

      {/* Edit vocabulary & grammar modal */}
      {editContent && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto space-y-6">
            <div>
              <h3 className="font-display font-bold text-slate-900">Từ vựng & Ngữ pháp</h3>
              <p className="text-xs text-slate-400 font-mono mt-0.5">{editContent.id} — {editContent.title_vi}</p>
            </div>

            {/* Vocabulary */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-display font-bold text-slate-700">Từ vựng then chốt ({editContent.vocabulary.length})</h4>
                <button
                  onClick={addVocab}
                  className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm từ
                </button>
              </div>

              {editContent.vocabulary.length === 0 && (
                <p className="text-xs text-slate-400 italic py-2">Chưa có từ vựng. Nhấn "Thêm từ" để bắt đầu.</p>
              )}

              {editContent.vocabulary.map((item, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/50">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">Từ #{idx + 1}</span>
                    <button onClick={() => removeVocab(idx)} className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { label: "Tiếng Đức", field: "de" as const },
                      { label: "Phiên âm", field: "pronunciation" as const },
                      { label: "Tiếng Việt", field: "vi" as const },
                    ] as { label: string; field: keyof VocabItem }[]).map(({ label, field }) => (
                      <div key={field} className={field === "vi" ? "col-span-2" : ""}>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">{label}</label>
                        <input
                          type="text"
                          value={item[field]}
                          onChange={(e) => updateVocab(idx, field, e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white"
                        />
                      </div>
                    ))}
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Ví dụ (DE)</label>
                      <input
                        type="text"
                        value={item.exampleDe}
                        onChange={(e) => updateVocab(idx, "exampleDe", e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Ví dụ (VI)</label>
                      <input
                        type="text"
                        value={item.exampleVi}
                        onChange={(e) => updateVocab(idx, "exampleVi", e.target.value)}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 bg-white"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Grammar */}
            <div className="space-y-3 border-t border-slate-100 pt-5">
              <h4 className="text-sm font-display font-bold text-slate-700">Ngữ pháp then chốt</h4>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tiêu đề ngữ pháp</label>
                <input
                  type="text"
                  value={editContent.grammar.title}
                  onChange={(e) => setEditContent(prev => prev ? { ...prev, grammar: { ...prev.grammar, title: e.target.value } } : prev)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Quy tắc</label>
                <textarea
                  rows={3}
                  value={editContent.grammar.rule}
                  onChange={(e) => setEditContent(prev => prev ? { ...prev, grammar: { ...prev.grammar, rule: e.target.value } } : prev)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-600">Ví dụ ({editContent.grammar.examples.length})</label>
                  <button
                    onClick={addGrammarExample}
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm ví dụ
                  </button>
                </div>
                {editContent.grammar.examples.map((ex, idx) => (
                  <div key={idx} className="flex gap-2 items-start border border-slate-200 rounded-xl p-2.5 bg-slate-50/50">
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Tiếng Đức</label>
                        <input
                          type="text"
                          value={ex.de}
                          onChange={(e) => updateGrammarExample(idx, "de", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 mb-0.5">Tiếng Việt</label>
                        <input
                          type="text"
                          value={ex.vi}
                          onChange={(e) => updateGrammarExample(idx, "vi", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 bg-white"
                        />
                      </div>
                    </div>
                    <button onClick={() => removeGrammarExample(idx)} className="mt-4 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors shrink-0">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <Button variant="secondary" className="flex-1" onClick={() => setEditContent(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveContent}>Lưu từ vựng & ngữ pháp</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
