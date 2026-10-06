import { supabase } from "./supabase";

export type ExerciseCategoryRow = { lesson_id: string; category: string };

/** PostgREST max-rows is 1000; page until every grammar_exercises_public row is in. */
const PAGE_SIZE = 1000;

export async function fetchExerciseCategoryRows(): Promise<{
  data: ExerciseCategoryRow[] | null;
  error: { message: string } | null;
  exactCount: number | null;
}> {
  const all: ExerciseCategoryRow[] = [];
  let from = 0;
  let exactCount: number | null = null;

  for (;;) {
    const { data, error, count } = await supabase
      .from("grammar_exercises_public")
      .select("lesson_id, category", { count: from === 0 ? "exact" : undefined })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      return { data: null, error: { message: error.message }, exactCount };
    }

    if (from === 0) exactCount = count;
    const page = (data ?? []) as ExerciseCategoryRow[];
    all.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return { data: all, error: null, exactCount };
}
