import React, { useEffect, useRef, useState } from 'react';
import { Button } from './DesignSystem';
import { MarkdownBlock } from './MarkdownBlock';
import { SpeakingAudio } from './SpeakingAudio';
import { supabase } from '../lib/supabase';
import { SPEAKING_BUCKET, MAX_SPEAKING_ATTEMPTS, speakingContentType, validateSpeakingFile, type SpeakingSubmission } from '../lib/speaking';

export function SpeakingTabPanel({ lessonId, userId, promptMd }: { lessonId: string; userId: string | null; promptMd: string }) {
  const [attempts, setAttempts] = useState<SpeakingSubmission[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadFailed(false);
    setAttempts([]);
    setFile(null);
    setNote('');
    if (!userId) { setLoading(false); return; }
    supabase.from('speaking_submissions').select('*').eq('lesson_id', lessonId).eq('user_id', userId)
      .order('submitted_at', { ascending: false }).then(({ data, error }) => {
        if (active) {
          setAttempts((data ?? []) as SpeakingSubmission[]);
          setLoadFailed(!!error);
          setError(error ? "Không tải được bài nộp. Vui lòng thử lại sau." : null);
          setLoading(false);
        }
      });
    return () => { active = false; };
  }, [lessonId, userId, reload]);

  const submit = async () => {
    if (!file || !userId || submitting.current || loading || attempts.length >= MAX_SPEAKING_ATTEMPTS) return;
    const validation = validateSpeakingFile(file);
    if (validation) { setError(validation); return; }
    submitting.current = true;
    setSaving(true);
    setError(null);
    const ext = file.name.split('.').pop()!.toLowerCase();
    const objectKey = `${userId}/${crypto.randomUUID()}.${ext}`;
    let uploaded = false;
    try {
      const { error: uploadError } = await supabase.storage.from(SPEAKING_BUCKET)
        .upload(objectKey, file, { contentType: speakingContentType(file.name), upsert: false });
      if (uploadError) throw uploadError;
      uploaded = true;
      const { error: insertError } = await supabase.from('speaking_submissions').insert({
        lesson_id: lessonId, user_id: userId, object_key: objectKey, file_name: file.name, note: note.trim() || null,
      });
      if (insertError) throw insertError;
      if (input.current) input.current.value = '';
      setReload(v => v + 1);
    } catch (err) {
      let message = err instanceof Error ? err.message : (err as { message?: string })?.message ?? 'Nộp bài thất bại.';
      if (message.includes('speaking attempt limit')) message = 'Bạn đã dùng hết 2 lần nộp bài nói này.';
      if (uploaded) {
        const { error: cleanupError } = await supabase.storage.from(SPEAKING_BUCKET).remove([objectKey]);
        if (cleanupError) message += ' Không dọn được file upload chưa nộp.';
      }
      setError(message);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return <div className="space-y-5">
    <h3 className="font-bold text-slate-900">Bài tập nói</h3>
    <MarkdownBlock content={promptMd} lessonId={lessonId} />
    {loading ? <p>Đang tải bài nộp…</p> : loadFailed ? <Button variant="secondary" onClick={() => setReload(v => v + 1)}>Thử lại</Button> : <>
      <p className="text-xs text-slate-500">Đã nộp {attempts.length}/2 lần. Chỉ bạn và giáo viên xem được bài nộp.</p>
      {userId && attempts.length < MAX_SPEAKING_ATTEMPTS && <div className="space-y-3 border border-slate-200 rounded-xl p-4">
        <label htmlFor="speaking-file" className="block text-sm font-bold">Tải file bài nói lên</label>
        <input ref={input} id="speaking-file" type="file" accept=".mp3,.m4a,.wav,.webm,.ogg" disabled={saving}
          onChange={e => { const next = e.target.files?.[0] ?? null; setFile(next); setError(next ? validateSpeakingFile(next) : null); }} className="w-full text-sm" />
        <p className="text-xs text-slate-500">MP3, M4A, WAV, WEBM, OGG · Tối đa 25 MB · Tối đa 2 lần nộp.</p>
        <label htmlFor="speaking-note" className="block text-sm font-bold">Lời nhắn cho giáo viên (không bắt buộc)</label>
        <textarea id="speaking-note" maxLength={2000} value={note} disabled={saving} onChange={e => setNote(e.target.value)} rows={3} className="w-full border border-slate-200 rounded-xl p-3 text-sm" />
        <Button variant="primary" onClick={submit} disabled={saving || !file || !!validateSpeakingFile(file)}> {saving ? 'Đang nộp…' : 'Nộp bài nói'}</Button>
      </div>}
      {attempts.length >= MAX_SPEAKING_ATTEMPTS && <p className="text-sm text-slate-600">Bạn đã dùng hết 2 lần nộp bài nói này.</p>}
      {attempts.map((attempt, index) => <div key={attempt.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-bold">Lần {attempts.length - index} · {new Date(attempt.submitted_at).toLocaleString('vi-VN')}</p>
        <p className="text-xs text-slate-500 break-all">{attempt.file_name}</p>
        <SpeakingAudio objectKey={attempt.object_key} />
        {attempt.note && <p className="text-sm whitespace-pre-wrap">Lời nhắn: {attempt.note}</p>}
        <p className="text-sm font-bold">{attempt.graded_at ? `Điểm: ${attempt.score}/100` : 'Chưa chấm'}</p>
        {attempt.comment && <p className="text-sm whitespace-pre-wrap">Nhận xét: {attempt.comment}</p>}
      </div>)}
    </>}
    {error && <p role="alert" className="text-sm text-rose-600">{error}</p>}
  </div>;
}
