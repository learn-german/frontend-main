import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { Button } from '../components/DesignSystem';
import { loadPracticeCatalog } from '../lib/practiceCatalog';
import { PRACTICE_CATEGORIES, practiceExerciseSet, practiceLesson, practiceSearchKey, practiceTopicSummary, type PracticeCategory, type PracticeTopic } from '../lib/practice';
import type { Level } from '../lib/appTypes';
import { useExerciseSetAttempts } from '../lib/hooks/useExerciseSetAttempt';
import { useExerciseSetDrafts } from '../lib/hooks/useExerciseSetDrafts';
import { useReadingSetPassageCounts } from '../lib/hooks/useReadingSetPassageCounts';
import { GrammarExerciseSetBody, GRAMMAR_TYPE_LABELS } from './GrammarExercisePage';
import { QuizExerciseSetBody } from './QuizSetListPage';
import { ReadingExerciseSetBody } from './ReadingSetListPage';
import { supabase } from '../lib/supabase';

type HistoryRow = { id:string; set_id:string; score:number; total:number; submitted_at:string };
export const UserPracticePage: React.FC = () => {
  const [topics, setTopics] = useState<PracticeTopic[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [category, setCategory] = useState<PracticeCategory>('nguphap');
  const [level, setLevel] = useState<Level>('A1');
  const [search, setSearch] = useState('');
  const [topicId, setTopicId] = useState<string | null>(null);
  const [setId, setSetId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);
  const setIds = useMemo(() => topics.flatMap(topic => topic.sets.map(set => set.id)), [topics]);
  const { attemptsBySetId, loading: attemptsLoading, updateAttempt } = useExerciseSetAttempts(setIds,historyVersion);
  const { draftSetIds, loading: draftsLoading, markDraftSaved } = useExerciseSetDrafts(setIds);
  const { passageCountBySetId } = useReadingSetPassageCounts(setIds);
  useEffect(() => {
    let active = true;
    loadPracticeCatalog().then(data => { if (active) setTopics(data); }).catch(e => { if (active) setError(e.message ?? 'Không tải được luyện tập.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!setId) return;
    let active = true;
    supabase.from('practice_submission_history').select('id,set_id,score,total,submitted_at').eq('set_id', setId).order('submitted_at', { ascending:false }).then(({data,error}) => { if (active) { setHistory((data ?? []) as HistoryRow[]); if(error) setError(error.message); } });
    return () => { active = false; };
  }, [setId,historyVersion]);
  const topic = topics.find(value => value.topic_id === topicId);
  const row = topic?.sets.find(value => value.id === setId);
  const submitted = new Set(Object.keys(attemptsBySetId).filter(id => attemptsBySetId[id].attemptCount > 0));
  const filtered = topics.filter(value => value.category === category && value.level === level && practiceSearchKey(value.topic_title_vi || value.topic_title).includes(practiceSearchKey(search)));
  const backToTopic = () => { setSetId(null); setHistory([]); setHistoryVersion(previous => previous + 1); };
  const onFinished = () => setHistoryVersion(previous => previous + 1);
  const onAttemptUpdate = (status:{isPassed:boolean;attemptCount:number}) => { if(setId) updateAttempt(setId,status); };
  const onDraftSaved = (hasDraft:boolean) => { if(setId) markDraftSaved(setId,hasDraft); };
  if (loading || (!topicId && (attemptsLoading || draftsLoading))) return <div className="flex min-h-64 items-center justify-center"><Loader2 className="animate-spin text-orange-500" aria-label="Đang tải luyện tập" /></div>;
  return <section className="mx-auto max-w-5xl space-y-6">
    <header><h1 className="text-2xl font-bold">Luyện tập</h1><p className="mt-2 text-sm text-slate-500">Luyện thêm theo chủ đề. Kết quả lưu riêng, không ảnh hưởng XP và tiến độ bài học.</p></header>
    {error && <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}
    {topic ? <>
      <Button variant="ghost" onClick={setId ? backToTopic : () => setTopicId(null)}><ArrowLeft size={16} className="mr-2" />{setId ? 'Quay lại chủ đề' : 'Danh sách chủ đề'}</Button>
      <h2 className="text-xl font-semibold">{topic.topic_title_vi || topic.topic_title}</h2>
      {row ? <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
        <h3 className="mb-4 text-lg font-semibold">{row.title}</h3>
        {topic.category === 'nguphap' ? <GrammarExerciseSetBody practice key={row.id} set={practiceExerciseSet(row)} onSetFinished={onFinished} onCollapse={backToTopic} onAttemptUpdate={onAttemptUpdate} onDraftSaved={onDraftSaved} /> : topic.category === 'nghe' ? <QuizExerciseSetBody practice key={row.id} lesson={practiceLesson(topic)} set={practiceExerciseSet(row)} isListening onSetFinished={onFinished} onCollapse={backToTopic} onAttemptUpdate={onAttemptUpdate} onDraftSaved={onDraftSaved} /> : <ReadingExerciseSetBody practice key={row.id} lesson={practiceLesson(topic)} set={practiceExerciseSet(row)} passageCount={passageCountBySetId.get(row.id) ?? 1} onSetFinished={onFinished} onCollapse={backToTopic} onAttemptUpdate={onAttemptUpdate} onDraftSaved={onDraftSaved} />}
        {!!history.length && <details className="mt-6 border-t pt-4"><summary className="cursor-pointer font-semibold">Lịch sử làm bài ({history.length})</summary><ol className="mt-3 space-y-2 text-sm">{history.map(item => <li key={item.id}>{new Date(item.submitted_at).toLocaleString('vi-VN')} · {item.score}% · {item.total} câu</li>)}</ol></details>}
      </div> : <div className="space-y-3">{topic.sets.map(set => {
        const attempt = attemptsBySetId[set.id];
        const status = draftSetIds.has(set.id) ? 'Đang làm' : attempt?.attemptCount ? `Kết quả gần nhất: ${attempt.score ?? 0}% · ${attempt.attemptCount} lần nộp` : 'Chưa làm';
        return <div key={set.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="min-w-0 flex-1"><h3 className="font-semibold">{set.title}</h3><p className="mt-1 text-sm text-slate-500">{(set.question_types ?? []).map(type => GRAMMAR_TYPE_LABELS[type as keyof typeof GRAMMAR_TYPE_LABELS] ?? type).join(' · ') || PRACTICE_CATEGORIES[topic.category]} · {set.question_count} câu</p><p className="mt-1 text-sm text-orange-700">{status}</p></div><Button onClick={() => { setHistory([]); setSetId(set.id); }}>{draftSetIds.has(set.id) ? 'Tiếp tục' : attempt?.attemptCount ? 'Làm lại / Xem kết quả' : 'Bắt đầu'}</Button></div>;
      })}</div>}
    </> : <>
      <div className="flex flex-wrap gap-3">{(Object.entries(PRACTICE_CATEGORIES) as [PracticeCategory,string][]).map(([id,label]) => <Button key={id} variant={category === id ? 'primary' : 'secondary'} onClick={() => setCategory(id)}>{label}</Button>)}<label className="sr-only" htmlFor="practice-level">Trình độ</label><select id="practice-level" className="rounded-xl border border-slate-200 px-3 py-2" value={level} onChange={e => setLevel(e.target.value as Level)}>{(['A1','A2','B1','B2'] as const).map(id => <option key={id}>{id}</option>)}</select></div>
      <input aria-label="Tìm chủ đề" placeholder="Tìm chủ đề" className="w-full rounded-xl border border-slate-200 px-4 py-3" value={search} onChange={e => setSearch(e.target.value)} />
      <div className="space-y-3">{filtered.map(value => { const summary = practiceTopicSummary(value.sets,submitted); return <div key={value.topic_id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5"><div className="min-w-0 flex-1"><h2 className="font-semibold">{value.topic_title_vi || value.topic_title}</h2><p className="mt-1 text-sm text-slate-500">{summary.sets} bài · {summary.questions} câu · Đã làm {summary.completed}/{summary.sets}</p></div><Button onClick={() => setTopicId(value.topic_id)}>Xem bài tập</Button></div>; })}</div>
      {!filtered.length && <p className="py-10 text-center text-slate-500">Chưa có chủ đề phù hợp được xuất bản cho trình độ của bạn.</p>}
    </>}
  </section>;
};
