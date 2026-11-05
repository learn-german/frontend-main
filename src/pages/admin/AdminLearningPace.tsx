import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/DesignSystem';
import { supabase } from '../../lib/supabase';
import { summarizeLearningPace, type LearningPaceReport } from '../../lib/adminLearningPace';

const formatRate = (value:number) => value.toLocaleString('vi-VN',{maximumFractionDigits:2});

export const AdminLearningPace: React.FC<{userId:string}> = ({userId}) => {
  const [report,setReport] = useState<LearningPaceReport|null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [reload,setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true); setReport(null); setError('');
    supabase.functions.invoke('daily-progress-report',{method:'POST',body:{user_id:userId}})
      .then(({data,error}) => {
        if (!active) return;
        if (error || data?.error || data?.generation_status === 'error') setError('Không tải được tiến độ theo kế hoạch. Vui lòng thử lại.');
        else setReport(data as LearningPaceReport|null);
      }).catch(() => { if(active) setError('Không tải được tiến độ theo kế hoạch. Vui lòng thử lại.'); })
      .finally(() => { if(active) setLoading(false); });
    return () => { active = false; };
  },[userId,reload]);
  const summary = summarizeLearningPace(report);
  return <section aria-label="Khối lượng bài học theo hạn gói" aria-busy={loading} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-800">Khối lượng cần học</h4><Button size="sm" variant="ghost" disabled={loading} onClick={() => setReload(value => value+1)}>Tải lại</Button></div>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />Đang tính số bài cần học…</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : summary ? <>
      <p className="text-xs text-slate-500">{summary.levels.join(' + ')} · Ngày báo cáo: {report?.report_date ? new Date(report.report_date).toLocaleDateString('vi-VN') : '—'}</p>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Đã hoàn thành</dt><dd className="font-bold text-slate-800">{summary.completed_lessons}/{summary.total_lessons} bài</dd></div><div><dt className="text-slate-500">Bài còn lại{summary.missing_levels.length ? ' (đã có nội dung)' : ''}</dt><dd className="font-bold text-slate-800">{summary.remaining_lessons} bài</dd></div><div><dt className="text-slate-500">Gói học còn lại</dt><dd className="font-bold text-slate-800">{summary.remaining_days === null ? 'Chưa có hạn gói' : `${summary.remaining_days} ngày`}</dd></div><div><dt className="text-slate-500">Ngày hết hạn</dt><dd className="font-bold text-slate-800">{summary.deadline_date ? new Date(summary.deadline_date).toLocaleDateString('vi-VN') : '—'}</dd></div></dl>
      {summary.state === 'missing_levels' ? <p role="status" className="text-sm text-amber-700">Chưa có bài học đã xuất bản cho {summary.missing_levels.join(', ')}. Chưa đủ dữ liệu để tính mục tiêu của toàn khóa.</p> : summary.state === 'complete' ? <p className="text-sm font-semibold text-green-700">Đã hoàn thành toàn bộ bài học ở các level đã mở.</p> : summary.state === 'expired' ? <p className="text-sm text-red-600">Gói đã hết hạn, còn {summary.remaining_lessons} bài chưa hoàn thành. Chưa tính mục tiêu bài/ngày khi chưa có thời hạn học mới.</p> : summary.state === 'no_deadline' ? <p className="text-sm text-slate-500">Chưa có ngày hết hạn gói để tính số bài cần học mỗi ngày.</p> : <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800"><p>{summary.remaining_lessons} bài ÷ {summary.remaining_days} ngày ≈ <b>{formatRate(summary.lessons_per_day!)} bài/ngày</b>.</p><p className="mt-1">Mục tiêu làm tròn lên: <b>{summary.daily_lesson_target} bài/ngày</b> để hoàn thành trước khi hết hạn gói.</p></div>}
      <p className="text-[11px] text-slate-500">Cộng bài học đã xuất bản của tất cả level đã mở, trừ bài đã hoàn thành, rồi chia số ngày gói học còn lại.</p>
    </> : <p className="text-sm text-slate-500">Chưa đủ dữ liệu để tính khối lượng bài học của các level đã mở.</p>}
  </section>;
};
