import React, { useEffect, useState } from 'react';
import { Bookmark, BookmarkCheck, BookOpen, Loader2 } from 'lucide-react';
import { Button, LevelBadge } from './DesignSystem';
import { dictionaryAudioUrl } from '../lib/dictionary';
import { DICTIONARY_TYPES, type DictionaryEntry, type DictionaryLesson, type DictionaryTopic } from '../lib/dictionaryModel';

interface DictionaryEntryDetailProps {
  entry: DictionaryEntry;
  topics: DictionaryTopic[];
  lessons: DictionaryLesson[];
  saved: boolean;
  saving: boolean;
  onToggleBookmark: () => void;
  onSelectLesson: (id: string) => void;
}

export function DictionaryEntryDetail({ entry, topics, lessons, saved, saving, onToggleBookmark, onSelectLesson }: DictionaryEntryDetailProps) {
  const [audioUrl, setAudioUrl] = useState('');
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAudioUrl('');
    setAudioError(false);
    if (entry.audio) {
      dictionaryAudioUrl(entry.audio).then(url => {
        if (!cancelled) setAudioUrl(url);
      }).catch(() => { if (!cancelled) setAudioError(true); });
    }
    return () => { cancelled = true; };
  }, [entry.audio]);

  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 sm:p-6" aria-label={`Chi tiết từ ${entry.word}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">{entry.type ? DICTIONARY_TYPES[entry.type] : 'Từ vựng'}</span>
          <LevelBadge level={entry.course} />
        </div>
        <Button variant="secondary" size="sm" aria-label={`${saved ? 'Bỏ lưu' : 'Lưu'} từ ${entry.word}`} aria-pressed={saved} disabled={saving} onClick={onToggleBookmark}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : saved ? <BookmarkCheck className="h-4 w-4 text-orange-600" aria-hidden="true" /> : <Bookmark className="h-4 w-4" aria-hidden="true" />}
        </Button>
      </div>
      <h3 lang="de" className="mt-5 break-words font-display text-2xl font-bold text-slate-900">
        {entry.type === 'noun' && <span className="text-orange-600">{entry.article} </span>}{entry.word}
      </h3>
      {entry.ipa && <p className="mt-1 text-sm text-slate-500">/{entry.ipa}/</p>}
      {entry.audio && <div className="mt-3">
        {audioUrl && <audio key={audioUrl} src={audioUrl} controls preload="none" className="w-full" aria-label={`Phát âm ${entry.word}`} onError={() => setAudioError(true)} />}
        {!audioUrl && !audioError && <p className="text-xs text-slate-500" role="status">Đang tải audio…</p>}
        {audioError && <p className="text-xs text-rose-600" role="alert">Không tải được audio.</p>}
      </div>}
      <p className="my-5 whitespace-pre-wrap text-lg text-slate-800">{entry.meaning}</p>
      {entry.type === 'noun' && entry.plural && <p className="text-sm text-slate-500">Số nhiều: <strong lang="de" className="text-slate-700">{entry.plural}</strong></p>}
      {(entry.type === 'verb' || entry.type === 'adjective') && entry.inflection && <p className="text-sm text-slate-500">Dạng biến đổi: <strong lang="de" className="text-slate-700">{entry.inflection}</strong></p>}
      {entry.example && <section className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Ví dụ trong ngữ cảnh</h4>
        <div className="space-y-2 border-l-4 border-orange-400 pl-3 text-sm">
          <p lang="de" className="whitespace-pre-wrap text-slate-800">{entry.example}</p>
          <p className="whitespace-pre-wrap text-slate-500">{entry.translation}</p>
        </div>
      </section>}
      <section className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Xuất hiện trong bài học</h4>
        <div className="space-y-2">
          {entry.lessons.map(id => {
            const lesson = lessons.find(item => item.id === id);
            return <button key={id} type="button" onClick={() => onSelectLesson(id)} className="flex w-full items-center gap-2 rounded-xl bg-slate-50 p-3 text-left text-sm text-slate-700 hover:bg-orange-50 focus-visible:outline-2 focus-visible:outline-orange-500">
              <BookOpen className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />{lesson?.title_vi || 'Bài học nguồn'}
            </button>;
          })}
        </div>
      </section>
      <section className="mt-6">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Chủ đề</h4>
        <div className="flex flex-wrap gap-2">{topics.filter(topic => entry.topics.includes(topic.id)).map(topic => <span key={topic.id} className="rounded-lg bg-orange-50 px-2.5 py-1 text-xs text-orange-700">{topic.vi}</span>)}</div>
      </section>
    </article>
  );
}
