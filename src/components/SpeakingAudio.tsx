import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { SPEAKING_BUCKET } from '../lib/speaking';

export function SpeakingAudio({ objectKey, label = 'Bản ghi bài nói' }: { objectKey: string; label?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    setUrl(null);
    setError(false);
    supabase.storage.from(SPEAKING_BUCKET).createSignedUrl(objectKey, 3600).then(({ data, error }) => {
      if (active) { setUrl(data?.signedUrl ?? null); setError(!!error || !data?.signedUrl); }
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [objectKey]);
  if (error) return <p role="alert" className="text-sm text-rose-600">Không tải hoặc phát được {label.toLowerCase()}. Hãy tải lại trang để thử lại.</p>;
  return url ? <audio controls preload="metadata" src={url} className="w-full" aria-label={label} onError={() => setError(true)} />
    : <p className="text-xs text-slate-400">Đang tải bản ghi…</p>;
}
