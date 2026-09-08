/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Video } from "lucide-react";
import { Button, LevelBadge, ProgressBar } from "../components/DesignSystem";
import type { LearnerMeetingSession, LearnerMeetingsResponse } from "../lib/appTypes";
import { capacityStatus, MAX_MEETING_CAPACITY } from "../lib/meetingCapacity";
import { cancelMeeting, listLearnerMeetings, registerMeeting } from "../lib/meetings";
import { showToast } from "../lib/toast";

type MeetingFilter = "all" | "open" | "registered";

const STATUS_LABELS = {
  open: "Còn chỗ",
  almost: "Sắp đầy",
  full: "Đã đủ chỗ",
} as const;

const STATUS_STYLES = {
  open: { text: "text-emerald-600", bar: "bg-emerald-500" },
  almost: { text: "text-amber-600", bar: "bg-amber-500" },
  full: { text: "text-rose-600", bar: "bg-rose-500" },
} as const;

function formatDateBlock(dateString: string) {
  const date = new Date(`${dateString}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("vi-VN", { weekday: "short" })
    .format(date)
    .replace(".", "")
    .toUpperCase();
  return {
    weekday,
    day: date.getDate(),
    monthYear: `tháng ${date.getMonth() + 1}, ${date.getFullYear()}`,
  };
}

async function getEdgeErrorCode(error: unknown): Promise<string | null> {
  if (typeof error !== "object" || error === null || !("context" in error)) return null;
  const context = (error as { context?: unknown }).context;
  if (!(context instanceof Response)) return null;

  try {
    const body: unknown = await context.clone().json();
    if (typeof body === "object" && body !== null && "code" in body) {
      return typeof body.code === "string" ? body.code : null;
    }
  } catch {
    return null;
  }
  return null;
}

function openMeeting(url: string | null) {
  if (!url) return;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    window.open(parsed.toString(), "_blank", "noopener,noreferrer");
  } catch {
    showToast("Link phòng học không hợp lệ.", "warning");
  }
}

export const MeetingPage: React.FC<{ onMeetingsChanged: () => void }> = ({
  onMeetingsChanged,
}) => {
  const [data, setData] = useState<LearnerMeetingsResponse | null>(null);
  const [filter, setFilter] = useState<MeetingFilter>("all");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busySessionId, setBusySessionId] = useState<string | null>(null);

  const loadMeetings = async () => {
    setLoadError("");
    try {
      setData(await listLearnerMeetings());
    } catch {
      setLoadError("Không thể tải lịch học trực tuyến. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMeetings();
  }, []);

  const sessions = data?.sessions ?? [];
  const registeredSession = sessions.find(
    (session) => session.id === data?.myRegistrationSessionId,
  );
  const visibleSessions = useMemo(() => {
    if (filter === "open") {
      return sessions.filter(
        (session) => capacityStatus(session.registrationCount) !== "full",
      );
    }
    if (filter === "registered") {
      return sessions.filter((session) => session.isRegistered);
    }
    return sessions;
  }, [filter, sessions]);

  const handleRegister = async (sessionId: string) => {
    setBusySessionId(sessionId);
    try {
      await registerMeeting(sessionId);
      await loadMeetings();
      onMeetingsChanged();
      showToast("Đăng ký lịch học thành công.", "success");
    } catch (error) {
      const code = await getEdgeErrorCode(error);
      if (code === "week_limit") {
        showToast("Bạn đã đăng ký một lịch trong tuần này.", "warning");
      } else if (code === "full") {
        showToast("Lịch học vừa đủ chỗ. Vui lòng chọn lịch khác.", "warning");
      } else {
        showToast("Không thể đăng ký buổi học. Vui lòng thử lại.", "warning");
      }
      await loadMeetings();
    } finally {
      setBusySessionId(null);
    }
  };

  const handleCancel = async (sessionId: string) => {
    setBusySessionId(sessionId);
    try {
      await cancelMeeting(sessionId);
      await loadMeetings();
      onMeetingsChanged();
      showToast("Đã hủy đăng ký lịch học.", "success");
    } catch {
      showToast("Không thể hủy đăng ký. Vui lòng thử lại.", "warning");
    } finally {
      setBusySessionId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-64 items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-orange-600 border-t-transparent" />
      </div>
    );
  }

  if (loadError && !data) {
    return (
      <div className="mx-auto flex max-w-lg flex-col items-center gap-4 py-20 text-center">
        <p role="alert" className="text-sm text-rose-600">{loadError}</p>
        <Button onClick={() => void loadMeetings()}>Thử lại</Button>
      </div>
    );
  }

  const availableCount = sessions.filter(
    (session) => capacityStatus(session.registrationCount) !== "full",
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 via-slate-800 to-indigo-950 p-5 text-white sm:p-6">
        <div className="relative z-10 flex flex-col justify-between gap-5 md:flex-row md:items-center">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-amber-300">
              Hỗ trợ trực tuyến hàng tuần
            </p>
            <h1 className="mt-2 text-2xl font-black">Lịch học trực tuyến</h1>
            <p className="mt-2 max-w-xl text-sm text-slate-300">
              Chọn một buổi hỗ trợ phù hợp. Mỗi học viên được đăng ký tối đa một lịch mỗi tuần.
            </p>
          </div>
          <div className="flex min-w-64 items-center gap-3 rounded-xl border border-white/10 bg-slate-950/40 p-4">
            <div className="rounded-lg bg-sky-500/20 p-2.5 text-sky-300">
              <CalendarDays className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Lịch tuần này
              </p>
              {data?.myRegistrationSessionId ? (
                <p className="mt-1 truncate text-xs font-semibold">
                  {registeredSession
                    ? `${registeredSession.sessionDate} • ${registeredSession.startTime}`
                    : "Bạn đã đăng ký một buổi"}
                </p>
              ) : (
                <>
                  <p className="mt-1 text-xs text-slate-200">Chưa đăng ký lịch</p>
                  <p className="mt-1 text-[10px] text-amber-300">Chọn lịch bên dưới</p>
                </>
              )}
            </div>
            {registeredSession?.meetUrl && (
              <Button
                size="sm"
                className="shrink-0"
                onClick={() => openMeeting(registeredSession.meetUrl)}
              >
                Tham gia
              </Button>
            )}
          </div>
        </div>
      </section>

      <header>
        <h2 className="text-xl font-black text-slate-900">Chọn lịch hỗ trợ trực tuyến</h2>
        <p className="mt-1 text-sm text-slate-500">
          Sau khi đăng ký, link Google Meet sẽ hiển thị để bạn tham gia.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-900">{availableCount}</p>
          <p className="mt-1 text-xs text-slate-500">Lịch còn chỗ trống</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-3xl font-black text-slate-900">
            {data?.myRegistrationSessionId ? 1 : 0}
          </p>
          <p className="mt-1 text-xs text-slate-500">Lịch đã đăng ký tuần này</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
        <label htmlFor="meeting-filter" className="sr-only">Lọc lịch học</label>
        <select
          id="meeting-filter"
          value={filter}
          onChange={(event) => setFilter(event.target.value as MeetingFilter)}
          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/10"
        >
          <option value="all">Tất cả lịch</option>
          <option value="open">Còn chỗ</option>
          <option value="registered">Đã đăng ký</option>
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {visibleSessions.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-14 text-center text-sm text-slate-400">
            Không có lịch học nào phù hợp.
          </div>
        )}
        {visibleSessions.map((session) => (
          <MeetingSessionCard
            key={session.id}
            session={session}
            busy={busySessionId === session.id}
            onRegister={handleRegister}
            onCancel={handleCancel}
          />
        ))}
      </div>
    </div>
  );
};

interface MeetingSessionCardProps {
  session: LearnerMeetingSession;
  busy: boolean;
  onRegister: (sessionId: string) => Promise<void>;
  onCancel: (sessionId: string) => Promise<void>;
}

const MeetingSessionCard: React.FC<MeetingSessionCardProps> = ({
  session,
  busy,
  onRegister,
  onCancel,
}) => {
  const date = formatDateBlock(session.sessionDate);
  const status = capacityStatus(session.registrationCount);
  const remaining = Math.max(0, MAX_MEETING_CAPACITY - session.registrationCount);
  const weekLimitReached = !session.canRegister && status !== "full";
  const registrationDisabled = !session.canRegister || busy;
  const styles = STATUS_STYLES[status];

  return (
    <article
      className={`grid items-center gap-4 rounded-2xl border bg-white p-5 shadow-sm lg:grid-cols-[72px_minmax(0,1fr)_180px_170px] ${
        session.isRegistered
          ? "border-orange-200 bg-gradient-to-r from-white to-orange-50"
          : "border-slate-200"
      } ${status === "full" && !session.isRegistered ? "opacity-60" : ""}`}
    >
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-wide text-orange-600">
          {date.weekday}
        </p>
        <p className="my-1 text-3xl font-black leading-none text-slate-900">{date.day}</p>
        <p className="text-[11px] text-slate-500">{date.monthYear}</p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-bold text-slate-900">{session.title}</h3>
          <LevelBadge level={session.level} className="px-2 py-0.5 text-[10px]" />
          {session.isRegistered && (
            <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700">
              Đã đăng ký
            </span>
          )}
        </div>
        {session.note && <p className="mt-2 text-xs italic text-slate-500">{session.note}</p>}
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
          <Clock3 className="h-3.5 w-3.5 text-slate-400" />
          {session.startTime}–{session.endTime} · Online qua Google Meet
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wide ${styles.text}`}>
            {STATUS_LABELS[status]}
          </span>
          <span className="font-mono text-xs font-semibold text-slate-600">
            {session.registrationCount}/{MAX_MEETING_CAPACITY}
          </span>
        </div>
        <ProgressBar
          value={session.registrationCount}
          max={MAX_MEETING_CAPACITY}
          barClassName={styles.bar}
        />
        <p className="mt-2 text-[11px] text-slate-500">
          {remaining > 0 ? `${remaining} chỗ còn lại` : "Không còn chỗ trống"}
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {session.isRegistered ? (
          <>
            <Button
              size="sm"
              className="w-full gap-1.5"
              disabled={!session.meetUrl}
              onClick={() => openMeeting(session.meetUrl)}
            >
              <Video className="h-4 w-4" />
              Vào phòng học
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="w-full"
              disabled={busy}
              onClick={() => void onCancel(session.id)}
            >
              {busy ? "Đang hủy…" : "Hủy đăng ký"}
            </Button>
          </>
        ) : (
          <>
            <Button
              size="sm"
              className="w-full"
              disabled={registrationDisabled}
              onClick={() => void onRegister(session.id)}
            >
              {busy
                ? "Đang đăng ký…"
                : status === "full"
                  ? "Đã đủ 10/10"
                  : "Đăng ký lịch này"}
            </Button>
            {weekLimitReached && (
              <p className="text-center text-[10px] text-slate-500">
                Bạn đã dùng lịch đăng ký tuần này
              </p>
            )}
            {status === "full" && (
              <p className="text-center text-[10px] text-slate-500">
                Lịch đã đóng đăng ký
              </p>
            )}
          </>
        )}
      </div>
    </article>
  );
};
