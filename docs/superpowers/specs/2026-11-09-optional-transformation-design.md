# Optional transformation instruction

Source: Notion 41292cf518d88006aea7d1a4da6e788d.
Allow blank transformation_hint when creating/updating sentence_transformation exercises in lessons and practice. Original sentence and correct answer remain required. Hide an absent hint in preview; student rendering already does this. Existing nullable database field requires no migration.

Approach: reuse shared validateForm and ExerciseEntryFields; do not add a second optional-field flag or change scoring. User requested autonomous execution without confirmation.
