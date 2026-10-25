import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '../../components/DesignSystem';
import { SpeakingAudio } from '../../components/SpeakingAudio';
import { supabase } from '../../lib/supabase';
import { type SpeakingSubmission } from '../../lib/speaking';

interface SpeakingRow extends SpeakingSubmission {
  lessons: { title_vi: string } | null;
  profiles: { email: string; full_name: string | null } | null;
}

export function AdminSpeakingSection() {
  const [rows, setRows] = useState<SpeakingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [grading, setGrading] = useState<SpeakingRow | null>(null);
  const [score, setScore] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const fetchRows = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('speaking_submissions')
      .select('*, lessons(title_vi), profiles(email, full_name)').order('submitted_at', { ascending: false });
    setRows((data ?? []) as SpeakingRow[]);
    setError(error?.message ?? null);
    setLoading(false);
  }, []);
  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const save = async () => {
    if (!grading || saving) return;
    const parsed = Number(score);
    if (!score.trim() || !Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      setError('Điểm phải là số nguyên từ 0 đến 100.'); return;
    }
    setSaving(true);
    setError(null);
    try {
      const { data, error } = await supabase.from('speaking_submissions')
        .update({ score: parsed, comment: comment.trim() || null, graded_at: new Date().toISOString() })
        .eq('id', grading.id).select('id').single();
      if (error) throw error;
      if (!data) throw new Error('Không lưu được điểm.');
      setGrading(null);
      await fetchRows();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Lưu điểm thất bại.');
    } finally { setSaving(false); }
  };

  return <div className="space-y-5">
    <h1 className="text-xl font-bold text-slate-900">Chấm bài nói</h1>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {loading ? <p>Đang tải bài nói…</p> : rows.length === 0 ? <p>Chưa có bài nói nào được nộp.</p> :
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white"><table className="w-full text-sm">
        <thead><tr className="text-left bg-slate-50"><th className="p-3">Học viên</th><th className="p-3">Bài học</th><th className="p-3">Nộp lúc</th><th className="p-3">Lần nộp</th><th className="p-3">Trạng thái</th><th className="p-3">Chấm điểm</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const attemptNumber = rows.slice(index).filter(r => r.user_id === row.user_id && r.lesson_id === row.lesson_id).length;
          return <tr key={row.id} className="border-t border-slate-100">
            <td className="p-3">{row.profiles?.full_name || row.profiles?.email || row.user_id}</td>
            <td className="p-3">{row.lessons?.title_vi ?? row.lesson_id}</td>
            <td className="p-3">{new Date(row.submitted_at).toLocaleString('vi-VN')}</td>
            <td className="p-3">{attemptNumber}/2</td>
            <td className="p-3">{row.graded_at ? `Đã chấm (${row.score}/100)` : 'Chưa chấm'}</td>
            <td className="p-3"><button className="font-bold text-orange-600" onClick={() => {
              setGrading(row); setScore(row.score === null ? '' : String(row.score)); setComment(row.comment ?? ''); setError(null);
            }}>{row.graded_at ? 'Sửa điểm' : 'Chấm điểm'}</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    {grading && <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="speaking-grade-title" className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
        <h2 id="speaking-grade-title" className="font-bold">Chấm bài nói — {grading.profiles?.full_name || grading.profiles?.email}</h2>
        <p className="text-sm break-all">{grading.file_name}</p>
        <SpeakingAudio objectKey={grading.object_key} />
        {grading.note && <p className="text-sm whitespace-pre-wrap">Lời nhắn: {grading.note}</p>}
        <label htmlFor="speaking-score" className="block text-sm font-bold">Điểm (0–100)</label>
        <input id="speaking-score" type="number" min={0} max={100} step={1} value={score} disabled={saving} onChange={e => setScore(e.target.value)} className="w-full border rounded-xl p-3" />
        <label htmlFor="speaking-feedback" className="block text-sm font-bold">Nhận xét</label>
        <textarea id="speaking-feedback" rows={4} maxLength={10000} value={comment} disabled={saving} onChange={e => setComment(e.target.value)} className="w-full border rounded-xl p-3" />
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-3"><Button variant="secondary" disabled={saving} onClick={() => setGrading(null)}>Hủy</Button>
          <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu điểm'}</Button></div>
      </div>
    </div>}
  </div>;
}
