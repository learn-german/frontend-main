# Dashboard Contact Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a “Liên hệ” button on Dashboard Trial and expired banners that opens the Facebook fanpage in a new tab.

**Architecture:** Minimal UI change in `DashboardPage.tsx` only. Reuse existing `Button` (`primary` / `sm`) and the local `openMeeting` helper (already validates http(s) and opens with `noopener,noreferrer`) so we avoid invalid `<a><button>` nesting.

**Tech Stack:** React 19, TypeScript, DesignSystem `Button`, Vite.

**Spec:** `docs/superpowers/specs/2026-09-08-dashboard-contact-button-design.md`

## Global Constraints

- UI label: `Liên hệ` (Vietnamese).
- URL: `https://web.facebook.com/share/1C9YswkzTN/?mibextid=wwXIfr&_rdc=1&_rdr`
- Both Trial (amber) and expired (red) banners get the button.
- No new npm packages; no `any`; no changes to trial gating logic.
- After edits: `npm run lint`. Before editing symbols: GitNexus `impact` upstream; before commit: `detect_changes()`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `src/pages/DashboardPage.tsx` | Constant URL + contact button on both status banners |

---

### Task 1: Add Liên hệ button to Trial and expired banners

**Files:**
- Modify: `src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: existing `Button`, existing `openMeeting(url: string | null): void`
- Produces: `CONTACT_FANPAGE_URL` constant; local `ContactFanpageButton`; buttons visible when banners render

- [x] **Step 1: Impact analysis**

Run GitNexus impact on `DashboardPage` (upstream). Report blast radius. If HIGH/CRITICAL, stop and warn user.

> **Done:** GitNexus MCP unavailable; manual grep fallback — sole caller `App.tsx`, blast radius LOW.

- [x] **Step 2: Add URL constant**

Insert after the existing helpers near the top of `DashboardPage.tsx` (after `openMeeting` / before `NoData`):

```typescript
const CONTACT_FANPAGE_URL =
  "https://web.facebook.com/share/1C9YswkzTN/?mibextid=wwXIfr&_rdc=1&_rdr";
```

- [x] **Step 3: Update expired banner**

Replace the expired banner block so text is `flex-1` and a primary sm button sits on the right:

```tsx
{isExpiredRestricted && (
  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3 mb-4">
    <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-display font-bold text-red-900">Gói học đã hết hạn</p>
      <p className="text-xs text-red-700 mt-0.5">Toàn bộ bài học đang bị khoá. Liên hệ admin để gia hạn — tiến trình của bạn vẫn được giữ.</p>
    </div>
    <ContactFanpageButton />
  </div>
)}
```

- [x] **Step 4: Update Trial banner**

Same pattern for the amber banner:

```tsx
{isTrialRestricted && !isExpiredRestricted && (
  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3 mb-4">
    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
    <div className="flex-1 min-w-0">
      <p className="text-sm font-display font-bold text-amber-900">Bạn đang dùng gói Trial</p>
      <p className="text-xs text-amber-700 mt-0.5">Chỉ bài học đầu tiên khả dụng. Liên hệ admin để nâng cấp gói và mở toàn bộ nội dung.</p>
    </div>
    <ContactFanpageButton />
  </div>
)}
```

> **Human Decision B (override Steps 3–4):** extracted light local `ContactFanpageButton` in `DashboardPage.tsx` instead of inline duplicated `Button` JSX in each banner. Opens via `openMeeting` on button click (not `<a>` wrapping `Button`).

- [x] **Step 5: Lint**

Run: `npm run lint`  
Expected: exit 0 (no new TypeScript errors).

- [ ] **Step 6: Manual check**

- Trial user → amber banner + “Liên hệ” → opens fanpage URL in new tab  
- Expired user → red banner + same button/URL  
- Active paid/admin → neither banner  

- [x] **Step 7: Commit**

Run `detect_changes()` then:

```bash
git add src/pages/DashboardPage.tsx
git commit -m "$(cat <<'EOF'
feat(dashboard): add Liên hệ button on trial and expired banners

EOF
)"
```

---

## Spec coverage (self-review)

| Spec requirement | Task |
|---|---|
| Button on Trial banner | Task 1 Step 4 |
| Button on expired banner | Task 1 Step 3 |
| Fanpage URL | Task 1 Step 2 |
| New tab / noopener | via `openMeeting` |
| DesignSystem Button primary/sm via `ContactFanpageButton` | Task 1 Steps 3–4 (Decision B) |
| Only `DashboardPage.tsx` | File Structure |
| Manual + lint | Steps 5–6 |
