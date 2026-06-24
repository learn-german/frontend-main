# DeutschPath — CLAUDE.md

App học tiếng Đức cho người Việt. Frontend React + Vite, backend Supabase (Auth + PostgREST + Edge Functions), AI via Gemini.

## Tech Stack

- **Frontend**: React 19, TypeScript 5.8, Vite 6, Tailwind CSS v4
- **Backend**: Supabase (Auth, PostgREST, Edge Functions)
- **AI**: Google Gemini (`@google/genai`)
- **UI icons**: lucide-react
- **Animation**: motion/react
- **API contract**: `openapi.yaml` → types auto-generated vào `src/types.ts` bằng `npm run gen:types`

## Cấu Trúc Thư Mục

```
src/
  components/   # Shared UI components (DesignSystem, Navigation, VideoPlayer)
  pages/        # Page-level components (Dashboard, Roadmap, Lesson, Quiz, Landing, Login)
  lib/          # Utilities (toast.ts, ...)
  data/         # Mock/seed data (mockData.ts)
  types.ts      # Auto-generated từ openapi.yaml — KHÔNG sửa tay
  App.tsx       # Root, quản lý routing + global state
  main.tsx      # Entry point
openapi.yaml    # Source of truth cho API contract
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
- `src/types.ts` auto-generated — **không sửa tay**. Sửa `openapi.yaml` rồi chạy `npm run gen:types`
- Auth do Supabase xử lý hoàn toàn, không viết custom auth endpoint
- `correctAnswer` không bao giờ gửi về client — quiz scoring chạy server-side

## Những Gì KHÔNG Được Làm

- Không sửa `src/types.ts` bằng tay
- Không dùng `window.alert()` hay `window.confirm()` — dùng `showToast()` hoặc UI modal
- Không thêm npm package mới mà không hỏi trước
- Không refactor code ngoài scope của task đang làm
- Không xóa code có sẵn nếu không chắc nó unused
- Không hardcode API key hay secret vào code — dùng `.env.local`

## Lệnh Thường Dùng

```bash
npm run dev        # Dev server tại localhost:3000
npm run build      # Build production
npm run lint       # TypeScript type check (tsc --noEmit)
npm run gen:types  # Regenerate src/types.ts từ openapi.yaml
```

## Workflow Khi Thêm Feature Mới

1. Nếu liên quan API → cập nhật `openapi.yaml` trước, chạy `npm run gen:types`
2. Implement component/page
3. Chạy `npm run lint` để kiểm tra type errors
4. Test thủ công trên browser

## Environment Variables

```
GEMINI_API_KEY=    # Google Gemini API key (bắt buộc)
```

Đặt trong `.env.local` (không commit file này).
