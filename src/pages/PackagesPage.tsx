/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Button } from "../components/DesignSystem";

const CONTACT_FANPAGE_URL =
  "https://web.facebook.com/share/1C9YswkzTN/?mibextid=wwXIfr&_rdc=1&_rdr";

const BADGE_STYLES = {
  open: "bg-emerald-100 text-emerald-800 border-emerald-200",
  build: "bg-amber-100 text-amber-800 border-amber-200",
  soon: "bg-slate-100 text-slate-600 border-slate-200",
} as const;

type BadgeTone = keyof typeof BADGE_STYLES;

const PACKAGES: {
  tone: BadgeTone;
  badge: string;
  title: string;
  body: string;
  points: string[];
  featured?: boolean;
  actionable: boolean;
}[] = [
  {
    tone: "open",
    badge: "Học thử",
    title: "Học thử khóa học A1",
    body: "Trải nghiệm bài đầu tiên miễn phí trước khi đăng ký toàn bộ khóa A1.",
    points: ["Video bài giảng", "Bài tập ngữ pháp / nghe / đọc", "Không cần thanh toán trước"],
    actionable: true,
  },
  {
    tone: "open",
    badge: "Có sẵn",
    title: "Khóa học tiếng Đức A1 online",
    body: "Khóa học chính dành cho người bắt đầu học tiếng Đức từ số 0.",
    points: [
      "Bài đầu tiên được học thử miễn phí",
      "Video và bài tập đủ kỹ năng",
      "Chấm bài và hỗ trợ trực tuyến hàng tuần",
    ],
    featured: true,
    actionable: true,
  },
  {
    tone: "build",
    badge: "Đang triển khai",
    title: "Khóa học bổ túc A1 online",
    body: "Dành cho người đã học A1 nhưng cần ôn lại và lấp phần kiến thức còn hổng.",
    points: ["Củng cố ngữ pháp", "Sửa lỗi thường gặp", "Ôn luyện theo kỹ năng"],
    actionable: true,
  },
];

const openContact = () => {
  window.open(CONTACT_FANPAGE_URL, "_blank", "noopener,noreferrer");
};

export const PackagesPage: React.FC = () => (
  <div className="mx-auto max-w-5xl space-y-6 animate-in fade-in duration-300">
    <div>
      <p className="text-xs font-display font-bold uppercase tracking-wider text-orange-600">
        Gói học
      </p>
      <h1 className="mt-1 text-2xl font-display font-black text-slate-900">
        Các khóa học tiếng Đức online
      </h1>
      <p className="mt-2 text-sm text-slate-500">
        Xem quyền lợi từng gói và liên hệ DeutschSelbst để kích hoạt khóa học phù hợp.
      </p>
    </div>

    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {PACKAGES.map((pkg) => (
        <article
          key={pkg.title}
          className={`flex flex-col rounded-2xl border p-5 shadow-sm ${
            pkg.featured
              ? "border-red-500 bg-red-50/40 ring-1 ring-red-200"
              : "border-slate-200 bg-white"
          }`}
        >
          <span
            className={`inline-flex self-start rounded-md border px-2 py-0.5 text-[10px] font-display font-bold uppercase ${BADGE_STYLES[pkg.tone]}`}
          >
            {pkg.badge}
          </span>
          <h2 className="mt-3 text-base font-display font-bold text-slate-900 leading-snug">
            {pkg.title}
          </h2>
          <p className="mt-2 text-xs text-slate-500 leading-relaxed">{pkg.body}</p>
          <ul className="mt-4 space-y-1.5 text-xs font-sans text-slate-700 flex-1">
            {pkg.points.map((point) => (
              <li key={point} className="flex gap-2">
                <span className="text-emerald-600 shrink-0">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
          {pkg.actionable && (
            <Button
              variant={pkg.featured ? "primary" : "secondary"}
              size="sm"
              className="mt-5 w-full"
              type="button"
              onClick={openContact}
            >
              Liên hệ tư vấn →
            </Button>
          )}
        </article>
      ))}
    </div>
  </div>
);
