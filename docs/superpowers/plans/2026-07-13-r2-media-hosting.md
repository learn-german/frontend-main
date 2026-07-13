# R2 Media Hosting (Upload + Signed Playback) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins upload lesson video/audio directly to Cloudflare R2 from the admin editor, and have learners play it back through short-lived signed URLs — the real R2 link is never exposed to the browser, and existing YouTube/`listening_url` lessons keep working unchanged.

**Architecture:** Two Vercel Serverless Functions (`api/media/upload-url.ts`, `api/media/playback-url.ts`) hold the R2 credentials (Vercel env vars, server-only) and use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` to mint presigned S3 URLs. The admin browser PUTs the file straight to R2 using a presigned PUT URL (the function never touches file bytes). Learners fetch a presigned GET URL (4h expiry) by lesson ID; the function looks up the real object key itself so the client never supplies or guesses one. Two new nullable columns (`video_r2_key`, `audio_r2_key`) sit alongside the existing `youtube_id`/`listening_url` — new content prefers R2, older lessons fall back to the old fields unchanged.

**Tech Stack:** React 19, TypeScript 5.8, Vercel Serverless Functions (Node.js runtime), `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 3.x. The two Vercel functions call Supabase's REST APIs (`/auth/v1/user`, `/rest/v1/lessons`) directly via `fetch` rather than `@supabase/supabase-js` — the SDK's `createClient()` eagerly builds a `RealtimeClient` needing a global `WebSocket`, which throws on Node <22 (discovered and fixed during Task 2; see that task's code for the corrected approach). The frontend (`src/lib/hooks/useMediaPlaybackUrl.ts`, `AdminLessonEditor.tsx`) still uses the existing `supabase` client singleton from `src/lib/supabase.ts` as normal — this WebSocket issue is specific to constructing a *new* client inside a Node.js serverless function, not the browser-side singleton already in use everywhere else in this app.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-13-r2-media-hosting-design.md` — read it before starting.
- Do not use `any` anywhere (project rule, CLAUDE.md).
- Do not add any npm package beyond `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` — both pre-approved for this plan.
- R2 credentials and a linked Vercel project are **not available in this dev/build environment** — nobody in this plan has real `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`, and there is no way to obtain a real logged-in user's Supabase JWT without entering a password (prohibited). Every task's verification is scoped to what is actually checkable without those: TypeScript correctness, pure-logic unit tests (extension validation, object-key construction), and the auth-guard's *rejection* paths (missing header → 401; garbage token → 401 from a real call to Supabase's public auth endpoint using the existing public `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from `.env.local` — safe to reuse, they're already shipped to every browser). **Do not fabricate a "200 success" or "403 forbidden" test result** — those paths require a real admin/non-admin JWT that only the human can produce; they are explicitly deferred to Task 6's manual checklist, run by the human after they configure real credentials.
- Only touch: `supabase/migrations/` (new file), `src/lib/appTypes.ts`, `src/lib/hooks/useModules.ts`, `src/lib/hooks/useMediaPlaybackUrl.ts` (new), `src/pages/admin/AdminContentSection.tsx`, `src/pages/admin/AdminLessonEditor.tsx`, `src/components/VideoPlayer.tsx`, `src/pages/LessonDetailPage.tsx`, `api/media/upload-url.ts` (new), `api/media/playback-url.ts` (new), `package.json`/`package-lock.json`, `tsconfig.json`. Do not touch `src/hooks/useModules.ts` (a separate, unused legacy duplicate of `src/lib/hooks/useModules.ts` — confirmed via `grep` that nothing imports it; leave it alone, it's not this plan's concern).
- Dev server / `npm run lint` need Node 20 in this environment (Node 16 is default via `nvm` and fails Vite 6 with a `crypto.getRandomValues` error): `source ~/.nvm/nvm.sh && nvm use 20` before running `npm run dev`, `npm install`, or `npm run lint`.
- R2 object key convention: `videos/{lessonId}.{ext}` for video, `audio/{lessonId}.{ext}` for audio. Allowed extensions: video → `mp4` only; audio → `mp3`, `m4a`, `wav`.
- Presigned PUT (upload) expiry: 600 seconds. Presigned GET (playback) expiry: 14400 seconds.

---

### Task 1: Database schema + type plumbing

**Files:**
- Create: `supabase/migrations/20260713000006_media_r2_fields.sql`
- Modify: `src/lib/appTypes.ts:57` (after the `listeningUrl?: string;` line)
- Modify: `src/lib/hooks/useModules.ts` (the `SupabaseLesson` type, the `.select()` query string, and `transformModule`)
- Modify: `src/pages/admin/AdminContentSection.tsx:28-31` (the `.select()` query string)
- Modify: `src/pages/admin/AdminLessonEditor.tsx` (the `LessonEditable` interface and `handleSave`'s update payload)

**Interfaces:**
- Produces: DB columns `lessons.video_r2_key text` and `lessons.audio_r2_key text` (both nullable).
- Produces: `Lesson.videoR2Key?: string` and `Lesson.audioR2Key?: string` in `src/lib/appTypes.ts`, populated by `useModules.ts`'s `transformModule`.
- Produces: `LessonEditable.video_r2_key?: string | null` and `LessonEditable.audio_r2_key?: string | null` in `AdminLessonEditor.tsx`, persisted by `handleSave`.
- Consumes: nothing from other tasks (this is the foundational data-layer task; Tasks 4 and 5 build on top of it).

- [ ] **Step 1: Write the migration**

Create `supabase/migrations/20260713000006_media_r2_fields.sql`:

```sql
-- =============================================================================
-- DeutschPath — R2-hosted video/audio: object key columns
-- =============================================================================

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_r2_key TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS audio_r2_key TEXT;
```

- [ ] **Step 2: Apply the migration and verify the columns exist**

Apply it with the Supabase MCP tool `apply_migration` (project_id `awdhqlgxnjwymwgxltlw`, name `media_r2_fields`, using the SQL above), then verify:

```sql
select column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'lessons' and column_name in ('video_r2_key', 'audio_r2_key');
```

Expected: 2 rows, both `data_type = 'text'`, `is_nullable = 'YES'`.

- [ ] **Step 3: Add the fields to `Lesson` (appTypes.ts)**

In `src/lib/appTypes.ts`, find:

```ts
  grammarMd?: string;
  listeningUrl?: string;
  readingText?: string;
```

Replace with:

```ts
  grammarMd?: string;
  listeningUrl?: string;
  videoR2Key?: string;
  audioR2Key?: string;
  readingText?: string;
```

- [ ] **Step 4: Map the new columns in `useModules.ts`**

In `src/lib/hooks/useModules.ts`, in the `SupabaseLesson` type, find:

```ts
  grammar_md: string | null;
  listening_url: string | null;
  reading_text: string | null;
```

Replace with:

```ts
  grammar_md: string | null;
  listening_url: string | null;
  video_r2_key: string | null;
  audio_r2_key: string | null;
  reading_text: string | null;
```

In the same file, find the `.select()` query string:

```ts
      .select(`
        id, level, title, title_vi, order_index,
        lessons (
          id, level, title, title_vi, objective, summary,
          youtube_id, duration, order_index, xp_reward,
          next_lesson_id, vocabulary, grammar,
          grammar_md, listening_url, reading_text, reading_text_vi
        )
      `)
```

Replace with:

```ts
      .select(`
        id, level, title, title_vi, order_index,
        lessons (
          id, level, title, title_vi, objective, summary,
          youtube_id, duration, order_index, xp_reward,
          next_lesson_id, vocabulary, grammar,
          grammar_md, listening_url, video_r2_key, audio_r2_key,
          reading_text, reading_text_vi
        )
      `)
```

In `transformModule`, find:

```ts
      grammarMd: l.grammar_md ?? undefined,
      listeningUrl: l.listening_url ?? undefined,
      readingText: l.reading_text ?? undefined,
```

Replace with:

```ts
      grammarMd: l.grammar_md ?? undefined,
      listeningUrl: l.listening_url ?? undefined,
      videoR2Key: l.video_r2_key ?? undefined,
      audioR2Key: l.audio_r2_key ?? undefined,
      readingText: l.reading_text ?? undefined,
```

- [ ] **Step 5: Add the columns to the admin content list query**

In `src/pages/admin/AdminContentSection.tsx`, find:

```ts
      .select(`id, title, title_vi, level, order_index,
        lessons(id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, reading_text, reading_text_vi, order_index)`)
```

Replace with:

```ts
      .select(`id, title, title_vi, level, order_index,
        lessons(id, title, title_vi, duration, level, xp_reward, youtube_id,
                objective, summary, vocabulary, grammar, grammar_md,
                listening_url, video_r2_key, audio_r2_key,
                reading_text, reading_text_vi, order_index)`)
```

- [ ] **Step 6: Add the fields to `LessonEditable` and `handleSave` (AdminLessonEditor.tsx)**

In `src/pages/admin/AdminLessonEditor.tsx`, find:

```ts
  grammar_md?: string | null;
  listening_url?: string | null;
  reading_text?: string | null;
```

Replace with:

```ts
  grammar_md?: string | null;
  listening_url?: string | null;
  video_r2_key?: string | null;
  audio_r2_key?: string | null;
  reading_text?: string | null;
```

In `handleSave`, find:

```ts
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      reading_text: data.reading_text || null,
```

Replace with:

```ts
      grammar_md: data.grammar_md || null,
      listening_url: data.listening_url || null,
      video_r2_key: data.video_r2_key || null,
      audio_r2_key: data.audio_r2_key || null,
      reading_text: data.reading_text || null,
```

- [ ] **Step 7: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20260713000006_media_r2_fields.sql src/lib/appTypes.ts src/lib/hooks/useModules.ts src/pages/admin/AdminContentSection.tsx src/pages/admin/AdminLessonEditor.tsx
git commit -m "feat: add video_r2_key/audio_r2_key columns and type plumbing"
```

---

### Task 2: Vercel Function `POST /api/media/upload-url`

**Files:**
- Modify: `package.json` (add `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`)
- Modify: `tsconfig.json` (add `"api"` to `exclude`)
- Create: `api/media/upload-url.ts`

**Interfaces:**
- Produces: `POST /api/media/upload-url` — request body `{ lessonId: string, mediaType: "video" | "audio", fileExt: string }`, header `Authorization: Bearer <supabase JWT>` → response `{ uploadUrl: string, objectKey: string }` (200), or `{ error: string }` with 400/401/403/405.
- Consumes: env vars `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (not set in this environment — see Global Constraints).

- [ ] **Step 1: Install the dependencies**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

Expected: `package.json` gains both under `dependencies`.

- [ ] **Step 2: Exclude `api/` from the frontend's TypeScript check**

In `tsconfig.json`, find:

```json
  "exclude": ["supabase/functions"]
```

Replace with:

```json
  "exclude": ["supabase/functions", "api"]
```

This mirrors how `supabase/functions` (a different runtime) is already excluded — Vercel type-checks/bundles its own functions at build/deploy time.

- [ ] **Step 3: Write a failing unit test for the pure helper functions**

Create `/tmp/media-upload-verify/pure-logic.mts`:

```ts
import assert from "node:assert/strict";
import { buildObjectKey, isAllowedExt } from "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/api/media/upload-url";

assert.equal(buildObjectKey("video", "a1-l1", "mp4"), "videos/a1-l1.mp4");
assert.equal(buildObjectKey("audio", "a1-l1", "MP3"), "audio/a1-l1.mp3", "extension must be lowercased");
console.log("buildObjectKey: OK");

assert.equal(isAllowedExt("video", "mp4"), true);
assert.equal(isAllowedExt("video", "mov"), false);
assert.equal(isAllowedExt("audio", "mp3"), true);
assert.equal(isAllowedExt("audio", "m4a"), true);
assert.equal(isAllowedExt("audio", "wav"), true);
assert.equal(isAllowedExt("audio", "ogg"), false);
console.log("isAllowedExt: OK");

console.log("ALL PASS");
```

- [ ] **Step 4: Run it to confirm it fails**

```bash
cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519 && NODE_PATH=$(npm root) npx tsx /tmp/media-upload-verify/pure-logic.mts
```

Expected: fails — `api/media/upload-url.ts` doesn't exist yet.

- [ ] **Step 5: Write `api/media/upload-url.ts`**

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createClient } from "@supabase/supabase-js";

type MediaType = "video" | "audio";

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
};

export function isAllowedExt(mediaType: MediaType, ext: string): boolean {
  return ALLOWED_EXT[mediaType].includes(ext.toLowerCase());
}

export function buildObjectKey(mediaType: MediaType, lessonId: string, ext: string): string {
  const folder = mediaType === "video" ? "videos" : "audio";
  return `${folder}/${lessonId}.${ext.toLowerCase()}`;
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers["authorization"];
  const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : undefined;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!);
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  if (user.app_metadata?.role !== "admin") {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

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

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const uploadUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey }),
    { expiresIn: 600 }
  );

  res.status(200).json({ uploadUrl, objectKey });
}
```

- [ ] **Step 6: Run the pure-logic test again**

```bash
cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519 && NODE_PATH=$(npm root) npx tsx /tmp/media-upload-verify/pure-logic.mts
```

Expected:
```
buildObjectKey: OK
isAllowedExt: OK
ALL PASS
```

- [ ] **Step 7: Write and run the auth-guard rejection test (no R2 credentials needed)**

This calls the handler directly as a plain function (no HTTP server, no Vercel CLI needed) and only exercises paths that reject *before* touching the R2 SDK.

Create `/tmp/media-upload-verify/auth-guard.mts`:

```ts
import assert from "node:assert/strict";
import dotenv from "dotenv";
dotenv.config({ path: "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/.env.local" });

process.env.SUPABASE_URL = process.env.VITE_SUPABASE_URL;
process.env.SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

import handler from "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/api/media/upload-url";

function mockRes() {
  const calls: { status?: number; body?: unknown } = {};
  return {
    status(code: number) { calls.status = code; return this; },
    json(body: unknown) { calls.body = body; },
    calls,
  };
}

// No Authorization header at all → 401, no network call.
{
  const res = mockRes();
  await handler({ method: "POST", headers: {}, body: {} }, res);
  assert.equal(res.calls.status, 401);
  console.log("no-auth-header -> 401: OK");
}

// Garbage bearer token → real call to Supabase's public auth endpoint, must reject.
{
  const res = mockRes();
  await handler(
    { method: "POST", headers: { authorization: "Bearer not-a-real-token" }, body: {} },
    res
  );
  assert.equal(res.calls.status, 401);
  console.log("garbage-token -> 401: OK");
}

// Wrong HTTP method → 405, no network call.
{
  const res = mockRes();
  await handler({ method: "GET", headers: {}, body: {} }, res);
  assert.equal(res.calls.status, 405);
  console.log("wrong-method -> 405: OK");
}

console.log("ALL PASS");
```

Run it:

```bash
cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519 && NODE_PATH=$(npm root) npx tsx /tmp/media-upload-verify/auth-guard.mts
```

Expected:
```
no-auth-header -> 401: OK
garbage-token -> 401: OK
wrong-method -> 405: OK
ALL PASS
```

If `garbage-token` doesn't return 401: check `.env.local` actually has `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set (it does, per this plan's Global Constraints) and that the sandbox has outbound network access to Supabase's API — if network is blocked here, note this in your report as `DONE_WITH_CONCERNS` rather than skipping the test silently.

**Do not attempt to test the 400 (bad input), 403 (non-admin), or 200 (success) paths** — they require a real authenticated JWT this environment cannot produce. That's expected; leave them for Task 6.

- [ ] **Step 8: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors (the `api/` folder is excluded, so this only confirms the rest of the app still compiles after the `tsconfig.json` change).

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json tsconfig.json api/media/upload-url.ts
git commit -m "feat: add /api/media/upload-url Vercel function for presigned R2 uploads"
```

---

### Task 3: Vercel Function `GET /api/media/playback-url`

**Files:**
- Create: `api/media/playback-url.ts`

**Interfaces:**
- Produces: `GET /api/media/playback-url?lessonId=...&type=video|audio`, header `Authorization: Bearer <supabase JWT>` → response `{ url: string }` (200), or `{ error: string }` with 400/401/404/405.
- Consumes: same env vars as Task 2 (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `R2_*`), plus reads `lessons.video_r2_key`/`lessons.audio_r2_key` (added in Task 1) via a direct REST call to `/rest/v1/lessons` using the caller's own bearer token (relies on the `lessons: authenticated read` RLS policy — no service-role key, no SDK). Does **not** use `@supabase/supabase-js` — see the note before Step 3 for why.

- [ ] **Step 1: Write the failing verification script**

Create `/tmp/media-upload-verify/playback-auth-guard.mts`. Note: read `SUPABASE_URL`/`SUPABASE_ANON_KEY` from the process environment directly rather than via `dotenv` — Node's ESM resolver doesn't consult `NODE_PATH`, so a `dotenv` import from a script living outside the project's own directory tree fails to resolve; export the values in the shell instead when running the script (see Step 2).

```ts
import assert from "node:assert/strict";
import handler from "/Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519/api/media/playback-url";

function mockRes() {
  const calls: { status?: number; body?: unknown } = {};
  return {
    status(code: number) { calls.status = code; return this; },
    json(body: unknown) { calls.body = body; },
    calls,
  };
}

// No Authorization header → 401.
{
  const res = mockRes();
  await handler({ method: "GET", headers: {}, query: { lessonId: "a1-l1", type: "video" } }, res);
  assert.equal(res.calls.status, 401);
  console.log("no-auth-header -> 401: OK");
}

// Garbage bearer token → 401 from real Supabase call.
{
  const res = mockRes();
  await handler(
    { method: "GET", headers: { authorization: "Bearer not-a-real-token" }, query: { lessonId: "a1-l1", type: "video" } },
    res
  );
  assert.equal(res.calls.status, 401);
  console.log("garbage-token -> 401: OK");
}

// Missing query params, no auth needed to fail method check.
{
  const res = mockRes();
  await handler({ method: "POST", headers: {}, query: {} }, res);
  assert.equal(res.calls.status, 405);
  console.log("wrong-method -> 405: OK");
}

console.log("ALL PASS");
```

- [ ] **Step 2: Run it to confirm it fails**

```bash
cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519 && cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519
export SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2-)
export SUPABASE_ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
NODE_PATH=$(npm root) npx tsx /tmp/media-upload-verify/playback-auth-guard.mts
```

Expected: fails — `api/media/playback-url.ts` doesn't exist yet.

- [ ] **Step 3: Write `api/media/playback-url.ts`**

**Correction (discovered during Task 2, applies here too):** do not use `@supabase/supabase-js`'s `createClient()` — it eagerly constructs a `RealtimeClient` that requires a global `WebSocket`, which throws synchronously on Node 20 (`Error: Node.js 20 detected without native WebSocket support`), and this function would call it on every invocation. Neither the auth check nor the RLS-scoped `lessons` read need the SDK — both are plain HTTP calls to Supabase's REST APIs (`/auth/v1/user` for the JWT check, `/rest/v1/lessons` for the RLS-respecting read, using the caller's own bearer token so RLS evaluates as that user). This was verified directly against the real project: a garbage bearer token against `/rest/v1/lessons` returns 401, and an unauthenticated (anon-only) request against it returns an empty array `[]` (RLS silently filters it out) rather than an error — both map correctly onto this handler's existing 401/404 branches with no extra handling needed.

```ts
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

interface VercelRequestLike {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query: Record<string, string | string[] | undefined>;
}
interface VercelResponseLike {
  status(code: number): VercelResponseLike;
  json(body: unknown): void;
}

interface AuthUser {
  id: string;
}

async function getAuthenticatedUser(token: string): Promise<AuthUser | null> {
  const res = await fetch(`${process.env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: process.env.SUPABASE_ANON_KEY!,
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as AuthUser;
}

export default async function handler(req: VercelRequestLike, res: VercelResponseLike) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const authHeader = req.headers["authorization"];
  const token = typeof authHeader === "string" ? authHeader.replace("Bearer ", "") : undefined;
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const user = await getAuthenticatedUser(token);
  if (!user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

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

  const s3 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: objectKey }),
    { expiresIn: 14400 }
  );

  res.status(200).json({ url });
}
```

Note: the auth check intentionally runs *before* the `lessonId`/`type` validation, matching Task 2's ordering (cheapest, most security-critical check first) and matching what the test in Step 1 expects (auth failures return 401 even when query params are also missing/malformed).

- [ ] **Step 4: Run the verification script again**

```bash
cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519 && cd /Users/thangnv/Documents/web-gemany/.claude/worktrees/modest-jang-d05519
export SUPABASE_URL=$(grep VITE_SUPABASE_URL .env.local | cut -d= -f2-)
export SUPABASE_ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2-)
NODE_PATH=$(npm root) npx tsx /tmp/media-upload-verify/playback-auth-guard.mts
```

Expected:
```
no-auth-header -> 401: OK
garbage-token -> 401: OK
wrong-method -> 405: OK
ALL PASS
```

**Do not attempt to test the 400/404/200 paths** — same reasoning as Task 2; deferred to Task 6.

- [ ] **Step 5: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add api/media/playback-url.ts
git commit -m "feat: add /api/media/playback-url Vercel function for signed R2 playback"
```

---

### Task 4: Admin UI — upload buttons for video and audio

**Files:**
- Modify: `src/pages/admin/AdminLessonEditor.tsx`

**Interfaces:**
- Consumes: `POST /api/media/upload-url` (Task 2), `LessonEditable.video_r2_key`/`audio_r2_key` (Task 1).
- Produces: no new exports; this is a leaf UI change.

- [ ] **Step 1: Add an upload helper function inside the component file**

In `src/pages/admin/AdminLessonEditor.tsx`, add this helper above the `AdminLessonEditor` component (after the `EditableText` component, before `export const AdminLessonEditor`):

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
    const body = await res.json().catch(() => ({ error: res.statusText }));
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

- [ ] **Step 2: Add upload state to the component**

In the `AdminLessonEditor` component, alongside the existing `useState` calls (`data`, `saving`, `grammarTab`), add:

```tsx
  const [videoUploadPct, setVideoUploadPct] = useState<number | null>(null);
  const [audioUploadPct, setAudioUploadPct] = useState<number | null>(null);
```

- [ ] **Step 3: Add the two upload handlers**

Below `removeVocab`, add:

```tsx
  const handleVideoUpload = async (file: File) => {
    setVideoUploadPct(0);
    try {
      const objectKey = await uploadMedia(file, data.id, "video", setVideoUploadPct);
      upd({ video_r2_key: objectKey });
      showToast("Đã tải video lên, nhớ bấm Lưu bài học.", "success");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Tải video lên thất bại", "warning");
    } finally {
      setVideoUploadPct(null);
    }
  };

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

- [ ] **Step 4: Replace the video block's YouTube-only input with an upload button**

Find (the video `<section>`, roughly lines 144-162):

```tsx
          {/* Video */}
          <section className="space-y-3">
            <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
              <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
            </h2>
            <div className="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
              {data.youtube_id ? (
                <iframe src={`https://www.youtube.com/embed/${data.youtube_id}`} className="w-full h-full" allowFullScreen title={data.title} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Video className="w-10 h-10 opacity-30" />
                  <p className="text-xs">Chưa có video</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
              <span className="text-xs font-bold text-slate-400 whitespace-nowrap">YouTube ID:</span>
              <EditableText value={data.youtube_id ?? ""} onChange={v => upd({ youtube_id: v })} className="text-sm font-mono text-slate-700" placeholder="dQw4w9WgXcQ" />
            </div>
          </section>
```

Replace with:

```tsx
          {/* Video */}
          <section className="space-y-3">
            <h2 className="text-base font-display font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wide">
              <Video className="w-5 h-5 text-orange-500" /> Bài giảng lý thuyết
            </h2>
            <div className="aspect-video bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
              {data.video_r2_key ? (
                <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-slate-500">
                  <Video className="w-10 h-10 text-orange-400" />
                  <p className="text-xs font-mono">{data.video_r2_key}</p>
                </div>
              ) : data.youtube_id ? (
                <iframe src={`https://www.youtube.com/embed/${data.youtube_id}`} className="w-full h-full" allowFullScreen title={data.title} />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center gap-3 text-slate-400">
                  <Video className="w-10 h-10 opacity-30" />
                  <p className="text-xs">Chưa có video</p>
                </div>
              )}
            </div>
            <label className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:bg-slate-100 transition">
              <Video className="w-4 h-4 text-orange-500 shrink-0" />
              <span className="text-xs font-bold text-slate-600">
                {videoUploadPct !== null ? `Đang tải lên... ${videoUploadPct}%` : "Tải video lên (.mp4)"}
              </span>
              <input
                type="file"
                accept="video/mp4"
                className="hidden"
                disabled={videoUploadPct !== null}
                onChange={e => { const f = e.target.files?.[0]; if (f) handleVideoUpload(f); e.target.value = ""; }}
              />
            </label>
            <details className="text-xs">
              <summary className="text-slate-400 cursor-pointer">Nhập thủ công (cũ) — YouTube ID</summary>
              <div className="flex items-center gap-2 mt-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                <span className="text-xs font-bold text-slate-400 whitespace-nowrap">YouTube ID:</span>
                <EditableText value={data.youtube_id ?? ""} onChange={v => upd({ youtube_id: v })} className="text-sm font-mono text-slate-700" placeholder="dQw4w9WgXcQ" />
              </div>
            </details>
          </section>
```

- [ ] **Step 5: Replace the audio block's URL input with an upload button**

Find (the "Nghe section", roughly lines 205-225):

```tsx
          {/* Nghe section */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
            <h3 className="text-sm font-display font-bold text-slate-800 flex items-center gap-2">
              <Headphones className="w-4 h-4 text-orange-500" /> Luyện nghe
            </h3>
            <div>
              <label className={labelCls}>URL audio (mp3 / m4a / wav)</label>
              <input
                type="text"
                value={data.listening_url ?? ""}
                onChange={e => upd({ listening_url: e.target.value })}
                placeholder="https://example.com/audio.mp3"
                className={inputCls}
              />
            </div>
            {data.listening_url && (
              <audio controls src={data.listening_url} className="w-full rounded-xl mt-2">
                Trình duyệt không hỗ trợ audio.
              </audio>
            )}
          </div>
```

Replace with:

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
```

- [ ] **Step 6: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/pages/admin/AdminLessonEditor.tsx
git commit -m "feat: add R2 upload buttons for video/audio in admin lesson editor"
```

---

### Task 5: Learner UI — signed playback for video and audio

**Files:**
- Create: `src/lib/hooks/useMediaPlaybackUrl.ts`
- Modify: `src/components/VideoPlayer.tsx`
- Modify: `src/pages/LessonDetailPage.tsx`

**Interfaces:**
- Produces: `useMediaPlaybackUrl(lessonId: string, type: "video" | "audio", objectKey: string | undefined): { url: string | null; loading: boolean; error: string | null }` — returns `{ url: null, loading: false, error: null }` immediately (no fetch) when `objectKey` is falsy.
- Consumes: `GET /api/media/playback-url` (Task 3), `Lesson.videoR2Key`/`Lesson.audioR2Key` (Task 1).

- [ ] **Step 1: Write `useMediaPlaybackUrl`**

Create `src/lib/hooks/useMediaPlaybackUrl.ts`:

```ts
import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export function useMediaPlaybackUrl(
  lessonId: string,
  type: "video" | "audio",
  objectKey: string | undefined
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
        const res = await fetch(`/api/media/playback-url?lessonId=${encodeURIComponent(lessonId)}&type=${type}`, {
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
  }, [lessonId, type, objectKey]);

  return { url, loading, error };
}
```

- [ ] **Step 2: Update `VideoPlayer.tsx` to use signed playback when `videoR2Key` is present**

Replace the entire contents of `src/components/VideoPlayer.tsx` with:

```tsx
import React from "react";
import { Video, Loader2 } from "lucide-react";
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";

interface VideoPlayerProps {
  lessonId: string;
  youtubeId?: string;
  videoR2Key?: string;
  title: string;
  levelBadge: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  lessonId,
  youtubeId,
  videoR2Key,
  title,
  levelBadge,
}) => {
  const { url, loading, error } = useMediaPlaybackUrl(lessonId, "video", videoR2Key);

  if (videoR2Key) {
    if (loading) {
      return (
        <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-50 aspect-video flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-orange-400 animate-spin" />
        </div>
      );
    }
    if (url) {
      return (
        <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm">
          <video controls src={url} title={title} className="w-full aspect-video bg-black">
            Trình duyệt không hỗ trợ video.
          </video>
        </div>
      );
    }
    if (error) {
      return (
        <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-50 aspect-video flex items-center justify-center">
          <p className="text-xs text-red-500">Không tải được video: {error}</p>
        </div>
      );
    }
  }

  if (youtubeId) {
    return (
      <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm">
        <iframe
          src={`https://www.youtube.com/embed/${youtubeId}`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="w-full aspect-video"
          loading="lazy"
        />
      </div>
    );
  }

  // Placeholder when no video is available yet
  return (
    <div className="rounded-2xl overflow-hidden border border-slate-200/60 shadow-sm bg-slate-50 aspect-video flex flex-col items-center justify-center gap-3 text-center px-6">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center">
        <Video className="w-6 h-6 text-slate-400" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-display font-bold text-slate-600">{title}</p>
        <span className="inline-block text-[10px] font-display font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full uppercase tracking-wider">
          {levelBadge}
        </span>
      </div>
      <p className="text-xs text-slate-400 max-w-xs">
        Nội dung video bài giảng đang được chuẩn bị.
      </p>
    </div>
  );
};
```

- [ ] **Step 3: Update the `VideoPlayer` call site in `LessonDetailPage.tsx`**

Find:

```tsx
            <VideoPlayer youtubeId={lesson.youtubeId} title={lesson.title} levelBadge={lesson.level} />
```

Replace with:

```tsx
            <VideoPlayer lessonId={lesson.id} youtubeId={lesson.youtubeId} videoR2Key={lesson.videoR2Key} title={lesson.title} levelBadge={lesson.level} />
```

- [ ] **Step 4: Add signed-URL audio playback to the "Nghe" tab**

In `src/pages/LessonDetailPage.tsx`, add the import:

```tsx
import { useMediaPlaybackUrl } from "../lib/hooks/useMediaPlaybackUrl";
```

Inside the `LessonDetailPage` component, alongside the existing `useState` calls, add:

```tsx
  const audioPlayback = useMediaPlaybackUrl(lesson.id, "audio", lesson.audioR2Key);
```

Find the "Nghe tab" block:

```tsx
          {/* Nghe tab */}
          {bottomTab === "nghe" && (
            <div className="space-y-4">
              {lesson.listeningUrl ? (
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
```

Replace with:

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
```

The rest of the block (the `<div>` empty-state shown when neither is set, and its closing `)}`) stays exactly as-is — only the condition chain above it changes, from a single `if/else` into an `if/else if/else`.

- [ ] **Step 5: Type-check**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npm run lint
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/hooks/useMediaPlaybackUrl.ts src/components/VideoPlayer.tsx src/pages/LessonDetailPage.tsx
git commit -m "feat: play R2-hosted video/audio via signed playback URLs, fallback to YouTube/listening_url"
```

---

### Task 6: Manual end-to-end verification checklist

**Files:** none (verification only; fix forward into whichever file is wrong if something's broken, per Step 4).

**Interfaces:** none — this task exercises everything built in Tasks 1-5 together.

This task's happy-path steps **require the human to have already completed the spec's "1 lần ngoài code" setup** (R2 API token created, Vercel env vars set, R2 bucket CORS configured, code deployed or run via `vercel dev` with those env vars present). If that setup isn't done yet, most of this task cannot run — **report BLOCKED with exactly what's missing**, do not simulate or fake the results.

- [ ] **Step 1: Confirm prerequisite setup is in place**

Ask/check whether these exist before proceeding:
- Vercel project has `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` set.
- R2 bucket `web-gemany` has CORS configured to allow `PUT`/`GET`/`HEAD` from the app's origin (see spec section 8 for the exact JSON).

If either is missing, stop here and report BLOCKED with the specific missing piece — this is expected until the human completes the spec's manual setup steps, not a failure of Tasks 1-5.

- [ ] **Step 2: Run the dev server against real functions**

```bash
source ~/.nvm/nvm.sh && nvm use 20 && npx vercel dev
```

(`vercel dev` serves both the Vite frontend and the `api/` functions together, using the env vars configured in Step 1. It may prompt to link the local directory to a Vercel project on first run — that's expected and requires the human's Vercel login.)

- [ ] **Step 3: Test the admin upload flow in a browser**

Log in as an admin, open a lesson in the admin editor, upload a small `.mp4` (a few MB) via the new "Tải video lên" button. Confirm:
- Upload progress percentage updates.
- On success, a toast confirms and the video block shows the object key (e.g. `videos/a1-l1.mp4`).
- Network tab shows a `PUT` request to a `*.r2.cloudflarestorage.com` URL with a 200 response.
- After clicking "Lưu bài học", re-open the lesson and confirm `video_r2_key` persisted (re-fetch shows the same key, not YouTube ID).

Repeat for a small `.mp3` via "Tải audio lên".

- [ ] **Step 4: Test learner playback**

Open the same lesson as a logged-in (non-admin) learner. Confirm:
- The video section shows a real `<video>` element playing the uploaded file (not a YouTube iframe), sourced from a signed URL containing `X-Amz-Signature` in its query string.
- The "Nghe" tab plays the uploaded audio the same way.
- Open a *different* lesson that has no `video_r2_key`/`audio_r2_key` (existing data) and confirm it still falls back to YouTube embed / `listening_url` exactly as before (regression check).

If anything in Steps 3-4 doesn't match, read the relevant file (`api/media/*.ts`, `AdminLessonEditor.tsx`, `VideoPlayer.tsx`, `LessonDetailPage.tsx`, `useMediaPlaybackUrl.ts`), fix it, and re-test from Step 3.

- [ ] **Step 5: Security spot-check**

```bash
npm run build
grep -r "R2_SECRET_ACCESS_KEY\|R2_ACCESS_KEY_ID" dist/ 2>/dev/null
```

Expected: no matches — confirms the R2 secrets never made it into the frontend bundle (they only ever exist in the Vercel function's server-side environment).

- [ ] **Step 6: Stop `vercel dev` and commit any fixes**

Only if Step 4 required a code fix:

```bash
git add <fixed files>
git commit -m "fix: correct issues found in manual R2 media end-to-end check"
```

If no fixes were needed, there is nothing to commit — skip this step.
