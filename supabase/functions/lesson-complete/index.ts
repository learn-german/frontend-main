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
    // Extract lesson_id from URL path: /functions/v1/lesson-complete/<lesson_id>
    const url = new URL(req.url);
    const lessonId = url.pathname.split("/").pop();
    if (!lessonId || lessonId === "lesson-complete") {
      return new Response(JSON.stringify({ error: "lesson_id required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use service_role for DB ops (bypasses RLS, ensures atomicity)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Verify user from JWT
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency check: already completed? Pinned to 'nguphap' — this is
    // the "mark lesson complete" flow, unaffected by optional Nghe/Đọc
    // exercise attempts, which live in separate category rows.
    const { data: existing } = await supabase
      .from("lesson_progress")
      .select("lesson_id")
      .eq("user_id", user.id)
      .eq("lesson_id", lessonId)
      .eq("category", "nguphap")
      .maybeSingle();

    if (existing) {
      return new Response(
        JSON.stringify({ xpAwarded: 0, newStreak: 0, alreadyCompleted: true }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get current user_stats
    const { data: stats } = await supabase
      .from("user_stats")
      .select("xp, streak, last_activity_date")
      .eq("user_id", user.id)
      .single();

    // Streak logic (UTC dates)
    const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
    const lastDate: string | null = stats?.last_activity_date ?? null;

    let newStreak: number;
    if (!lastDate) {
      newStreak = 1;
    } else if (lastDate === today) {
      // Already active today — keep streak, still award XP for completing another lesson
      newStreak = stats.streak;
    } else {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      const yesterdayStr = yesterday.toISOString().split("T")[0];
      newStreak = lastDate === yesterdayStr ? (stats.streak ?? 0) + 1 : 1;
    }

    const XP_REWARD = 15;

    // Insert lesson_progress
    await supabase.from("lesson_progress").insert({
      user_id: user.id,
      lesson_id: lessonId,
      category: "nguphap",
    });

    // Update user_stats atomically
    await supabase.from("user_stats").update({
      xp: (stats?.xp ?? 0) + XP_REWARD,
      streak: newStreak,
      last_activity_date: today,
      updated_at: new Date().toISOString(),
    }).eq("user_id", user.id);

    return new Response(
      JSON.stringify({ xpAwarded: XP_REWARD, newStreak, alreadyCompleted: false }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (_error) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
