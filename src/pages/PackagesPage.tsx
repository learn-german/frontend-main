/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check, MessagesSquare, Play } from "lucide-react";

const CONTACT_FANPAGE_URL =
  "https://web.facebook.com/share/1C9YswkzTN/?mibextid=wwXIfr&_rdc=1&_rdr";

export type CourseId = "trial" | "a1" | "a1-plus";
type StatusTone = "current" | "available" | "building" | "soon";

const STATUS_STYLES: Record<StatusTone, string> = {
  current: "bg-[#eaf8f0] text-[#17864b]",
  available: "bg-[#eaf8f0] text-[#17864b]",
  building: "bg-[#fff8dc] text-[#7b5600]",
  soon: "bg-[#eef1f5] text-[#556176]",
};

const COURSES: {
  id: CourseId;
  level: string;
  title: string;
  body: string;
  price: string;
  priceHint?: string;
  points: string[];
  featured?: boolean;
  building?: boolean;
}[] = [
  {
    id: "trial",
    level: "A1",
    title: "Học thử khóa học A1",
    body: "Làm quen với phương pháp học trước khi đăng ký toàn bộ khóa A1.",
    price: "Miễn phí",
    priceHint: "không giới hạn thời gian",
    points: [
      "Video bài học đầu tiên",
      "Bài tập thực hành ngay trong bài",
      "Xem kết quả sau khi hoàn thành",
    ],
  },
  {
    id: "a1",
    level: "A1",
    title: "Khóa học tiếng Đức A1 online",
    body: "Lộ trình có hệ thống dành cho người bắt đầu học tiếng Đức từ số 0.",
    price: "Nhận thông tin khóa học",
    points: [
      "Toàn bộ video và bài tập A1",
      "Đủ kỹ năng ngữ pháp, đọc, nghe và từ vựng",
      "Bài viết được chấm và nhận góp ý",
      "Hỗ trợ trực tuyến hàng tuần cùng mentor",
    ],
    featured: true,
  },
  {
    id: "a1-plus",
    level: "A1+",
    title: "Khóa học bổ túc A1 online",
    body: "Dành cho người đã học A1 nhưng cần ôn lại và lấp phần kiến thức còn hổng.",
    price: "Nhận thông tin khóa học",
    points: ["Củng cố ngữ pháp", "Sửa các lỗi thường gặp", "Ôn luyện theo từng kỹ năng"],
    building: true,
  },
];

const UPCOMING = [
  {
    level: "A2",
    title: "Khóa học tiếng Đức A2",
    body: "Phát triển giao tiếp trong các tình huống quen thuộc.",
  },
  {
    level: "B1",
    title: "Khóa học tiếng Đức B1",
    body: "Hướng đến giao tiếp độc lập và mở rộng kỹ năng viết.",
  },
];

const openContact = () => {
  window.open(CONTACT_FANPAGE_URL, "_blank", "noopener,noreferrer");
};

export function getActiveCourseId(isTrial: boolean): CourseId {
  return isTrial ? "trial" : "a1";
}

export function courseStatus(
  id: CourseId,
  building: boolean | undefined,
  activeId: CourseId,
): { label: string; tone: StatusTone } | null {
  if (id === activeId) return { label: "Đang sử dụng", tone: "current" };
  if (id === "a1") return { label: "Khuyên dùng", tone: "available" };
  if (building) return { label: "Đang triển khai", tone: "building" };
  return null;
}

export function isContinueLearningCta(id: CourseId, activeId: CourseId): boolean {
  return id === "trial" || id === activeId;
}

export const PackagesPage: React.FC<{
  isTrial: boolean;
  onContinueLearning: () => void;
}> = ({ isTrial, onContinueLearning }) => {
  const activeId = getActiveCourseId(isTrial);

  return (
    <div className="mx-auto max-w-5xl space-y-8 animate-in fade-in duration-300">
      <div>
        <p className="text-xs font-display font-bold uppercase tracking-wider text-orange-600">
          Gói học
        </p>
        <h1 className="mt-1 text-2xl font-display font-black text-slate-900">
          Chọn cách học phù hợp
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Bắt đầu miễn phí với bài học đầu tiên hoặc mở toàn bộ lộ trình A1 cùng các buổi hỗ trợ trực tuyến hàng tuần.
        </p>
      </div>

      <section aria-label="Các lựa chọn gói học">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {COURSES.map((pkg) => {
            const status = courseStatus(pkg.id, pkg.building, activeId);
            const continueLearning = isContinueLearningCta(pkg.id, activeId);
            return (
              <article
                key={pkg.id}
                className={`relative flex flex-col rounded-lg border bg-white p-6 shadow-sm ${
                  pkg.featured
                    ? "border-[#e997ad] shadow-[0_12px_30px_rgba(228,0,59,0.08)]"
                    : "border-slate-200"
                }`}
              >
                {pkg.featured && (
                  <span className="absolute inset-x-0 top-0 h-1 rounded-t-lg bg-[#e4003b]" />
                )}
                <div className="flex items-center justify-between gap-3">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-lg text-xs font-display font-extrabold ${
                      pkg.featured
                        ? "bg-[#fff3f6] text-[#bd0031]"
                        : pkg.building
                          ? "bg-[#fff8dc] text-[#765400]"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {pkg.level}
                  </span>
                  {status && (
                    <span
                      className={`inline-flex min-h-6 items-center rounded px-2 text-[10px] font-display font-extrabold uppercase ${STATUS_STYLES[status.tone]}`}
                    >
                      {status.label}
                    </span>
                  )}
                </div>
                <h2 className="mt-5 min-h-14 text-xl font-display font-bold text-slate-900 leading-snug">
                  {pkg.title}
                </h2>
                <p className="mt-2 min-h-10 text-[13px] text-slate-500 leading-relaxed">{pkg.body}</p>
                <div className="mt-5 flex items-baseline gap-2">
                  <strong className="text-[22px] font-display font-bold text-slate-900 leading-none">
                    {pkg.price}
                  </strong>
                  {pkg.priceHint && (
                    <span className="text-[11px] text-slate-500">{pkg.priceHint}</span>
                  )}
                </div>
                <ul className="mt-5 flex-1 space-y-2.5 border-t border-slate-200 pt-5 text-xs text-slate-700">
                  {pkg.points.map((point) => (
                    <li key={point} className="flex gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#17864b]" strokeWidth={2.5} />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`mt-6 inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-md px-4 text-[13px] font-display font-bold ${
                    continueLearning
                      ? "border border-slate-900 bg-slate-900 text-white hover:bg-slate-800"
                      : pkg.featured
                        ? "border border-[#e4003b] bg-[#e4003b] text-white hover:bg-[#bd0031]"
                        : "border border-slate-200 bg-white text-slate-900 hover:border-slate-300"
                  }`}
                  onClick={continueLearning ? onContinueLearning : openContact}
                >
                  {continueLearning ? (
                    <>
                      <Play className="h-4 w-4" />
                      Tiếp tục học
                    </>
                  ) : (
                    <>
                      <MessagesSquare className="h-4 w-4" />
                      Liên hệ tư vấn
                    </>
                  )}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="border-t border-slate-200 pt-7" aria-labelledby="upcoming-courses-title">
        <h2 id="upcoming-courses-title" className="text-xl font-display font-bold text-slate-900">
          Khóa học sắp có
        </h2>
        <p className="mt-1.5 text-[13px] text-slate-500">
          Theo dõi các trình độ tiếp theo đang được DeutschSelbst chuẩn bị.
        </p>
        <div className="mt-4 space-y-3">
          {UPCOMING.map((course) => (
            <article
              key={course.level}
              className="flex items-center gap-4 rounded-lg border border-slate-200 bg-white px-4 py-3.5"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-xs font-display font-extrabold text-slate-600">
                {course.level}
              </span>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-display font-bold text-slate-900">{course.title}</h3>
                <p className="text-xs text-slate-500">{course.body}</p>
              </div>
              <span className={`inline-flex min-h-6 shrink-0 items-center rounded px-2 text-[10px] font-display font-extrabold uppercase ${STATUS_STYLES.soon}`}>
                Sắp có
              </span>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
