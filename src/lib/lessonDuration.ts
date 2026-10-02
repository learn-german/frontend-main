/** Parse stored lesson.duration ("05:40", "10 phút", "10") into seconds. */
export function parseDurationSeconds(raw: string): number {
  const trimmed = raw.trim();
  const clock = trimmed.match(/^(\d+):(\d{1,2})(?::(\d{1,2}))?$/);
  if (clock) {
    const hoursOrMinutes = Number(clock[1]);
    const minutesOrSeconds = Number(clock[2]);
    if (clock[3] != null) {
      return hoursOrMinutes * 3600 + minutesOrSeconds * 60 + Number(clock[3]);
    }
    return hoursOrMinutes * 60 + minutesOrSeconds;
  }
  const minutes = Number.parseInt(trimmed, 10);
  return Number.isFinite(minutes) && minutes >= 0 ? minutes * 60 : 0;
}

/** Canonical DB/display clock, e.g. 340 → "05:40". */
export function formatDurationClock(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Learner label: "05:40 phút". */
export function formatDurationLabel(raw: string): string {
  return `${formatDurationClock(parseDurationSeconds(raw))} phút`;
}

function readHtmlVideoDurationSeconds(src: string, revokeObjectUrl: boolean): Promise<number | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      if (revokeObjectUrl) URL.revokeObjectURL(src);
      const duration = video.duration;
      resolve(Number.isFinite(duration) && duration > 0 ? duration : null);
    };
    video.onerror = () => {
      if (revokeObjectUrl) URL.revokeObjectURL(src);
      resolve(null);
    };
    video.src = src;
  });
}

export function readVideoFileDurationSeconds(file: File): Promise<number | null> {
  return readHtmlVideoDurationSeconds(URL.createObjectURL(file), true);
}

export function readVideoUrlDurationSeconds(url: string): Promise<number | null> {
  return readHtmlVideoDurationSeconds(url, false);
}
