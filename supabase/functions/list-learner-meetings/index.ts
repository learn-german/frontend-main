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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET" && req.method !== "POST") {
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

    const { data, error: sessionsError } = await supabase
      .from("meeting_sessions")
      .select(
        "id, title, level, session_date, start_time, end_time, meet_url, note",
      )
      .gte("session_date", today)
      .order("session_date")
      .order("start_time");
    if (sessionsError) throw sessionsError;

    const sessions = (data ?? []) as SessionRow[];
    const sessionIds = sessions.map((session) => session.id);
    const registeredIds = new Set<string>();
    const registrationCounts = new Map<string, number>();

    if (sessionIds.length > 0) {
      const { data: registrations, error: registrationsError } = await supabase
        .from("meeting_registrations")
        .select("session_id, user_id")
        .in("session_id", sessionIds);
      if (registrationsError) throw registrationsError;

      for (const registration of registrations ?? []) {
        registrationCounts.set(
          registration.session_id,
          (registrationCounts.get(registration.session_id) ?? 0) + 1,
        );
        if (registration.user_id === user.id) {
          registeredIds.add(registration.session_id);
        }
      }
    }

    const week = vnWeekBounds(today);
    const { data: weekRegistration, error: weekError } = await supabase
      .from("meeting_registrations")
      .select("session_id, meeting_sessions!inner(session_date)")
      .eq("user_id", user.id)
      .gte("meeting_sessions.session_date", week.start)
      .lte("meeting_sessions.session_date", week.end)
      .limit(1)
      .maybeSingle();
    if (weekError) throw weekError;

    return json({
      sessions: sessions.map((session) => {
        const isRegistered = registeredIds.has(session.id);
        return {
          id: session.id,
          title: session.title,
          level: session.level,
          sessionDate: session.session_date,
          startTime: session.start_time,
          endTime: session.end_time,
          note: session.note,
          registrationCount: registrationCounts.get(session.id) ?? 0,
          isRegistered,
          meetUrl: isRegistered ? session.meet_url : null,
        };
      }),
      myRegistrationSessionId: weekRegistration?.session_id ?? null,
    });
  } catch (error) {
    console.error("list-learner-meetings failed", error);
    return json(
      { error: "Internal server error", code: "internal_error" },
      500,
    );
  }
});
