import { useState, useEffect } from "react";
import { supabase } from "../supabase";

export interface ModuleOrder {
  id: string;
  level: string;
  lessonIds: string[];
}

interface ModuleRow {
  id: string;
  level: string;
  lessons: { id: string }[];
}

export function useModuleOrder() {
  const [modules, setModules] = useState<ModuleOrder[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase
      .from("modules")
      .select("id, level, order_index, lessons(id, order_index)")
      .order("order_index")
      .order("order_index", { referencedTable: "lessons" })
      .then(({ data }) => {
        setModules(
          ((data ?? []) as unknown as ModuleRow[]).map((m) => ({
            id: m.id,
            level: m.level,
            lessonIds: m.lessons.map((l) => l.id),
          })),
        );
        setLoading(false);
      });
  }, []);

  return { modules, loading };
}
