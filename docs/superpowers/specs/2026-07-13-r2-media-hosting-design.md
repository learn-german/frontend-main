# Video/audio hosting on Cloudflare R2 with expiring signed URLs

## Bối cảnh

Hiện tại lesson video dùng YouTube embed (`lessons.youtube_id`, render trong [VideoPlayer.tsx](../../../src/components/VideoPlayer.tsx)), audio dùng URL trực tiếp (`lessons.listening_url`, render bằng `<audio src=...>` trong [LessonDetailPage.tsx](../../../src/pages/LessonDetailPage.tsx)). Admin nhập cả hai dưới dạng text field thủ công trong [AdminLessonEditor.tsx](../../../src/pages/admin/AdminLessonEditor.tsx).

Yêu cầu mới: admin upload trực tiếp file video/audio lên Cloudflare R2 (bucket S3-compatible tại `https://586e2faf05d03edec1456845c8240700.r2.cloudflarestorage.com/web-gemany`) qua một nút upload trong trang admin, thay cho YouTube/URL thủ công. Link R2 thật không bao giờ được lộ ra cho client — thay vào đó dùng signed URL (presigned) có hạn dùng.

## Quyết định kiến trúc

- **R2 credentials chỉ sống trong Supabase Edge Function secrets** (giống pattern `SUPABASE_SERVICE_ROLE_KEY` hiện có) — không đặt trong biến môi trường Vercel, vì Vercel hiện chỉ deploy static SPA ([vercel.json](../../../vercel.json) chỉ có rewrite rule, không có serverless function nào), nên bất kỳ secret nào đặt ở đó có nguy cơ bị bundle vào frontend nếu không cẩn thận. Giữ đúng nguyên tắc kiến trúc hiện tại của project: logic nhạy cảm nằm trong Edge Function.
- **Upload đi thẳng từ browser lên R2** qua presigned PUT URL (Edge Function chỉ ký URL, không proxy file qua nó) — tránh giới hạn payload/thời gian chạy của Edge Function với file video lớn.
- **Playback dùng presigned GET URL hết hạn ~4 giờ**, Edge Function tự tra object key thật từ DB theo `lessonId` — client không được tự cung cấp raw object key, tránh dò object khác trong bucket.
- **Thêm cột mới, không xoá cột cũ**: `video_r2_key`, `audio_r2_key` thêm vào `lessons`, giữ `youtube_id`/`listening_url` để bài học cũ không bị hỏng. Render ưu tiên R2 nếu có, fallback về YouTube/URL cũ nếu không — cùng pattern đã dùng cho `grammar_md` vs `grammar` JSONB cũ ([LessonDetailPage.tsx:131](../../../src/pages/LessonDetailPage.tsx)).

## Phạm vi thay đổi

**Database:** 1 migration mới thêm 2 cột.

**Supabase Edge Functions (mới):**
- `media-upload-url` — sinh presigned PUT URL cho admin.
- `media-playback-url` — sinh presigned GET URL cho learner.

**Frontend:**
- `src/pages/admin/AdminLessonEditor.tsx` — thay ô nhập YouTube ID/audio URL bằng nút upload.
- `src/components/VideoPlayer.tsx` — nhận thêm object key, tự fetch signed URL khi có `video_r2_key`.
- `src/pages/LessonDetailPage.tsx` — audio player tự fetch signed URL khi có `audio_r2_key`.
- `src/lib/appTypes.ts`, `src/lib/hooks/useModules.ts` — thêm field `videoR2Key`/`audioR2Key`.

**Việc admin phải làm 1 lần ngoài code (không thể tự động hoá qua Edge Function vì cần quyền quản trị bucket, không phải S3 API thường):**
1. Tạo R2 API token (Access Key ID + Secret Access Key) trong Cloudflare dashboard, set vào Supabase secrets.
2. Cấu hình CORS cho bucket R2 (JSON cụ thể ở mục dưới) — cho phép `PUT`/`GET` từ domain app.

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

Supabase secrets (set qua `supabase secrets set`, không qua chat):
- `R2_ACCOUNT_ID` — `586e2faf05d03edec1456845c8240700`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME` — `web-gemany`

S3 endpoint dùng trong SDK: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, region `"auto"`.

Object key convention (đơn giản, đoán được, ghi đè khi re-upload):
- Video: `videos/{lessonId}.{ext}`
- Audio: `audio/{lessonId}.{ext}`

Giới hạn định dạng/kích thước (client-side validate trước khi xin presigned URL):
- Video: `.mp4` — tối đa 2GB.
- Audio: `.mp3`, `.m4a`, `.wav` — tối đa 100MB.

### 3. Edge Function `media-upload-url`

Path: `supabase/functions/media-upload-url/index.ts`

Request: `POST` body `{ lessonId: string, mediaType: "video" | "audio", fileExt: string }`

Auth: giống `set-admin-role` — bắt buộc JWT hợp lệ và `user.app_metadata.role === "admin"`, nếu không trả 401/403.

Validate `mediaType` là `"video"` hoặc `"audio"`; validate `fileExt` thuộc danh sách cho phép theo `mediaType` (mp4 cho video; mp3/m4a/wav cho audio) — nếu không, trả 400.

Xử lý: dùng `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` (import qua `esm.sh` trong Deno, không phải npm package của frontend) để tạo presigned PUT URL, hết hạn **600 giây (10 phút)**, cho object key `${mediaType === "video" ? "videos" : "audio"}/${lessonId}.${fileExt}`.

Response: `{ uploadUrl: string, objectKey: string }`.

### 4. Edge Function `media-playback-url`

Path: `supabase/functions/media-playback-url/index.ts`

Request: `GET /media-playback-url/<lessonId>?type=video|audio` (path param giống `lesson-complete`, query param cho type).

Auth: bắt buộc JWT hợp lệ (bất kỳ user đã login, không cần admin — giống `lesson-complete`).

Xử lý:
1. Query `lessons` table (dùng service_role, bypass RLS chỉ để đọc key) lấy `video_r2_key`/`audio_r2_key` theo `lessonId` + `type`.
2. Nếu key rỗng/null → trả 404.
3. Tạo presigned **GET** URL hết hạn **14400 giây (4 giờ)** cho key đó.

Response: `{ url: string }`.

Client **không** được tự truyền raw object key — chỉ truyền `lessonId`, function tự tra key thật, tránh cho phép ký URL cho object bất kỳ trong bucket.

### 5. Admin UI (`AdminLessonEditor.tsx`)

Thay 2 chỗ:
- Khối video (hiện là input text `YouTube ID`) → thêm nút "Tải video lên" (file input `accept="video/mp4"`), khi chọn file:
  1. Validate size/type client-side theo giới hạn mục 2.
  2. Gọi `media-upload-url` lấy `{uploadUrl, objectKey}`.
  3. `fetch(uploadUrl, { method: "PUT", body: file, headers: { "Content-Type": file.type } })`, hiện progress (dùng `XMLHttpRequest` để có `upload.onprogress`, `fetch` không hỗ trợ progress upload).
  4. Lưu `objectKey` vào state `data.video_r2_key`, admin bấm "Lưu" như flow hiện tại (`supabase.from("lessons").update(...)`) để persist — không cần Edge Function riêng cho bước lưu.
  5. Preview: sau khi có `video_r2_key`, gọi `media-playback-url` lấy signed URL, hiển thị `<video controls src=...>` nhỏ để admin xem lại.
- Khối audio ("Luyện nghe", hiện là input text URL) → tương tự, nút "Tải audio lên" (`accept="audio/mpeg,audio/mp4,audio/wav"`), lưu vào `data.audio_r2_key`.

Giữ ô input `youtube_id`/`listening_url` cũ ở dạng thu gọn/phụ (ví dụ trong một `<details>` "Nhập thủ công (cũ)") để admin vẫn có thể override bằng tay nếu cần — không xoá hoàn toàn khỏi UI, chỉ không còn là cách nhập chính.

### 6. Learner UI

`VideoPlayer.tsx` nhận thêm prop `videoR2Key?: string`. Nếu có, component tự gọi `media-playback-url` (qua `supabase.functions.invoke`) lấy signed URL, hiện loading state trong lúc chờ, sau đó render `<video controls src={signedUrl}>` thay cho iframe YouTube. Nếu không có `videoR2Key` nhưng có `youtubeId` → giữ nguyên iframe YouTube như hiện tại. Nếu không có gì cả → giữ placeholder hiện tại.

Audio trong `LessonDetailPage.tsx` (tab "Nghe"): nếu có `audioR2Key`, gọi `media-playback-url` lấy signed URL cho `<audio src>` thay vì dùng `listening_url` trực tiếp; ngược lại giữ `listening_url` như hiện tại.

### 7. Types & data hooks

`src/lib/appTypes.ts`: thêm `videoR2Key?: string; audioR2Key?: string;` vào type `Lesson`.

`src/lib/hooks/useModules.ts`: map `video_r2_key`/`audio_r2_key` từ DB row sang `videoR2Key`/`audioR2Key`, cùng cách `grammar_md` → `grammarMd` đang làm.

### 8. CORS cho bucket R2 (việc admin tự làm qua Cloudflare dashboard hoặc AWS CLI với credentials của họ — Claude không có quyền set CORS bucket)

```json
[
  {
    "AllowedOrigins": ["https://<production-domain>", "http://localhost:5173"],
    "AllowedMethods": ["PUT", "GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "MaxAgeSeconds": 3600
  }
]
```
(`<production-domain>` cần điền domain thật app đang deploy trên Vercel.)

## Testing / verification

- Migration: chạy `list_tables`/`execute_sql` qua Supabase MCP xác nhận 2 cột mới tồn tại, kiểu `text`, nullable.
- Edge Functions: test cục bộ bằng `supabase functions serve`, gọi bằng `curl` với JWT giả lập (admin và non-admin) để xác nhận 401/403/200 đúng theo role; xác nhận presigned URL trả về có domain R2 thật và query string `X-Amz-*` (SigV4), hết hạn đúng theo cấu hình.
- Admin UI: test thủ công trên browser (dev server) — upload 1 file mp4 nhỏ, xác nhận PUT request thành công (network tab), object key lưu vào DB, preview hiển thị đúng qua signed URL.
- Learner UI: mở lesson đã có `video_r2_key`, xác nhận video load qua signed URL (không phải YouTube iframe); mở lesson chưa có `video_r2_key` (dữ liệu cũ), xác nhận vẫn fallback YouTube như trước (regression check).
- Bảo mật: xác nhận không có secret R2 nào xuất hiện trong bundle frontend (`grep` trong `dist/` sau build) hoặc trong Network tab của browser — chỉ signed URL (đã có chữ ký hết hạn) mới lộ ra client.

## Ngoài phạm vi (không làm)

- Không transcode/convert format video (giữ nguyên file admin upload).
- Không xây DRM/watermark — signed URL hết hạn là mức bảo vệ được chọn, không chống được screen-recording.
- Không tự động migrate video/audio cũ từ YouTube/URL cũ sang R2 — chỉ áp dụng cho nội dung upload mới; bài cũ tiếp tục dùng YouTube/URL cũ qua fallback.
- Không xoá cột `youtube_id`/`listening_url` hay logic YouTube embed hiện có.
