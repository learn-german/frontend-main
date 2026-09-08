import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json(
      { error: "Method not allowed", code: "method_not_allowed" },
      405,
    );
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized", code: "unauthorized" }, 401);
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body", code: "invalid_body" }, 400);
    }
    const sessionId = typeof body === "object" && body !== null &&
        "sessionId" in body && typeof body.sessionId === "string"
      ? body.sessionId.trim()
      : "";
    if (!sessionId) {
      return json({
        error: "sessionId is required",
        code: "invalid_session_id",
      }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace(/^Bearer\s+/i, "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );
    if (authError || !user) {
      return json({ error: "Unauthorized", code: "unauthorized" }, 401);
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("meeting_registrations")
      .delete()
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .select("id")
      .maybeSingle();
    if (deleteError) throw deleteError;
    if (!deleted) {
      return json({
        error: "Meeting registration not found",
        code: "not_found",
      }, 404);
    }

    return json({ success: true, sessionId });
  } catch (error) {
    console.error("cancel-meeting failed", error);
    return json(
      { error: "Internal server error", code: "internal_error" },
      500,
    );
  }
});
