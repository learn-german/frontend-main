import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const MAX_CAPACITY = 10;
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

function vnWeekBounds(date: string): { start: string; end: string } {
  const current = new Date(`${date}T00:00:00Z`);
  const mondayOffset = (current.getUTCDay() + 6) % 7;
  const start = new Date(current);
  start.setUTCDate(current.getUTCDate() - mondayOffset);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

interface SessionRow {
  id: string;
  title: string;
  level: "A1" | "A2" | "B1" | "B2";
  session_date: string;
  start_time: string;
  end_time: string;
  meet_url: string;
  note: string | null;
}

interface RegistrationRow {
  id: string;
  session_id: string;
  user_id: string;
  registered_at: string;
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

    const { data, error: sessionError } = await supabase
      .from("meeting_sessions")
      .select(
        "id, title, level, session_date, start_time, end_time, meet_url, note",
      )
      .eq("id", sessionId)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!data) {
      return json(
        { error: "Meeting session not found", code: "not_found" },
        404,
      );
    }
    const session = data as SessionRow;

    const { data: existing, error: existingError } = await supabase
      .from("meeting_registrations")
      .select("id")
      .eq("session_id", sessionId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return json(
        { error: "Already registered", code: "already_registered" },
        409,
      );
    }

    const { count, error: countError } = await supabase
      .from("meeting_registrations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (countError) throw countError;
    if ((count ?? 0) >= MAX_CAPACITY) {
      return json({ error: "Meeting session is full", code: "full" }, 409);
    }

    const week = vnWeekBounds(session.session_date);
    const { data: weekRegistration, error: weekError } = await supabase
      .from("meeting_registrations")
      .select("session_id, meeting_sessions!inner(session_date)")
      .eq("user_id", user.id)
      .gte("meeting_sessions.session_date", week.start)
      .lte("meeting_sessions.session_date", week.end)
      .limit(1)
      .maybeSingle();
    if (weekError) throw weekError;
    if (weekRegistration) {
      return json(
        {
          error: "Only one meeting registration is allowed per week",
          code: "week_limit",
        },
        409,
      );
    }

    const { data: insertedData, error: insertError } = await supabase
      .from("meeting_registrations")
      .insert({ session_id: sessionId, user_id: user.id })
      .select("id, session_id, user_id, registered_at")
      .single();
    if (insertError?.code === "23505") {
      return json(
        { error: "Already registered", code: "already_registered" },
        409,
      );
    }
    if (insertError) throw insertError;
    const registration = insertedData as RegistrationRow;

    const rollback = async () => {
      const { error } = await supabase
        .from("meeting_registrations")
        .delete()
        .eq("id", registration.id);
      if (error) throw error;
    };

    const { count: finalCount, error: finalCountError } = await supabase
      .from("meeting_registrations")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    if (finalCountError) {
      await rollback();
      throw finalCountError;
    }
    if ((finalCount ?? 0) > MAX_CAPACITY) {
      await rollback();
      return json({ error: "Meeting session is full", code: "full" }, 409);
    }

    const { data: finalWeekData, error: finalWeekError } = await supabase
      .from("meeting_registrations")
      .select(
        "id, session_id, registered_at, meeting_sessions!inner(session_date)",
      )
      .eq("user_id", user.id)
      .gte("meeting_sessions.session_date", week.start)
      .lte("meeting_sessions.session_date", week.end);
    if (finalWeekError) {
      await rollback();
      throw finalWeekError;
    }

    const finalWeek = (finalWeekData ?? []) as Array<
      Pick<RegistrationRow, "id" | "session_id" | "registered_at">
    >;
    finalWeek.sort((left, right) =>
      left.registered_at.localeCompare(right.registered_at) ||
      left.id.localeCompare(right.id)
    );
    if (finalWeek.length > 1 && finalWeek[0]?.id !== registration.id) {
      await rollback();
      return json(
        {
          error: "Only one meeting registration is allowed per week",
          code: "week_limit",
        },
        409,
      );
    }

    return json({
      registration: {
        id: registration.id,
        sessionId: registration.session_id,
        userId: registration.user_id,
        registeredAt: registration.registered_at,
      },
      session: {
        id: session.id,
        title: session.title,
        level: session.level,
        sessionDate: session.session_date,
        startTime: session.start_time,
        endTime: session.end_time,
        note: session.note,
        meetUrl: session.meet_url,
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
