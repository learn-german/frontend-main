import React from "react";
import { Check, Flame } from "lucide-react";

export interface LearningStreakCardProps {
  streak: number;
  weekActivity: boolean[];
}

const DAY_LABELS = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"] as const;

export function LearningStreakCard({
  streak,
  weekActivity,
}: LearningStreakCardProps): React.ReactElement {
  const days = Array.from({ length: 7 }, (_, i) => weekActivity[i] === true);
  const subcopy =
    streak === 0
      ? "Hãy học hôm nay để bắt đầu chuỗi!"
      : "Bạn đang duy trì thói quen học rất tốt!";

  return (
    <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
      <div className="mb-2 flex items-center gap-2">
        <Flame className="h-5 w-5 shrink-0 text-orange-500" aria-hidden="true" />
        <span className="text-xs font-bold uppercase tracking-wide text-red-600">
          CHUỖI HỌC LIÊN TỤC
        </span>
      </div>

      <p className="mb-1 text-2xl font-bold text-red-600">
        {streak} ngày
      </p>

      <p className="mb-4 text-sm text-slate-600">{subcopy}</p>

      <div className="flex justify-between gap-1">
        {DAY_LABELS.map((label, index) => (
          <div key={label} className="flex flex-col items-center gap-1">
            {days[index] ? (
              <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-600">
                <Check className="h-3.5 w-3.5 text-white" strokeWidth={3} aria-hidden="true" />
              </div>
            ) : (
              <div className="h-6 w-6 rounded-full border-2 border-slate-300" />
            )}
            <span className="text-[10px] text-slate-400">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
