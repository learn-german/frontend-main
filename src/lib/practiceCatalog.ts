import { supabase } from './supabase';
import type { PracticeTopic } from './practice';
export async function loadPracticeCatalog(): Promise<PracticeTopic[]> {
  const { data, error } = await supabase.rpc('practice_catalog');
  if (error) throw error;
  return (data ?? []) as PracticeTopic[];
}
