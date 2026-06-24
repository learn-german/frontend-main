# DeutschPath — CLAUDE.md

App học tiếng Đức cho người Việt. Frontend React + Vite, backend Supabase (Auth + PostgREST + Edge Functions), AI via Gemini.

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- **Backend**: Supabase (Auth, PostgREST, Edge Functions)
- **AI**: Google Gemini (`@google/genai`)
- **UI icons**: lucide-react
- **Animation**: motion/react

## Cấu Trúc Thư Mục

```
src/
  components/   # Shared UI components (DesignSystem, Navigation, VideoPlayer)
  pages/        # Page-level components (Dashboard, Roadmap, Lesson, Quiz, Landing, Login)
  lib/
    appTypes.ts          # App types (Level, Lesson, UserStats, ...)
    supabase.ts          # Supabase client singleton
    toast.ts             # Toast notification utility
    database.types.ts    # Auto-generated từ Supabase schema (npm run gen:types)
  data/         # Mock/seed data (mockData.ts)
  App.tsx       # Root, quản lý routing + global state
  main.tsx      # Entry point
supabase/
  functions/    # Edge Functions (submit-quiz, set-admin-role, ...)
  migrations/   # SQL migrations
```

## Conventions

### Code
- Ngôn ngữ code: **English** (tên biến, hàm, type, comment kỹ thuật)
- Nội dung hiển thị cho user: **Tiếng Việt** (label, message, placeholder)
- Naming: `camelCase` cho biến/hàm, `PascalCase` cho component/type/interface
- Không dùng `any` trong TypeScript — dùng type cụ thể hoặc `unknown`
- Export named exports, không dùng default export (trừ `App.tsx`)

### Components
- Mỗi page nằm trong `src/pages/`, shared UI trong `src/components/`
- Dùng component từ `DesignSystem.tsx` trước khi tạo component mới
- Toast notification: dùng `showToast()` từ `src/lib/toast.ts`, không dùng `window.alert()`

### State & Storage
- Global state quản lý trong `App.tsx`, truyền xuống qua props
- localStorage access qua `safeStorage` (có fallback cho iframe/sandbox), không dùng `window.localStorage` trực tiếp
- LocalStorage keys: khai báo constant ở đầu file (`LOCAL_STORAGE_*`)

### API & Types
- App types định nghĩa trong `src/lib/appTypes.ts` — sửa trực tiếp tại đây
- Supabase DB types auto-generated vào `src/lib/database.types.ts` — **không sửa tay**, chạy `npm run gen:types`
- Auth do Supabase xử lý hoàn toàn, không viết custom auth endpoint
- `correctAnswer` không bao giờ gửi về client — quiz scoring chạy trong Edge Function

## Kiến Trúc & Bảo Mật

### Tổng quan
- **Frontend container** (public): React app, gọi Supabase trực tiếp với `anon` key
- **Admin container** (internal only): React app, gọi Supabase với `anon` key + admin JWT claim
- **Supabase**: Auth, PostgREST + RLS, Storage, Edge Functions
- Không có custom backend server — logic nhạy cảm nằm trong Edge Functions

### Nguyên tắc bảo mật bắt buộc
- `SUPABASE_SERVICE_ROLE_KEY` **không bao giờ** xuất hiện trong bất kỳ container nào
- Admin container không expose ra internet — chỉ truy cập qua VPN hoặc IP whitelist
- Mọi bảng Supabase phải bật RLS
- `correctAnswer` không bao giờ gửi về client — quiz scoring chạy trong Edge Function
- Admin role gán qua `app_metadata.role = "admin"` — chỉ set được bằng Edge Function dùng service_role

### Edge Functions (operations cần service_role)
- `submit-quiz` — chấm điểm server-side, đọc `correct_answer`
- `set-admin-role` — gán role admin cho user
- `delete-user` — xóa user khỏi auth.users

### Docker
- Frontend: bind port 443 ra ngoài
- Admin: chỉ nằm trong Docker internal network, không bind port ra host
- Nginx làm reverse proxy, IP whitelist cho admin endpoint

## Những Gì KHÔNG Được Làm

- Không dùng `window.alert()` hay `window.confirm()` — dùng `showToast()` hoặc UI modal
- Không thêm npm package mới mà không hỏi trước
- Không refactor code ngoài scope của task đang làm
- Không xóa code có sẵn nếu không chắc nó unused
- Không hardcode API key hay secret vào code — dùng `.env.local`
- Không để `SUPABASE_SERVICE_ROLE_KEY` trong file `.env` của frontend hoặc admin container
- Không tắt RLS trên bất kỳ bảng nào
- Không xử lý quiz scoring ở frontend
- Không sửa `src/lib/database.types.ts` bằng tay

## Lệnh Thường Dùng

```bash
npm run dev        # Dev server tại localhost:3000
npm run build      # Build production
npm run lint       # TypeScript type check (tsc --noEmit)
npm run gen:types  # Regenerate database.types.ts từ Supabase schema
```

## Workflow Khi Thêm Feature Mới

1. Implement component/page
2. Chạy `npm run lint` để kiểm tra type errors
3. Test thủ công trên browser
4. Nếu có thay đổi DB schema → chạy `npm run gen:types` để cập nhật types

## Environment Variables

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # Supabase anon/public key (an toàn để expose)
GEMINI_API_KEY=          # Google Gemini API key
```

Đặt trong `.env.local` (không commit file này).
`SUPABASE_SERVICE_ROLE_KEY` **không bao giờ** đặt ở đây — chỉ dùng trong Supabase Edge Functions.
