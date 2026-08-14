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

## Skills Bắt Buộc

- **Trước khi code bất kỳ feature/thay đổi hành vi nào**: dùng
  `/superpowers:brainstorming` để hỏi rõ yêu cầu, chốt thiết kế và viết
  spec trước — không code thẳng kể cả khi task trông đơn giản.
- **Khi viết/sửa code**: áp dụng `/ponytail:ponytail` (mặc định level
  full) — ưu tiên giải pháp tối giản, tái dùng code/pattern có sẵn trong
  repo trước khi thêm cái mới, tránh over-engineering.
- **Khi GitNexus báo index cũ, hoặc trước khi tra cứu/refactor/debug
  code**: dùng `/gitnexus-cli` (`node .gitnexus/run.cjs analyze`) để
  reindex trước.

## Environment Variables

```
VITE_SUPABASE_URL=       # Supabase project URL
VITE_SUPABASE_ANON_KEY=  # Supabase anon/public key (an toàn để expose)
GEMINI_API_KEY=          # Google Gemini API key
```

Đặt trong `.env.local` (không commit file này).
`SUPABASE_SERVICE_ROLE_KEY` **không bao giờ** đặt ở đây — chỉ dùng trong Supabase Edge Functions.

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **frontend-main** (2519 symbols, 4165 relationships, 118 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({search_query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.
- For security review, `explain({target: "fileOrSymbol"})` lists taint findings (source→sink flows; needs `analyze --pdg`).

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/frontend-main/context` | Codebase overview, check index freshness |
| `gitnexus://repo/frontend-main/clusters` | All functional areas |
| `gitnexus://repo/frontend-main/processes` | All execution flows |
| `gitnexus://repo/frontend-main/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
