# Task 5 Report: Admin listening — variable MC options (2–6)

**Branch:** `feat/listening-quiz-ux-fixes`

## Status

**DONE** — Admin listening multiple-choice questions now default to two
options and support adding/removing options up to the shared 2–6 bounds.

## Changes

### `src/pages/admin/AdminListeningExerciseSection.tsx`

- Changed new multiple-choice defaults from four empty options to two.
- Changed empty database fallback options from four to two while preserving
  stored option lengths for existing rows.
- Reused `addOption`, `removeOption`, `setOption`, `optionLabel`,
  `MIN_MULTIPLE_CHOICE_OPTIONS`, and `MAX_MULTIPLE_CHOICE_OPTIONS`.
- Added accessible add/remove controls and disabled removal at the minimum.
- Removal keeps the correct-answer index synchronized through the shared helper.

## Impact analysis

- `emptyForm`: LOW risk; 4 upstream dependants.
- `ListeningQuestionFields`: LOW risk; 3 upstream dependants.
- `formFromRow`: HIGH risk; 4 upstream dependants across edit and publish
  validation flows. The change is fallback-only, so persisted option lengths
  remain unchanged.

## Verification

```text
npm run lint
# pass (tsc --noEmit)

git diff --check
# pass

gitnexus detect_changes --repo frontend-main
# 1 file, 8 symbols, 7 affected flows, reported high risk
```

## Concerns

- No dedicated UI test suite exists for this admin component; manual browser
  verification should cover adding to six, removing back to two, and changing
  the selected correct option.
