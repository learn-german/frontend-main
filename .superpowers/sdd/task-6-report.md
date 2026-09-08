# Task 6 Report: Wire Sidebar + useUserStats + App

## Status

Implemented.

## Summary

- `useUserStats` now returns `weekActivity` and fetches current Vietnam-time Mon-Sun activity from `learning_activity_days`.
- Lesson completion and quiz completion optimistically mark today active in the local week state; quiz completion also accepts optional `newStreak`.
- `Sidebar` now accepts `streak` and `weekActivity`, keeps the weekly meeting card, and renders `LearningStreakCard` below it in an `mt-auto` footer stack.
- `App` passes stats into `Sidebar` and threads optional quiz `newStreak` through grammar, listening, and reading set completion callbacks.

## Impact Analysis

GitNexus MCP tools were unavailable. CLI `node .gitnexus/run.cjs analyze` was attempted first but failed with local FTS index inconsistency:

> FTS index 'file_fts' is inconsistent: document for node offset 431 is missing during delete.

Fallback caller grep:

- `Sidebar`: rendered only from `src/App.tsx`. Risk: LOW.
- `useUserStats`: consumed only by `src/App.tsx`. Risk: LOW.
- `applyLessonCompleteReward`: called only by `handleMarkComplete` in `src/App.tsx`. Risk: LOW.
- `applyQuizResult`: called only by `handleQuizFinished` in `src/App.tsx`; callback is passed to quiz set pages. Risk: LOW.

No HIGH/CRITICAL blast radius found.

## Verification

- `npm run lint`: PASS.
- `node --import tsx --test src/lib/learningStreak.test.ts src/components/LearningStreakCard.test.ts src/components/Navigation.test.tsx`: PASS, 13 tests.
- Brief command `npm test -- src/lib/learningStreak.test.ts src/components/LearningStreakCard.test.ts src/components/Navigation.test.tsx`: FAIL because the npm script still runs the whole suite first. Relevant streak/navigation tests passed; unrelated existing failures were in `App.auth.test.ts`, `trialGating.test.ts`, and `LoginPage.test.tsx`.
- `node .gitnexus/run.cjs detect_changes --repo '/Users/thangnv/Documents/github/frontend-main-1/.worktrees/feat-learning-streak'`: PASS. 8 files, 30 symbols, 0 affected processes, low risk.

## Notes

- Existing unrelated modification left untouched: `.superpowers/sdd/task-5-report.md`.
- Local generated `src/lib/database.types.ts` did not include `learning_activity_days`; the Supabase client in this app is currently untyped, and `npm run lint` passes without editing generated types.
