import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeCompletedLessons, computeLessonStatuses, type LessonQuizFlags, type LessonProgressRow } from "./completion.ts";
import { computeDailyProgressReport, defaultPlannedCompletionDate, earliestStudyDate } from "./report.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const LEVEL_ORDER = ["A1", "A2", "B1", "B2"];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const todayIso = () => new Date().toISOString().slice(0, 10);

interface LevelEnrollmentDates {
  started_at: string;
  planned_completion_date: string;
}

/** Tạo enrollment nếu chưa có, dùng `startedAt` = ngày học bài đầu tiên của level.
 * ON CONFLICT DO NOTHING — không ghi đè mốc admin đã set.
 * Enrollment sẵn có mà started_at trễ hơn ngày học thật (mốc auto tạo bằng
 * report_date của lần chạy đầu) thì kéo về ngày học thật, nếu không tiến độ
 * kỳ vọng đứng ở 0% dù user đã học. planned_completion_date chỉ dời theo khi
 * nó vẫn là mốc mặc định — admin đặt tay thì giữ nguyên. */
async function ensureLevelEnrollment(
  supabase: SupabaseClient,
  userId: string,
  level: string,
  startedAt: string,
): Promise<LevelEnrollmentDates | null> {
  const { data: existing } = await supabase
    .from("level_enrollments")
    .select("started_at, planned_completion_date")
    .eq("user_id", userId)
    .eq("level", level)
    .maybeSingle();

  if (existing?.started_at && existing?.planned_completion_date) {
    if (existing.started_at <= startedAt) return existing;

    const plannedCompletionDate =
      existing.planned_completion_date === defaultPlannedCompletionDate(existing.started_at, level)
        ? defaultPlannedCompletionDate(startedAt, level)
        : existing.planned_completion_date;
    const { data: repaired } = await supabase
      .from("level_enrollments")
      .update({ started_at: startedAt, planned_completion_date: plannedCompletionDate })
      .eq("user_id", userId)
      .eq("level", level)
      .select("started_at, planned_completion_date")
      .maybeSingle();
    return repaired ?? { started_at: startedAt, planned_completion_date: plannedCompletionDate };
  }

  const plannedCompletionDate = defaultPlannedCompletionDate(startedAt, level);
  await supabase.from("level_enrollments").upsert(
    { user_id: userId, level, started_at: startedAt, planned_completion_date: plannedCompletionDate },
    { onConflict: "user_id,level", ignoreDuplicates: true },
  );

  const { data: created } = await supabase
    .from("level_enrollments")
    .select("started_at, planned_completion_date")
    .eq("user_id", userId)
    .eq("level", level)
    .maybeSingle();

  return created ?? { started_at: startedAt, planned_completion_date: plannedCompletionDate };
}

interface LessonRow extends LessonQuizFlags {
  level: string;
  order_index: number;
}

/** Tính report tươi cho 1 user tại report_date, upsert vào daily_progress_reports.
 * Trả về { generation_status: "empty" } (không upsert) nếu chưa unlock level nào.
 * Gói hết hạn / chưa có subscription_end_date vẫn tính tiến độ kỳ vọng;
 * package_remaining_days = null → UI hiện "—". */
async function computeAndUpsertReport(supabase: SupabaseClient, userId: string, reportDate: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_premium, subscription_end_date, unlocked_levels")
    .eq("id", userId)
    .single();

  const unlockedLevels: string[] = profile?.unlocked_levels ?? [];

  if (unlockedLevels.length === 0) {
    return { generation_status: "empty" as const };
  }

  const { data: modulesRes } = await supabase
    .from("modules")
    .select("level, order_index, lessons(id, order_index, status)")
    .in("level", unlockedLevels)
    .order("order_index")
    .order("order_index", { referencedTable: "lessons" });

  const { data: exercisesRes } = await supabase.from("grammar_exercises_public").select("lesson_id, category");
  const quizCategoriesByLesson = new Map<string, Set<string>>();
  for (const row of (exercisesRes ?? []) as { lesson_id: string; category: string }[]) {
    const categories = quizCategoriesByLesson.get(row.lesson_id) ?? new Set<string>();
    categories.add(row.category);
    quizCategoriesByLesson.set(row.lesson_id, categories);
  }

  const lessonsByLevel = new Map<string, LessonRow[]>();
  for (const m of modulesRes ?? []) {
    const lessons = ((m.lessons ?? []) as { id: string; order_index: number; status: string }[])
      .filter((l) => l.status === "published")
      .map((l) => ({
        id: l.id,
        order_index: l.order_index,
        hasNguphapQuestions: quizCategoriesByLesson.get(l.id)?.has("nguphap") ?? false,
        hasNgheQuestions: quizCategoriesByLesson.get(l.id)?.has("nghe") ?? false,
        hasDocQuestions: quizCategoriesByLesson.get(l.id)?.has("doc") ?? false,
        level: m.level as string,
      }));
    const existing = lessonsByLevel.get(m.level as string) ?? [];
    lessonsByLevel.set(m.level as string, [...existing, ...lessons]);
  }

  const { data: progressRows } = await supabase
    .from("lesson_progress")
    .select("lesson_id, category, quiz_score, completed_at")
    .eq("user_id", userId);
  const progress = (progressRows ?? []) as LessonProgressRow[];

  // Level hiện tại: level đầu tiên (A1→A2→B1→B2) trong unlocked_levels có ít
  // nhất 1 lesson "current"; nếu mọi level unlock đều xong 100%, dùng level
  // cuối cùng trong unlocked_levels.
  let chosenLevel: string | null = null;
  let chosenLessons: LessonRow[] = [];
  let chosenStatuses: Record<string, "completed" | "current" | "locked"> = {};
  for (const level of LEVEL_ORDER) {
    if (!unlockedLevels.includes(level)) continue;
    const lessons = (lessonsByLevel.get(level) ?? []).sort((a, b) => a.order_index - b.order_index);
    if (lessons.length === 0) continue;
    const completed = computeCompletedLessons(lessons, progress);
    const statuses = computeLessonStatuses(lessons, completed);
    chosenLevel = level;
    chosenLessons = lessons;
    chosenStatuses = statuses;
    if (Object.values(statuses).some((s) => s === "current")) break;
  }

  if (!chosenLevel || chosenLessons.length === 0) {
    return { generation_status: "empty" as const };
  }

  const completedIds = computeCompletedLessons(chosenLessons, progress);
  const currentLesson = chosenLessons.find((l) => chosenStatuses[l.id] === "current");

  // Mốc bắt đầu level = ngày học bài đầu tiên trong level; chưa học gì thì tính từ hôm nay.
  const levelLessonIds = new Set(chosenLessons.map((l) => l.id));
  const levelStartedAt = earliestStudyDate(
    progress.filter((p) => levelLessonIds.has(p.lesson_id)).map((p) => p.completed_at),
  ) ?? reportDate;

  const enrollment = await ensureLevelEnrollment(supabase, userId, chosenLevel, levelStartedAt);

  const computed = computeDailyProgressReport({
    reportDate,
    completedRequiredLessons: completedIds.length,
    totalRequiredLessons: chosenLessons.length,
    levelStartedAt: enrollment?.started_at ?? null,
    plannedCompletionDate: enrollment?.planned_completion_date ?? null,
    subscriptionEndDate: profile.subscription_end_date ?? null,
  });

  const row = {
    user_id: userId,
    level_id: chosenLevel,
    current_lesson_id: currentLesson?.id ?? null,
    report_date: reportDate,
    completed_required_lessons: completedIds.length,
    total_required_lessons: chosenLessons.length,
    actual_progress_percentage: computed.actualProgressPercentage,
    expected_progress_percentage: computed.expectedProgressPercentage,
    progress_gap_percentage_point: computed.progressGapPercentagePoint,
    progress_status: computed.progressStatus,
    package_remaining_days: computed.packageRemainingDays,
    generation_status: computed.generationStatus,
    updated_at: new Date().toISOString(),
  };

  const { data: upserted, error } = await supabase
    .from("daily_progress_reports")
    .upsert(row, { onConflict: "user_id,level_id,report_date" })
    .select()
    .single();

  if (error) {
    return { generation_status: "error" as const, error_message: error.message };
  }
  return upserted;
}

async function handleBatch(supabase: SupabaseClient) {
  const reportDate = todayIso();
  const { data: eligible } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_premium", true)
    .gte("subscription_end_date", reportDate);

  const results = [];
  for (const p of eligible ?? []) {
    results.push(await computeAndUpsertReport(supabase, p.id, reportDate));
  }
  return json({ processed: results.length });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (req.method === "POST") {
      const body = await req.json();

      if (body.mode === "batch") {
        // Chỉ cron job gọi được — Authorization phải đúng service_role key
        // (Vault secret), không phải bất kỳ JWT user nào đã đăng nhập. Kiểm
        // tra bằng so khớp trực tiếp thay vì auth.getUser() vì service_role
        // key không phải user thật, getUser() sẽ không trả về user hợp lệ
        // cho nó — không dùng được để phân biệt "user thường" và "service_role".
        const authHeader = req.headers.get("Authorization");
        const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
        if (authHeader !== expected) return json({ error: "Unauthorized" }, 401);
        return await handleBatch(supabase);
      }

      const authHeader = req.headers.get("Authorization");
      if (!authHeader) return json({ error: "Unauthorized" }, 401);
      const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
      if (authError || !user) return json({ error: "Unauthorized" }, 401);
      if (user.app_metadata?.role !== "admin") return json({ error: "Forbidden" }, 403);
      if (!body.user_id) return json({ error: "user_id required" }, 400);

      const result = await computeAndUpsertReport(supabase, body.user_id, todayIso());
      return json(result);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const url = new URL(req.url);
    if (url.searchParams.get("history") === "1") {
      const from = url.searchParams.get("from");
      const to = url.searchParams.get("to");
      let query = supabase
        .from("daily_progress_reports")
        .select("*")
        .eq("user_id", user.id)
        .order("report_date", { ascending: false });
      if (from) query = query.gte("report_date", from);
      if (to) query = query.lte("report_date", to);
      const { data, error } = await query;
      if (error) return json({ error: "Internal server error" }, 500);
      return json({ reports: data ?? [] });
    }

    const result = await computeAndUpsertReport(supabase, user.id, todayIso());
    return json(result);
  } catch (_err) {
    return json({ error: "Internal server error" }, 500);
  }
});
