import React, { useState, useEffect } from "react";
import { Loader2, Pencil, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: string;
  question_text: string;
  correct_answer: string;
  explanation: string | null;
  order_index: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  questions: QuizQuestion[];
}

export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [editQ, setEditQ] = useState<QuizQuestion | null>(null);

  const fetchQuestions = async () => {
    const [questionsRes, lessonsRes] = await Promise.all([
      supabase.from("quiz_questions").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
    ]);

    const lessonMap = new Map(
      (lessonsRes.data ?? []).map((l) => [
        l.id,
        {
          lesson_title: l.title_vi,
          module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
        },
      ]),
    );

    const grouped: Record<string, LessonGroup> = {};
    for (const q of questionsRes.data ?? []) {
      if (!grouped[q.lesson_id]) {
        const meta = lessonMap.get(q.lesson_id) ?? { lesson_title: q.lesson_id, module_title: "" };
        grouped[q.lesson_id] = { lesson_id: q.lesson_id, ...meta, questions: [] };
      }
      grouped[q.lesson_id].questions.push(q as QuizQuestion);
    }

    setGroups(Object.values(grouped));
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, []);

  const handleSaveQuestion = async () => {
    if (!editQ) return;
    const { error } = await supabase
      .from("quiz_questions")
      .update({
        question_text: editQ.question_text,
        correct_answer: editQ.correct_answer,
        explanation: editQ.explanation,
      })
      .eq("id", editQ.id);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast("Đã cập nhật câu hỏi.", "success");
      setEditQ(null);
      fetchQuestions();
    }
  };

  const TYPE_LABELS: Record<string, string> = {
    "multiple-choice": "Trắc nghiệm",
    "fill-blank": "Điền chỗ trống",
    "matching": "Ghép đôi",
    "listening": "Nghe hiểu",
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
      <h1 className="text-xl font-display font-black text-slate-900">Quản lý Quiz</h1>

      <div className="space-y-3">
        {groups.map((group) => (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">{group.module_title} · {group.questions.length} câu hỏi</p>
              </div>
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">#</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Loại</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
                      <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Đáp án đúng</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {group.questions.map((q) => (
                      <tr key={q.id} className="hover:bg-slate-50/50">
                        <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
                        <td className="px-4 py-2.5">
                          <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 uppercase">
                            {TYPE_LABELS[q.type] ?? q.type}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{q.question_text}</td>
                        <td className="px-4 py-2.5 text-green-700 font-mono text-xs max-w-xs truncate">{q.correct_answer}</td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => setEditQ(q)}
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

      {/* Edit question modal */}
      {editQ && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-lg space-y-4">
            <h3 className="font-display font-bold text-slate-900">Chỉnh sửa câu hỏi</h3>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Câu hỏi</label>
              <textarea
                rows={3}
                value={editQ.question_text}
                onChange={(e) => setEditQ((prev) => prev ? { ...prev, question_text: e.target.value } : prev)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Đáp án đúng</label>
              <input
                type="text"
                value={editQ.correct_answer}
                onChange={(e) => setEditQ((prev) => prev ? { ...prev, correct_answer: e.target.value } : prev)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Giải thích</label>
              <textarea
                rows={3}
                value={editQ.explanation ?? ""}
                onChange={(e) => setEditQ((prev) => prev ? { ...prev, explanation: e.target.value } : prev)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setEditQ(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveQuestion}>Lưu thay đổi</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
