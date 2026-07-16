# Multi-Audio Listening Exercises Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each lesson can have multiple mp3 files ("clips"), each with its own group of Nghe (listening) questions, managed entirely from the admin "Quản lý bài tập" page instead of "Sửa bài học".

**Architecture:** A new `listening_clips` table (1 lesson → many clips) and a new nullable `quiz_questions.audio_clip_id` column (1 clip → many questions) replace the old single `lessons.audio_r2_key`/`listening_url` model. The R2 upload/playback APIs are extended to address a specific clip instead of a lesson-level audio slot. Scoring/completion stay unchanged — a lesson's Nghe score is still one combined `lesson_progress` row across all of its clips' questions, submitted once.

**Tech Stack:** React 19, TypeScript, Supabase (Postgres + RLS + PostgREST), Vercel serverless functions (`api/media/*.ts`), Cloudflare R2 (via presigned S3-compatible URLs).

## Global Constraints

- Learners do all clips in one sitting: start the Nghe exercise once, work through each clip's questions in order, submit once at the end — one combined score per lesson (no change to `quiz-submit` Edge Function or the 80% pass threshold).
- Each clip has no title/label (UI shows "File 1", "File 2"... by upload order) and no drag-to-reorder (order = upload order via `order_index`).
- `quiz_questions.audio_clip_id` is only meaningful for `category='nghe'` rows; other categories keep it `NULL`.
- Do not drop `lessons.audio_r2_key`/`listening_url` columns from the DB (avoid migration risk) — but no code anywhere may read or write them after this plan lands.
- No changes to `quiz-submit`/`lesson-complete` Edge Functions, XP/streak logic, or the Ngữ pháp/Đọc flows.
- Deleting a clip in the admin UI deletes its questions via DB `ON DELETE CASCADE`, not manual client-side deletion.

---

### Task 1: Migration — `listening_clips` table + `audio_clip_id` column + backfill

**Files:**
- Create: `supabase/migrations/20260716000014_listening_clips.sql`

**Interfaces:**
- Produces (used by all later tasks): table `listening_clips(id UUID, lesson_id TEXT, r2_key TEXT, order_index INTEGER)`; `quiz_questions.audio_clip_id UUID` (nullable, FK to `listening_clips.id`, `ON DELETE CASCADE`); `quiz_questions_public` view now also exposes `audio_clip_id`.

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260716000014_listening_clips.sql`:

```sql
-- =============================================================================
-- DeutschPath — multi-audio listening clips: listening_clips table,
-- quiz_questions.audio_clip_id, backfill from existing single-audio lessons.
-- =============================================================================

-- 1. listening_clips: 1 lesson can now have multiple mp3 files (clips).
CREATE TABLE listening_clips (
  id          UUID    NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  lesson_id   TEXT    NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  r2_key      TEXT    NOT NULL,
  order_index INTEGER NOT NULL DEFAULT 0
);

ALTER TABLE listening_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "listening_clips: authenticated read"
  ON listening_clips FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "listening_clips: admin write"
  ON listening_clips FOR ALL
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');

-- 2. quiz_questions: link Nghe questions to a specific clip. Deleting a
--    clip cascades to delete its questions (admin UI relies on this instead
--    of manually deleting each question first).
ALTER TABLE quiz_questions
  ADD COLUMN audio_clip_id UUID REFERENCES listening_clips(id) ON DELETE CASCADE;

-- 3. quiz_questions_public view: add audio_clip_id (still no correct_answer).
DROP VIEW IF EXISTS quiz_questions_public;

CREATE VIEW quiz_questions_public AS
  SELECT
    id,
    lesson_id,
    type,
    category,
    question_text,
    audio_text,
    options,
    matching_pairs,
    audio_clip_id,
    explanation,
    order_index
  FROM quiz_questions;

GRANT SELECT ON quiz_questions_public TO authenticated;

-- 4. Backfill: lessons that already have a single audio_r2_key (from before
--    multi-clip support) get one listening_clips row created from it, and
--    their existing 'nghe' questions (which had no clip link before) get
--    reassigned to that new clip — preserves already-uploaded real audio
--    and already-authored questions (e.g. lesson a1-l1).
INSERT INTO listening_clips (lesson_id, r2_key, order_index)
SELECT id, audio_r2_key, 0
FROM lessons
WHERE audio_r2_key IS NOT NULL;

UPDATE quiz_questions q
SET audio_clip_id = lc.id
FROM listening_clips lc
WHERE q.category = 'nghe'
  AND q.lesson_id = lc.lesson_id
  AND q.audio_clip_id IS NULL;
```

- [ ] **Step 2: Apply the migration to the live Supabase project**

Use the Supabase MCP `apply_migration` tool (project_id `awdhqlgxnjwymwgxltlw`, name `listening_clips`) with the exact SQL above.

- [ ] **Step 3: Verify live**

Run these `execute_sql` queries against the same project and confirm the results:

```sql
SELECT id, lesson_id, r2_key, order_index FROM listening_clips ORDER BY lesson_id;
```
Expected: exactly one row, `lesson_id = 'a1-l1'`, `r2_key` equal to whatever `a1-l1`'s `audio_r2_key` value was before this migration (query `SELECT audio_r2_key FROM lessons WHERE id = 'a1-l1';` first to confirm it matches), `order_index = 0`.

```sql
SELECT id, question_text, audio_clip_id FROM quiz_questions WHERE lesson_id = 'a1-l1' AND category = 'nghe';
```
Expected: all 3 rows (seeded in an earlier plan) have the SAME non-null `audio_clip_id`, equal to the `id` from the `listening_clips` query above.

```sql
SELECT column_name FROM information_schema.columns WHERE table_name = 'quiz_questions_public';
```
Expected: includes `audio_clip_id`, does NOT include `correct_answer`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260716000014_listening_clips.sql
git commit -m "feat: add listening_clips table + quiz_questions.audio_clip_id, backfill existing audio"
```

---

### Task 2: Extend R2 upload/playback APIs for per-clip audio

**Files:**
- Modify: `api/media/upload-url.ts`
- Modify: `api/media/playback-url.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (this is a backend-only change; DB table from Task 1 is referenced by `playback-url.ts`'s new lookup path).
- Produces (used by Task 3's `src/lib/uploadMedia.ts`):
  - `POST /api/media/upload-url` request body gains an optional `clipId?: string` field. When `mediaType === "audio"`, `clipId` is now REQUIRED (400 if missing) and the returned `objectKey` is `audio/{lessonId}/{clipId}.{ext}` instead of `audio/{lessonId}.{ext}`. `mediaType === "video"` is unchanged.
  - `GET /api/media/playback-url?lessonId=X&type=audio&clipId=Y` — when `type=audio` AND `clipId` is present, looks up `listening_clips` (by `id=clipId`, verifying its `lesson_id` matches the given `lessonId`) instead of `lessons.audio_r2_key`. When `type=audio` with no `clipId`, or `type=video`, behavior is unchanged (backward compatible, though nothing calls the old audio-without-clipId path after this plan lands).

- [ ] **Step 1: Extend `upload-url.ts`**

Find in `api/media/upload-url.ts`:

```ts
export function buildObjectKey(mediaType: MediaType, lessonId: string, ext: string): string {
  const folder = mediaType === "video" ? "videos" : "audio";
  return `${folder}/${lessonId}.${ext.toLowerCase()}`;
}
```

Replace with:

```ts
export function buildObjectKey(mediaType: MediaType, lessonId: string, ext: string, clipId?: string): string {
  if (mediaType === "video") {
    return `videos/${lessonId}.${ext.toLowerCase()}`;
  }
  return `audio/${lessonId}/${clipId}.${ext.toLowerCase()}`;
}
```

Find:

```ts
  const body = req.body as { lessonId?: string; mediaType?: string; fileExt?: string };
  const { lessonId, fileExt } = body;
  const mediaType = body.mediaType;

  if (!lessonId || (mediaType !== "video" && mediaType !== "audio") || !fileExt) {
    res.status(400).json({ error: "lessonId, mediaType (video|audio), fileExt required" });
    return;
  }
  if (!isAllowedExt(mediaType, fileExt)) {
    res.status(400).json({ error: `fileExt must be one of: ${ALLOWED_EXT[mediaType].join(", ")}` });
    return;
  }

  const objectKey = buildObjectKey(mediaType, lessonId, fileExt);
```

Replace with:

```ts
  const body = req.body as { lessonId?: string; mediaType?: string; fileExt?: string; clipId?: string };
  const { lessonId, fileExt, clipId } = body;
  const mediaType = body.mediaType;

  if (!lessonId || (mediaType !== "video" && mediaType !== "audio") || !fileExt) {
    res.status(400).json({ error: "lessonId, mediaType (video|audio), fileExt required" });
    return;
  }
  if (mediaType === "audio" && !clipId) {
    res.status(400).json({ error: "clipId required for audio uploads" });
    return;
  }
  if (!isAllowedExt(mediaType, fileExt)) {
    res.status(400).json({ error: `fileExt must be one of: ${ALLOWED_EXT[mediaType].join(", ")}` });
    return;
  }

  const objectKey = buildObjectKey(mediaType, lessonId, fileExt, clipId);
```

- [ ] **Step 2: Extend `playback-url.ts`**

Find in `api/media/playback-url.ts`:

```ts
  const lessonId = typeof req.query.lessonId === "string" ? req.query.lessonId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;

  if (!lessonId || (type !== "video" && type !== "audio")) {
    res.status(400).json({ error: "lessonId and type (video|audio) required" });
    return;
  }

  const column = type === "video" ? "video_r2_key" : "audio_r2_key";
  const restRes = await fetch(
    `${process.env.SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&select=${column}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        apikey: process.env.SUPABASE_ANON_KEY!,
      },
    }
  );
  if (!restRes.ok) {
    res.status(404).json({ error: "Lesson not found" });
    return;
  }
  const rows = (await restRes.json()) as Record<string, string | null>[];
  const objectKey = rows[0]?.[column];
  if (!objectKey) {
    res.status(404).json({ error: "Media not found for this lesson" });
    return;
  }
```

Replace with:

```ts
  const lessonId = typeof req.query.lessonId === "string" ? req.query.lessonId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const clipId = typeof req.query.clipId === "string" ? req.query.clipId : undefined;

  if (!lessonId || (type !== "video" && type !== "audio")) {
    res.status(400).json({ error: "lessonId and type (video|audio) required" });
    return;
  }

  let objectKey: string | undefined;

  if (type === "audio" && clipId) {
    const clipRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/listening_clips?id=eq.${encodeURIComponent(clipId)}&select=r2_key,lesson_id`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY!,
        },
      }
    );
    if (!clipRes.ok) {
      res.status(404).json({ error: "Clip not found" });
      return;
    }
    const clipRows = (await clipRes.json()) as { r2_key: string; lesson_id: string }[];
    const clipRow = clipRows[0];
    if (!clipRow || clipRow.lesson_id !== lessonId) {
      res.status(404).json({ error: "Clip not found for this lesson" });
      return;
    }
    objectKey = clipRow.r2_key;
  } else {
    const column = type === "video" ? "video_r2_key" : "audio_r2_key";
    const restRes = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/lessons?id=eq.${encodeURIComponent(lessonId)}&select=${column}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: process.env.SUPABASE_ANON_KEY!,
        },
      }
    );
    if (!restRes.ok) {
      res.status(404).json({ error: "Lesson not found" });
      return;
    }
    const rows = (await restRes.json()) as Record<string, string | null>[];
    objectKey = rows[0]?.[column] ?? undefined;
  }

  if (!objectKey) {
    res.status(404).json({ error: "Media not found for this lesson" });
    return;
  }
```

(The rest of the function — the `S3Client`/`getSignedUrl` call using `objectKey` — is unchanged; it already reads the `objectKey` variable, which is still in scope.)

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add api/media/upload-url.ts api/media/playback-url.ts
git commit -m "feat: extend media upload/playback APIs for per-clip audio"
```

---

### Task 3: Extract shared `uploadMedia`, remove audio upload from lesson editor

**Files:**
- Create: `src/lib/uploadMedia.ts`
- Modify: `src/pages/admin/AdminLessonEditor.tsx`
- Modify: `src/pages/admin/AdminContentSection.tsx`

**Interfaces:**
- Consumes: the extended `POST /api/media/upload-url` contract from Task 2 (`clipId` field in the request body).
- Produces (used by Task 7): `export async function uploadMedia(file: File, lessonId: string, mediaType: "video" | "audio", onProgress: (pct: number) => void, clipId?: string): Promise<string>` in `src/lib/uploadMedia.ts`.

- [ ] **Step 1: Create the shared upload helper**

Create `src/lib/uploadMedia.ts`:

```ts
import { supabase } from "./supabase";

export async function uploadMedia(
  file: File,
  lessonId: string,
  mediaType: "video" | "audio",
  onProgress: (pct: number) => void,
  clipId?: string,
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Chưa đăng nhập");

  const fileExt = file.name.split(".").pop() ?? "";
  const res = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ lessonId, mediaType, fileExt, clipId }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(body.error ?? "Không lấy được upload URL");
  }
  const { uploadUrl, objectKey } = (await res.json()) as { uploadUrl: string; objectKey: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload thất bại (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload thất bại (lỗi mạng)"));
    xhr.send(file);
  });

  return objectKey;
}
```

- [ ] **Step 2: Update `AdminLessonEditor.tsx` — import shared helper, remove local copy**

Find:

```tsx
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { MarkdownBlock } from "../../components/MarkdownBlock";
import { showToast } from "../../lib/toast";
```

Replace with:

```tsx
import { supabase } from "../../lib/supabase";
import { Button, LessonStatusBadge } from "../../components/DesignSystem";
import { MarkdownBlock } from "../../components/MarkdownBlock";
import { showToast } from "../../lib/toast";
import { uploadMedia } from "../../lib/uploadMedia";
```

Find (delete this entire local function — it's now imported instead):

```tsx
async function uploadMedia(
  file: File,
  lessonId: string,
  mediaType: "video" | "audio",
  onProgress: (pct: number) => void
): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error("Chưa đăng nhập");

  const fileExt = file.name.split(".").pop() ?? "";
  const res = await fetch("/api/media/upload-url", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ lessonId, mediaType, fileExt }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({ error: res.statusText }))) as { error?: string };
    throw new Error(body.error ?? "Không lấy được upload URL");
  }
  const { uploadUrl, objectKey } = (await res.json()) as { uploadUrl: string; objectKey: string };

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload thất bại (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload thất bại (lỗi mạng)"));
    xhr.send(file);
  });

  return objectKey;
}

```

- [ ] **Step 3: Remove `audio_r2_key`/`listening_url` from `LessonEditable`**

Find:

```tsx
  grammar_md?: string | null;
  speaking_md?: string | null;
  listening_url?: string | null;
  video_r2_key?: string | null;
  audio_r2_key?: string | null;
  reading_text?: string | null;
```

Replace with:

```tsx
  grammar_md?: string | null;
  speaking_md?: string | null;
  video_r2_key?: string | null;
  reading_text?: string | null;
```

- [ ] **Step 4: Remove `audioUploadPct` state and `handleAudioUpload`**

Find:

```tsx
  const [videoUploadPct, setVideoUploadPct] = useState<number | null>(null);
  const [audioUploadPct, setAudioUploadPct] = useState<number | null>(null);
```

Replace with:

```tsx
  const [videoUploadPct, setVideoUploadPct] = useState<number | null>(null);
```

Find (delete this entire function):

```tsx
  const handleAudioUpload = async (file: File) => {
    setAudioUploadPct(0);
    try {
      const objectKey = await uploadMedia(file, data.id, "audio", setAudioUploadPct);
      upd({ audio_r2_key: objectKey });
      showToast("Đã tải audio lên, nhớ bấm Lưu bài học.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải audio lên thất bại", "warning");
    } finally {
      setAudioUploadPct(null);
    }
  };

```

- [ ] **Step 5: Remove `listening_url`/`audio_r2_key` from `handleSave`'s and `handlePublish`'s payloads**

Find (in `handleSave`):

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
```

Replace with:

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
```

Find (in `handlePublish`):

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
```

Replace with:

```tsx
      grammar_md: data.grammar_md || null,
      speaking_md: data.speaking_md || null,
      video_r2_key: data.video_r2_key || null,
      reading_text: data.reading_text || null,
      reading_text_vi: data.reading_text_vi || null,
      status: "published",
    }).eq("id", data.id);
    setSaving(false);

    if (error) {
      showToast("Public thất bại: " + error.message, "warning");
```

- [ ] **Step 6: Remove the now-unused `Headphones` icon import**

`Headphones` is only used inside the "Nghe section" block being removed in Step 7 below (confirmed via `grep -n "Headphones" src/pages/admin/AdminLessonEditor.tsx` — only 3 hits: the import line and 2 uses inside that block). Find:

```tsx
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2, Headphones, FileText,
  Globe, EyeOff,
} from "lucide-react";
```

Replace with:

```tsx
import {
  ArrowLeft, Save, Plus, Trash2,
  BookOpen, GraduationCap, Video, Volume2, Loader2, FileText,
  Globe, EyeOff,
} from "lucide-react";
```

- [ ] **Step 7: Remove the "Nghe section" JSX block**

Find:

```tsx
          {/* Nghe section */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-2">
              <Headphones className="w-4 h-4 text-orange-500" /> Luyện nghe
            </h3>
            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition">
              <Headphones className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-xs font-bold text-slate-600">
                {audioUploadPct !== null ? `Đang tải lên... ${audioUploadPct}%` : "Tải audio lên (.mp3 / .m4a / .wav)"}
              </span>
              <input
                type="file"
                accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"
                className="hidden"
                disabled={audioUploadPct !== null}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioUpload(f); e.target.value = ""; }}
              />
            </label>
            {data.audio_r2_key && (
              <p className="text-[10px] text-slate-400 font-mono">{data.audio_r2_key}</p>
            )}
            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer">Nhập thủ công (cũ) — URL audio</summary>
              <div className="mt-2">
                <label className={labelCls}>URL audio (mp3 / m4a / wav)</label>
                <input
                  type="text"
                  value={data.listening_url ?? ""}
                  onChange={e => upd({ listening_url: e.target.value })}
                  placeholder="https://example.com/audio.mp3"
                  className={inputCls}
                />
              </div>
            </details>
            {data.listening_url && !data.audio_r2_key && (
              <audio controls src={data.listening_url} className="w-full rounded-xl mt-2">
                Trình duyệt không hỗ trợ audio.
              </audio>
            )}
          </div>

          {/* Đọc section */}
```

Replace with:

```tsx
          {/* Đọc section */}
```

- [ ] **Step 8: Update `AdminContentSection.tsx`'s `LESSON_SELECT`**

Find:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index, status`;
```

Replace with:

```tsx
const LESSON_SELECT = `id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md, speaking_md,
                video_r2_key,
                reading_text, reading_text_vi, order_index, status`;
```

- [ ] **Step 9: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add src/lib/uploadMedia.ts src/pages/admin/AdminLessonEditor.tsx src/pages/admin/AdminContentSection.tsx
git commit -m "refactor: extract shared uploadMedia helper, remove single-audio upload from lesson editor"
```

---

### Task 4: Extend `useMediaPlaybackUrl` for per-clip audio

**Files:**
- Modify: `src/lib/hooks/useMediaPlaybackUrl.ts`

**Interfaces:**
- Consumes: the extended `GET /api/media/playback-url` contract from Task 2 (`clipId` query param).
- Produces (used by Tasks 9, 10): `useMediaPlaybackUrl(lessonId: string, type: "video" | "audio", objectKey: string | undefined, clipId?: string): { url: string | null; loading: boolean; error: string | null }` — existing 3-arg call sites (video playback) remain valid since `clipId` is optional and appended as a 4th param.

- [ ] **Step 1: Add the optional `clipId` parameter**

Find:

```ts
export function useMediaPlaybackUrl(
  lessonId: string,
  type: "video" | "audio",
  objectKey: string | undefined
): { url: string | null; loading: boolean; error: string | null } {
```

Replace with:

```ts
export function useMediaPlaybackUrl(
  lessonId: string,
  type: "video" | "audio",
  objectKey: string | undefined,
  clipId?: string,
): { url: string | null; loading: boolean; error: string | null } {
```

- [ ] **Step 2: Pass `clipId` in the fetch URL and dependency array**

Find:

```ts
      try {
        const res = await fetch(`/api/media/playback-url?lessonId=${encodeURIComponent(lessonId)}&type=${type}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
```

Replace with:

```ts
      try {
        const clipParam = clipId ? `&clipId=${encodeURIComponent(clipId)}` : "";
        const res = await fetch(`/api/media/playback-url?lessonId=${encodeURIComponent(lessonId)}&type=${type}${clipParam}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
```

Find:

```ts
    return () => { cancelled = true; };
  }, [lessonId, type, objectKey]);
```

Replace with:

```ts
    return () => { cancelled = true; };
  }, [lessonId, type, objectKey, clipId]);
```

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors (existing 3-arg call sites in `VideoPlayer`/other components still compile since `clipId` is optional).

- [ ] **Step 4: Commit**

```bash
git add src/lib/hooks/useMediaPlaybackUrl.ts
git commit -m "feat: add optional clipId param to useMediaPlaybackUrl for per-clip audio"
```

---

### Task 5: Thread `listeningClips`/`audioClipId` through types and data hooks

**Files:**
- Modify: `src/lib/appTypes.ts`
- Modify: `src/lib/hooks/useModules.ts`
- Modify: `src/lib/hooks/useQuizQuestions.ts`

**Interfaces:**
- Consumes: `listening_clips`/`quiz_questions.audio_clip_id` columns from Task 1.
- Produces (used by Tasks 6, 9, 10): `Lesson.listeningClips: { id: string; r2Key: string }[]` (always an array, ordered by upload order); `QuizQuestion.audioClipId?: string`.

- [ ] **Step 1: `appTypes.ts` — add `audioClipId` to `QuizQuestion`, replace audio fields on `Lesson`**

Find:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

Replace with:

```ts
export interface QuizQuestion {
  id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category?: "nguphap" | "nghe" | "doc";
  questionText: string;
  audioText?: string;
  audioClipId?: string;
  options?: string[];
  matchingPairs?: { de: string; vi: string }[];
  explanation: string;
  correctAnswer?: string;
}
```

Find:

```ts
  grammarMd?: string;
  speakingMd?: string;
  listeningUrl?: string;
  videoR2Key?: string;
  audioR2Key?: string;
  readingText?: string;
```

Replace with:

```ts
  grammarMd?: string;
  speakingMd?: string;
  videoR2Key?: string;
  listeningClips: { id: string; r2Key: string }[];
  readingText?: string;
```

- [ ] **Step 2: `useModules.ts` — fetch and map `listening_clips`**

Find:

```ts
  video_r2_key: string | null;
  audio_r2_key: string | null;
  reading_text: string | null;
  reading_text_vi: string | null;
};
```

Replace with:

```ts
  video_r2_key: string | null;
  reading_text: string | null;
  reading_text_vi: string | null;
  listening_clips: { id: string; r2_key: string; order_index: number }[];
};
```

Find:

```ts
        lessons (
          id, level, title, title_vi, objective, summary,
          youtube_id, duration, order_index, xp_reward,
          next_lesson_id, vocabulary, grammar,
          grammar_md, speaking_md, listening_url, video_r2_key, audio_r2_key,
          reading_text, reading_text_vi
        )
```

Replace with:

```ts
        lessons (
          id, level, title, title_vi, objective, summary,
          youtube_id, duration, order_index, xp_reward,
          next_lesson_id, vocabulary, grammar,
          grammar_md, speaking_md, video_r2_key,
          reading_text, reading_text_vi,
          listening_clips (id, r2_key, order_index)
        )
```

Find:

```ts
      grammarMd: l.grammar_md ?? undefined,
      speakingMd: l.speaking_md ?? undefined,
      listeningUrl: l.listening_url ?? undefined,
      videoR2Key: l.video_r2_key ?? undefined,
      audioR2Key: l.audio_r2_key ?? undefined,
      readingText: l.reading_text ?? undefined,
      readingTextVi: l.reading_text_vi ?? undefined,
```

Replace with:

```ts
      grammarMd: l.grammar_md ?? undefined,
      speakingMd: l.speaking_md ?? undefined,
      videoR2Key: l.video_r2_key ?? undefined,
      // Sorted client-side rather than relying on a 3-level-deep Supabase
      // nested .order() call (modules -> lessons -> listening_clips), which
      // has uncertain referencedTable path support at that depth.
      listeningClips: [...(l.listening_clips ?? [])]
        .sort((a, b) => a.order_index - b.order_index)
        .map((c) => ({ id: c.id, r2Key: c.r2_key })),
      readingText: l.reading_text ?? undefined,
      readingTextVi: l.reading_text_vi ?? undefined,
```

- [ ] **Step 3: `useQuizQuestions.ts` — select and map `audio_clip_id`**

Find:

```ts
      .select("id, type, category, question_text, audio_text, options, matching_pairs, explanation, order_index")
```

Replace with:

```ts
      .select("id, type, category, question_text, audio_text, audio_clip_id, options, matching_pairs, explanation, order_index")
```

Find:

```ts
              audioText: (q.audio_text as string | null) ?? undefined,
```

Replace with:

```ts
              audioText: (q.audio_text as string | null) ?? undefined,
              audioClipId: (q.audio_clip_id as string | null) ?? undefined,
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: errors ONLY in `src/lib/completion.ts` (still referencing the old `audioR2Key`/`listeningUrl` fields on `LessonContentFlags`, and any file constructing a `Lesson` object literal without `listeningClips`, e.g. `src/data/mockData.ts` if it builds `Lesson` objects — check the lint output for exactly which files/lines fail) — these are expected and fixed by Task 6. Confirm no errors in the 3 files this task touches.

- [ ] **Step 5: Commit**

```bash
git add src/lib/appTypes.ts src/lib/hooks/useModules.ts src/lib/hooks/useQuizQuestions.ts
git commit -m "feat: thread listeningClips/audioClipId through Lesson/QuizQuestion types and data hooks"
```

---

### Task 6: Update `completion.ts` for multi-clip Nghe applicability

**Files:**
- Modify: `src/lib/completion.ts`

**Interfaces:**
- Consumes: `Lesson.listeningClips` shape from Task 5 (structurally: any object with `.length` — this task only needs `{ id: string }[]`, so `Lesson.listeningClips: { id: string; r2Key: string }[]` satisfies it).
- Produces: `LessonContentFlags.listeningClips?: { id: string }[]` (same field name/shape used elsewhere so callers don't need per-consumer field name mapping).

- [ ] **Step 1: Update `LessonContentFlags` and `applicableCategories`**

Find:

```ts
export interface LessonContentFlags {
  id: string;
  audioR2Key?: string;
  listeningUrl?: string;
  readingText?: string;
}

/**
 * Which quiz categories actually apply to a lesson. Ngữ pháp always applies;
 * Nghe/Đọc only apply if the lesson has audio / a reading passage (mirrors
 * the content-gated "Bắt đầu bài tập" buttons on LessonDetailPage).
 */
export function applicableCategories(lesson: LessonContentFlags): QuizCategory[] {
  const categories: QuizCategory[] = ["nguphap"];
  if (lesson.audioR2Key || lesson.listeningUrl) categories.push("nghe");
  if (lesson.readingText) categories.push("doc");
  return categories;
}
```

Replace with:

```ts
export interface LessonContentFlags {
  id: string;
  listeningClips?: { id: string }[];
  readingText?: string;
}

/**
 * Which quiz categories actually apply to a lesson. Ngữ pháp always applies;
 * Nghe/Đọc only apply if the lesson has at least one listening clip / a
 * reading passage (mirrors the content-gated "Bắt đầu bài tập" buttons on
 * LessonDetailPage).
 */
export function applicableCategories(lesson: LessonContentFlags): QuizCategory[] {
  const categories: QuizCategory[] = ["nguphap"];
  if ((lesson.listeningClips?.length ?? 0) > 0) categories.push("nghe");
  if (lesson.readingText) categories.push("doc");
  return categories;
}
```

- [ ] **Step 2: Add `listeningClips: []` to the pre-existing mock `Lesson` object literals**

Since `Lesson.listeningClips` is now a required (non-optional) field (Task 5), the two files below — which construct `Lesson`-shaped object literals independent of `useModules.ts` — will fail `tsc --noEmit` otherwise. Both already have a `moduleTitle: ...` line in each literal; add `listeningClips: [],` immediately after each one.

`src/data/mockData.ts` has 4 such literals (confirmed via `grep -n moduleTitle src/data/mockData.ts` — lines 18, 118, 214, 314 at the time this plan was written; line numbers may have shifted, search for `moduleTitle:` to find each one). For each occurrence, find:

```ts
        moduleTitle: "...",
```

(with whatever literal string is already there) and add `listeningClips: [],` on the next line, same indentation, e.g.:

```ts
        moduleTitle: "...",
        listeningClips: [],
```

`src/hooks/useModules.ts` (NOT `src/lib/hooks/useModules.ts` — this is a different, pre-existing, already-confirmed-dead duplicate file from an earlier plan in this session's history, unimported anywhere, kept as-is per this project's "don't delete pre-existing code unless asked" convention) has one such literal. Find:

```ts
            moduleTitle: m.title_vi,
```

Replace with:

```ts
            moduleTitle: m.title_vi,
            listeningClips: [],
```

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors anywhere.

- [ ] **Step 4: Commit**

```bash
git add src/lib/completion.ts src/data/mockData.ts src/hooks/useModules.ts
git commit -m "feat: update applicableCategories to check listeningClips instead of single audio field"
```

---

### Task 7: Admin — clip management UI in "Quản lý bài tập"

**Files:**
- Modify: `src/pages/admin/AdminQuizSection.tsx`

**Interfaces:**
- Consumes: `uploadMedia` from `src/lib/uploadMedia.ts` (Task 3); `useMediaPlaybackUrl(lessonId, type, objectKey, clipId?)` from Task 4.
- Produces: nothing new for later tasks (this is a leaf admin-UI task).

This is a full-file rewrite of `src/pages/admin/AdminQuizSection.tsx` because the Nghe tab's rendering branches out significantly from the other two tabs. Read the file's CURRENT content first (`Read src/pages/admin/AdminQuizSection.tsx`) to confirm you're starting from the right base, then apply the changes below as a whole-file replacement.

- [ ] **Step 1: Replace the full file content**

Replace the entire contents of `src/pages/admin/AdminQuizSection.tsx` with:

```tsx
import React, { useState, useEffect } from "react";
import { Loader2, Pencil, Trash2, Plus, ChevronDown, ChevronRight, X, GripVertical, Search, Headphones } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../../components/DesignSystem";
import { showToast } from "../../lib/toast";
import { uploadMedia } from "../../lib/uploadMedia";
import { useMediaPlaybackUrl } from "../../lib/hooks/useMediaPlaybackUrl";

interface QuizQuestion {
  id: string;
  lesson_id: string;
  type: "multiple-choice" | "fill-blank" | "matching" | "listening";
  category: "nguphap" | "nghe" | "doc";
  question_text: string;
  audio_text: string | null;
  audio_clip_id: string | null;
  options: string[] | null;
  matching_pairs: { de: string; vi: string }[] | null;
  correct_answer: string;
  explanation: string;
  order_index: number;
}

interface ListeningClip {
  id: string;
  lesson_id: string;
  r2_key: string;
  order_index: number;
}

interface LessonGroup {
  lesson_id: string;
  lesson_title: string;
  module_title: string;
  questions: QuizQuestion[];
  clips: ListeningClip[];
}

type EditForm = Omit<QuizQuestion, "id" | "lesson_id">;

const EMPTY_FORM: EditForm = {
  type: "multiple-choice",
  category: "nguphap",
  question_text: "",
  audio_text: null,
  audio_clip_id: null,
  options: ["", "", "", ""],
  matching_pairs: [{ de: "", vi: "" }],
  correct_answer: "",
  explanation: "",
  order_index: 0,
};

const TYPE_LABELS: Record<string, string> = {
  "multiple-choice": "Trắc nghiệm",
  "fill-blank": "Điền chỗ trống",
  "matching": "Ghép đôi",
  "listening": "Nghe hiểu",
};

const CATEGORY_LABELS: Record<string, string> = {
  "nguphap": "Ngữ pháp",
  "nghe": "Nghe",
  "doc": "Đọc",
};

const TYPE_COLORS: Record<string, string> = {
  "multiple-choice": "bg-blue-50 text-blue-700",
  "fill-blank": "bg-purple-50 text-purple-700",
  "matching": "bg-teal-50 text-teal-700",
  "listening": "bg-amber-50 text-amber-700",
};

const QuestionTable: React.FC<{
  questions: QuizQuestion[];
  onEdit: (q: QuizQuestion) => void;
  onDelete: (q: QuizQuestion) => void;
}> = ({ questions, onEdit, onDelete }) => (
  <table className="w-full text-sm">
    <thead>
      <tr className="bg-slate-50">
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-8">#</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-28">Loại</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500">Câu hỏi</th>
        <th className="text-left px-4 py-2 text-xs font-bold text-slate-500 w-40">Đáp án đúng</th>
        <th className="px-4 py-2 w-20"></th>
      </tr>
    </thead>
    <tbody className="divide-y divide-slate-50">
      {questions.map((q) => (
        <tr key={q.id} className="hover:bg-slate-50/50 group">
          <td className="px-4 py-2.5 text-slate-400 text-xs">{q.order_index}</td>
          <td className="px-4 py-2.5">
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[q.type] ?? "bg-slate-100 text-slate-500"}`}>
              {TYPE_LABELS[q.type] ?? q.type}
            </span>
          </td>
          <td className="px-4 py-2.5 text-slate-700 max-w-xs truncate">{q.question_text}</td>
          <td className="px-4 py-2.5 text-green-700 font-mono text-xs max-w-[160px] truncate">{q.correct_answer}</td>
          <td className="px-4 py-2.5">
            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onEdit(q)}
                className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                title="Chỉnh sửa"
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => onDelete(q)}
                className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                title="Xóa"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </td>
        </tr>
      ))}
      {questions.length === 0 && (
        <tr>
          <td colSpan={5} className="px-4 py-6 text-center text-slate-400 text-sm">Chưa có câu hỏi nào.</td>
        </tr>
      )}
    </tbody>
  </table>
);

const ClipCard: React.FC<{
  lessonId: string;
  clip: ListeningClip;
  index: number;
  questions: QuizQuestion[];
  onDeleteClip: (clip: ListeningClip) => void;
  onAddQuestion: (lessonId: string, clipId: string, nextOrder: number) => void;
  onEditQuestion: (q: QuizQuestion) => void;
  onDeleteQuestion: (q: QuizQuestion) => void;
}> = ({ lessonId, clip, index, questions, onDeleteClip, onAddQuestion, onEditQuestion, onDeleteQuestion }) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2_key, clip.id);

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 p-3 bg-slate-50/60">
        <span className="text-xs font-display font-bold text-slate-600 shrink-0">File {index + 1}</span>
        <div className="flex-1 min-w-0">
          {playback.loading && <p className="text-[11px] text-slate-400">Đang tải...</p>}
          {playback.url && (
            <audio controls src={playback.url} className="w-full h-8">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
          {playback.error && <p className="text-[11px] text-red-500">Không tải được: {playback.error}</p>}
        </div>
        <button
          onClick={() => onAddQuestion(lessonId, clip.id, questions.length)}
          className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-100 transition-colors shrink-0"
        >
          <Plus className="w-3.5 h-3.5" /> Câu hỏi
        </button>
        <button
          onClick={() => onDeleteClip(clip)}
          className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors shrink-0"
          title="Xóa file mp3 này (xóa luôn các câu hỏi thuộc file)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
      <QuestionTable questions={questions} onEdit={onEditQuestion} onDelete={onDeleteQuestion} />
    </div>
  );
};

export const AdminQuizSection: React.FC = () => {
  const [groups, setGroups] = useState<LessonGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeTab, setActiveTab] = useState<"nguphap" | "nghe" | "doc">("nguphap");
  const [search, setSearch] = useState("");
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState<number | null>(null);

  // Modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null); // null = create
  const [editLessonId, setEditLessonId] = useState<string>("");
  const [form, setForm] = useState<EditForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<QuizQuestion | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteClipTarget, setDeleteClipTarget] = useState<ListeningClip | null>(null);
  const [deletingClip, setDeletingClip] = useState(false);

  const fetchQuestions = async () => {
    const [questionsRes, lessonsRes, clipsRes] = await Promise.all([
      supabase.from("quiz_questions").select("*").order("lesson_id").order("order_index"),
      supabase.from("lessons").select("id, title_vi, module_id, modules(title_vi)").order("order_index"),
      supabase.from("listening_clips").select("*").order("lesson_id").order("order_index"),
    ]);

    const questionsByLesson: Record<string, QuizQuestion[]> = {};
    for (const q of questionsRes.data ?? []) {
      (questionsByLesson[q.lesson_id] ??= []).push(q as QuizQuestion);
    }

    const clipsByLesson: Record<string, ListeningClip[]> = {};
    for (const c of clipsRes.data ?? []) {
      (clipsByLesson[c.lesson_id] ??= []).push(c as ListeningClip);
    }

    // Build one group per lesson (ALL lessons, not just ones that already
    // have questions) so admins can add the first Nghe/Đọc question for
    // any lesson, not only lessons that already have Ngữ pháp questions.
    const grouped: LessonGroup[] = (lessonsRes.data ?? []).map((l) => ({
      lesson_id: l.id,
      lesson_title: l.title_vi,
      module_title: (l.modules as unknown as { title_vi: string } | null)?.title_vi ?? "",
      questions: questionsByLesson[l.id] ?? [],
      clips: clipsByLesson[l.id] ?? [],
    }));

    setGroups(grouped);
    setLoading(false);
  };

  useEffect(() => { fetchQuestions(); }, []);

  const openCreate = (lessonId: string, nextOrder: number, clipId?: string) => {
    setEditId(null);
    setEditLessonId(lessonId);
    setForm({ ...EMPTY_FORM, category: activeTab, order_index: nextOrder, audio_clip_id: clipId ?? null });
    setModalOpen(true);
  };

  const openEdit = (q: QuizQuestion) => {
    setEditId(q.id);
    setEditLessonId(q.lesson_id);
    setForm({
      type: q.type,
      category: q.category,
      question_text: q.question_text,
      audio_text: q.audio_text,
      audio_clip_id: q.audio_clip_id,
      options: q.options ?? ["", "", "", ""],
      matching_pairs: q.matching_pairs ?? [{ de: "", vi: "" }],
      correct_answer: q.correct_answer,
      explanation: q.explanation,
      order_index: q.order_index,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.question_text.trim()) {
      showToast("Câu hỏi không được để trống.", "warning");
      return;
    }
    if (!form.correct_answer.trim()) {
      showToast("Đáp án đúng không được để trống.", "warning");
      return;
    }

    setSaving(true);

    const payload = {
      type: form.type,
      category: form.category,
      question_text: form.question_text,
      audio_text: form.audio_text || null,
      audio_clip_id: form.category === "nghe" ? form.audio_clip_id : null,
      options: (form.type === "multiple-choice" || form.type === "listening") ? form.options?.filter(Boolean) ?? null : null,
      matching_pairs: form.type === "matching" ? form.matching_pairs?.filter((p) => p.de || p.vi) ?? null : null,
      correct_answer: form.correct_answer,
      explanation: form.explanation,
      order_index: form.order_index,
    };

    let error;
    if (editId) {
      ({ error } = await supabase.from("quiz_questions").update(payload).eq("id", editId));
    } else {
      ({ error } = await supabase.from("quiz_questions").insert({ ...payload, lesson_id: editLessonId }));
    }

    setSaving(false);

    if (error) {
      showToast("Lưu thất bại: " + error.message, "warning");
    } else {
      showToast(editId ? "Đã cập nhật câu hỏi." : "Đã thêm câu hỏi.", "success");
      setModalOpen(false);
      fetchQuestions();
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("quiz_questions").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa câu hỏi.", "success");
      setDeleteTarget(null);
      fetchQuestions();
    }
  };

  const handleUploadClip = async (lessonId: string, file: File) => {
    setUploadingFor(lessonId);
    setUploadPct(0);
    try {
      const clipId = crypto.randomUUID();
      const objectKey = await uploadMedia(file, lessonId, "audio", setUploadPct, clipId);
      const group = groups.find((g) => g.lesson_id === lessonId);
      const nextOrder = group?.clips.length ?? 0;
      const { error } = await supabase
        .from("listening_clips")
        .insert({ id: clipId, lesson_id: lessonId, r2_key: objectKey, order_index: nextOrder });
      if (error) throw new Error(error.message);
      showToast("Đã tải file mp3 lên.", "success");
      fetchQuestions();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải file mp3 thất bại", "warning");
    } finally {
      setUploadingFor(null);
      setUploadPct(null);
    }
  };

  const handleDeleteClip = async () => {
    if (!deleteClipTarget) return;
    setDeletingClip(true);
    const { error } = await supabase.from("listening_clips").delete().eq("id", deleteClipTarget.id);
    setDeletingClip(false);
    if (error) {
      showToast("Xóa thất bại: " + error.message, "warning");
    } else {
      showToast("Đã xóa file mp3 và các câu hỏi thuộc file.", "success");
      setDeleteClipTarget(null);
      fetchQuestions();
    }
  };

  // Helpers for form fields
  const setOption = (i: number, val: string) => {
    setForm((prev) => {
      const opts = [...(prev.options ?? [])];
      opts[i] = val;
      return { ...prev, options: opts };
    });
  };

  const addOption = () => setForm((prev) => ({ ...prev, options: [...(prev.options ?? []), ""] }));
  const removeOption = (i: number) =>
    setForm((prev) => ({ ...prev, options: (prev.options ?? []).filter((_, idx) => idx !== i) }));

  const setPair = (i: number, key: "de" | "vi", val: string) => {
    setForm((prev) => {
      const pairs = [...(prev.matching_pairs ?? [])];
      pairs[i] = { ...pairs[i], [key]: val };
      return { ...prev, matching_pairs: pairs };
    });
  };

  const addPair = () =>
    setForm((prev) => ({ ...prev, matching_pairs: [...(prev.matching_pairs ?? []), { de: "", vi: "" }] }));
  const removePair = (i: number) =>
    setForm((prev) => ({ ...prev, matching_pairs: (prev.matching_pairs ?? []).filter((_, idx) => idx !== i) }));

  const inputCls = "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500";
  const labelCls = "block text-xs font-bold text-slate-600 mb-1";

  const filteredGroups = groups.filter(
    (g) =>
      g.lesson_title.toLowerCase().includes(search.toLowerCase()) ||
      g.module_title.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-48">
        <Loader2 className="w-6 h-6 text-orange-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-display font-black text-slate-900">Quản lý bài tập</h1>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm bài học..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-200/60">
        {(Object.keys(CATEGORY_LABELS) as ("nguphap" | "nghe" | "doc")[]).map((val) => (
          <button
            key={val}
            onClick={() => setActiveTab(val)}
            className={`px-4 py-2.5 text-sm font-display font-bold border-b-2 transition-colors ${
              activeTab === val
                ? "border-orange-500 text-orange-600"
                : "border-transparent text-slate-500 hover:text-slate-800"
            }`}
          >
            {CATEGORY_LABELS[val]}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {filteredGroups.map((group) => {
          const filteredQuestions = group.questions.filter((q) => q.category === activeTab);
          return (
          <div key={group.lesson_id} className="bg-white rounded-2xl border border-slate-200/60 shadow-sm overflow-hidden">
            <button
              onClick={() => setExpanded((prev) => ({ ...prev, [group.lesson_id]: !prev[group.lesson_id] }))}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-slate-50 transition-colors"
            >
              {expanded[group.lesson_id] ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <div className="flex-1">
                <p className="font-display font-bold text-slate-900 text-sm">{group.lesson_title}</p>
                <p className="text-xs text-slate-400">
                  {group.module_title} · {filteredQuestions.length} câu hỏi
                  {activeTab === "nghe" && ` · ${group.clips.length} file mp3`}
                </p>
              </div>
              {activeTab !== "nghe" && (
                <span
                  onClick={(e) => { e.stopPropagation(); openCreate(group.lesson_id, filteredQuestions.length); }}
                  className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm câu hỏi
                </span>
              )}
            </button>

            {expanded[group.lesson_id] && (
              <div className="border-t border-slate-100 p-4 space-y-3">
                {activeTab === "nghe" ? (
                  <>
                    <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition w-fit">
                      <Headphones className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className="text-xs font-bold text-slate-600">
                        {uploadingFor === group.lesson_id
                          ? `Đang tải lên... ${uploadPct}%`
                          : "Tải file mp3 mới (.mp3 / .m4a / .wav)"}
                      </span>
                      <input
                        type="file"
                        accept="audio/mpeg,audio/mp4,audio/wav,audio/x-m4a"
                        className="hidden"
                        disabled={uploadingFor !== null}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUploadClip(group.lesson_id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    {group.clips.length === 0 ? (
                      <p className="text-center py-6 text-slate-400 text-sm">Chưa có file mp3 nào cho bài học này.</p>
                    ) : (
                      <div className="space-y-3">
                        {group.clips.map((clip, idx) => (
                          <ClipCard
                            key={clip.id}
                            lessonId={group.lesson_id}
                            clip={clip}
                            index={idx}
                            questions={filteredQuestions.filter((q) => q.audio_clip_id === clip.id)}
                            onDeleteClip={setDeleteClipTarget}
                            onAddQuestion={openCreate}
                            onEditQuestion={openEdit}
                            onDeleteQuestion={setDeleteTarget}
                          />
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <QuestionTable questions={filteredQuestions} onEdit={openEdit} onDelete={setDeleteTarget} />
                )}
              </div>
            )}
          </div>
          );
        })}
        {filteredGroups.length === 0 && (
          <div className="text-center py-10 text-slate-400 text-sm">
            Không tìm thấy bài học nào khớp với "{search}".
          </div>
        )}
      </div>

      {/* Edit / Create modal */}
      {modalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg my-8 space-y-4 p-6">
            <div className="flex items-center justify-between">
              <h3 className="font-display font-bold text-slate-900">{editId ? "Chỉnh sửa câu hỏi" : "Thêm câu hỏi mới"}</h3>
              <button onClick={() => setModalOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Category, Type & Order */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Dạng bài tập</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as EditForm["category"] }))}
                  className={inputCls}
                >
                  {Object.entries(CATEGORY_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Loại câu hỏi</label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as EditForm["type"] }))}
                  className={inputCls}
                >
                  {Object.entries(TYPE_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Thứ tự (#)</label>
                <input
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm((prev) => ({ ...prev, order_index: parseInt(e.target.value) || 0 }))}
                  className={inputCls}
                  min={0}
                />
              </div>
            </div>

            {/* Question text */}
            <div>
              <label className={labelCls}>Câu hỏi *</label>
              <textarea
                rows={2}
                value={form.question_text}
                onChange={(e) => setForm((prev) => ({ ...prev, question_text: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Nhập nội dung câu hỏi..."
              />
            </div>

            {/* Audio text (listening) */}
            {form.type === "listening" && (
              <div>
                <label className={labelCls}>Nội dung nghe (audio_text)</label>
                <textarea
                  rows={2}
                  value={form.audio_text ?? ""}
                  onChange={(e) => setForm((prev) => ({ ...prev, audio_text: e.target.value }))}
                  className={inputCls + " resize-none"}
                  placeholder="Văn bản sẽ được đọc lên..."
                />
              </div>
            )}

            {/* Options (multiple-choice, listening) */}
            {(form.type === "multiple-choice" || form.type === "listening") && (
              <div>
                <label className={labelCls}>Các lựa chọn</label>
                <div className="space-y-2">
                  {(form.options ?? []).map((opt, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-400 w-5 text-center">{String.fromCharCode(65 + i)}</span>
                      <input
                        type="text"
                        value={opt}
                        onChange={(e) => setOption(i, e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder={`Lựa chọn ${String.fromCharCode(65 + i)}`}
                      />
                      {(form.options ?? []).length > 2 && (
                        <button onClick={() => removeOption(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addOption}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm lựa chọn
                  </button>
                </div>
              </div>
            )}

            {/* Matching pairs */}
            {form.type === "matching" && (
              <div>
                <label className={labelCls}>Các cặp ghép đôi</label>
                <div className="space-y-2">
                  {(form.matching_pairs ?? []).map((pair, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <GripVertical className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                      <input
                        type="text"
                        value={pair.de}
                        onChange={(e) => setPair(i, "de", e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder="Tiếng Đức"
                      />
                      <span className="text-slate-300">↔</span>
                      <input
                        type="text"
                        value={pair.vi}
                        onChange={(e) => setPair(i, "vi", e.target.value)}
                        className={inputCls + " flex-1"}
                        placeholder="Tiếng Việt"
                      />
                      {(form.matching_pairs ?? []).length > 1 && (
                        <button onClick={() => removePair(i)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-400 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button
                    onClick={addPair}
                    className="flex items-center gap-1 text-xs font-bold text-orange-600 hover:text-orange-700 px-2 py-1 rounded-lg hover:bg-orange-50 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Thêm cặp
                  </button>
                </div>
              </div>
            )}

            {/* Correct answer */}
            <div>
              <label className={labelCls}>Đáp án đúng *</label>
              {(form.type === "multiple-choice" || form.type === "listening") && (form.options ?? []).some(Boolean) ? (
                <select
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                >
                  <option value="">-- Chọn đáp án đúng --</option>
                  {(form.options ?? []).filter(Boolean).map((opt, i) => (
                    <option key={i} value={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.correct_answer}
                  onChange={(e) => setForm((prev) => ({ ...prev, correct_answer: e.target.value }))}
                  className={inputCls}
                  placeholder={form.type === "matching" ? 'JSON: [{"de":"...", "vi":"..."}]' : "Đáp án đúng..."}
                />
              )}
            </div>

            {/* Explanation */}
            <div>
              <label className={labelCls}>Giải thích</label>
              <textarea
                rows={2}
                value={form.explanation}
                onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))}
                className={inputCls + " resize-none"}
                placeholder="Giải thích tại sao đáp án này đúng..."
              />
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="secondary" className="flex-1" onClick={() => setModalOpen(false)}>Hủy</Button>
              <Button variant="primary" className="flex-1" onClick={handleSave}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                {editId ? "Lưu thay đổi" : "Thêm câu hỏi"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete question */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa câu hỏi?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="bg-red-50 rounded-xl px-4 py-3 text-sm text-red-700 line-clamp-2">
              {deleteTarget.question_text}
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteTarget(null)}>Hủy</Button>
              <button
                onClick={handleDelete}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete clip */}
      {deleteClipTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-50 rounded-full flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-display font-bold text-slate-900">Xóa file mp3?</h3>
                <p className="text-xs text-slate-500 mt-0.5">Toàn bộ câu hỏi thuộc file này cũng sẽ bị xóa. Hành động này không thể hoàn tác.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setDeleteClipTarget(null)}>Hủy</Button>
              <button
                onClick={handleDeleteClip}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 text-white text-sm font-display font-bold rounded-xl transition-colors"
              >
                {deletingClip ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                Xóa vĩnh viễn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 3: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

IMPORTANT: prior implementer attempts elsewhere in this session have submitted reports claiming "browser verification" that were actually just static code re-reading or on-paper logic reasoning — this was caught and rejected every time, requiring a full re-dispatch. Do NOT repeat this. Your report must contain literal pasted tool output.

This component does its own Supabase fetch (no injectable mock props) and requires an admin session, which this sandbox does not have (same limitation as other admin-page tasks earlier in this session — `AdminApp.tsx`'s login gate blocks it from ever mounting pre-auth). Verify by:
(a) Loading the admin route in the Browser pane and confirming via `read_console_messages`/`read_network_requests` that the edited file compiles/serves with no errors (a 200 response for `AdminQuizSection.tsx`, no console errors, no Vite overlay).
(b) A written code-level trace confirming: `ClipCard` calls `useMediaPlaybackUrl` unconditionally (not inside a branch) so Rules of Hooks are respected when mapped over `group.clips`; `handleUploadClip` generates a `clipId` via `crypto.randomUUID()` BEFORE calling `uploadMedia`, ensuring a stable id shared between the R2 object key and the `listening_clips` row; `openCreate`'s new optional `clipId` param defaults to `undefined` so existing nguphap/doc call sites (which don't pass a 3rd arg) behave identically to before.

- [ ] **Step 4: Commit**

```bash
git add src/pages/admin/AdminQuizSection.tsx
git commit -m "feat: add multi-clip audio management to admin quiz page's Nghe tab"
```

---

### Task 8: Update `AdminUsersSection.tsx` for the new Nghe-applicability field

**Files:**
- Modify: `src/pages/admin/AdminUsersSection.tsx`

**Interfaces:**
- Consumes: `completion.ts`'s `LessonContentFlags.listeningClips` shape from Task 6 — this file's local `ProgressLesson` type must structurally satisfy it.

- [ ] **Step 1: Update `ProgressLesson` and the fetch/mapping**

Find:

```tsx
interface ProgressLesson {
  id: string;
  title: string;
  titleVi: string;
  moduleTitle: string;
  level: string;
  audioR2Key?: string;
  listeningUrl?: string;
  readingText?: string;
}
```

Replace with:

```tsx
interface ProgressLesson {
  id: string;
  title: string;
  titleVi: string;
  moduleTitle: string;
  level: string;
  listeningClips: { id: string }[];
  readingText?: string;
}
```

Find:

```tsx
        lessons (id, title, title_vi, order_index, status, audio_r2_key, listening_url, reading_text)
      `)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        const flat: ProgressLesson[] = (data ?? []).flatMap((m) =>
          (m.lessons ?? [])
            .filter((l: { status: string }) => l.status === "published")
            .map((l: { id: string; title: string; title_vi: string; audio_r2_key: string | null; listening_url: string | null; reading_text: string | null }) => ({
              id: l.id,
              title: l.title,
              titleVi: l.title_vi,
              moduleTitle: m.title_vi,
              level: m.level,
              audioR2Key: l.audio_r2_key ?? undefined,
              listeningUrl: l.listening_url ?? undefined,
              readingText: l.reading_text ?? undefined,
            })),
        );
        setOrderedLessons(flat);
      });
```

Replace with:

```tsx
        lessons (id, title, title_vi, order_index, status, reading_text, listening_clips(id))
      `)
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        const flat: ProgressLesson[] = (data ?? []).flatMap((m) =>
          (m.lessons ?? [])
            .filter((l: { status: string }) => l.status === "published")
            .map((l: { id: string; title: string; title_vi: string; reading_text: string | null; listening_clips: { id: string }[] | null }) => ({
              id: l.id,
              title: l.title,
              titleVi: l.title_vi,
              moduleTitle: m.title_vi,
              level: m.level,
              listeningClips: l.listening_clips ?? [],
              readingText: l.reading_text ?? undefined,
            })),
        );
        setOrderedLessons(flat);
      });
```

- [ ] **Step 2: Update the `hasNghe` computation in the progress modal**

Find:

```tsx
                      const hasNghe = !!(l.audioR2Key || l.listeningUrl);
```

Replace with:

```tsx
                      const hasNghe = l.listeningClips.length > 0;
```

- [ ] **Step 3: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 4: Manual verification**

Same sandbox limitation as other admin-page tasks (no admin session available). Verify: (a) a real Browser-pane check that the edited file compiles/serves with no console/network errors on the admin login route, and (b) a written trace confirming `ProgressLesson` (this file's local type) structurally satisfies `completion.ts`'s `LessonContentFlags` (has `id: string` and `listeningClips?: { id: string }[]` — the field is non-optional here but that's still assignable to an optional field), so `computeCompletedLessons`/`furthestCompletedLesson` (already called elsewhere in this file, unchanged) keep compiling and behaving correctly.

- [ ] **Step 5: Commit**

```bash
git add src/pages/admin/AdminUsersSection.tsx
git commit -m "feat: update admin progress view to use listeningClips instead of single audio field"
```

---

### Task 9: LessonDetailPage — show multiple clip players

**Files:**
- Create: `src/components/ListeningClipPlayer.tsx`
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: `useMediaPlaybackUrl(lessonId, type, objectKey, clipId?)` from Task 4; `Lesson.listeningClips` from Task 5.
- Produces: `ListeningClipPlayer({ lessonId, clip, label }: { lessonId: string; clip: { id: string; r2Key: string }; label: string })` component, reusable by any page needing to render one clip's player (only consumer for now is this task).

- [ ] **Step 1: Create the clip player component**

Create `src/components/ListeningClipPlayer.tsx`:

```tsx
import React from "react";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";

interface ListeningClipPlayerProps {
  lessonId: string;
  clip: { id: string; r2Key: string };
  label: string;
}

export const ListeningClipPlayer: React.FC<ListeningClipPlayerProps> = ({ lessonId, clip, label }) => {
  const playback = useMediaPlaybackUrl(lessonId, "audio", clip.r2Key, clip.id);
  return (
    <div className="space-y-1.5">
      <span className="text-xs font-display font-bold text-slate-500">{label}</span>
      {playback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
      {playback.url && (
        <audio controls src={playback.url} className="w-full rounded-xl">
          Trình duyệt không hỗ trợ audio.
        </audio>
      )}
      {playback.error && <p className="text-xs text-red-500">Không tải được audio: {playback.error}</p>}
    </div>
  );
};
```

- [ ] **Step 2: Update `LessonDetailPage.tsx`'s imports and remove the old top-level playback hook**

Find:

```tsx
import { LevelBadge, Button } from "../components/DesignSystem";
import { VideoPlayer } from "../components/VideoPlayer";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";
```

Replace with:

```tsx
import { LevelBadge, Button } from "../components/DesignSystem";
import { VideoPlayer } from "../components/VideoPlayer";
import { MarkdownBlock } from "../components/MarkdownBlock";
import { ListeningClipPlayer } from "../components/ListeningClipPlayer";
import { Lesson, UserStats } from "../lib/appTypes";
import { showToast } from "../lib/toast";
```

Find:

```tsx
  const [bottomTab, setBottomTab] = useState<BottomTab>("tuvung");
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", lesson.audioR2Key);
```

Replace with:

```tsx
  const [bottomTab, setBottomTab] = useState<BottomTab>("tuvung");
```

- [ ] **Step 3: Replace the Nghe tab content**

Find:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.audioR2Key ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
                  {audioPlayback.url && (
                    <audio controls src={audioPlayback.url} className="w-full rounded-xl">
                      Trình duyệt không hỗ trợ audio.
                    </audio>
                  )}
                  {audioPlayback.error && <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>}
                </>
              ) : lesson.listeningUrl ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  <audio
                    controls
                    src={lesson.listeningUrl}
                    className="w-full rounded-xl"
                  >
                    Trình duyệt không hỗ trợ audio.
                  </audio>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài luyện nghe cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {(lesson.audioR2Key || lesson.listeningUrl) && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                    Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

Replace with:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.listeningClips.length > 0 ? (
                <>
                  <div className="flex items-center gap-2 mb-2">
                    <Headphones className="w-4 h-4 text-orange-500" />
                    <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
                  </div>
                  <div className="space-y-4">
                    {lesson.listeningClips.map((clip, idx) => (
                      <ListeningClipPlayer key={clip.id} lessonId={lesson.id} clip={clip} label={`File ${idx + 1}`} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
                  <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center">
                    <Headphones className="w-6 h-6 text-slate-400" />
                  </div>
                  <p className="text-sm font-display font-bold text-slate-500">Sắp có</p>
                  <p className="text-xs text-slate-400">Bài luyện nghe cho bài học này đang được chuẩn bị.</p>
                </div>
              )}
              {lesson.listeningClips.length > 0 && (
                <div className="flex justify-center pt-2">
                  <Button id="btn-lesson-start-nghe" variant="primary" onClick={() => onStartQuiz(lesson.id, "nghe")}>
                    Bắt đầu bài tập nghe <ArrowRight className="w-4 h-4 ml-1.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

Build a throwaway harness `dbgtest.html` + `dbgtest.tsx` at repo root rendering `LessonDetailPage` with mock props: a `Lesson` with `listeningClips: []` (confirm "Sắp có" shows, no start button), and a second scenario with `listeningClips: [{id:"c1", r2Key:"audio/x/c1.mp3"}, {id:"c2", r2Key:"audio/x/c2.mp3"}]` (confirm 2 "File 1"/"File 2" players render, and the "Bắt đầu bài tập nghe" button appears). The presigned-URL fetch itself will fail in this sandbox (no real session/R2 credentials) — that's fine and expected; you're verifying the LIST of players renders (2 labels, 2 `<audio>`-or-error placeholders), not that audio actually plays. Paste literal `get_page_text`/`read_page` output. Delete the harness before committing.

- [ ] **Step 6: Commit**

```bash
git add src/components/ListeningClipPlayer.tsx src/pages/LessonDetailPage.tsx
git commit -m "feat: show list of listening clips (instead of single audio) on lesson page"
```

---

### Task 10: QuizPage — group Nghe questions by clip

**Files:**
- Modify: `src/pages/QuizPage.tsx`

**Interfaces:**
- Consumes: `Lesson.listeningClips` (Task 5), `QuizQuestion.audioClipId` (Task 5), `useMediaPlaybackUrl(lessonId, type, objectKey, clipId?)` (Task 4).

- [ ] **Step 1: Reorder/group questions by clip**

Find:

```tsx
  const { questions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id, category);
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", lesson.audioR2Key);

  const [currentIdx, setCurrentIdx] = useState(0);
```

Replace with:

```tsx
  const { questions: rawQuestions, loading: questionsLoading, error: questionsError } = useQuizQuestions(lesson.id, category);

  // For Nghe, group+reorder questions by their owning clip (in clip upload
  // order) so the learner works through one mp3's questions at a time,
  // rather than relying on raw order_index alone. A question whose
  // audioClipId doesn't match any of the lesson's clips is defensively
  // dropped (shouldn't happen post-migration, but avoids an ungrouped
  // orphan question breaking the per-clip audio recap below).
  const questions = category === "nghe"
    ? (lesson.listeningClips ?? []).flatMap((clip) => rawQuestions.filter((q) => q.audioClipId === clip.id))
    : rawQuestions;

  const [currentIdx, setCurrentIdx] = useState(0);
```

- [ ] **Step 2: Compute the active clip and move the playback hook next to `activeQuestion`**

Find:

```tsx
  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;
```

Replace with:

```tsx
  const activeQuestion = questions[currentIdx];
  const isLastQuestion = currentIdx === questions.length - 1;
  const activeClip = category === "nghe" && activeQuestion
    ? (lesson.listeningClips ?? []).find((c) => c.id === activeQuestion.audioClipId)
    : undefined;
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", activeClip?.r2Key, activeClip?.id);
```

- [ ] **Step 3: Update the audio recap block to use `activeClip`**

Find:

```tsx
      {/* Audio recap (Nghe exercises only) */}
      {category === "nghe" && (lesson.audioR2Key || lesson.listeningUrl) && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
          </div>
          {lesson.audioR2Key ? (
            <>
              {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
              {audioPlayback.url && (
                <audio controls src={audioPlayback.url} className="w-full rounded-xl">
                  Trình duyệt không hỗ trợ audio.
                </audio>
              )}
              {audioPlayback.error && <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>}
            </>
          ) : (
            <audio controls src={lesson.listeningUrl} className="w-full rounded-xl">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
        </div>
      )}
```

Replace with:

```tsx
      {/* Audio recap (Nghe exercises only) — shows the clip that owns the current question */}
      {category === "nghe" && activeClip && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Headphones className="w-4 h-4 text-orange-500" />
            <span className="text-sm font-display font-bold text-slate-800">Luyện nghe</span>
          </div>
          {audioPlayback.loading && <p className="text-xs text-slate-400">Đang tải...</p>}
          {audioPlayback.url && (
            <audio controls src={audioPlayback.url} className="w-full rounded-xl">
              Trình duyệt không hỗ trợ audio.
            </audio>
          )}
          {audioPlayback.error && <p className="text-xs text-red-500">Không tải được audio: {audioPlayback.error}</p>}
        </div>
      )}
```

- [ ] **Step 4: Run lint**

Run: `source ~/.nvm/nvm.sh && nvm use 20 && npm run lint`
Expected: no errors.

- [ ] **Step 5: Manual browser verification (mandatory — use the real Browser pane tools, not static code re-reading)**

Build a throwaway harness (module-stub `useQuizQuestions` the way earlier tasks in this session's history stubbed hooks, since this needs predictable mock questions without a real quiz-submit session) rendering `QuizPage` with `category="nghe"`, a mock `lesson.listeningClips = [{id:"c1", r2Key:"a"}, {id:"c2", r2Key:"b"}]`, and mock questions: 2 questions with `audioClipId: "c2"` fetched/returned BEFORE 2 questions with `audioClipId: "c1"` (i.e. out of clip order in the raw array, to prove the grouping logic — not just raw array order — determines navigation order). Verify via `read_page`/`get_page_text`:
1. The FIRST question shown (`currentIdx=0`) is one of the `c1`-tagged questions (not a `c2` one), proving the flatMap grouped by `lesson.listeningClips` order (c1 before c2) rather than the raw fetch order.
2. The "Luyện nghe" recap block is present for this first question.
3. Advancing through all 4 questions (via the "Tiếp theo" button, answering minimally to enable it) visits both `c1` questions before either `c2` question.

Delete the harness before committing. Paste literal tool output into the report.

- [ ] **Step 6: Commit**

```bash
git add src/pages/QuizPage.tsx
git commit -m "feat: group and reorder Nghe questions by their owning audio clip"
```

---

## Final Notes

- Tasks 1 → 2 → 3 → 4 → 5 → 6 must land in order (each depends on the DB/API/type contract the previous one establishes).
- Tasks 7, 8, 9, 10 all depend on Tasks 1-6 being complete, but are independent of each other (still execute sequentially per this session's process, never in parallel).
- After all 10 tasks pass task-level review, run a final whole-branch review (this plan is large enough to warrant one, unlike the single-task admin-search plan), then `superpowers:finishing-a-development-branch`.
- Known accepted risk, not to be "fixed" beyond what's described: `src/data/mockData.ts` (if it exists and constructs `Lesson` objects for any remaining mock/demo code path) needs `listeningClips: []` added to stay type-correct — this is called out explicitly in Task 6 Step 2 as an in-scope mechanical fix if lint surfaces it, not a separate task.
