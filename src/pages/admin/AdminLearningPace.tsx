import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '../../components/DesignSystem';
import { supabase } from '../../lib/supabase';
import { summarizeLearningPace, type LearningPaceReport } from '../../lib/adminLearningPace';

const BADGES = {
  ahead: { label:'Nhanh hơn kế hoạch', className:'bg-blue-50 text-blue-700' },
  on_track: { label:'Đúng tiến độ', className:'bg-green-50 text-green-700' },
  attention: { label:'Cần chú ý', className:'bg-amber-50 text-amber-700' },
  behind: { label:'Chậm tiến độ', className:'bg-red-50 text-red-700' },
};
const percent = (value:number) => value.toLocaleString('vi-VN',{maximumFractionDigits:1});

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
  const badge = summary ? BADGES[summary.status] : null;
  return <section aria-label="Tốc độ học theo kế hoạch" aria-busy={loading} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-bold text-slate-800">Tốc độ học theo kế hoạch</h4><Button size="sm" variant="ghost" disabled={loading} onClick={() => setReload(value => value+1)}>Tải lại</Button></div>
    {loading ? <p role="status" className="flex items-center gap-2 text-sm text-slate-500"><Loader2 size={15} className="animate-spin" />Đang tính tiến độ…</p> : error ? <p role="alert" className="text-sm text-red-600">{error}</p> : summary && badge ? <>
      <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${badge.className}`}>{badge.label}</span><span className="text-xs text-slate-500">{report?.level_id} · Ngày báo cáo: {report?.report_date ? new Date(report.report_date).toLocaleDateString('vi-VN') : '—'}</span></div>
      <dl className="grid grid-cols-2 gap-3 text-sm"><div><dt className="text-slate-500">Tiến độ thực tế</dt><dd className="font-bold text-slate-800">{percent(summary.actual)}%</dd></div><div><dt className="text-slate-500">Tiến độ kỳ vọng</dt><dd className="font-bold text-slate-800">{percent(summary.expected)}%</dd></div></dl>
      <p className="text-xs text-slate-600">{report?.completed_required_lessons}/{report?.total_required_lessons} bài hoàn thành ở level hiện tại. {summary.difference === 0 ? 'Đang bằng kế hoạch.' : `${summary.difference > 0 ? 'Nhanh' : 'Chậm'} hơn kế hoạch ${Math.abs(summary.difference) < 0.1 ? '<0,1' : percent(Math.abs(summary.difference))} điểm phần trăm.`}</p>
      <p className="text-[11px] text-slate-500">Dùng cùng mốc bắt đầu, ngày hoàn tất dự kiến và cách tính với Dashboard học viên. Chậm dưới 5 điểm: đúng tiến độ; từ 5 đến dưới 10 điểm: cần chú ý; từ 10 điểm: chậm tiến độ.</p>
    </> : <p className="text-sm text-slate-500">Chưa đủ dữ liệu để đánh giá nhanh/chậm. Cần cấp độ đã mở và kế hoạch học hợp lệ.</p>}
  </section>;
};
