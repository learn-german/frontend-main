import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parallel fetch: modules+lessons and user's lesson_progress
    const [modulesRes, progressRes] = await Promise.all([
      supabase
        .from("modules")
        .select(`
          id, level, title, title_vi, order_index,
          lessons (
            id, level, title, title_vi, objective, summary,
            youtube_id, duration, order_index, xp_reward, next_lesson_id,
            vocabulary, grammar
          )
        `)
        .order("order_index")
        .order("order_index", { referencedTable: "lessons" }),
      supabase
        .from("lesson_progress")
        .select("lesson_id, quiz_score, completed_at")
        .eq("user_id", user.id),
    ]);

    if (modulesRes.error) {
      return new Response(JSON.stringify({ error: modulesRes.error.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const completedMap = new Map(
      (progressRes.data ?? []).map((p) => [p.lesson_id, p]),
    );

    const modules = (modulesRes.data ?? []).map((module) => ({
      ...module,
      lessons: (module.lessons as Record<string, unknown>[]).map((lesson) => ({
        ...lesson,
        isCompleted: completedMap.has(lesson.id as string),
        quizScore: completedMap.get(lesson.id as string)?.quiz_score ?? null,
      })),
    }));

    return new Response(JSON.stringify({ modules }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
