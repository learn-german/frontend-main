import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../../components/DesignSystem';
import { SpeakingAudio } from '../../components/SpeakingAudio';
import { supabase } from '../../lib/supabase';
import { type SpeakingSubmission } from '../../lib/speaking';
import { saveSpeakingFeedback, validateSpeakingFeedbackFile } from '../../lib/speakingFeedback';

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
  const [feedbackFile, setFeedbackFile] = useState<File | null>(null);
  const [removeAudio, setRemoveAudio] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [history, setHistory] = useState<SpeakingRow | null>(null);
  const feedbackInput = useRef<HTMLInputElement>(null);
  const savingRef = useRef(false);
  useEffect(() => {
    if (!feedbackFile) { setPreview(null); return; }
    const url = URL.createObjectURL(feedbackFile);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [feedbackFile]);
  const openGrade = (row: SpeakingRow) => {
    setGrading(row); setScore(row.score === null ? '' : String(row.score)); setComment(row.comment ?? '');
    setFeedbackFile(null); setRemoveAudio(false); setError(null); setWarning(null); setHistory(null);
  };
  const closeGrade = () => { setGrading(null); setFeedbackFile(null); setRemoveAudio(false); setError(null); };

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
    if (!grading || savingRef.current) return;
    const parsed = Number(score);
    if (!score.trim() || !Number.isInteger(parsed) || parsed < 0 || parsed > 100) {
      setError('Điểm phải là số nguyên từ 0 đến 100.'); return;
    }
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const cleanupWarning = await saveSpeakingFeedback(supabase, grading, parsed, comment, feedbackFile, removeAudio);
      closeGrade();
      setWarning(cleanupWarning);
      await fetchRows();
    } catch (err) {
      setError((err as { message?: string })?.message ?? 'Lưu điểm thất bại.');
    } finally { savingRef.current = false; setSaving(false); }
  };

  return <div className="space-y-5">
    <h1 className="text-xl font-bold text-slate-900">Chấm bài nói</h1>
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
    {warning && <p role="status" className="text-sm text-amber-700">{warning}</p>}
    {loading ? <p>Đang tải bài nói…</p> : rows.length === 0 ? <p>Chưa có bài nói nào được nộp.</p> :
      <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white"><table className="w-full text-sm">
        <thead><tr className="text-left bg-slate-50"><th className="p-3">Học viên</th><th className="p-3">Bài học</th><th className="p-3">Nộp lúc</th><th className="p-3">Lần nộp</th><th className="p-3">Trạng thái</th><th className="p-3">Chấm điểm</th></tr></thead>
        <tbody>{rows.map((row, index) => {
          const attemptNumber = rows.slice(index).filter(r => r.user_id === row.user_id && r.lesson_id === row.lesson_id).length;
          return <tr key={row.id} className="border-t border-slate-100">
            <td className="p-3"><button className="font-bold text-orange-600 text-left" onClick={() => setHistory(row)}>{row.profiles?.full_name || row.profiles?.email || row.user_id}</button></td>
            <td className="p-3">{row.lessons?.title_vi ?? row.lesson_id}</td>
            <td className="p-3">{new Date(row.submitted_at).toLocaleString('vi-VN')}</td>
            <td className="p-3">{attemptNumber}/2</td>
            <td className="p-3">{row.graded_at ? `Đã chấm (${row.score}/100)` : 'Chưa chấm'}</td>
            <td className="p-3"><button className="font-bold text-orange-600" onClick={() => openGrade(row)}>{row.graded_at ? 'Sửa điểm' : 'Chấm điểm'}</button></td>
          </tr>;
        })}</tbody>
      </table></div>}
    {history && <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="speaking-history-title" className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
        <h2 id="speaking-history-title" className="font-bold">Lịch sử bài nói — {history.profiles?.full_name || history.profiles?.email}</h2>
        {rows.filter(row => row.user_id === history.user_id).map(row => <div key={row.id} className="border rounded-xl p-3 space-y-2">
          <p className="font-bold">{row.lessons?.title_vi ?? row.lesson_id} · Lần {rows.slice(rows.indexOf(row)).filter(r => r.user_id === row.user_id && r.lesson_id === row.lesson_id).length}/2</p>
          <p className="text-sm">{new Date(row.submitted_at).toLocaleString('vi-VN')} · {row.graded_at ? `${row.score}/100` : 'Chưa chấm'}</p>
          <p className="text-sm break-all">Bài nói đã nộp: {row.file_name}</p><SpeakingAudio objectKey={row.object_key} />
          {row.comment && <p className="text-sm whitespace-pre-wrap">Nhận xét: {row.comment}</p>}
          {row.feedback_object_key && <><p className="text-sm break-all">File ghi âm phản hồi: {row.feedback_file_name}</p><SpeakingAudio objectKey={row.feedback_object_key} label="File ghi âm phản hồi" /></>}
          <Button variant="secondary" onClick={() => openGrade(row)}>{row.graded_at ? 'Sửa điểm' : 'Chấm điểm'}</Button>
        </div>)}
        <Button variant="secondary" onClick={() => setHistory(null)}>Đóng</Button>
      </div>
    </div>}
    {grading && <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
      <div role="dialog" aria-modal="true" aria-labelledby="speaking-grade-title" className="bg-white rounded-2xl p-6 w-full max-w-xl space-y-4 max-h-[85vh] overflow-y-auto">
        <h2 id="speaking-grade-title" className="font-bold">Chấm bài nói — {grading.profiles?.full_name || grading.profiles?.email}</h2>
        <p className="text-sm break-all">Bài nói đã nộp: {grading.file_name}</p>
        <SpeakingAudio objectKey={grading.object_key} />
        {grading.note && <p className="text-sm whitespace-pre-wrap">Lời nhắn: {grading.note}</p>}
        <label htmlFor="speaking-score" className="block text-sm font-bold">Điểm (0–100)</label>
        <input id="speaking-score" type="number" min={0} max={100} step={1} value={score} disabled={saving} onChange={e => setScore(e.target.value)} className="w-full border rounded-xl p-3" />
        <label htmlFor="speaking-feedback" className="block text-sm font-bold">Nhận xét</label>
        <textarea id="speaking-feedback" rows={4} maxLength={10000} value={comment} disabled={saving} onChange={e => setComment(e.target.value)} className="w-full border rounded-xl p-3" />
        <label htmlFor="speaking-feedback-file" className="block text-sm font-bold">File ghi âm phản hồi (không bắt buộc)</label>
        <input ref={feedbackInput} id="speaking-feedback-file" type="file" accept=".mp3,.m4a,.wav,.webm,.ogg" className="sr-only" disabled={saving}
          onChange={e => {
            const next = e.target.files?.[0]; if (!next) return;
            const validation = validateSpeakingFeedbackFile(next); setError(validation);
            if (!validation) { setFeedbackFile(next); setRemoveAudio(false); }
            e.target.value = '';
          }} />
        <button type="button" className="rounded-xl bg-rose-600 text-white px-4 py-2 font-bold disabled:opacity-50" disabled={saving} onClick={() => feedbackInput.current?.click()}>{feedbackFile || (!removeAudio && grading.feedback_object_key) ? 'Đổi file âm thanh' : 'Chọn file âm thanh'}</button>
        <p className="text-xs text-slate-500">MP3, M4A, WAV, WEBM, OGG · Tối đa 25 MB.</p>
        {(feedbackFile || (!removeAudio && grading.feedback_object_key)) && <div className="space-y-2">
          <p className="text-sm break-all">{feedbackFile?.name ?? grading.feedback_file_name}</p>
          {preview && feedbackFile ? <audio controls src={preview} className="w-full" aria-label="Nghe thử file phản hồi" onError={() => setError('Không phát được file phản hồi. Hãy chọn file âm thanh khác.')} />
            : !feedbackFile && grading.feedback_object_key && <SpeakingAudio objectKey={grading.feedback_object_key} label="File ghi âm phản hồi" />}
          <button type="button" className="text-sm text-rose-600 font-bold" disabled={saving} onClick={() => { setFeedbackFile(null); setRemoveAudio(true); }}>Bỏ file</button>
        </div>}
        {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
        <div className="flex gap-3"><Button variant="secondary" disabled={saving} onClick={closeGrade}>Hủy</Button>
          <Button variant="primary" disabled={saving} onClick={save}>{saving ? 'Đang lưu…' : 'Lưu điểm'}</Button></div>
      </div>
    </div>}
  </div>;
}
