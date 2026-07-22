# Video Explanation Images Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Admin embed images inside the "Ngữ pháp then chốt" (grammar_md) content of a lesson, stored privately on the existing Cloudflare R2 infrastructure and resolved to signed URLs at render time — exactly like video/audio already work.

**Architecture:** Images are embedded inline in the existing `grammar_md` markdown text using a custom `r2img:<objectKey>` scheme (parallel to the existing `pronounce:` scheme trick already in `MarkdownBlock.tsx`). Admin uploads via a "Thêm ảnh" button or by pasting an image into the textarea; both go through the existing R2 presigned-upload endpoint (extended with an `"image"` media type). At render time (both in Admin preview and the student-facing lesson page), `MarkdownBlock` resolves `r2img:` references to short-lived signed URLs via the existing R2 presigned-playback endpoint (also extended with `"image"`), reusing the existing `useMediaPlaybackUrl` hook.

**Tech Stack:** React 19 + TypeScript, Vite, Supabase (auth only for this feature), Cloudflare R2 via `@aws-sdk/client-s3` presigned URLs (existing `api/media/*.ts` Vercel serverless functions), `react-markdown` (existing `MarkdownBlock.tsx`).

## Global Constraints

- Scope is limited to the `grammar_md` field ("Ngữ pháp then chốt") only — do not touch `speaking_md`, `writing_prompt_md`, or `vocabulary_md`.
- Permission gate: reuse the existing `app_metadata.role === "admin"` check already present in `api/media/upload-url.ts` and `api/media/playback-url.ts`. Do not add a `content_manager` role.
- Allowed image formats: `jpg`, `jpeg`, `png`, `webp`. Max size: 5 MB, enforced client-side before requesting an upload URL.
- No new npm dependencies.
- No Supabase schema changes — images are referenced entirely inside the existing `grammar_md` text column, no new column or table.
- **Test infra note:** this repository has no unit/e2e test runner wired up (no Jest/Vitest config, no Playwright config despite the devDependency, no existing `*.test.ts`/`*.spec.ts` files). The project's own documented workflow (`CLAUDE.md`) is: implement → `npm run lint` (`tsc --noEmit`) → manual browser test. This plan follows that convention: every code task ends with a `tsc --noEmit` check, and full behavioral verification happens in the final manual end-to-end task using the browser preview tool. Do not introduce a new test framework to fulfil this plan's "test" steps.
- Vietnamese user-facing strings, English code/identifiers, per `CLAUDE.md`.

---

## File Structure

All changes are modifications to existing files — no new files are created:

- `api/media/upload-url.ts` — add `"image"` to the media-type union; server generates a random object key under `images/{lessonId}/`.
- `src/lib/uploadMedia.ts` — widen the `mediaType` parameter to accept `"image"`.
- `api/media/playback-url.ts` — add an `"image"` branch that validates a client-supplied `objectKey` against the lesson's `images/{lessonId}/` prefix before signing it.
- `src/lib/hooks/useMediaPlaybackUrl.ts` — widen the `type` parameter to accept `"image"` and forward `objectKey` to the API for that case.
- `src/components/MarkdownBlock.tsx` — add an `R2Image` component that resolves `r2img:` references via `useMediaPlaybackUrl`; wire it into the `img` renderer; accept a new `lessonId` prop; extend `urlTransform` to allow the `r2img:` scheme.
- `src/pages/admin/AdminLessonEditor.tsx` — add a "Thêm ảnh" upload button and paste-to-upload handler on the grammar textarea; insert `![](r2img:<objectKey>)` at the cursor; pass `lessonId` to the preview `MarkdownBlock`.
- `src/pages/LessonDetailPage.tsx` — pass `lessonId` to the `MarkdownBlock` used for the "Ngữ pháp then chốt" tab.

---

### Task 1: Backend + client upload support for images

**Files:**
- Modify: `api/media/upload-url.ts`
- Modify: `src/lib/uploadMedia.ts`

**Interfaces:**
- Produces: `uploadMedia(file: File, lessonId: string, mediaType: "video" | "audio" | "image", onProgress: (pct: number) => void, clipId?: string): Promise<string>` — for `mediaType: "image"`, resolves to an object key of the form `images/{lessonId}/{uuid}.{ext}`.

- [ ] **Step 1: Extend `api/media/upload-url.ts` to support `mediaType: "image"`**

Replace the top of the file (imports through `buildObjectKey`) with:

```typescript
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";

type MediaType = "video" | "audio" | "image";

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
}
interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(body: unknown): void;
}

const ALLOWED_EXT: Record<MediaType, string[]> = {
  video: ["mp4"],
  audio: ["mp3", "m4a", "wav"],
  image: ["jpg", "jpeg", "png", "webp"],
};

export function isAllowedExt(mediaType: MediaType, ext: string): boolean {
  return ALLOWED_EXT[mediaType].includes(ext.toLowerCase());
}

export function buildObjectKey(mediaType: MediaType, lessonId: string, ext: string, clipId?: string, randomId?: string): string {
  if (mediaType === "video") {
    return `videos/${lessonId}.${ext.toLowerCase()}`;
  }
  if (mediaType === "image") {
    return `images/${lessonId}/${randomId}.${ext.toLowerCase()}`;
  }
  return `audio/${lessonId}/${clipId}.${ext.toLowerCase()}`;
}
```

Then update the body-validation and object-key-construction section of `handler` (the block starting at `const body = req.body as ...` through `const objectKey = buildObjectKey(...)`) to:

```typescript
  const body = req.body as { lessonId?: string; mediaType?: string; fileExt?: string; clipId?: string };
  const { lessonId, fileExt, clipId } = body;
  const mediaType = body.mediaType;

  if (!lessonId || (mediaType !== "video" && mediaType !== "audio" && mediaType !== "image") || !fileExt) {
    res.status(400).json({ error: "lessonId, mediaType (video|audio|image), fileExt required" });
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

  const objectKey = buildObjectKey(mediaType, lessonId, fileExt, clipId, mediaType === "image" ? randomUUID() : undefined);
```

Leave the rest of the file (the `S3Client` construction, `getSignedUrl` call, and JSON response) unchanged — it already returns `{ uploadUrl, objectKey }` generically for any `objectKey`.

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: no errors from `api/media/upload-url.ts`.

- [ ] **Step 3: Widen `src/lib/uploadMedia.ts` to accept `"image"`**

In `src/lib/uploadMedia.ts`, change the function signature:

```typescript
export async function uploadMedia(
  file: File,
  lessonId: string,
  mediaType: "video" | "audio" | "image",
  onProgress: (pct: number) => void,
  clipId?: string,
): Promise<string> {
```

No other lines in this file need to change — the rest of the function (fetching the upload URL, PUT-ing the file, returning `objectKey`) is already generic over `mediaType`.

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add api/media/upload-url.ts src/lib/uploadMedia.ts
git commit -m "feat: support image uploads in R2 upload-url endpoint"
```

---

### Task 2: Backend + client playback (signed URL) support for images

**Files:**
- Modify: `api/media/playback-url.ts`
- Modify: `src/lib/hooks/useMediaPlaybackUrl.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `useMediaPlaybackUrl(lessonId: string, type: "video" | "audio" | "image", objectKey: string | undefined, clipId?: string): { url: string | null; loading: boolean; error: string | null }` — for `type: "image"`, `objectKey` must be the full key returned by `uploadMedia` (e.g. `images/{lessonId}/{uuid}.jpg`) and is forwarded to the API for signing.

- [ ] **Step 1: Add the `"image"` branch to `api/media/playback-url.ts`**

Change the type check near the top of `handler` from:

```typescript
  const lessonId = typeof req.query.lessonId === "string" ? req.query.lessonId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const clipId = typeof req.query.clipId === "string" ? req.query.clipId : undefined;

  if (!lessonId || (type !== "video" && type !== "audio")) {
    res.status(400).json({ error: "lessonId and type (video|audio) required" });
    return;
  }
```

to:

```typescript
  const lessonId = typeof req.query.lessonId === "string" ? req.query.lessonId : undefined;
  const type = typeof req.query.type === "string" ? req.query.type : undefined;
  const clipId = typeof req.query.clipId === "string" ? req.query.clipId : undefined;

  if (!lessonId || (type !== "video" && type !== "audio" && type !== "image")) {
    res.status(400).json({ error: "lessonId and type (video|audio|image) required" });
    return;
  }
```

Then replace the object-key-resolution block:

```typescript
  let objectKey: string | undefined;

  if (type === "audio" && clipId) {
```

with:

```typescript
  let objectKey: string | undefined;

  if (type === "image") {
    const rawKey = typeof req.query.objectKey === "string" ? req.query.objectKey : undefined;
    const prefix = `images/${lessonId}/`;
    const suffix = rawKey?.startsWith(prefix) ? rawKey.slice(prefix.length) : undefined;
    const validSuffix = suffix !== undefined && /^[a-f0-9-]+\.(jpg|jpeg|png|webp)$/i.test(suffix);
    if (!rawKey || !validSuffix) {
      res.status(400).json({ error: "Invalid objectKey" });
      return;
    }
    objectKey = rawKey;
  } else if (type === "audio" && clipId) {
```

Leave everything else in the file (the `audio`+`clipId` branch, the final `else` branch for `video`/`audio` without `clipId`, the `if (!objectKey)` 404 check, and the `getSignedUrl` call with `expiresIn: 14400`) unchanged.

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: no errors from `api/media/playback-url.ts`.

- [ ] **Step 3: Widen `src/lib/hooks/useMediaPlaybackUrl.ts` to accept `"image"` and forward `objectKey`**

Replace the full file contents with:

```typescript
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export function useMediaPlaybackUrl(
  lessonId: string,
  type: "video" | "audio" | "image",
  objectKey: string | undefined,
  clipId?: string,
): { url: string | null; loading: boolean; error: string | null } {
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!objectKey) {
      setUrl(null);
      setLoading(false);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        if (!cancelled) { setError("Chưa đăng nhập"); setLoading(false); }
        return;
      }
      try {
        const clipParam = clipId ? `&clipId=${encodeURIComponent(clipId)}` : "";
        const objectKeyParam = type === "image" ? `&objectKey=${encodeURIComponent(objectKey)}` : "";
        const res = await fetch(`/api/media/playback-url?lessonId=${encodeURIComponent(lessonId)}&type=${type}${clipParam}${objectKeyParam}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { url: string };
        if (!cancelled) { setUrl(body.url); setLoading(false); }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Không tải được media");
          setLoading(false);
        }
      }
    })();

    return () => { cancelled = true; };
  }, [lessonId, type, objectKey, clipId]);

  return { url, loading, error };
}
```

(Only the `type` parameter type and the new `objectKeyParam` line changed from the original.)

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: no errors. `src/components/VideoPlayer.tsx` still calls `useMediaPlaybackUrl(lessonId, "video", videoR2Key)` and must still compile unchanged.

- [ ] **Step 5: Commit**

```bash
git add api/media/playback-url.ts src/lib/hooks/useMediaPlaybackUrl.ts
git commit -m "feat: support signed playback URLs for images"
```

---

### Task 3: Resolve `r2img:` references in MarkdownBlock

**Files:**
- Modify: `src/components/MarkdownBlock.tsx`

**Interfaces:**
- Consumes: `useMediaPlaybackUrl` from Task 2 (`src/lib/hooks/useMediaPlaybackUrl.ts`).
- Produces: `MarkdownBlock` gains an optional `lessonId?: string` prop. When `content` contains `![alt](r2img:<objectKey>)` and `lessonId` is provided, it renders the resolved image (loading skeleton while fetching, "Không tải được ảnh" text on failure). Plain `http(s)`/relative image URLs continue to render exactly as before.

- [ ] **Step 1: Add the `r2img:` scheme constant and allow it through `urlTransform`**

In `src/components/MarkdownBlock.tsx`, near the existing `PRONOUNCE_SCHEME` constant (around line 83), add:

```typescript
const VOCAB_WORD_PATTERN = /\{\{([^{}]+)\}\}/g;
const PRONOUNCE_SCHEME = "pronounce:";
const R2IMG_SCHEME = "r2img:";
```

Update `urlTransform` (currently):

```typescript
function urlTransform(url: string): string {
  return url.startsWith(PRONOUNCE_SCHEME) ? url : defaultUrlTransform(url);
}
```

to:

```typescript
function urlTransform(url: string): string {
  return url.startsWith(PRONOUNCE_SCHEME) || url.startsWith(R2IMG_SCHEME) ? url : defaultUrlTransform(url);
}
```

- [ ] **Step 2: Add the `R2Image` component**

Add this import at the top of the file, alongside the existing imports:

```typescript
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";
```

Add the `R2Image` component right after the `TaskCheckbox` component (around line 192), before `CodeBlock`:

```typescript
function R2Image({ objectKey, lessonId, alt }: { objectKey: string; lessonId: string; alt?: string }) {
  const { url, loading, error } = useMediaPlaybackUrl(lessonId, "image", objectKey);
  if (loading) {
    return <div className="rounded-lg bg-slate-100 animate-pulse w-full h-40 my-1" />;
  }
  if (error || !url) {
    return <p className="text-xs text-red-500 my-1">Không tải được ảnh</p>;
  }
  return <img src={url} alt={alt} className="rounded-lg max-w-full my-1" />;
}

function ContentImage({ src, alt, lessonId }: { src?: string; alt?: string; lessonId?: string }) {
  if (src?.startsWith(R2IMG_SCHEME) && lessonId) {
    return <R2Image objectKey={src.slice(R2IMG_SCHEME.length)} lessonId={lessonId} alt={alt} />;
  }
  return <img src={src} alt={alt} className="rounded-lg max-w-full my-1" />;
}
```

- [ ] **Step 3: Wire `lessonId` through `MarkdownBlock` and override the `img` renderer per-render**

Replace the base `components.img` entry (currently `img: ({ src, alt }) => <img src={src} alt={alt} className="rounded-lg max-w-full my-1" />,` in the module-level `components` object) — delete that line from the `components` object entirely, since the image renderer now needs access to the `lessonId` prop and must be built inside `MarkdownBlock` instead of the static object.

Then replace the `MarkdownBlock` component (from `export const MarkdownBlock` to the end of the file) with:

```typescript
export const MarkdownBlock: React.FC<{
  content: string;
  className?: string;
  lessonId?: string;
  onWordClick?: (word: string) => void;
}> = ({ content, className, lessonId, onWordClick }) => {
  const pronounceWords: string[] = [];
  const preprocessed = preprocessMarkdown(content);
  const processedContent = onWordClick ? wrapPronounceWords(preprocessed, pronounceWords) : preprocessed;

  const activeComponents: Components = {
    ...components,
    img: ({ src, alt }) => <ContentImage src={src} alt={alt} lessonId={lessonId} />,
    ...(onWordClick
      ? {
          a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
            if (href?.startsWith(PRONOUNCE_SCHEME)) {
              const word = pronounceWords[Number(href.slice(PRONOUNCE_SCHEME.length))];
              return (
                <button
                  type="button"
                  onClick={() => onWordClick(word)}
                  className="font-display font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 active:scale-95 rounded px-1 -mx-0.5 transition cursor-pointer"
                >
                  {children}
                </button>
              );
            }
            return (
              <a href={href} target="_blank" rel="noopener noreferrer" className="text-orange-600 underline hover:text-orange-700">
                {children}
              </a>
            );
          },
        }
      : {}),
  };

  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={activeComponents} urlTransform={urlTransform}>
        {processedContent}
      </ReactMarkdown>
    </div>
  );
};
```

- [ ] **Step 4: Type-check**

Run: `npm run lint`
Expected: no errors. If `Components` type complains about the inline `a` override's parameter types, match the exact shape react-markdown expects by removing the explicit `{ href, children }` annotation and letting it infer from `Components["a"]` — but first try as written above, since this mirrors the original code's structure.

- [ ] **Step 5: Commit**

```bash
git add src/components/MarkdownBlock.tsx
git commit -m "feat: resolve r2img: image references to signed R2 URLs in MarkdownBlock"
```

---

### Task 4: Admin UI — "Thêm ảnh" button and paste-to-upload

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx`

**Interfaces:**
- Consumes: `uploadMedia(file, lessonId, "image", onProgress)` (Task 1), `MarkdownBlock` with `lessonId` prop (Task 3), `showToast` from `src/lib/toast.ts`.
- Produces: admin can upload an image via button or paste; on success, `![](r2img:<objectKey>)` is inserted into `data.grammar_md` at the cursor and the grammar tab switches to "Xem trước".

- [ ] **Step 1: Add `useRef` import and image-upload state**

Change the top import line:

```typescript
import React, { useState } from "react";
```

to:

```typescript
import React, { useState, useRef } from "react";
```

Add `Image as ImageIcon` to the `lucide-react` import:

```typescript
import {
  ArrowLeft, Save,
  GraduationCap, Video, Loader2,
  Globe, EyeOff, Image as ImageIcon,
} from "lucide-react";
```

Inside `AdminLessonEditor`, alongside the existing `videoUploadPct` state (around line 64), add:

```typescript
  const [imageUploadPct, setImageUploadPct] = useState<number | null>(null);
  const grammarTextareaRef = useRef<HTMLTextAreaElement>(null);
```

- [ ] **Step 2: Add the upload + insert handlers**

Right after `handleVideoUpload` (around line 79), add:

```typescript
  const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
  const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

  const insertGrammarImage = (objectKey: string) => {
    const textarea = grammarTextareaRef.current;
    const current = data.grammar_md ?? "";
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? current.length;
    const snippet = `![](r2img:${objectKey})`;
    const next = `${current.slice(0, start)}${snippet}${current.slice(end)}`;
    upd({ grammar_md: next });
    setGrammarTab("preview");
  };

  const handleGrammarImageUpload = async (file: File) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      showToast("Chỉ hỗ trợ ảnh JPG, PNG hoặc WEBP", "warning");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      showToast("Ảnh vượt quá 5MB", "warning");
      return;
    }
    setImageUploadPct(0);
    try {
      const objectKey = await uploadMedia(file, data.id, "image", setImageUploadPct);
      insertGrammarImage(objectKey);
      showToast("Đã thêm ảnh vào nội dung.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải ảnh lên thất bại", "warning");
    } finally {
      setImageUploadPct(null);
    }
  };

  const handleGrammarPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const item = Array.from(e.clipboardData.items).find(it => it.type.startsWith("image/"));
    if (!item) return;
    e.preventDefault();
    const file = item.getAsFile();
    if (file) handleGrammarImageUpload(file);
  };
```

Note `data.grammar_md` is `string | null | undefined` per `LessonEditable`; `current` above already normalizes that with `?? ""`.

- [ ] **Step 3: Type-check**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 4: Add the "Thêm ảnh" button and wire the textarea**

In the Grammar block (around line 240-256), replace the header row:

```typescript
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Ngữ pháp then chốt
              </span>
              <div className="flex rounded-lg overflow-hidden border border-slate-200">
                {(["edit", "preview"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setGrammarTab(tab)}
                    className={`px-3 py-1 text-[11px] font-bold transition-colors ${grammarTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                  >
                    {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                  </button>
                ))}
              </div>
            </div>
```

with:

```typescript
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[10px] font-display font-bold text-yellow-400 bg-slate-950 border border-slate-800 px-2.5 py-0.5 rounded-full uppercase tracking-wider font-mono">
                Ngữ pháp then chốt
              </span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 bg-white border border-slate-200 rounded-lg px-2.5 py-1 cursor-pointer hover:bg-slate-50 transition">
                  <ImageIcon className="w-3.5 h-3.5 text-orange-500" />
                  {imageUploadPct !== null ? `Đang tải... ${imageUploadPct}%` : "Thêm ảnh"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={imageUploadPct !== null}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleGrammarImageUpload(f); e.target.value = ""; }}
                  />
                </label>
                <div className="flex rounded-lg overflow-hidden border border-slate-200">
                  {(["edit", "preview"] as const).map(tab => (
                    <button
                      key={tab}
                      onClick={() => setGrammarTab(tab)}
                      className={`px-3 py-1 text-[11px] font-bold transition-colors ${grammarTab === tab ? "bg-orange-500 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}
                    >
                      {tab === "edit" ? "Chỉnh sửa" : "Xem trước"}
                    </button>
                  ))}
                </div>
              </div>
            </div>
```

Then update the textarea in the same block to attach the ref and paste handler:

```typescript
                <textarea
                  ref={grammarTextareaRef}
                  rows={12}
                  value={data.grammar_md ?? ""}
                  onChange={e => upd({ grammar_md: e.target.value })}
                  onPaste={handleGrammarPaste}
                  placeholder={"## Mạo từ (Artikel)\n\nTiếng Đức có 3 mạo từ: **der** (nam), **die** (nữ), **das** (trung)\n\n### Ví dụ\n- **der** Mann (người đàn ông)\n- **die** Frau (người phụ nữ)\n- **das** Kind (đứa trẻ)"}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 font-mono resize-y bg-white"
                />
```

And update the preview render in the same block to pass `lessonId`:

```typescript
                {data.grammar_md ? (
                  <MarkdownBlock content={data.grammar_md} lessonId={data.id} />
                ) : (
                  <p className="text-xs text-slate-400 italic">Chưa có nội dung ngữ pháp.</p>
                )}
```

- [ ] **Step 5: Type-check**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx
git commit -m "feat: add image upload button and paste-to-upload to grammar editor"
```

---

### Task 5: Student-facing rendering

**Files:**
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Consumes: `MarkdownBlock` with `lessonId` prop (Task 3).

- [ ] **Step 1: Pass `lessonId` to the grammar `MarkdownBlock`**

In `src/pages/LessonDetailPage.tsx` (around line 194), change:

```typescript
                  <MarkdownBlock content={lesson.grammarMd} onWordClick={handlePronounce} />
```

to:

```typescript
                  <MarkdownBlock content={lesson.grammarMd} lessonId={lesson.id} onWordClick={handlePronounce} />
```

- [ ] **Step 2: Type-check**

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/LessonDetailPage.tsx
git commit -m "feat: resolve grammar images on the student lesson page"
```

---

### Task 6: Manual end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Start the dev server and open the admin lesson editor**

Use the browser preview tool to start the `dev` server (`npm run dev`) and navigate to an existing lesson's editor screen (Admin → Content → pick a lesson → open editor). Confirm the "Ngữ pháp then chốt" block shows the new "Thêm ảnh" button next to the Chỉnh sửa/Xem trước toggle.

- [ ] **Step 2: Upload a valid image via the button**

Click "Thêm ảnh", pick a JPG (or PNG/WEBP) under 5MB. Confirm: a `Đang tải... N%` state appears briefly, a success toast appears, the tab auto-switches to "Xem trước", and the image renders inline in the preview.

- [ ] **Step 3: Upload a second image via paste**

Copy an image to the clipboard (e.g. screenshot), click into the grammar textarea (switch back to "Chỉnh sửa" first), and paste (Cmd/Ctrl+V). Confirm it uploads and inserts the same way as Step 2, and both images now appear in "Xem trước", in the order they were inserted.

- [ ] **Step 4: Reject invalid uploads**

Try uploading a `.pdf` or `.gif` file via the button — confirm a warning toast appears (format not supported) and neither the textarea content nor previously-inserted images change. Try uploading an image over 5MB (or temporarily lower `MAX_IMAGE_BYTES` in a scratch edit to test with a smaller file, then revert) — confirm a warning toast about the size limit and no content change.

- [ ] **Step 5: Replace / delete an image via text edit**

Switch to "Chỉnh sửa", find one of the `![](r2img:...)` lines, delete it or change its position relative to the surrounding text, save (`Lưu bài học`), then reopen the lesson editor. Confirm the change persisted correctly and the remaining image(s) still render.

- [ ] **Step 6: Verify persistence across reload**

After saving with images present, fully reload the browser page and reopen the same lesson's editor. Confirm the "Xem trước" tab still resolves and displays the saved image(s) correctly (proves the `r2img:` reference round-trips through the DB and re-resolves to a fresh signed URL).

- [ ] **Step 7: Verify the student-facing page**

Navigate to the same lesson as a learner (Roadmap → lesson → "Ngữ pháp then chốt" tab). Confirm the image(s) render correctly alongside the text, in the saved order.

- [ ] **Step 8: Verify responsive layout**

Using the browser preview tool's `resize_window`, check the student lesson page at mobile (375×812), tablet (768×1024), and desktop (1280×800) widths. Confirm images scale to the content width and never overflow or break the layout.

- [ ] **Step 9: Verify old text-only lessons are unaffected**

Open a lesson whose `grammar_md` has no `r2img:` references (plain text/markdown only). Confirm it still displays and edits exactly as before, with no loading skeletons or errors from the new `R2Image` code path.

- [ ] **Step 10: Final full lint pass**

Run: `npm run lint`
Expected: no errors across the whole project.

---

## Self-Review Notes

- **Spec coverage:** upload button ✓ (Task 4), paste ✓ (Task 4), format/size validation with clear errors ✓ (Task 4, verified Task 6 Step 4), multiple images in one content block ✓ (markdown-native, verified Task 6 Step 3), replace/delete before and after save ✓ (Task 6 Step 5), persistence on reopen ✓ (Task 6 Step 6), upload failure doesn't lose existing content ✓ (handler only mutates state on success, verified Task 6 Step 4), student page displays images ✓ (Task 5, verified Task 6 Step 7), responsive on desktop/tablet/mobile ✓ (verified Task 6 Step 8), old text-only content unaffected ✓ (verified Task 6 Step 9).
- **Type consistency:** `mediaType`/`type` unions (`"video" | "audio" | "image"`) match across `upload-url.ts`, `uploadMedia.ts`, `playback-url.ts`, and `useMediaPlaybackUrl.ts`. `MarkdownBlock`'s new `lessonId?: string` prop name matches its two call sites (`AdminLessonEditor.tsx`, `LessonDetailPage.tsx`). The `r2img:` scheme string is defined once (`R2IMG_SCHEME` in `MarkdownBlock.tsx`) and used consistently by both the insertion side (`AdminLessonEditor.tsx`'s `insertGrammarImage`, which hardcodes the literal `r2img:` prefix to match) and the resolution side (`ContentImage`/`urlTransform`).
