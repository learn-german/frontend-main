# DeutschPath

App học tiếng Đức dành cho người Việt — bài giảng video, ngữ pháp, từ vựng, bài tập nghe/đọc/ngữ pháp, theo dõi tiến trình học, và bảng xếp hạng.

## Kiến trúc

- **Frontend** (public): React + Vite, gọi Supabase trực tiếp bằng `anon` key.
- **Admin panel** (internal only): cùng codebase React, chỉ khác JWT có `app_metadata.role = "admin"` — không expose ra internet, chỉ truy cập qua VPN/IP whitelist.
- **Supabase**: Auth, Postgres (PostgREST + Row Level Security), Storage, Edge Functions.
- Không có backend server riêng — mọi logic nhạy cảm (chấm điểm quiz, gán quyền admin, xóa user...) nằm trong Supabase Edge Functions dùng `service_role` key, không bao giờ lộ ra frontend.

## Tech Stack

- React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- Supabase (Auth, PostgREST, Edge Functions/Deno)
- Google Gemini (`@google/genai`)
- lucide-react (icon), motion/react (animation)
- Cloudflare R2 (lưu trữ video/audio bài học)

## Cấu trúc thư mục

```
src/
  components/   # UI dùng chung (DesignSystem, Navigation, VideoPlayer, MarkdownBlock...)
  pages/        # Trang học viên (Dashboard, Roadmap, LessonDetail, Quiz, Landing, Login...)
  pages/admin/  # Trang admin (quản lý Nội dung, Bài tập, Người dùng, Tổng quan)
  lib/          # appTypes, supabase client, toast, hooks (useModules, useUserStats...)
  data/         # Mock/seed data cho môi trường demo
supabase/
  functions/    # Edge Functions (quiz-submit, lesson-complete, leaderboard, dashboard,
                # roadmap, set-admin-role, admin-create-user, admin-delete-user...)
  migrations/   # SQL migrations (schema, RLS policies)
docs/
  superpowers/  # Spec + implementation plan cho từng tính năng đã brainstorm/triển khai
```

## Chạy dự án cục bộ

**Yêu cầu:** Node.js 20+ (Node 16 sẽ crash Vite 6).

1. Cài dependencies:
   ```bash
   npm install
   ```
2. Tạo file `.env.local` (không commit) với các biến:
   ```
   VITE_SUPABASE_URL=       # Supabase project URL
   VITE_SUPABASE_ANON_KEY=  # Supabase anon/public key
   GEMINI_API_KEY=          # Google Gemini API key
   ```
   `SUPABASE_SERVICE_ROLE_KEY` **không bao giờ** đặt ở đây — chỉ dùng trong Supabase Edge Functions.
3. Chạy dev server:
   ```bash
   npm run dev   # http://localhost:5173
   ```

## Lệnh thường dùng

```bash
npm run dev        # Dev server
npm run build      # Build production
npm run lint       # Type check (tsc --noEmit)
npm run gen:types  # Regenerate src/lib/database.types.ts từ schema Supabase
```

## Quy ước chính

- Tên biến/hàm/type bằng tiếng Anh; nội dung hiển thị cho người dùng bằng tiếng Việt.
- `correctAnswer` của câu hỏi quiz không bao giờ gửi về client — chấm điểm chạy trong Edge Function `quiz-submit`.
- Mọi bảng Supabase bật Row Level Security.
- Không dùng `window.alert()`/`window.confirm()` — dùng `showToast()` (`src/lib/toast.ts`).

Xem chi tiết đầy đủ về quy ước code, kiến trúc bảo mật, và quy trình phát triển tại [`CLAUDE.md`](CLAUDE.md).
