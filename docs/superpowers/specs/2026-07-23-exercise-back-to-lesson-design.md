# Exercise Back-to-Lesson Navigation

## Goal

Make it easy for learners to return from any exercise to the lesson they were studying, and simplify the German label of the lesson's grammar-theory tab.

## Scope

- Rename the lesson theory tab from `Schlüsselgrammatik` to `Grammatik`.
- Keep the exercise tab label `Grammatikübungen` unchanged so the two tabs remain distinct.
- Add a visible `Trở về bài học` secondary action at the top of:
  - grammar exercises;
  - reading exercises;
  - listening exercises;
  - the general lesson quiz.
- The action returns to the detail page of the currently selected lesson.
- Apply the same destination to exercise loading, empty, active, and result states where a return action is shown.

## Design

Both exercise page components already receive an `onBackToLesson` callback from `App`. The UI will use that callback directly rather than introducing new route state.

`GrammarExercisePage` and `QuizPage` will show a top header row containing the exercise title/context and a secondary `Trở về bài học` button. The button will be visually subordinate to answer and submission actions. Existing progress and answer state do not need to be persisted because returning to the lesson intentionally exits the exercise screen.

Existing route behavior remains unchanged: `App` keeps the selected lesson ID and changes the current page back to `lesson-detail`.

## Error and Edge Cases

- If an exercise has no questions, the return action goes to the lesson rather than the roadmap.
- If exercise loading fails, the learner can still return to the current lesson.
- The button does not depend on score, completion, or pass state.

## Testing

- Verify the lesson theory tab renders `Grammatik` and no longer renders `Schlüsselgrammatik`.
- Verify `GrammarExercisePage` calls `onBackToLesson` from its top return button.
- Verify `QuizPage` calls `onBackToLesson` for grammar quiz, reading, and listening categories.
- Run the focused tests, then the full test and build commands.
