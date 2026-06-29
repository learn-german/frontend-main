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

    const [statsRes, progressRes, modulesRes] = await Promise.all([
      supabase
        .from("user_stats")
        .select("xp, streak, last_activity_date")
        .eq("user_id", user.id)
        .single(),
      supabase
        .from("lesson_progress")
        .select("lesson_id, quiz_score, completed_at")
        .eq("user_id", user.id),
      supabase
        .from("modules")
        .select("id, lessons(id, title, title_vi, order_index)")
        .order("order_index")
        .order("order_index", { referencedTable: "lessons" }),
    ]);

    const completedIds = new Set((progressRes.data ?? []).map((p) => p.lesson_id));
    const allLessons = (modulesRes.data ?? []).flatMap((m) => m.lessons as { id: string; title: string; title_vi: string; order_index: number }[]);
    const nextLesson = allLessons.find((l) => !completedIds.has(l.id)) ?? null;

    return new Response(
      JSON.stringify({
        stats: statsRes.data ?? null,
        completedLessons: progressRes.data ?? [],
        nextLesson,
        totalLessons: allLessons.length,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
