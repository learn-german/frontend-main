/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { 
  Play, 
  Map, 
  BookOpen, 
  Trophy, 
  ChevronRight, 
  CheckCircle, 
  Sparkles, 
  Star, 
  ArrowRight,
  Zap,
  Globe,
  MessageCircle,
  HelpCircle
} from "lucide-react";
import { Button } from "../components/DesignSystem";
import { TESTIMONIALS, GENERAL_FAQ } from "../data/mockData";
import { motion } from "motion/react";

interface LandingPageProps {
  onStartLearning: () => void;
  onViewRoadmap: () => void;
  onNavigateLogin: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onStartLearning,
  onViewRoadmap,
  onNavigateLogin
}) => {
  // Mini interactive flashcard widget state
  const [activeTeaserWord, setActiveTeaserWord] = useState(0);
  const [teaserFlipped, setTeaserFlipped] = useState(false);

  const teaserWords = [
    { de: "Hallo!", pron: "[ha'lo:]", vi: "Xin chào!", desc: "Từ chào hỏi siêu thông dụng tại Đức" },
    { de: "Danke schön", pron: "['daŋkə ʃø:n]", vi: "Cảm ơn bạn rất nhiều", desc: "Cách nói cảm ơn lịch sự và thân thiện" },
    { de: "Guten Appetit", pron: "['gu:ten ape'ti:t]", vi: "Chúc ngon miệng!", desc: "Nói trước mỗi bữa ăn cùng người Đức" },
    { de: "Deutsch ist toll", pron: "[dɔɪtʃ ɪst tɔl]", vi: "Tiếng Đức rất tuyệt vời!", desc: "Mẫu câu khích lệ người học" },
  ];

  const handleNextTeaserWord = () => {
    setTeaserFlipped(false);
    setTimeout(() => {
      setActiveTeaserWord((prev) => (prev + 1) % teaserWords.length);
    }, 150);
  };

  return (
    <div className="bg-slate-50 min-h-screen">
      {/* Hero Section */}
      <section className="bg-white border-b border-slate-200/60 pt-12 pb-20 px-4 md:px-8 max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Hero Text content */}
        <div className="lg:col-span-7 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 border border-slate-205 text-slate-800 rounded-full text-xs font-display font-medium">
            <span className="flex h-2 w-2 rounded-full bg-orange-600 animate-pulse" />
            Lộ trình tiếng Đức A1 → B1 tối ưu nhất cho người Việt
          </div>

          <h1 className="text-4xl md:text-5xl lg:text-5.5xl font-display font-black leading-tight text-slate-900 tracking-tight">
            Học tiếng Đức <br className="hidden sm:inline" />
            <span className="text-orange-600">
              từng bước một vững chắc
            </span>
          </h1>

          <p className="text-slate-600 text-base md:text-lg max-w-xl leading-relaxed">
            Nền tảng học thông minh mang phong cách trực quan từ Duolingo, kết hợp bài giảng sâu sắc từ khóa học chuyên sâu. Giúp người Việt bắt đầu từ số 0 tự tin nói tiếng Đức trôi chảy.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 pt-2">
            <Button
              id="btn-hero-start"
              variant="primary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={onStartLearning}
            >
              Bắt đầu Học thử Miễn phí
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            
            <Button
              id="btn-hero-roadmap"
              variant="secondary"
              size="lg"
              className="w-full sm:w-auto"
              onClick={onViewRoadmap}
            >
              <Map className="w-4 h-4 mr-2 text-orange-600" />
              Xem Lộ trình A1 - B1
            </Button>
          </div>

          {/* Social Proof */}
          <div className="pt-6 flex flex-wrap items-center gap-6 border-t border-gray-100 mt-8">
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-4.5 h-4.5 text-amber-400 fill-amber-400" />
              ))}
              <span className="text-sm font-display font-bold text-gray-800 ml-1">4.9/5</span>
            </div>
            <p className="text-xs text-slate-500 font-sans">
              Được tin tưởng bởi hơn <b>10,000+</b> học viên, điều dưỡng viên và kỹ sư Việt Nam tại Đức.
            </p>
          </div>
        </div>

        {/* Hero Interactive Widget Presentation */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-md border border-slate-200/60 flex flex-col gap-6 relative overflow-hidden">
            {/* Corner decorator */}
            <div className="absolute top-0 right-0 w-24 h-24 bg-orange-500/5 rounded-full blur-2xl pointer-events-none" />

            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-display font-extrabold text-white bg-orange-600 px-2.5 py-0.5 rounded-md">TEASER</span>
                <span className="text-xs font-display font-bold text-slate-400">Thẻ thực hành</span>
              </div>
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                {activeTeaserWord + 1} / {teaserWords.length}
              </span>
            </div>

            {/* Interactive Flipped Card */}
            <div 
              id="teaser-card"
              onClick={() => setTeaserFlipped(!teaserFlipped)} 
              className={`aspect-[4/3] w-full rounded-2xl border cursor-pointer transition-all duration-300 transform flex flex-col items-center justify-center p-6 text-center select-none ${
                teaserFlipped 
                  ? "border-orange-400 bg-orange-50/10 scale-[1.02]" 
                  : "border-slate-200/80 hover:border-orange-350 bg-white"
              }`}
            >
              {!teaserFlipped ? (
                <div className="space-y-2">
                  <p className="text-[11px] text-slate-400 font-mono tracking-widest uppercase mb-1">Click lật mặt sau</p>
                  <h3 className="text-3xl font-display font-black text-slate-900">
                    {teaserWords[activeTeaserWord].de}
                  </h3>
                  <p className="text-sm font-sans text-slate-500">
                    Phát âm: <code className="text-amber-600 bg-yellow-50/70 px-1.5 py-0.5 rounded text-xs">{teaserWords[activeTeaserWord].pron}</code>
                  </p>
                </div>
              ) : (
                <div className="space-y-2 animate-in fade-in">
                  <p className="text-[11px] text-orange-600 font-mono tracking-widest uppercase mb-1">Nghĩa tiếng Việt</p>
                  <h3 className="text-2xl font-display font-extrabold text-orange-700">
                    {teaserWords[activeTeaserWord].vi}
                  </h3>
                  <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed mx-auto">
                    {teaserWords[activeTeaserWord].desc}
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-2.5">
              <Button 
                id="btn-teaser-flip"
                variant="secondary" 
                className="flex-1" 
                onClick={() => setTeaserFlipped(!teaserFlipped)}
              >
                Lật thẻ
              </Button>
              <Button 
                id="btn-teaser-next"
                variant="primary" 
                className="flex-1" 
                onClick={handleNextTeaserWord}
              >
                Từ tiếp theo <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <p className="text-[11px] text-center text-gray-400 font-sans">
              *Tập nói to từ vựng theo phát âm mẫu để ghi nhớ sâu sắc!
            </p>
          </div>
        </div>
      </section>

      {/* WHY US Section */}
      <section id="features" className="bg-white py-20 px-4 md:px-8 border-y border-slate-200/60">
        <div className="max-w-7xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-display font-extrabold text-orange-600 tracking-wider uppercase">
              Phương pháp SelbstDeutsch
            </span>
            <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight font-sans">
              Bật Cao Trình Độ Với Trải Nghiệm Học Đặc Sắc
            </h2>
            <p className="text-gray-500 text-sm md:text-base">
              Chúng tôi kết hợp trải nghiệm thiết kế tối ưu với định hướng sư phạm chuyên sâu giúp giảm áp lực và tăng hứng thú học ngoại ngữ.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              {
                title: "Lộ trình trực quan A1-B1",
                desc: "Chia nhỏ kiến thức thành các module bài học tương tự trò chơi, dễ thở và có mục tiêu cụ thể mỗi ngày.",
                icon: Map,
                color: "bg-orange-50 text-orange-600"
              },
              {
                title: "Bài giảng video tinh gọn",
                desc: "Bản tóm tắt trực tiếp dài 5-8 phút lý giải tường tận cấu trúc ngữ pháp thay vì bài giảng dài lê thê buồn tẻ.",
                icon: BookOpen,
                color: "bg-yellow-50 text-amber-600"
              },
              {
                title: "Từ vựng Việt hóa chi tiết",
                desc: "Bảng từ vựng dịch chuẩn nghĩa đính kèm ghi chú phát âm phiên âm, ví dụ và ngữ cảnh thực tế của người Việt.",
                icon: Globe,
                color: "bg-slate-100 text-slate-700"
              },
              {
                title: "Kiểm tra tương tác tức thì",
                desc: "Đa dạng hóa câu hỏi: trắc nghiệm, điền khuyết, ghép từ vựng, câu hỏi luyện nghe có giải thích chi tiết đáp án.",
                icon: Trophy,
                color: "bg-green-50 text-green-600"
              }
            ].map((feature, i) => {
              const Icon = feature.icon;
              return (
                <div 
                  key={i} 
                  className="bg-slate-50 hover:bg-white border hover:border-orange-100 p-6 rounded-2xl hover:shadow-xl hover:shadow-gray-100 duration-300 transition group"
                >
                  <div className={`w-12 h-12 rounded-xl ${feature.color} flex items-center justify-center mb-5 group-hover:scale-110 duration-200 transition`}>
                    <Icon className="w-5.5 h-5.5" />
                  </div>
                  <h3 className="text-base font-display font-bold text-slate-900 mb-2 font-sans">{feature.title}</h3>
                  <p className="text-gray-505 text-slate-500 text-xs sm:text-sm leading-relaxed">{feature.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Interactive ROADMAP preview */}
      <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="bg-slate-900 rounded-3xl p-8 md:p-12 relative overflow-hidden shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-center text-white">
          
          {/* Subtle German flag-inspired micro-stripe inside container card */}
          <div className="absolute top-0 left-0 right-0 h-1 flex">
            <div className="w-[10%] bg-slate-950" />
            <div className="w-[15%] bg-red-600" />
            <div className="w-[5%] bg-yellow-400" />
            <div className="flex-1 bg-transparent" />
          </div>

          <div className="lg:col-span-6 space-y-5">
            <span className="text-yellow-400 font-mono text-xs uppercase tracking-widest font-bold">Xây dựng nền móng</span>
            <h2 className="text-3xl md:text-4xl font-display font-black leading-snug">
              Bản đồ định hướng rõ ràng từ Con số 0
            </h2>
            <p className="text-slate-300 leading-relaxed text-sm md:text-base">
              Chúng tôi phân tích khung tham chiếu châu Âu (CEFR) thành các dấu mốc cụ thể cho người Việt để tránh lạc lối giữa hàng tá tài liệu:
            </p>

            <ul className="space-y-3.5 pt-2">
              <li className="flex items-start gap-2 text-sm text-slate-205">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span><b>Khóa A1 (Mới bắt đầu)</b>: 12 Module hội thoại sinh hoạt, bảng chữ cái, phát âm cơ bản nhất.</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-205">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span><b>Khóa A2 (Giao tiếp đơn giản)</b>: Du lịch, việc làm phổ thông, viết thư từ hỏi thăm cơ bản.</span>
              </li>
              <li className="flex items-start gap-2 text-sm text-slate-205">
                <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                <span><b>Khóa B1 (Tự tin độc lập)</b>: Thảo luận, hùng biện, tranh luận, soạn thảo CV chuyên nghiệp.</span>
              </li>
            </ul>

            <div className="pt-4">
              <Button id="btn-road-cta" variant="primary" size="lg" onClick={onViewRoadmap}>
                Xem lộ trình mô phỏng ngay <ChevronRight className="w-4.5 h-4.5 ml-1.5" />
              </Button>
            </div>
          </div>

          {/* Graphical Map Representation on Landing */}
          <div className="lg:col-span-6 flex flex-col gap-3">
            {[
              { level: "Cấp độ A1", title: "Xin chào & Cuộc gặp ngẫu nhiên", active: true, progress: "100%", badge: "Hoàn tất" },
              { level: "Cấp độ A2", title: "Khách sạn & Du lịch vòng quanh nước Đức", active: false, progress: "0%", badge: "Kế hoạch sãn" },
              { level: "Cấp độ B1", title: "Tranh luận công việc & Soạn hồ sơ tuyển dụng", active: false, progress: "0%", badge: "Khóa kín" },
            ].map((step, idx) => (
              <div 
                key={idx} 
                className={`p-4 rounded-2xl border transition duration-300 flex items-center justify-between ${
                  step.active 
                    ? "bg-slate-950/85 border-orange-500/25 shadow-lg shadow-black/50" 
                    : "bg-slate-950/40 border-slate-800"
                }`}
              >
                <div className="flex items-center gap-3.5">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center font-display font-black text-sm ${
                    step.active ? "bg-green-600 text-white" : "bg-slate-800 text-slate-400"
                  }`}>
                    {idx + 1}
                  </div>
                  <div>
                    <span className="text-[11px] font-display font-bold text-yellow-405 text-yellow-400 uppercase tracking-widest">{step.level}</span>
                    <h4 className="text-sm font-sans font-semibold text-gray-100">{step.title}</h4>
                  </div>
                </div>
                <span className={`text-[11px] px-2 py-0.5 rounded font-display font-bold ${
                  step.active ? "bg-green-650/25 bg-green-500/20 text-green-455 text-green-305 text-green-400" : "bg-slate-800 text-slate-500"
                }`}>
                  {step.badge}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Course Teaser Preview Panel */}
      <section className="bg-white py-20 px-4 md:px-8 border-t border-slate-200/60">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-4">
            <div className="space-y-2">
              <span className="text-xs font-display font-extrabold text-orange-600 tracking-wider uppercase">LỚP HỌC MẪU</span>
              <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight font-sans">Chi tiết bài giảng số 1</h2>
              <p className="text-slate-500 text-sm max-w-lg">
                Xem một phần giao diện bài giảng đính kèm bảng từ vựng, cách thức học chuẩn bị cho các đợt thi chứng chỉ.
              </p>
            </div>
            <Button id="btn-sample-learn" variant="secondary" onClick={onStartLearning}>
              Trực tiếp xem kho bài giảng <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-7 bg-slate-900/95 p-4 rounded-3xl shadow-lg border border-slate-800">
              {/* Simulated Video with Play Overlay */}
              <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black flex items-center justify-center">
                <div className="absolute inset-0 bg-cover bg-center bg-no-referrer opacity-50" style={{ backgroundImage: `url('https://images.unsplash.com/photo-1481627834876-b7833e8f5570?auto=format&fit=crop&w=600&q=80')` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-transparent to-transparent" />
                
                {/* Play Button */}
                <div 
                  onClick={onStartLearning}
                  className="w-14 h-14 bg-orange-600 hover:bg-orange-700 text-white rounded-full flex items-center justify-center cursor-pointer hover:scale-105 duration-200 shadow-md z-10 animate-pulse"
                >
                  <Play className="w-6 h-6 fill-white translate-x-0.5" />
                </div>

                <div className="absolute bottom-4 left-4 z-10">
                  <span className="bg-slate-950 border border-slate-800 text-yellow-405 text-yellow-400 text-[10px] font-display font-bold px-2.5 py-0.5 rounded-full mr-2 uppercase">A1 LESSON 1</span>
                  <span className="text-white text-xs font-semibold">Chào hỏi xã giao & Giới thiệu</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5 space-y-4">
              <div className="bg-slate-50 border border-gray-100 p-5 rounded-2xl">
                <span className="text-xs font-display font-bold text-orange-600 bg-orange-50 px-2.5 py-0.5 rounded-full uppercase">Từ vựng then chốt</span>
                <div className="mt-3.5 space-y-2.5">
                  <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm text-xs md:text-sm">
                    <div>
                      <span className="font-display font-extrabold text-slate-900">Guten Tag</span>
                      <span className="text-gray-400 font-mono text-[11px] ml-1.5">&#91;'gu:ten ta:k&#93;</span>
                    </div>
                    <span className="text-gray-600">Xin chào (ban ngày)</span>
                  </div>
                  <div className="flex justify-between items-center bg-white p-2.5 rounded-xl border border-gray-100 shadow-sm text-xs md:text-sm">
                    <div>
                      <span className="font-display font-extrabold text-slate-900">Wie heißt du?</span>
                      <span className="text-gray-400 font-mono text-[11px] ml-1.5">&#91;vi: haɪst du:&#93;</span>
                    </div>
                    <span className="text-gray-600">Tên bạn là gì?</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 border border-gray-100 p-5 rounded-2xl">
                <span className="text-xs font-display font-bold text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-full uppercase">Bài kiểm tra đi kèm</span>
                <p className="text-gray-500 text-xs mt-2.5 leading-relaxed">
                  Cuối mỗi bài học là <b>4-5 câu hỏi ngắn</b>. Bạn chỉ được lưu bài học là Hoàn thành và mở khóa bài tiếp theo nếu vượt qua bài test với điểm chuẩn từ <b>80% trở lên</b>.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
        <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
          <span className="text-xs font-display font-extrabold text-orange-600 tracking-wider uppercase">Ý kiến học viên</span>
          <h2 className="text-3xl md:text-4xl font-display font-extrabold text-slate-900 tracking-tight font-sans">Thành tựu từ những người đi trước</h2>
          <p className="text-slate-500 text-sm">Hơn cả hàng ngàn lời quảng cáo, hãy lắng nghe đánh giá chân thực từ cộng đồng SelbstDeutsch Việt Nam!</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {TESTIMONIALS.map((t, idx) => (
            <div key={idx} className="bg-white border border-slate-200/60 p-6 rounded-2xl shadow-sm hover:shadow-md transition duration-200 flex flex-col justify-between animate-in fade-in">
              <p className="text-slate-600 text-xs sm:text-sm leading-relaxed italic">
                "{t.content}"
              </p>
              <div className="flex items-center gap-3.5 mt-6 pt-4 border-t border-slate-100">
                <img 
                  src={t.avatar} 
                  alt={t.name} 
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-full object-cover border border-slate-100" 
                />
                <div>
                  <h4 className="text-sm font-display font-bold text-slate-950">{t.name}</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-tight">{t.role}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing / Trial segment */}
      <section id="pricing" className="bg-[#F8FAFC] py-20 px-4 md:px-8 border-t border-slate-200/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-16 space-y-3">
            <span className="text-xs font-display font-extrabold text-orange-600 tracking-wider uppercase">Phương án học phí</span>
            <h2 className="text-3xl font-display font-black text-slate-900 tracking-tight font-sans">Phù hợp cho mọi nhu cầu</h2>
            <p className="text-slate-500 text-sm">Bắt đầu học thử hoàn toàn miễn phí hoặc đăng ký trọn gói trọn đời không giới hạn.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-3xl mx-auto">
            {/* Free tier */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200/80 flex flex-col justify-between shadow-sm">
              <div className="space-y-4">
                <span className="text-[10px] font-display font-bold bg-slate-100 text-slate-500 px-2.5 py-0.5 rounded-full uppercase">Basic Trial</span>
                <h3 className="text-xl font-display font-extrabold text-slate-900 font-sans">Khóa học thử A1</h3>
                <div className="flex items-baseline gap-1 py-1">
                  <span className="text-3.5xl font-display font-black text-slate-900">0đ</span>
                  <span className="text-xs text-slate-400 font-sans">Miễn phí trải nghiệm</span>
                </div>
                <p className="text-xs text-slate-500">Tìm hiểu phương pháp học mới mẻ mà không cần cam kết.</p>
                <div className="h-[1px] bg-slate-100 my-4" />
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> Toàn bộ bài giảng video Module A1</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> Thực hành từ vựng cơ bản</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> Làm bài kiểm tra test 100% không giới hạn</li>
                </ul>
              </div>
              <Button id="btn-price-free" variant="secondary" className="w-full mt-8" onClick={onStartLearning}>
                Bắt đầu học thử
              </Button>
            </div>

            {/* Premium tier */}
            <div className="bg-white p-8 rounded-3xl border border-orange-500/60 flex flex-col justify-between shadow-md relative overflow-hidden">
              <div className="absolute right-[-15px] top-[-15px] bg-orange-600 text-white font-display font-medium text-[9px] uppercase px-5 py-2.5 shrink-0 rotate-45 select-none tracking-wider">
                Yêu thích
              </div>
              
              <div className="space-y-4">
                <span className="text-[10px] font-display font-bold bg-orange-50 text-orange-700 px-2.5 py-0.5 rounded-full uppercase">Premium PRO</span>
                <h3 className="text-xl font-display font-extrabold text-slate-900 font-sans">Trọn gói A1 - B1</h3>
                <div className="flex items-baseline gap-1 py-1">
                  <span className="text-3.5xl font-display font-black text-orange-600">349.000đ</span>
                  <span className="text-xs text-slate-400 font-sans line-through">1.200.000đ</span>
                </div>
                <p className="text-xs text-slate-500">Sở hữu trọn đời toàn bộ giáo trình, cam kết đạt kết quả B1.</p>
                <div className="h-[1px] bg-slate-100 my-4" />
                <ul className="space-y-2.5 text-xs text-slate-600">
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> Mở khóa toàn bộ giáo trình A1, A2 và B1</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> 1600+ từ vựng phong phú, bài đọc nâng cao</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> Thi thử mô phỏng Goethe & Telc thực tế</li>
                  <li className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-605 text-green-600 shrink-0" /> Cập nhật nội dung miễn phí trọn đời</li>
                </ul>
              </div>
              <Button id="btn-price-premium" variant="primary" className="w-full mt-8" onClick={onStartLearning}>
                Nhận gói ưu đãi Pro
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Accordion */}
      <section className="py-20 px-4 md:px-8 max-w-4xl mx-auto bg-white rounded-3xl my-10 border border-slate-200/60 shadow-sm">
        <h2 className="text-2.5xl font-display font-bold text-slate-950 text-center mb-10 flex items-center justify-center gap-2 font-sans">
          <HelpCircle className="w-6 h-6 text-orange-500" /> Các câu hỏi thường gặp
        </h2>
        <div className="space-y-4">
          {GENERAL_FAQ.map((faq, index) => (
            <div key={index} className="border-b border-gray-100 pb-4">
              <h4 className="font-display font-bold text-gray-800 text-sm md:text-base mb-1.5">{faq.q}</h4>
              <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA Banner */}
      <section className="bg-orange-600 py-16 text-center text-white select-none relative overflow-hidden">
        {/* Subtle decorative non-political stripe */}
        <div className="absolute top-0 left-0 right-0 h-1 flex">
          <div className="w-14 bg-slate-950" />
          <div className="w-8 bg-yellow-400" />
          <div className="flex-1 bg-transparent" />
        </div>

        <div className="max-w-4xl mx-auto px-4 space-y-5">
          <h2 className="text-3xl font-display font-black font-sans">Sẵn sàng chinh phục giấc mơ nước Đức chứ?</h2>
          <p className="text-orange-100 max-w-xl mx-auto text-sm">
            Hàng ngàn bạn học là du học sinh, điều dưỡng đã và đang đạt được chứng chỉ A2/B1 với lộ trình thông minh của SelbstDeutsch. Khởi đầu ngay hôm nay!
          </p>
          <div className="pt-2">
            <Button id="btn-cta-footer" variant="secondary" size="lg" className="bg-white text-orange-700 hover:bg-orange-50 border-white active:scale-95" onClick={onStartLearning}>
              Bắt đầu hành trình ngay
            </Button>
          </div>
        </div>
      </section>

      {/* Simple Footer */}
      <footer className="bg-slate-950 text-gray-500 py-10 text-center text-xs font-sans tracking-wide">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-display font-bold text-gray-300 font-sans">© 2026 SelbstDeutsch.</p>
          <p>Phương pháp trực quan, học ngữ pháp và từ vựng thông minh cho người Việt.</p>
        </div>
      </footer>
    </div>
  );
};
