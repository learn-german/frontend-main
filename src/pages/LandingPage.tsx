/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";

interface LandingPageProps {
  onStartLearning: () => void;
  onNavigateLogin: () => void;
}

const BUTTON_BASE =
  "inline-flex min-h-[42px] items-center justify-center whitespace-nowrap rounded-lg border px-[17px] text-sm font-bold transition-transform duration-200 hover:-translate-y-px focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-[3px] focus-visible:outline-[rgba(40,86,197,.28)]";

const BUTTON_DEFAULT = `${BUTTON_BASE} border-[#e5e9f0] bg-white text-[#111827]`;

const BUTTON_PRIMARY = `${BUTTON_BASE} border-[#e4003b] bg-[#e4003b] text-white hover:bg-[#bd0031]`;

const KICKER = "text-xs font-bold uppercase text-[#e4003b]";

const SECTION_TITLE =
  "mt-2.5 text-[30px] font-extrabold leading-[1.12] min-[720px]:text-[38px]";

const BENEFITS = [
  {
    title: "Học đủ trong mỗi bài",
    alt: "Học tiếng Đức A1 qua video và bài tập",
    offset: "left-0",
    body: "Video đi cùng bài tập để bạn vừa tiếp nhận kiến thức, vừa luyện ngay trong cùng một lộ trình.",
    points: [
      "Ngữ pháp, bài đọc và bài nghe",
      "Từ vựng theo từng chủ đề",
      "Xem lại bài giảng bất cứ lúc nào",
    ],
  },
  {
    title: "Có người góp ý và giải đáp",
    alt: "Buổi hỗ trợ trực tuyến cùng người hướng dẫn",
    offset: "left-[-100%]",
    body: "Bạn không phải tự xử lý mọi điểm khó khi học online. Người hướng dẫn hỗ trợ đều đặn trong suốt khóa học.",
    points: [
      "Bài viết được chấm điểm",
      "Buổi học trực tuyến hàng tuần",
      "Giải đáp bài học và luyện nói",
    ],
  },
  {
    title: "Chủ động hơn, tiết kiệm hơn",
    alt: "Học tiếng Đức online theo lịch linh hoạt",
    offset: "left-[-200%]",
    body: "Tự chọn thời gian phù hợp với công việc, học theo tốc độ riêng và không mất thời gian di chuyển.",
    points: [
      "Linh hoạt sắp xếp lịch học",
      "Ôn lại nội dung khi cần",
      "Tiết kiệm thời gian và chi phí",
    ],
  },
];

const STEPS = [
  {
    index: "01",
    title: "Xem video bài học",
    body: "Nắm kiến thức chính qua video ngắn, được sắp xếp theo đúng trình tự của khóa A1.",
  },
  {
    index: "02",
    title: "Luyện tập ngay trong bài",
    body: "Thực hành ngữ pháp, đọc, nghe, từ vựng và bài viết để củng cố nội dung vừa học.",
  },
  {
    index: "03",
    title: "Nhận góp ý và hỗ trợ",
    body: "Bài viết được chấm; thắc mắc và kỹ năng nói được hỗ trợ trong buổi học trực tuyến hàng tuần.",
  },
];

const BADGE_STYLES = {
  open: "bg-[#e4003b] text-white",
  build: "bg-[#f4bd48] text-[#111827]",
  soon: "bg-[#475467] text-white",
} as const;

type BadgeTone = keyof typeof BADGE_STYLES;

const COURSES: {
  id?: string;
  tone: BadgeTone;
  badge: string;
  title: string;
  body: string;
  points: string[];
  action: string;
  actionable: boolean;
  featured?: boolean;
}[] = [
  {
    id: "course-a1",
    tone: "open",
    badge: "Có sẵn",
    title: "Khóa A1 đầy đủ",
    body: "Khóa học chính dành cho người bắt đầu học tiếng Đức từ số 0.",
    points: [
      "Bài đầu tiên được học thử miễn phí",
      "Video và bài tập đủ kỹ năng",
      "Chấm bài và hỗ trợ trực tuyến hàng tuần",
    ],
    action: "Liên hệ đăng ký →",
    actionable: true,
    featured: true,
  },
  {
    tone: "build",
    badge: "Đang triển khai",
    title: "Khóa học bổ túc A1 online",
    body: "Dành cho người đã học A1 nhưng cần ôn lại và lấp phần kiến thức còn hổng.",
    points: ["Củng cố ngữ pháp", "Sửa lỗi thường gặp", "Ôn luyện theo kỹ năng"],
    action: "Nhận thông tin khi mở →",
    actionable: true,
  },
  {
    tone: "soon",
    badge: "Sắp có",
    title: "Khóa A2",
    body: "Giai đoạn tiếp theo sau A1, phát triển giao tiếp trong các tình huống quen thuộc.",
    points: ["Giao tiếp thực tế", "Nghe và đọc mở rộng", "Viết email ngắn"],
    action: "Đang lên kế hoạch",
    actionable: false,
  },
  {
    tone: "soon",
    badge: "Sắp có",
    title: "Khóa B1",
    body: "Khóa học tiếp nối A2, hướng đến khả năng giao tiếp độc lập và trình bày ý kiến.",
    points: ["Giao tiếp theo chủ đề", "Đọc và viết mở rộng", "Củng cố ngữ pháp B1"],
    action: "Đang lên kế hoạch",
    actionable: false,
  },
];

const REGISTER_STEPS = [
  {
    index: "01",
    title: "Học thử bài đầu tiên",
    body: "Đăng nhập để xem video và làm bài tập trong bài đầu tiên của khóa A1.",
  },
  {
    index: "02",
    title: "Trao đổi lộ trình",
    body: "Liên hệ SelbstDeutsch để trao đổi mục tiêu học và hình thức hỗ trợ phù hợp.",
  },
  {
    index: "03",
    title: "Mở khóa toàn bộ A1",
    body: "Tiếp tục toàn bộ lộ trình và tham gia buổi hỗ trợ trực tuyến hàng tuần.",
  },
];

const COURSE_GAP = 14;

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartLearning,
  onNavigateLogin,
}) => {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(true);

  const updateSliderControls = useCallback(() => {
    const slider = sliderRef.current;
    if (!slider) return;
    const maxScroll = slider.scrollWidth - slider.clientWidth;
    setCanScrollPrev(slider.scrollLeft > 2);
    setCanScrollNext(slider.scrollLeft < maxScroll - 2);
  }, []);

  useEffect(() => {
    updateSliderControls();
    window.addEventListener("resize", updateSliderControls);
    return () => window.removeEventListener("resize", updateSliderControls);
  }, [updateSliderControls]);

  const scrollCourses = (direction: 1 | -1) => {
    const slider = sliderRef.current;
    if (!slider) return;
    const card = slider.querySelector("article");
    const step = card
      ? card.getBoundingClientRect().width + COURSE_GAP
      : slider.clientWidth;
    slider.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  const scrollToSection =
    (id: string) => (event: React.MouseEvent<HTMLAnchorElement>) => {
      event.preventDefault();
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    };

  return (
    <div className="bg-white font-sans text-[#111827] antialiased">
      {/* Topbar */}
      <header className="sticky top-0 z-20 border-b border-[#e5e9f0] bg-white/95 backdrop-blur-[14px]">
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-[linear-gradient(90deg,#151515_0_33.333%,#d90028_33.333%_66.666%,#ffcc00_66.666%_100%)]"
        />
        <div className="mx-auto flex min-h-[66px] max-w-[1180px] items-center justify-between gap-2 px-3 py-3 min-[720px]:gap-6 min-[720px]:px-6 min-[720px]:pt-[15px] min-[720px]:pb-[11px]">
          <a
            href="#home"
            onClick={scrollToSection("home")}
            aria-label="SelbstDeutsch - Trang chủ"
            className="inline-flex items-center gap-2 whitespace-nowrap text-[17px] font-extrabold min-[720px]:gap-3 min-[720px]:text-[20px]"
          >
            <span className="block h-[34px] w-[34px] shrink-0 shadow-[0_7px_16px_rgba(228,0,59,.25)] min-[720px]:h-[38px] min-[720px]:w-[38px]">
              <img
                src="/assets/selbstdeutsch-mark.svg"
                alt=""
                width={40}
                height={40}
                className="block h-full w-full"
              />
            </span>
            <span className="max-[360px]:hidden">SelbstDeutsch</span>
          </a>
          <div className="flex items-center gap-1.5 min-[720px]:gap-2.5">
            <a
              href="#contact"
              onClick={scrollToSection("contact")}
              className={`${BUTTON_DEFAULT} min-h-[38px] px-2.5 text-xs min-[720px]:min-h-[42px] min-[720px]:px-[17px] min-[720px]:text-sm`}
            >
              Liên hệ
            </a>
            <button
              type="button"
              onClick={onNavigateLogin}
              className={`${BUTTON_PRIMARY} min-h-[38px] px-2.5 text-xs min-[720px]:min-h-[42px] min-[720px]:px-[17px] min-[720px]:text-sm`}
            >
              Đăng nhập
            </button>
          </div>
        </div>
      </header>

      <div className="overflow-hidden">
        {/* Hero */}
        <section
          id="home"
          className="scroll-mt-[72px] bg-white px-5 pt-[72px] pb-[58px] min-[720px]:px-6 min-[720px]:pt-[86px]"
        >
          <div className="mx-auto max-w-[980px] text-center">
            <div className={KICKER}>
              Khóa tiếng Đức online cho người Việt
            </div>
            <h1 className="mx-auto mt-[17px] max-w-[940px] text-[36px] font-extrabold leading-[1.15] text-balance min-[720px]:text-[48px] min-[720px]:leading-[1.12]">
              Học tiếng Đức online, đầy đủ kỹ năng.{" "}
              <span className="mt-1 block text-[#e4003b]">
                Chủ động theo lịch của bạn.
              </span>
            </h1>
            <p className="mx-auto mt-[22px] max-w-[780px] text-[16px] font-normal leading-[1.62] text-[#4f596b] text-pretty min-[720px]:text-[17px]">
              Mỗi bài học kết hợp video với bài tập ngữ pháp, đọc, nghe và từ
              vựng. Bài viết được chấm, thắc mắc được giải đáp trong buổi học
              trực tuyến hàng tuần. Bạn vẫn chủ động học theo lịch riêng.
            </p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onStartLearning}
                className={BUTTON_PRIMARY}
              >
                Học thử bài đầu tiên
              </button>
              <a
                href="#courses"
                onClick={scrollToSection("courses")}
                className={BUTTON_DEFAULT}
              >
                Xem các khóa học
              </a>
            </div>
          </div>
        </section>

        {/* Product proof */}
        <div className="border-b border-[#e5e9f0] bg-white px-5 pb-[52px] min-[720px]:px-6 min-[720px]:pb-[72px]">
          <figure className="mx-auto my-0 max-w-[980px] overflow-hidden rounded-lg border border-[#e5e9f0] bg-[#f6f8fb] shadow-[0_18px_45px_rgba(17,24,39,.09)]">
            <img
              src="/assets/dashboard-product-preview.jpg"
              alt="Giao diện khóa học tiếng Đức A1 online và theo dõi tiến độ tại SelbstDeutsch"
              width={1672}
              height={941}
              decoding="async"
              fetchPriority="high"
              className="block h-[170px] w-full object-cover object-top min-[720px]:h-[250px]"
            />
            <figcaption className="flex flex-col items-start justify-between gap-[3px] border-t border-[#e5e9f0] bg-white px-4 py-3 text-left text-sm font-semibold leading-[1.45] text-[#667085] min-[720px]:flex-row min-[720px]:items-center min-[720px]:gap-[18px]">
              <strong className="text-[#111827]">
                Giao diện học tiếng Đức A1 tập trung
              </strong>
              <span>
                Video, bài tập và lộ trình được sắp xếp rõ theo từng bài.
              </span>
            </figcaption>
          </figure>
        </div>

        {/* Benefits */}
        <section
          id="benefits"
          className="scroll-mt-[72px] border-b border-[#e5e9f0] bg-white px-5 py-[58px] min-[720px]:px-6 min-[720px]:py-20"
        >
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-10 max-w-[760px]">
              <h2 className={SECTION_TITLE}>
                Điều gì đặc biệt ở SelbstDeutsch?
              </h2>
            </div>

            <div className="grid gap-[22px] min-[720px]:grid-cols-2 min-[1080px]:grid-cols-3">
              {BENEFITS.map((benefit) => (
                <article
                  key={benefit.title}
                  className="overflow-hidden rounded-lg border border-[#e3e7ed] bg-white"
                >
                  <div className="relative h-[245px] overflow-hidden border-b border-[#e3e7ed] bg-[#f3f5f8] min-[720px]:h-[220px]">
                    <img
                      src="/assets/benefits-triptych-flat.jpg"
                      alt={benefit.alt}
                      width={1824}
                      height={862}
                      loading="lazy"
                      decoding="async"
                      className={`absolute top-1/2 block h-auto w-[300%] max-w-none -translate-y-1/2 [filter:saturate(.7)_contrast(.97)] ${benefit.offset}`}
                    />
                  </div>
                  <div className="px-6 pt-6 pb-[26px]">
                    <h3 className="max-w-[300px] text-[23px] font-bold leading-[1.18]">
                      {benefit.title}
                    </h3>
                    <p className="mt-3 text-sm font-normal leading-[1.65] text-[#525d70]">
                      {benefit.body}
                    </p>
                    <div className="mt-[17px] grid gap-[7px] text-sm font-[650] leading-[1.45] text-[#344054]">
                      {benefit.points.map((point) => (
                        <span
                          key={point}
                          className="before:mr-2 before:font-extrabold before:text-[#14804a] before:content-['✓']"
                        >
                          {point}
                        </span>
                      ))}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Method */}
        <section
          id="method"
          className="scroll-mt-[72px] border-b border-[#e5e9f0] bg-[#f6f8fb] px-5 py-[58px] min-[720px]:px-6 min-[720px]:py-20"
        >
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto mb-10 max-w-[760px] text-center">
              <div className={KICKER}>Cách học</div>
              <h2 className={SECTION_TITLE}>Một bài học diễn ra như thế nào?</h2>
            </div>
            <div className="relative mx-auto grid max-w-[1040px] gap-[30px] min-[720px]:grid-cols-3 min-[720px]:gap-9">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-[17px] bottom-[17px] left-4 w-px bg-[#d8dde6] min-[720px]:top-[18px] min-[720px]:right-[16%] min-[720px]:bottom-auto min-[720px]:left-[16%] min-[720px]:h-px min-[720px]:w-auto"
              />
              {STEPS.map((step) => (
                <article
                  key={step.index}
                  className="relative min-h-[64px] pl-[58px] text-left min-[720px]:min-h-0 min-[720px]:px-2.5 min-[720px]:text-center"
                >
                  <span className="absolute top-0 left-0 grid h-[34px] w-[34px] place-items-center rounded-full border border-[#e4003b] bg-white text-[13px] font-bold text-[#e4003b] min-[720px]:static min-[720px]:mx-auto min-[720px]:mb-[22px]">
                    {step.index}
                  </span>
                  <h3 className="text-[18px] font-bold">{step.title}</h3>
                  <p className="mt-2.5 text-sm font-normal leading-[1.65] text-[#667085]">
                    {step.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Courses */}
        <section
          id="courses"
          className="scroll-mt-[72px] border-b border-[#e5e9f0] bg-[#0c1321] px-5 py-[58px] text-white min-[720px]:px-6 min-[720px]:py-20"
        >
          <div className="mx-auto max-w-[1180px]">
            <div className="mb-[34px] flex flex-col items-start justify-between gap-8 min-[1080px]:flex-row min-[1080px]:items-end">
              <div className="max-w-[760px]">
                <div className={KICKER}>Lộ trình học</div>
                <h2 className={SECTION_TITLE}>Các khóa học tiếng Đức online</h2>
              </div>
              <div
                className="flex gap-2"
                aria-label="Điều khiển danh sách khóa học"
              >
                <button
                  type="button"
                  onClick={() => scrollCourses(-1)}
                  disabled={!canScrollPrev}
                  title="Khóa học trước"
                  aria-label="Xem khóa học trước"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-white/[.18] bg-white/[.06] text-[19px] font-bold text-white hover:border-white/40 hover:bg-white/[.11] disabled:cursor-default disabled:opacity-35 disabled:hover:border-white/[.18] disabled:hover:bg-white/[.06]"
                >
                  ←
                </button>
                <button
                  type="button"
                  onClick={() => scrollCourses(1)}
                  disabled={!canScrollNext}
                  title="Khóa học tiếp theo"
                  aria-label="Xem khóa học tiếp theo"
                  className="grid h-10 w-10 place-items-center rounded-lg border border-white/[.18] bg-white/[.06] text-[19px] font-bold text-white hover:border-white/40 hover:bg-white/[.11] disabled:cursor-default disabled:opacity-35 disabled:hover:border-white/[.18] disabled:hover:bg-white/[.06]"
                >
                  →
                </button>
              </div>
            </div>

            <div
              ref={sliderRef}
              onScroll={updateSliderControls}
              tabIndex={0}
              aria-label="Danh sách khóa học"
              className="grid snap-x snap-mandatory auto-cols-[88%] grid-flow-col gap-[14px] overflow-x-auto scroll-smooth pb-[5px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden min-[720px]:auto-cols-[calc((100%_-_14px)/2)] min-[1080px]:auto-cols-[calc((100%_-_28px)/3)]"
            >
              {COURSES.map((course) => (
                <article
                  key={course.title}
                  id={course.id}
                  className={`flex min-h-[290px] snap-start flex-col rounded-[10px] border p-[22px] min-[720px]:min-h-[330px] ${
                    course.featured
                      ? "border-[#e4003b] bg-[#e4003b]/[.11]"
                      : "border-white/[.12] bg-white/[.045]"
                  }`}
                >
                  <span
                    className={`inline-flex min-h-[25px] items-center self-start rounded-[5px] px-[9px] text-[10px] font-bold uppercase ${BADGE_STYLES[course.tone]}`}
                  >
                    {course.badge}
                  </span>
                  <h3 className="mt-[18px] text-[21px] font-bold leading-[1.2]">
                    {course.title}
                  </h3>
                  <p className="mt-[9px] text-sm font-normal leading-[1.6] text-[#c9d1de]">
                    {course.body}
                  </p>
                  <ul className="mt-[18px] grid list-none gap-2 p-0 text-sm font-semibold leading-[1.45] text-[#eef2f7]">
                    {course.points.map((point) => (
                      <li
                        key={point}
                        className="before:mr-2 before:text-[#72d99e] before:content-['✓']"
                      >
                        {point}
                      </li>
                    ))}
                  </ul>
                  {course.actionable ? (
                    <a
                      href="#contact"
                      onClick={scrollToSection("contact")}
                      className="mt-auto pt-[22px] text-sm font-bold text-white"
                    >
                      {course.action}
                    </a>
                  ) : (
                    <span className="mt-auto pt-[22px] text-sm font-bold text-white">
                      {course.action}
                    </span>
                  )}
                </article>
              ))}
            </div>

            <div className="mt-[14px] grid items-center gap-[18px] rounded-[10px] border border-white/10 bg-white/[.035] px-5 py-[18px] min-[720px]:grid-cols-[auto_1fr_auto]">
              <strong className="text-[18px] font-bold text-white">
                Lớp online trực tiếp
              </strong>
              <p className="text-sm leading-[1.55] font-semibold text-[#c9d1de]">
                Bổ túc kiến thức và ôn luyện theo từng trình độ A1-B1.
              </p>
              <span
                className={`inline-flex min-h-[25px] items-center self-start rounded-[5px] px-[9px] text-[10px] font-bold uppercase ${BADGE_STYLES.soon}`}
              >
                Định hướng tiếp theo
              </span>
            </div>
          </div>
        </section>

        {/* Register */}
        <section
          id="contact"
          className="scroll-mt-[72px] border-b border-[#e5e9f0] bg-[#f8f9fb] px-5 pt-[56px] pb-[52px] min-[720px]:px-6 min-[720px]:pt-[68px] min-[720px]:pb-[60px]"
        >
          <div className="mx-auto max-w-[1180px]">
            <div className="mx-auto grid max-w-[780px] items-start gap-11 min-[1080px]:max-w-none min-[1080px]:grid-cols-[minmax(0,1.05fr)_minmax(380px,.95fr)] min-[1080px]:gap-16">
              <div className="text-left min-[720px]:text-center min-[1080px]:text-left">
                <div className={KICKER}>Bắt đầu với A1</div>
                <h2 className="mt-2.5 max-w-[590px] text-[30px] font-extrabold leading-[1.16] text-balance min-[720px]:mx-auto min-[720px]:text-[36px] min-[1080px]:mx-0">
                  Học thử A1 miễn phí trước khi đăng ký.
                </h2>
                <p className="mt-4 max-w-[570px] text-[16px] font-normal leading-[1.62] text-[#667085] text-pretty min-[720px]:mx-auto min-[1080px]:mx-0">
                  Trải nghiệm bài đầu tiên để xem cách học có phù hợp. Khi muốn
                  học tiếp, liên hệ SelbstDeutsch để mở khóa toàn bộ A1.
                </p>
                <div className="mt-[26px] grid gap-3 min-[720px]:flex min-[720px]:flex-wrap min-[720px]:items-center min-[720px]:justify-center min-[1080px]:justify-start">
                  <button
                    type="button"
                    onClick={onStartLearning}
                    className={`${BUTTON_PRIMARY} w-full min-[720px]:w-auto`}
                  >
                    Học thử bài đầu tiên
                  </button>
                  <a
                    href="#contact"
                    onClick={scrollToSection("contact")}
                    className={`${BUTTON_DEFAULT} w-full min-[720px]:w-auto`}
                  >
                    Liên hệ tư vấn
                  </a>
                </div>
              </div>

              <div
                className="border-t border-[#e5e9f0]"
                aria-label="Quy trình đăng ký"
              >
                {REGISTER_STEPS.map((step) => (
                  <div
                    key={step.index}
                    className="grid grid-cols-[42px_1fr] gap-4 border-b border-[#e5e9f0] py-5"
                  >
                    <strong className="text-[13px] font-bold text-[#e4003b]">
                      {step.index}
                    </strong>
                    <div>
                      <h3 className="text-[16px] font-bold">{step.title}</h3>
                      <p className="mt-[5px] text-sm font-normal leading-[1.6] text-[#667085]">
                        {step.body}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="bg-[#090e18] px-5 pt-[46px] pb-6 text-[13px] font-semibold text-[#98a2b3] min-[720px]:px-6">
        <div className="mx-auto max-w-[1180px]">
          <div className="grid items-start gap-[30px] min-[720px]:grid-cols-[minmax(0,1.5fr)_repeat(2,minmax(150px,.5fr))] min-[720px]:gap-12">
            <div className="grid max-w-[430px] gap-[14px]">
              <a
                href="#home"
                onClick={scrollToSection("home")}
                aria-label="SelbstDeutsch - về đầu trang"
                className="inline-flex items-center gap-[11px] text-[19px] font-extrabold text-white"
              >
                <img
                  src="/assets/selbstdeutsch-mark.svg"
                  alt=""
                  width={34}
                  height={34}
                  className="block h-[34px] w-[34px]"
                />
                <span>SelbstDeutsch</span>
              </a>
              <p className="text-sm leading-[1.65] text-[#aeb8c7]">
                Khóa học tiếng Đức online cho người Việt với lộ trình rõ ràng,
                bài tập đầy đủ kỹ năng và hỗ trợ trực tuyến hàng tuần.
              </p>
            </div>

            <div className="grid gap-[14px]">
              <strong className="text-sm font-bold text-white">Khám phá</strong>
              <nav className="grid gap-[11px]" aria-label="Khám phá">
                <a
                  href="#benefits"
                  onClick={scrollToSection("benefits")}
                  className="text-[13px] font-semibold text-[#aeb8c7] hover:text-white"
                >
                  Điểm đặc biệt
                </a>
                <a
                  href="#method"
                  onClick={scrollToSection("method")}
                  className="text-[13px] font-semibold text-[#aeb8c7] hover:text-white"
                >
                  Cách học
                </a>
                <a
                  href="#courses"
                  onClick={scrollToSection("courses")}
                  className="text-[13px] font-semibold text-[#aeb8c7] hover:text-white"
                >
                  Khóa học
                </a>
              </nav>
            </div>

            <div className="grid gap-[14px]">
              <strong className="text-sm font-bold text-white">Bắt đầu</strong>
              <nav className="grid gap-[11px]" aria-label="Bắt đầu">
                <button
                  type="button"
                  onClick={onStartLearning}
                  className="text-left text-[13px] font-semibold text-[#aeb8c7] hover:text-white"
                >
                  Học thử A1
                </button>
                <a
                  href="#contact"
                  onClick={scrollToSection("contact")}
                  className="text-[13px] font-semibold text-[#aeb8c7] hover:text-white"
                >
                  Cách đăng ký
                </a>
              </nav>
            </div>
          </div>

          <div className="mt-9 flex flex-col items-start justify-between gap-[18px] border-t border-white/10 pt-[22px] text-xs min-[720px]:flex-row min-[720px]:items-center">
            <span>© 2026 SelbstDeutsch</span>
            <span>
              Tiếng Đức online cho người Việt · A1 đang mở đăng ký
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
};
