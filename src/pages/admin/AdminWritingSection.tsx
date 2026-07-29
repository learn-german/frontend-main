import React, { useState, useEffect, useMemo } from "react";
import { Loader2, X, ChevronDown, ChevronRight } from "lucide-react";
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

interface WritingGroup {
  key: string;
  latest: WritingSubmissionRow;      // newest attempt — the one admin grades
  earlier: WritingSubmissionRow[];   // older attempts, read-only, newest-first
  attempts: WritingSubmissionRow[];  // every attempt, newest-first
  attemptCount: number;
}

const CONTENT_PREVIEW_LENGTH = 180;

export const AdminWritingSection: React.FC = () => {
  const [rows, setRows] = useState<WritingSubmissionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [grading, setGrading] = useState<WritingGroup | null>(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [expandedSubmissionIds, setExpandedSubmissionIds] = useState<Set<string>>(new Set());

  const toggleInSet = (
    setState: React.Dispatch<React.SetStateAction<Set<string>>>,
    value: string,
  ) => {
    setState((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  };

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

  // rows are newest-first; group by (user_id, lesson_id), first seen = latest.
  const groups = useMemo<WritingGroup[]>(() => {
    const map = new Map<string, WritingSubmissionRow[]>();
    for (const r of rows) {
      const k = `${r.user_id}::${r.lesson_id}`;
      const arr = map.get(k);
      if (arr) arr.push(r); else map.set(k, [r]);
    }
    return Array.from(map.entries()).map(([key, list]) => ({
      key,
      latest: list[0],
      earlier: list.slice(1),
      attempts: list,
      attemptCount: list.length,
    }));
  }, [rows]);

  const openGrade = (g: WritingGroup) => {
    setGrading(g);
    setScore(g.latest.score !== null ? String(g.latest.score) : "");
    setComment(g.latest.comment ?? "");
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
      .eq("id", grading.latest.id);
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
              <th className="px-4 py-2.5">Lần nộp</th>
              <th className="px-4 py-2.5">Trạng thái</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((g) => {
              const isExpanded = expandedKeys.has(g.key);
              return (
                <React.Fragment key={g.key}>
                  <tr
                    className="hover:bg-slate-50/50 cursor-pointer"
                    onClick={() => toggleInSet(setExpandedKeys, g.key)}
                  >
                    <td className="px-4 py-2.5 text-slate-700">
                      <span className="flex items-center gap-1.5">
                        {isExpanded ? (
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        {g.latest.profiles?.full_name || g.latest.profiles?.email || g.latest.user_id}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-700">{g.latest.lessons?.title_vi ?? g.latest.lesson_id}</td>
                    <td className="px-4 py-2.5 text-slate-500">{new Date(g.latest.submitted_at).toLocaleString("vi-VN")}</td>
                    <td className="px-4 py-2.5 text-slate-500">{g.attemptCount}/6</td>
                    <td className="px-4 py-2.5">
                      {g.latest.graded_at ? (
                        <span className="text-xs font-bold text-emerald-600">Đã chấm ({g.latest.score}/100)</span>
                      ) : (
                        <span className="text-xs font-bold text-amber-600">Chưa chấm</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={(e) => { e.stopPropagation(); openGrade(g); }}
                        className="text-xs font-bold text-orange-600 hover:text-orange-700"
                      >
                        {g.latest.graded_at ? "Sửa điểm" : "Chấm điểm"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50/60">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="space-y-2">
                          <h3 className="text-[11px] font-display font-bold text-slate-500 uppercase tracking-wider">
                            Lịch sử nộp bài ({g.attemptCount} lần)
                          </h3>
                          {g.attempts.map((attempt, index) => {
                            const attemptNumber = g.attemptCount - index;
                            const isContentExpanded = expandedSubmissionIds.has(attempt.id);
                            const isTruncatable = attempt.content.length > CONTENT_PREVIEW_LENGTH;
                            return (
                              <div key={attempt.id} className="bg-white border border-slate-200 rounded-xl p-3 space-y-1.5">
                                <div className="flex items-center justify-between gap-3">
                                  <span className="text-[11px] font-bold text-slate-600">Lần {attemptNumber}</span>
                                  <span className="text-[11px] text-slate-400">
                                    {new Date(attempt.submitted_at).toLocaleString("vi-VN")}
                                  </span>
                                  <span className="ml-auto text-[11px] font-bold">
                                    {attempt.graded_at ? (
                                      <span className="text-emerald-600">{attempt.score}/100</span>
                                    ) : (
                                      <span className="text-amber-600">Chưa chấm</span>
                                    )}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleInSet(setExpandedSubmissionIds, attempt.id)}
                                  className="w-full text-left"
                                >
                                  <p className="text-xs text-slate-700 whitespace-pre-wrap font-sans">
                                    {isContentExpanded || !isTruncatable
                                      ? attempt.content
                                      : `${attempt.content.slice(0, CONTENT_PREVIEW_LENGTH)}…`}
                                  </p>
                                  {isTruncatable && (
                                    <span className="text-[11px] font-bold text-orange-600 hover:text-orange-700">
                                      {isContentExpanded ? "Thu gọn" : "Xem toàn bộ bài viết"}
                                    </span>
                                  )}
                                </button>
                                <p className="text-xs text-slate-500">
                                  <span className="font-bold">Nhận xét:</span>{" "}
                                  {attempt.comment?.trim() ? attempt.comment : "Chưa có nhận xét."}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
            {groups.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-slate-400 text-sm">Chưa có bài viết nào được nộp.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {grading && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-display font-extrabold text-slate-900">Chấm bài viết — lần {grading.attemptCount}</h2>
              <button onClick={() => setGrading(null)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-700 whitespace-pre-wrap max-h-64 overflow-y-auto font-sans">
              {grading.latest.content}
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

            {grading.earlier.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Các lần nộp trước (chỉ xem)</h3>
                {grading.earlier.map((e, i) => (
                  <div key={e.id} className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-500">Lần {grading.earlier.length - i}</span>
                      <span className="text-[11px] text-slate-400">{new Date(e.submitted_at).toLocaleString("vi-VN")}</span>
                    </div>
                    <p className="text-xs text-slate-600 whitespace-pre-wrap font-sans">{e.content}</p>
                  </div>
                ))}
              </div>
            )}

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
