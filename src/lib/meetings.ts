import { supabase } from "./supabase";
import type {
  LearnerMeetingsResponse,
  Level,
  MeetingRegisterResult,
  MeetingRegistrationRow,
  MeetingSessionAdmin,
  MeetingSessionUpsertInput,
} from "./appTypes";

const SESSION_COLUMNS =
  "id, title, level, session_date, start_time, end_time, meet_url, note, created_by, created_at, updated_at";

const REGISTRATION_COLUMNS =
  "id, session_id, user_id, registered_at, profiles(email, full_name)";

interface SessionRow {
  id: string;
  title: string;
  level: string;
  session_date: string;
  start_time: string;
  end_time: string;
  meet_url: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  meeting_registrations?: { count: number }[];
}

interface RegistrationRow {
  id: string;
  session_id: string;
  user_id: string;
  registered_at: string;
  profiles?: { email: string; full_name: string | null } | null;
}

function mapSessionRow(row: SessionRow): MeetingSessionAdmin {
  const count = row.meeting_registrations?.[0]?.count ?? 0;
  return {
    id: row.id,
    title: row.title,
    level: row.level as Level,
    sessionDate: row.session_date,
    startTime: row.start_time,
    endTime: row.end_time,
    meetUrl: row.meet_url,
    note: row.note,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    registrationCount: count,
  };
}

function mapRegistrationRow(row: RegistrationRow): MeetingRegistrationRow {
  return {
    id: row.id,
    sessionId: row.session_id,
    userId: row.user_id,
    registeredAt: row.registered_at,
    user: row.profiles
      ? { email: row.profiles.email, fullName: row.profiles.full_name }
      : null,
  };
}

function edgeErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === "object" && data !== null && "error" in data) {
    const err = (data as { error?: unknown }).error;
    if (typeof err === "string") return err;
  }
  return fallback;
}

/** Upcoming sessions for the learner — Edge strips meetUrl unless registered. */
export async function listLearnerMeetings(): Promise<LearnerMeetingsResponse> {
  const { data, error } = await supabase.functions.invoke("list-learner-meetings", {
    method: "GET",
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || !("sessions" in data)) {
    throw new Error(edgeErrorMessage(data, "Không thể tải lịch học trực tuyến."));
  }
  return data as LearnerMeetingsResponse;
}

export async function registerMeeting(sessionId: string): Promise<MeetingRegisterResult> {
  const { data, error } = await supabase.functions.invoke("register-meeting", {
    body: { sessionId },
  });
  if (error) throw error;
  if (!data || typeof data !== "object" || !("registration" in data)) {
    throw new Error(edgeErrorMessage(data, "Không thể đăng ký buổi học."));
  }
  return data as MeetingRegisterResult;
}

export async function cancelMeeting(sessionId: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("cancel-meeting", {
    body: { sessionId },
  });
  if (error) throw error;
  if (data && typeof data === "object" && "error" in data) {
    throw new Error(edgeErrorMessage(data, "Không thể hủy đăng ký."));
  }
}

/** All sessions with registration counts — admin RLS only. */
export async function adminListSessions(): Promise<MeetingSessionAdmin[]> {
  const { data, error } = await supabase
    .from("meeting_sessions")
    .select(`${SESSION_COLUMNS}, meeting_registrations(count)`)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapSessionRow(row as SessionRow));
}

export async function adminUpsertSession(
  input: MeetingSessionUpsertInput,
): Promise<MeetingSessionAdmin> {
  const payload = {
    title: input.title,
    level: input.level,
    session_date: input.sessionDate,
    start_time: input.startTime,
    end_time: input.endTime,
    meet_url: input.meetUrl,
    note: input.note ?? null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await supabase
      .from("meeting_sessions")
      .update(payload)
      .eq("id", input.id)
      .select(SESSION_COLUMNS)
      .single();
    if (error) throw error;
    return mapSessionRow({ ...(data as SessionRow), meeting_registrations: [{ count: 0 }] });
  }

  const { data: authData } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from("meeting_sessions")
    .insert({ ...payload, created_by: authData.user?.id ?? null })
    .select(SESSION_COLUMNS)
    .single();
  if (error) throw error;
  return mapSessionRow({ ...(data as SessionRow), meeting_registrations: [{ count: 0 }] });
}

export async function adminDeleteSession(id: string): Promise<void> {
  const { error } = await supabase.from("meeting_sessions").delete().eq("id", id);
  if (error) throw error;
}

export async function adminListRegistrations(
  sessionId: string,
): Promise<MeetingRegistrationRow[]> {
  const { data, error } = await supabase
    .from("meeting_registrations")
    .select(REGISTRATION_COLUMNS)
    .eq("session_id", sessionId)
    .order("registered_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapRegistrationRow(row as unknown as RegistrationRow));
}
