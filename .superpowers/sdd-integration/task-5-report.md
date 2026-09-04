# Task 5 Report — Gating + routing + navigation shell

## Status

DONE

## Implementation

- `trialGating.ts`: added `"meetings"` to `LockedFeature`; meetings lock via `role !== "admin" && isTrialBySubscription(...)`; other features unchanged (`isEffectivelyTrial`).
- `router.ts` + `appTypes.ts`: `"meetings"` page, `/meetings` route, protected page, parse/serialize.
- `App.tsx`: subscription-gated redirect for `/meetings`; sidebar + `<MeetingPage />` stub render.
- `Navigation.tsx`: sidebar link "Lịch học trực tuyến" after lesson, `featureMap.meetings`.
- `MeetingPage.tsx`: minimal stub ("Đang tải…").
- Tests: `router.test.ts`, new `trialGating.test.ts`.

## Validation

- `npm run lint` — passed
- `npx tsx src/lib/router.test.ts` — passed
- `npx tsx src/lib/trialGating.test.ts` — passed

## Commit

`feat(meetings): add /meetings route and subscription gate`
