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

    const url = new URL(req.url);
    const type = url.searchParams.get("type") ?? "global";

    if (type === "weekly") {
      // Sum xp_reward of lessons completed in the last 7 days
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: progress } = await supabase
        .from("lesson_progress")
        .select("user_id, lessons(xp_reward)")
        .gte("completed_at", since);

      // Aggregate weekly XP per user
      const weeklyMap: Record<string, number> = {};
      for (const row of progress ?? []) {
        const xp = (row.lessons as unknown as { xp_reward: number } | null)?.xp_reward ?? 0;
        weeklyMap[row.user_id] = (weeklyMap[row.user_id] ?? 0) + xp;
      }

      const topUserIds = Object.entries(weeklyMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 50)
        .map(([id]) => id);

      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", topUserIds);

      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

      const leaderboard = topUserIds.map((id, idx) => ({
        rank: idx + 1,
        user_id: id,
        full_name: profileMap.get(id) ?? "Ẩn danh",
        xp: weeklyMap[id],
      }));

      return new Response(JSON.stringify({ leaderboard }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Global leaderboard: top 50 by total XP
    const { data: stats } = await supabase
      .from("user_stats")
      .select("user_id, xp")
      .order("xp", { ascending: false })
      .limit(50);

    const userIds = (stats ?? []).map((s) => s.user_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));

    const leaderboard = (stats ?? []).map((s, idx) => ({
      rank: idx + 1,
      user_id: s.user_id,
      full_name: profileMap.get(s.user_id) ?? "Ẩn danh",
      xp: s.xp,
    }));

    return new Response(JSON.stringify({ leaderboard }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
