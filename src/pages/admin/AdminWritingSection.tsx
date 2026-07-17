import React, { useState, useEffect } from "react";
import { Loader2, X } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";

interface WritingSubmissionRow {
  id: string;
  lesson_id: string;
  user_id: string;
  content: string;
  score: number | null;
  comment: string | null;
  graded_at: string | null;
  submitted_at: string;
  lessons: { title_vi: string } | null;
  profiles: { email: string; full_name: string | null } | null;
}

export const AdminWritingSection: React.FC = () => {
  const [rows, setRows] = useState<WritingSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<WritingSubmissionRow | null>(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchRows = () => {
    setLoading(true);
    supabase
      .from("writing_submissions")
      .select("id, lesson_id, user_id, content, score, comment, graded_at, submitted_at, lessons(title_vi), profiles(email, full_name)")
      .order("submitted_at", { ascending: false })
      .then(({ data }) => {
        setRows((data ?? []) as unknown as WritingSubmissionRow[]);
        setLoading(false);
      });
  };

  useEffect(() => { fetchRows(); }, []);

  const openGrade = (row: WritingSubmissionRow) => {
    setGrading(row);
    setScore(row.score !== null ? String(row.score) : "");
    setComment(row.comment ?? "");
  };

  const handleSaveGrade = async () => {
    if (!grading) return;
    const parsedScore = parseInt(score, 10);
    if (Number.isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
      showToast("Điểm phải là số từ 0 đến 100.", "warning");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("writing_submissions")
      .update({ score: parsedScore, comment: comment || null, graded_at: new Date().toISOString() })
      .eq("id", grading.id);
    setSaving(false);
    if (error) {
      showToast("Lưu điểm thất bại: " + error.message, "warning");
    } else {
      showToast("Đã lưu điểm.", "success");
      setGrading(null);
      fetchRows();
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-display font-extrabold text-slate-900">Chấm bài viết</h1>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-display font-bold text-slate-500 uppercase tracking-wider">
              <th className="px-4 py-2.5">Học viên</th>
              <th className="px-4 py-2.5">Bài học</th>
              <th className="px-4 py-2.5">Nộp lúc</th>
              <th className="px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/50">
                <td className="px-4 py-2.5 text-slate-700">{row.profiles?.full_name || row.profiles?.email || row.user_id}</td>
                <td className="px-4 py-2.5 text-slate-700">{row.lessons?.title_vi ?? row.lesson_id}</td>
                <td className="px-4 py-2.5 text-slate-500">{new Date(row.submitted_at).toLocaleString("vi-VN")}</td>
                <td className="px-4 py-2.5">
                  {row.graded_at ? (
                    <span className="text-xs font-bold text-emerald-600">Đã chấm ({row.score}/100)</span>
                  ) : (
                    <span className="text-xs font-bold text-amber-600">Chưa chấm</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button onClick={() => openGrade(row)} className="text-xs font-bold text-orange-600 hover:text-orange-700">
                    {row.graded_at ? "Sửa điểm" : "Chấm điểm"}
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-slate-400 text-sm">Chưa có bài viết nào được nộp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grading && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-extrabold text-slate-900">Chấm bài viết</h2>
              <button onClick={() => setGrading(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans">
              {grading.content}
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Điểm (0-100)</label>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(e) => setScore(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-1">Nhận xét</label>
              <textarea
                rows={4}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 resize-none"
                placeholder="Nhận xét cho học viên (không bắt buộc)..."
              />
            </div>
            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setGrading(null)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSaveGrade} disabled={saving}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                Lưu điểm
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
