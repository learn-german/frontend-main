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

function vnToday(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

interface RegistrationRpcRow {
  registration_id: string;
  registration_session_id: string;
  registration_user_id: string;
  registration_registered_at: string;
  session_title: string;
  session_level: "A1" | "A2" | "B1" | "B2";
  session_date: string;
  session_start_time: string;
  session_end_time: string;
  session_meet_url: string;
  session_note: string | null;
}

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

    const today = vnToday();
    const isAdmin = user.app_metadata?.role === "admin";
    if (!isAdmin) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("subscription_end_date")
        .eq("id", user.id)
        .maybeSingle();
      if (profileError) throw profileError;
      if (
        !profile?.subscription_end_date || profile.subscription_end_date < today
      ) {
        return json(
          {
            error: "Active subscription required",
            code: "subscription_required",
          },
          403,
        );
      }
    }

    const { data, error: registrationError } = await supabase.rpc(
      "register_meeting_session",
      { p_session_id: sessionId, p_user_id: user.id },
    ).single();
    if (registrationError) {
      if (registrationError.message === "not_found") {
        return json(
          { error: "Meeting session not found", code: "not_found" },
          404,
        );
      }
      if (registrationError.message === "already") {
        return json(
          { error: "Already registered", code: "already_registered" },
          409,
        );
      }
      if (registrationError.message === "full") {
        return json({ error: "Meeting session is full", code: "full" }, 409);
      }
      if (registrationError.message === "week_limit") {
        return json(
          {
            error: "Only one meeting registration is allowed per week",
            code: "week_limit",
          },
          409,
        );
      }
      throw registrationError;
    }
    const registration = data as RegistrationRpcRow;

    return json({
      registration: {
        id: registration.registration_id,
        sessionId: registration.registration_session_id,
        userId: registration.registration_user_id,
        registeredAt: registration.registration_registered_at,
      },
      session: {
        id: registration.registration_session_id,
        title: registration.session_title,
        level: registration.session_level,
        sessionDate: registration.session_date,
        startTime: registration.session_start_time,
        endTime: registration.session_end_time,
        note: registration.session_note,
        meetUrl: registration.session_meet_url,
      },
    });
  } catch (error) {
    console.error("register-meeting failed", error);
    return json(
      { error: "Internal server error", code: "internal_error" },
      500,
    );
  }
});
