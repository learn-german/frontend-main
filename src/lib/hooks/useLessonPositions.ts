import { useState, useEffect } from "react";
import { supabase } from "../supabase";
import { LessonPosition } from "../appTypes";

type SupabaseLessonPosition = {
  id: string;
  module_id: string;
  order_index: number;
  status: string;
};

export function useLessonPositions(userId: string | null): { positions: LessonPosition[]; loading: boolean } {
  const [positions, setPositions] = useState<LessonPosition[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setPositions([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    supabase
      .from("lesson_positions")
      .select("id, module_id, order_index, status")
      .then(({ data, error }) => {
        if (cancelled) return;
        if (!error && data) {
          setPositions((data as SupabaseLessonPosition[]).map((row) => ({
            id: row.id,
            moduleId: row.module_id,
            orderIndex: row.order_index,
            status: row.status as "draft" | "published",
          })));
        }
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [userId]);

  return { positions, loading };
}
