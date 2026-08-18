import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export function useReadingSetPassageCounts(setIds: string[]): {
  passageCountBySetId: Map<string, number>;
  loading: boolean;
} {
  const [passageCountBySetId, setPassageCountBySetId] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const key = setIds.join(",");

  useEffect(() => {
    if (setIds.length === 0) {
      setPassageCountBySetId(new Map());
      setLoading(false);
      return;
    }

    setLoading(true);

    supabase
      .from("reading_passages")
      .select("set_id")
      .in("set_id", setIds)
      .then(({ data }) => {
        const counts = new Map<string, number>();
        for (const row of data ?? []) {
          const id = row.set_id as string | null;
          if (!id) continue;
          counts.set(id, (counts.get(id) ?? 0) + 1);
        }
        setPassageCountBySetId(counts);
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { passageCountBySetId, loading };
}
