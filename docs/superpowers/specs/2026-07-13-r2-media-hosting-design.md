# Video/audio hosting on Cloudflare R2 with expiring signed URLs

## Bối cảnh

Hiện tại lesson video dùng YouTube embed (`lessons.youtube_id`, render trong [VideoPlayer.tsx](../../../src/components/VideoPlayer.tsx)), audio dùng URL trực tiếp (`lessons.listening_url`, render bằng `<audio src=...>` trong [LessonDetailPage.tsx](../../../src/pages/LessonDetailPage.tsx)). Admin nhập cả hai dưới dạng text field thủ công trong [AdminLessonEditor.tsx](../../../src/pages/admin/AdminLessonEditor.tsx).

Yêu cầu mới: admin upload trực tiếp file video/audio lên Cloudflare R2 (bucket S3-compatible tại `https://586e2faf05d03edec1456845c8240700.r2.cloudflarestorage.com/web-gemany`) qua một nút upload trong trang admin, thay cho YouTube/URL thủ công. Link R2 thật không bao giờ được lộ ra cho client — thay vào đó dùng signed URL (presigned) có hạn dùng.

## Quyết định kiến trúc

- **R2 credentials sống trong Vercel Environment Variables, dùng bởi Vercel Serverless Function** (`api/media/*.ts`), theo yêu cầu cụ thể của người dùng — KHÔNG dùng Supabase Edge Function như bản thiết kế trước. Biến môi trường Vercel không prefix `VITE_` chỉ chạy phía server (Node.js runtime), không bao giờ bundle vào frontend, nên vẫn giữ được nguyên tắc "secret không lộ ra browser".
  **Lưu ý lệch khỏi CLAUDE.md hiện tại:** CLAUDE.md ghi "Không có custom backend server — logic nhạy cảm nằm trong Edge Functions", ngụ ý Supabase Edge Functions là nơi duy nhất cho logic nhạy cảm. Thêm Vercel Serverless Function là một ngoại lệ có chủ đích cho riêng feature này, theo yêu cầu trực tiếp của người dùng. Không tự sửa CLAUDE.md trong phạm vi task này — nếu muốn chuẩn hoá ngoại lệ này cho các feature sau, cần cập nhật CLAUDE.md riêng.
- **Auth trong Vercel Function**: verify JWT bằng `@supabase/supabase-js` (đã là dependency có sẵn) với `SUPABASE_URL` + `SUPABASE_ANON_KEY` (giá trị public, không phải secret mới — trùng với `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` hiện có, chỉ cần khai báo thêm bản không-prefix cho Vercel Function đọc) — gọi `supabase.auth.getUser(token)`, đọc `app_metadata.role` từ user trả về để check quyền admin. **Không cần `SUPABASE_SERVICE_ROLE_KEY`** trong Vercel: `upload-url` không đọc/viết DB; `playback-url` chỉ SELECT `lessons` — RLS policy `lessons: authenticated read` đã cho phép `true` với mọi user đã login, nên dùng client với JWT của user (không cần service role) là đủ.
- **Upload đi thẳng từ browser lên R2** qua presigned PUT URL (Vercel Function chỉ ký URL, không proxy file qua nó) — tránh giới hạn payload/timeout của serverless function với file video lớn.
- **Playback dùng presigned GET URL hết hạn ~4 giờ**, Vercel Function tự tra object key thật từ DB theo `lessonId` (qua Supabase client với JWT của user) — client không được tự cung cấp raw object key, tránh dò object khác trong bucket.
- **Thêm cột mới, không xoá cột cũ**: `video_r2_key`, `audio_r2_key` thêm vào `lessons`, giữ `youtube_id`/`listening_url` để bài học cũ không bị hỏng. Render ưu tiên R2 nếu có, fallback về YouTube/URL cũ nếu không — cùng pattern đã dùng cho `grammar_md` vs `grammar` JSONB cũ ([LessonDetailPage.tsx:131](../../../src/pages/LessonDetailPage.tsx)).
- **`api/` bị loại khỏi `tsconfig.json`** (thêm vào mảng `exclude`, cùng cách `supabase/functions` đã bị loại) — Vercel Function chạy Node.js runtime với type/global khác hẳn DOM-oriented tsconfig của frontend; Vercel tự type-check/build function của nó khi deploy (`vercel build`/`vercel dev`), không cần `npm run lint` của frontend cover phần này.

## Phạm vi thay đổi

**Database:** 1 migration mới thêm 2 cột.

**Vercel Serverless Functions (mới, Node.js runtime, không phải Supabase Edge Function):**
- `api/media/upload-url.ts` — `POST`, sinh presigned PUT URL cho admin.
- `api/media/playback-url.ts` — `GET`, sinh presigned GET URL cho learner.

**Dependencies mới trong `package.json`** (đã được người dùng đồng ý): `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`.

**`tsconfig.json`:** thêm `"api"` vào mảng `exclude`.

**Frontend:**
- `src/pages/admin/AdminLessonEditor.tsx` — thay ô nhập YouTube ID/audio URL bằng nút upload, gọi `fetch("/api/media/upload-url", ...)`.
- `src/components/VideoPlayer.tsx` — nhận thêm object key, tự `fetch("/api/media/playback-url", ...)` khi có `video_r2_key`.
- `src/pages/LessonDetailPage.tsx` — audio player tự fetch signed URL khi có `audio_r2_key`.
- `src/lib/appTypes.ts`, `src/lib/hooks/useModules.ts` — thêm field `videoR2Key`/`audioR2Key`.

**Việc admin phải làm 1 lần ngoài code (không thể tự động hoá vì cần quyền quản trị Cloudflare/Vercel dashboard):**
1. Tạo R2 API token (Access Key ID + Secret Access Key) trong Cloudflare dashboard.
2. Set biến môi trường trong Vercel project settings (hoặc `vercel env add`): `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`.
3. Cấu hình CORS cho bucket R2 (JSON cụ thể ở mục dưới) — cho phép `PUT`/`GET` từ domain app.

## Thiết kế chi tiết

### 1. Migration

`supabase/migrations/20260713000006_media_r2_fields.sql`:
```sql
-- =============================================================================
-- DeutschPath — R2-hosted video/audio: object key columns
-- =============================================================================

ALTER TABLE lessons ADD COLUMN IF NOT EXISTS video_r2_key TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS audio_r2_key TEXT;
```

Không cần đổi RLS — 2 cột mới nằm trong bảng `lessons` đã có RLS sẵn (đọc công khai cho user đã login, ghi chỉ admin), theo policy hiện có.

### 2. Cấu hình R2 (secrets + object key convention)

Vercel Environment Variables (set qua Vercel dashboard hoặc `vercel env add`, không qua chat):
- `R2_ACCOUNT_ID` — `586e2faf05d03edec1456845c8240700`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME` — `web-gemany`
- `SUPABASE_URL` — cùng giá trị với `VITE_SUPABASE_URL` (public, không phải secret mới)
- `SUPABASE_ANON_KEY` — cùng giá trị với `VITE_SUPABASE_ANON_KEY` (public, không phải secret mới)

S3 endpoint dùng trong SDK: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `"auto"`.

Object key convention (đơn giản, đoán được, ghi đè khi re-upload):
- Video: `videos/{lessonId}.{ext}`
- Audio: `audio/{lessonId}.{ext}`

Giới hạn định dạng/kích thước (client-side validate trước khi xin presigned URL):
- Video: `.mp4` — tối đa 2GB.
- Audio: `.mp3`, `.m4a`, `.wav` — tối đa 100MB.

### 3. Vercel Function `POST /api/media/upload-url`

Path: `api/media/upload-url.ts` (Vercel Node.js Serverless Function — file dưới `api/` tự động thành route theo tên file/thư mục).

Request: `POST` body `{ lessonId: string, mediaType: "video" | "audio", fileExt: string }`, header `Authorization: Bearer <supabase JWT>`.

Auth: dùng `@supabase/supabase-js` với `SUPABASE_URL`/`SUPABASE_ANON_KEY` để `supabase.auth.getUser(token)`; nếu không có token/token invalid → 401; nếu `user.app_metadata?.role !== "admin"` → 403 (cùng logic `set-admin-role` đang dùng, chỉ khác runtime).

Validate `mediaType` là `"video"` hoặc `"audio"`; validate `fileExt` thuộc danh sách cho phép theo `mediaType` (mp4 cho video; mp3/m4a/wav cho audio) — nếu không, trả 400.

Xử lý: dùng `@aws-sdk/client-s3` (`S3Client`, endpoint `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `"auto"`, credentials từ `R2_ACCESS_KEY_ID`/`R2_SECRET_ACCESS_KEY`) + `@aws-sdk/s3-request-presigner` (`getSignedUrl`) để tạo presigned **PUT** URL, hết hạn **600 giây (10 phút)**, cho object key `${mediaType === "video" ? "videos" : "audio"}/${lessonId}.${fileExt}`.

Response: `{ uploadUrl: string, objectKey: string }`.

### 4. Vercel Function `GET /api/media/playback-url`

Path: `api/media/playback-url.ts`

Request: `GET /api/media/playback-url?lessonId=...&type=video|audio`, header `Authorization: Bearer <supabase JWT>`.

Auth: bắt buộc JWT hợp lệ (bất kỳ user đã login, không cần admin) — cùng cách verify như trên.

Xử lý:
1. Dùng Supabase client khởi tạo **với JWT của user** (`createClient(url, anonKey, { global: { headers: { Authorization: bearer } } })`) để SELECT `video_r2_key`/`audio_r2_key` từ `lessons` theo `lessonId` — dựa vào RLS policy `lessons: authenticated read` (`true` cho mọi authenticated user), không cần service role.
2. Nếu key rỗng/null → trả 404.
3. Tạo presigned **GET** URL hết hạn **14400 giây (4 giờ)** cho key đó.

Response: `{ url: string }`.

Client **không** được tự truyền raw object key — chỉ truyền `lessonId`, function tự tra key thật, tránh cho phép ký URL cho object bất kỳ trong bucket.

### 5. Admin UI (`AdminLessonEditor.tsx`)

Thay 2 chỗ:
- Khối video (hiện là input text `YouTube ID`) → thêm nút "Tải video lên" (file input `accept="video/mp4"`), khi chọn file:
  1. Validate size/type client-side theo giới hạn mục 2.
  2. Gọi `POST /api/media/upload-url` (kèm header `Authorization: Bearer <session.access_token>` từ Supabase session hiện tại) lấy `{uploadUrl, objectKey}`.
  3. `fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })`, hiện progress (dùng `XMLHttpRequest` để có `upload.onprogress`, `fetch` không hỗ trợ progress upload).
  4. Lưu `objectKey` vào state `data.video_r2_key`, admin bấm "Lưu" như flow hiện tại (`supabase.from("lessons").update(...)`) để persist — không cần route riêng cho bước lưu.
  5. Preview: sau khi có `video_r2_key`, gọi `GET /api/media/playback-url` lấy signed URL, hiển thị `<video controls src=...>` nhỏ để admin xem lại.
- Khối audio ("Luyện nghe", hiện là input text URL) → tương tự, nút "Tải audio lên" (`accept="audio/mpeg,audio/mp4,audio/wav"`), lưu vào `data.audio_r2_key`.

Giữ ô input `youtube_id`/`listening_url` cũ ở dạng thu gọn/phụ (ví dụ trong một `<details>` "Nhập thủ công (cũ)") để admin vẫn có thể override bằng tay nếu cần — không xoá hoàn toàn khỏi UI, chỉ không còn là cách nhập chính.

### 6. Learner UI

`VideoPlayer.tsx` nhận thêm prop `videoR2Key?: string`. Nếu có, component tự gọi `GET /api/media/playback-url?lessonId=...&type=video` (kèm `Authorization: Bearer <session.access_token>`) lấy signed URL, hiện loading state trong lúc chờ, sau đó render `<video controls src={signedUrl}>` thay cho iframe YouTube. Nếu không có `videoR2Key` nhưng có `youtubeId` → giữ nguyên iframe YouTube như hiện tại. Nếu không có gì cả → giữ placeholder hiện tại.

Audio trong `LessonDetailPage.tsx` (tab "Nghe"): nếu có `audioR2Key`, gọi `GET /api/media/playback-url?...&type=audio` lấy signed URL cho `<audio src>` thay vì dùng `listening_url` trực tiếp; ngược lại giữ `listening_url` như hiện tại.

### 7. Types & data hooks

`src/lib/appTypes.ts`: thêm `videoR2Key?: string; audioR2Key?: string;` vào type `Lesson`.

`src/lib/hooks/useModules.ts`: map `video_r2_key`/`audio_r2_key` từ DB row sang `videoR2Key`/`audioR2Key`, cùng cách `grammar_md` → `grammarMd` đang làm.

### 8. CORS cho bucket R2 (việc admin tự làm qua Cloudflare dashboard hoặc AWS CLI với credentials của họ — Claude không có quyền set CORS bucket)

```json
[
  {
    "AllowedOrigins": [
      "https://gemany.fares.vn",
      "https://frontend-main-git-claude-r2-media-hosting-faresvn.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000"
    ],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
`https://gemany.fares.vn` là domain chính (production). Domain `*.vercel.app` là preview deployment của PR — có thể xoá khỏi danh sách sau khi PR merge và không còn cần test trên preview nữa.

## Testing / verification

- Migration: chạy `list_tables`/`execute_sql` qua Supabase MCP xác nhận 2 cột mới tồn tại, kiểu `text`, nullable.
- Vercel Functions: test cục bộ bằng `vercel dev`, gọi bằng `curl` với JWT thật (đăng nhập lấy `access_token` từ Supabase — admin và non-admin) để xác nhận 401/403/200 đúng theo role; xác nhận presigned URL trả về có domain R2 thật và query string `X-Amz-*` (SigV4), hết hạn đúng theo cấu hình.
- Admin UI: test thủ công trên browser (dev server) — upload 1 file mp4 nhỏ, xác nhận PUT request thành công (network tab), object key lưu vào DB, preview hiển thị đúng qua signed URL.
- Learner UI: mở lesson đã có `video_r2_key`, xác nhận video load qua signed URL (không phải YouTube iframe); mở lesson chưa có `video_r2_key` (dữ liệu cũ), xác nhận vẫn fallback YouTube như trước (regression check).
- Bảo mật: xác nhận không có secret R2 nào xuất hiện trong bundle frontend (`grep` trong `dist/` sau build) hoặc trong Network tab của browser — chỉ signed URL (đã có chữ ký hết hạn) mới lộ ra client.

## Ngoài phạm vi (không làm)

- Không transcode/convert format video (giữ nguyên file admin upload).
- Không xây DRM/watermark — signed URL hết hạn là mức bảo vệ được chọn, không chống được screen-recording.
- Không tự động migrate video/audio cũ từ YouTube/URL cũ sang R2 — chỉ áp dụng cho nội dung upload mới; bài cũ tiếp tục dùng YouTube/URL cũ qua fallback.
- Không xoá cột `youtube_id`/`listening_url` hay logic YouTube embed hiện có.
