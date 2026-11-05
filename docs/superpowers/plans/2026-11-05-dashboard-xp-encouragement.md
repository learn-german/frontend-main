# Dashboard XP Encouragement Implementation Plan

> **For agentic workers:** Execute this small plan inline. Steps use checkbox syntax for tracking.

**Goal:** Show the approved encouragement message when total XP is below 5000.

**Architecture:** Replace only the existing false branch of the XP message ternary in `DashboardPage`. Reuse its paragraph and bold elements; keep the true branch and threshold intact.

**Tech Stack:** React, TypeScript, Tailwind CSS, Vite, Node test runner.

## Task 1: Update and verify the copy

**Files:** Modify `src/pages/DashboardPage.tsx`; existing validation in `src/lib/dashboardProgress.test.ts` and project scripts.

- [x] Reindex with GitNexus, query the XP dashboard flow, and run upstream impact on `DashboardPage`. Report risk and affected callers/processes before editing.
- [x] Replace only the below-threshold message with this JSX:

```tsx
<>Mỗi bài học là một bước tiến! Chinh phục <b className="text-slate-700">5.000 XP</b> để mở khóa phần thưởng <b className="text-slate-700">300.000đ</b> dành cho sự kiên trì của bạn!</>
```

- [x] Review exact rendered text and the existing condition at XP 4999, 5000 and 5001. Confirm the >=5000 branch is unchanged.
- [x] Run `npm test`, `npm run lint` and `npm run build`; expect zero failures and successful compilation/build.
- [x] Run `node .gitnexus/run.cjs detect-changes --scope all`, `git diff --check` and review the minimal source diff. Preserve unrelated original-checkout edits.

Validation results: exact rendered copy and threshold cases pass; TypeScript and production build pass. Existing test suite: 347/348 pass; the same profileOnboardingMigration fixture test fails before and after the change. GitNexus upstream impact LOW (caller App); detect_changes finds only DashboardPage and its two local flows, aggregate risk medium. Source diff is one JSX line.
