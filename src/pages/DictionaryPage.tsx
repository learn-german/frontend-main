import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BookmarkCheck, BookOpen, ChevronRight, Loader2, Search } from 'lucide-react';
import { Button } from '../components/DesignSystem';
import { DictionaryEntryDetail } from '../components/DictionaryEntryDetail';
import { loadDictionary, loadDictionaryBookmarks, loadDictionaryLessons, setDictionaryBookmark } from '../lib/dictionary';
import { matchesDictionarySearch, type DictionaryEntry, type DictionaryLesson, type DictionaryTopic } from '../lib/dictionaryModel';

interface DictionaryPageProps {
  userId: string;
  onSelectLesson: (id: string) => void;
}

export function DictionaryPage(props: DictionaryPageProps) {
  return <DictionaryCatalog key={props.userId} {...props} />;
}

function DictionaryCatalog({ userId, onSelectLesson }: DictionaryPageProps) {
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [topics, setTopics] = useState<DictionaryTopic[]>([]);
  const [lessons, setLessons] = useState<DictionaryLesson[]>([]);
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [bookmarkError, setBookmarkError] = useState('');
  const [retry, setRetry] = useState(0);
  const [course, setCourse] = useState('');
  const [topicId, setTopicId] = useState('');
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [savingId, setSavingId] = useState('');
  const saving = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(false);
    Promise.all([loadDictionary(), loadDictionaryBookmarks(userId), loadDictionaryLessons()]).then(([catalog, saved, sources]) => {
      if (cancelled) return;
      setEntries(catalog.entries.filter(entry => entry.status === 'published'));
      setTopics(catalog.topics);
      setBookmarks(saved);
      setLessons(sources);
    }).catch(() => { if (!cancelled) setLoadError(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [userId, retry]);

  const courses = [...new Set(entries.map(entry => entry.course))].sort();
  const courseEntries = entries.filter(entry => !course || entry.course === course);
  const visibleTopics = topics.map(topic => ({ ...topic, count: courseEntries.filter(entry => entry.topics.includes(topic.id)).length }))
    .filter(topic => topic.count > 0).sort((a, b) => a.order - b.order || a.vi.localeCompare(b.vi, 'vi'));
  const results = courseEntries.filter(entry => (!topicId || entry.topics.includes(topicId)) && (!savedOnly || bookmarks.includes(entry.id)) && matchesDictionarySearch(entry, query))
    .sort((a, b) => a.word.localeCompare(b.word, 'de'));
  const current = results.find(entry => entry.id === selectedId) || results[0];
  const showTopics = !topicId && !query.trim() && !savedOnly;
  const savedCount = courseEntries.filter(entry => bookmarks.includes(entry.id)).length;

  async function toggleBookmark(entry: DictionaryEntry) {
    if (saving.current) return;
    saving.current = true;
    setSavingId(entry.id);
    setBookmarkError('');
    const saved = !bookmarks.includes(entry.id);
    try {
      await setDictionaryBookmark(userId, entry.id, saved);
      if (mounted.current) setBookmarks(previous => saved ? [...previous, entry.id] : previous.filter(id => id !== entry.id));
    } catch {
      if (mounted.current) setBookmarkError('Không lưu được thay đổi. Vui lòng thử lại.');
    } finally {
      saving.current = false;
      if (mounted.current) setSavingId('');
    }
  }

  function resetTopics() {
    setTopicId('');
    setQuery('');
    setSavedOnly(false);
    setSelectedId('');
  }

  return <div className="mx-auto max-w-6xl space-y-5">
    <header>
      <p className="text-xs font-bold uppercase tracking-wide text-orange-600">Kho từ vựng khóa học</p>
      <h1 className="mt-2 font-display text-2xl font-bold text-slate-900 sm:text-3xl">Từ điển theo chủ đề</h1>
      <p className="mt-2 text-sm text-slate-500">Tìm lại từ đã gặp. Khám phá từ mới theo từng chủ đề.</p>
    </header>
    {loading ? <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500" role="status"><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Đang tải từ điển…</div>
      : loadError ? <div className="rounded-2xl border border-rose-200 bg-white p-6" role="alert"><p className="mb-3 text-sm text-rose-700">Không tải được từ điển.</p><Button variant="secondary" onClick={() => setRetry(value => value + 1)}>Thử lại</Button></div>
      : <>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 focus-within:border-orange-500">
            <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
            <input type="search" aria-label="Tìm từ tiếng Đức hoặc tiếng Việt" placeholder="Tìm từ tiếng Đức hoặc tiếng Việt…" value={query} onChange={event => { setQuery(event.target.value); setTopicId(''); setSelectedId(''); }} className="min-w-0 w-full bg-transparent text-sm text-slate-900 outline-none" />
          </label>
          <select aria-label="Khóa học từ điển" value={course} onChange={event => { setCourse(event.target.value); setTopicId(''); setSelectedId(''); }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 focus:outline-orange-500">
            <option value="">Tất cả khóa học</option>{courses.map(level => <option key={level} value={level}>Khóa {level}</option>)}
          </select>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-5">
            {[{ saved: false, label: 'Tất cả từ vựng' }, { saved: true, label: `Đã lưu (${savedCount})` }].map(tab => <button key={tab.label} type="button" aria-pressed={savedOnly === tab.saved} onClick={() => { setSavedOnly(tab.saved); setTopicId(''); setSelectedId(''); }} className={`border-b-2 py-2 text-sm focus-visible:outline-2 focus-visible:outline-orange-500 ${savedOnly === tab.saved ? 'border-orange-600 font-semibold text-orange-600' : 'border-transparent text-slate-500'}`}>{tab.label}</button>)}
          </div>
          <p className="text-xs text-slate-500">{courseEntries.length} mục từ · {visibleTopics.length} chủ đề</p>
        </div>
        {bookmarkError && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{bookmarkError}</p>}
        {showTopics ? <section>
          <h2 className="mb-3 font-display text-lg font-bold text-slate-900">Khám phá chủ đề</h2>
          {visibleTopics.length ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {visibleTopics.map(topic => <button key={topic.id} type="button" onClick={() => { setTopicId(topic.id); setSelectedId(''); }} className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white p-4 text-left transition-colors hover:border-orange-400 focus-visible:outline-2 focus-visible:outline-orange-500 sm:p-5">
              <span className="mb-4 rounded-xl bg-orange-50 p-2.5 text-orange-600 self-start"><BookOpen className="h-5 w-5" aria-hidden="true" /></span>
              <strong className="break-words text-sm text-slate-900">{topic.vi}</strong><span lang="de" className="mt-1 break-words text-xs text-slate-500">{topic.de}</span>
              <span className="mt-4 flex w-full items-center justify-between gap-2 text-xs text-slate-500">{topic.count} mục từ<ArrowUpRight className="h-4 w-4 text-orange-600" aria-hidden="true" /></span>
            </button>)}
          </div> : <p className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">Chưa có từ vựng trong khóa học bạn được truy cập.</p>}
          <p className="mt-5 text-xs text-slate-500">Từ và cụm từ trong bài học, bài đọc, bài nghe và bài tập của khóa học.</p>
        </section> : <section>
          <Button variant="ghost" size="sm" onClick={resetTopics} className="mb-3 gap-1"><ArrowLeft className="h-4 w-4" aria-hidden="true" />Tất cả chủ đề</Button>
          <div className="mb-3 flex items-center justify-between gap-3"><h2 className="font-display text-lg font-bold text-slate-900">{query.trim() ? 'Kết quả tìm kiếm' : savedOnly ? 'Từ vựng đã lưu' : topics.find(topic => topic.id === topicId)?.vi}</h2><p className="text-xs text-slate-500" role="status">{results.length} mục từ · A–Z</p></div>
          {current ? <div className="grid items-start gap-4 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white" aria-label="Danh sách từ vựng">
              {results.map(entry => <button key={entry.id} type="button" aria-pressed={entry.id === current.id} onClick={() => setSelectedId(entry.id)} className={`flex w-full items-center justify-between gap-3 border-b border-slate-100 p-4 text-left last:border-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-orange-500 ${entry.id === current.id ? 'bg-orange-50 shadow-[inset_3px_0_0_#ea580c]' : 'hover:bg-slate-50'}`}>
                <span className="min-w-0"><strong lang="de" className="block break-words text-base text-slate-900">{entry.type === 'noun' && <span className="text-orange-600">{entry.article} </span>}{entry.word}</strong><span className="mt-1 block break-words text-sm text-slate-500">{entry.meaning}</span></span>
                {bookmarks.includes(entry.id) ? <BookmarkCheck className="h-4 w-4 shrink-0 text-orange-600" aria-label="Đã lưu" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              </button>)}
            </div>
            <DictionaryEntryDetail key={current.id} entry={current} topics={topics} lessons={lessons} saved={bookmarks.includes(current.id)} saving={!!savingId} onToggleBookmark={() => void toggleBookmark(current)} onSelectLesson={onSelectLesson} />
          </div> : <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center"><h3 className="font-semibold text-slate-900">{savedOnly && !query.trim() ? 'Chưa có từ vựng đã lưu' : 'Không tìm thấy từ phù hợp'}</h3><p className="mt-2 text-sm text-slate-500">{savedOnly && !query.trim() ? 'Chọn một từ và bấm biểu tượng lưu để tra lại sau.' : 'Thử từ khác bằng tiếng Đức hoặc tiếng Việt.'}</p></div>}
        </section>}
      </>}
  </div>;
}
