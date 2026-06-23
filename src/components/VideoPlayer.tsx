/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { 
  Play, 
  Pause, 
  RotateCcw, 
  Volume2, 
  VolumeX, 
  Maximize2, 
  Settings, 
  Subtitles, 
  SkipForward,
  FastForward
} from "lucide-react";
import { showToast } from "../lib/toast";

interface VideoPlayerProps {
  durationStr: string; // E.g., "05:40"
  title: string;
  levelBadge: string;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  durationStr,
  title,
  levelBadge
}) => {
  // Convert duration string (MM:SS) to total seconds
  const parseDuration = (str: string) => {
    const parts = str.split(":");
    if (parts.length === 2) {
      return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
    }
    return 300; // default 5 minutes
  };

  const totalSeconds = parseDuration(durationStr);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [speed, setSpeed] = useState<0.5 | 1 | 1.5 | 2>(1);
  const [showSpeedControls, setShowSpeedControls] = useState(false);
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Simulate video playback
  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= totalSeconds) {
            setIsPlaying(false);
            return 0; // reset
          }
          return prev + speed;
        });
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, speed, totalSeconds]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = Math.floor(secs % 60);
    return `${mins.toString().padStart(2, "0")}:${remainingSecs.toString().padStart(2, "0")}`;
  };

  const handleProgressChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentTime(parseInt(e.target.value, 10));
  };

  // Generate captions based on video current time (educational contextual bubbles)
  const getSubtitles = () => {
    const percent = currentTime / totalSeconds;
    if (percent < 0.15) {
      return { de: "Hallo! Willkommen bei DeutschPath.", vi: "Xin chào! Chào mừng bạn đến với DeutschPath." };
    } else if (percent < 0.35) {
      if (title.includes("học")) {
        return { de: "Heute lernen wir das deutsche Alphabet.", vi: "Hôm nay chúng ta sẽ tìm hiểu bảng chữ cái tiếng Đức." };
      }
      return { de: "Wie begrüßen wir uns auf Deutsch? Guten Tag!", vi: "Chúng ta chào hỏi nhau thế nào bằng tiếng Đức? Guten Tag!" };
    } else if (percent < 0.55) {
      if (title.includes("học")) {
        return { de: "A, B, C, D... und die Umlaute Ä, Ö, Ü.", vi: "A, B, C, D... và các nguyên âm biến đổi Ä, Ö, Ü." };
      }
      return { de: "Ich heiße Thomas. Und wie heißt du?", vi: "Tôi tên là Thomas. Còn bạn tên là gì?" };
    } else if (percent < 0.75) {
      if (title.includes("học")) {
        return { de: "Zählen wir zusammen: eins, zwei, drei...", vi: "Hãy cùng đếm nào: một, hai, ba..." };
      }
      return { de: "Ich komme aus Deutschland. Woher kommst du?", vi: "Tôi đến từ nước Đức. Bạn đến từ đâu?" };
    } else if (percent < 0.90) {
      return { de: "Sehr gut! Machen wir eine kurze Zusammenfassung.", vi: "Rất tốt! Chúng ta hãy cùng tóm tắt ngắn nào." };
    } else {
      return { de: "Tschüss! Vergiss nicht, den Test zu machen.", vi: "Tạm biệt! Đừng quên giải bài tập test bên dưới nhé!" };
    }
  };

  const caption = getSubtitles();

  return (
    <div className="w-full">
      {/* Video Box container */}
      <div 
        id="video-player-canvas"
        className="relative aspect-video w-full bg-slate-950 rounded-2xl overflow-hidden shadow-xl border border-slate-800 flex flex-col group select-none"
      >
        {/* Dynamic Classboard content / Visual Simulation */}
        <div 
          onClick={() => setIsPlaying(!isPlaying)}
          className="flex-1 flex flex-col items-center justify-center p-6 relative cursor-pointer"
        >
          {/* Animated blackboard layout */}
          <div className="absolute inset-0 bg-radial-[circle_at_center,_var(--tw-gradient-stops)] from-emerald-950/40 via-slate-900 to-slate-950 opacity-90 transition" />
          
          {/* Accent light lines */}
          <div className="absolute top-4 left-4 flex items-center gap-1.5 bg-slate-900/80 border border-slate-700/50 px-2.5 py-1 rounded-lg text-[11px] text-emerald-400 font-mono tracking-widest uppercase">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
            <span>PLAYBACK PREVIEW</span>
          </div>

          <div className="absolute top-4 right-4 bg-slate-900/80 border border-slate-700/50 px-2.5 py-1 rounded-lg text-xs font-display font-bold text-gray-300">
            {levelBadge} Course
          </div>

          {/* Core Mock Presentation Content */}
          <div className="relative text-center max-w-md z-10 antialiased">
            {currentTime === 0 && !isPlaying ? (
              <div className="animate-in fade-in zoom-in duration-300">
                <div className="w-16 h-16 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 border-b-4 border-green-700 hover:scale-105 transition-transform shadow-lg">
                  <Play className="w-7 h-7 fill-white translate-x-0.5" />
                </div>
                <h3 className="text-white font-display font-extrabold text-lg md:text-xl md:leading-snug">
                  {title}
                </h3>
                <p className="text-gray-400 text-xs mt-2 font-sans">
                  Bài giảng video độc quyền của DeutschPath • Thời lượng {durationStr}
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-4 animate-in fade-in">
                {/* Simulated Lesson Blackboard Graphics */}
                <div className="bg-slate-900/90 border border-emerald-500/20 px-8 py-5 rounded-2xl shadow-inner min-w-[280px]">
                  <p className="text-[11px] text-emerald-500 font-mono uppercase tracking-widest mb-1.5">
                    Grammatik / Wortschatz
                  </p>
                  <h4 className="text-white font-display font-bold text-lg">
                    {currentTime / totalSeconds < 0.4 ? (
                      <span className="text-green-400">1. Đọc Chào Hỏi</span>
                    ) : currentTime / totalSeconds < 0.7 ? (
                      <span className="text-indigo-400">2. Mẫu Câu Hỏi</span>
                    ) : (
                      <span className="text-amber-400">3. Cách Chia Ngôi</span>
                    )}
                  </h4>
                  <div className="mt-2.5 h-[1px] bg-slate-800" />
                  <div className="mt-3 text-left font-mono text-xs text-gray-300 space-y-1">
                    <p>» Guten Tag! [Chào ngày mới]</p>
                    <p>» Wie heißt du? [Bạn sấm tên gì]</p>
                    <p>» Ich bin / Ich heiße Lam.</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Interactive Subtitles / Caption Overlay */}
          {subtitlesEnabled && currentTime > 0 && (
            <div className="absolute bottom-16 left-4 right-4 md:left-10 md:right-10 text-center z-20 pointer-events-none">
              <div className="inline-block bg-black/85 border border-slate-700/30 px-4 py-2.5 rounded-xl max-w-xl mx-auto shadow-xl">
                <p className="text-emerald-400 font-sans font-bold text-[13px] md:text-sm tracking-wide">
                  {caption.de}
                </p>
                <p className="text-gray-300 font-sans text-xs mt-1 italic">
                  {caption.vi}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Video Custom Controller panel */}
        <div className="bg-slate-900/95 border-t border-slate-800/80 px-4 py-3 flex flex-col gap-2 z-30">
          {/* Progress timeline */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-mono text-gray-400 min-w-[36px]">
              {formatTime(currentTime)}
            </span>
            <input
              id="video-timeline-slider"
              type="range"
              min={0}
              max={totalSeconds}
              value={currentTime}
              onChange={handleProgressChange}
              className="flex-1 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-green-500 overflow-hidden"
              style={{
                background: `linear-gradient(to right, #22c55e 0%, #22c55e ${(currentTime / totalSeconds) * 100}%, #1e293b ${(currentTime / totalSeconds) * 100}%, #1e293b 100%)`
              }}
            />
            <span className="text-xs font-mono text-gray-400 min-w-[36px]">
              {durationStr}
            </span>
          </div>

          {/* Action buttons panel */}
          <div className="flex items-center justify-between mt-1">
            <div className="flex items-center gap-3.5">
              <button
                id="btn-video-play-toggle"
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 rounded-lg bg-green-500 hover:bg-green-600 text-white transition cursor-pointer"
                title={isPlaying ? "Tạm dừng" : "Phát bài giảng"}
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-white" /> : <Play className="w-4 h-4 fill-white translate-x-[1px]" />}
              </button>

              <button
                id="btn-video-restart"
                onClick={() => setCurrentTime(0)}
                className="p-1.5 text-gray-400 hover:text-white transition cursor-pointer"
                title="Xem lại từ đầu"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Volume */}
              <div className="flex items-center gap-1.5 group/volume">
                <button
                  id="btn-video-mute-toggle"
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-1 text-gray-400 hover:text-white transition cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
                </button>
                <input
                  id="video-volume-slider"
                  type="range"
                  min={0}
                  max={100}
                  value={isMuted ? 0 : volume}
                  onChange={(e) => {
                    setVolume(parseInt(e.target.value, 10));
                    setIsMuted(false);
                  }}
                  className="w-16 h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-white hover:accent-green-500 transition-colors hidden md:block"
                />
              </div>
            </div>

            {/* Right-sided utility indicators */}
            <div className="flex items-center gap-3.5">
              {/* Subs toggle */}
              <button
                id="btn-toggle-subs"
                onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
                className={`p-1.5 rounded-lg transition text-xs font-display font-semibold flex items-center gap-1 cursor-pointer ${
                  subtitlesEnabled ? "bg-white/10 text-emerald-400" : "text-gray-400 hover:text-white"
                }`}
                title="Bật/Tắt phụ đề song ngữ"
              >
                <Subtitles className="w-4 h-4" />
                <span className="hidden sm:inline">Phụ đề</span>
              </button>

              {/* Playback speed selector */}
              <div className="relative">
                <button
                  id="btn-video-speed-selector"
                  onClick={() => setShowSpeedControls(!showSpeedControls)}
                  className="px-2 py-1 bg-white/5 hover:bg-white/10 border border-slate-700/60 rounded-lg text-[11px] font-mono font-bold text-gray-300 hover:text-white flex items-center gap-1 transition cursor-pointer"
                >
                  <FastForward className="w-3.5 h-3.5" />
                  <span>{speed}x</span>
                </button>

                {showSpeedControls && (
                  <div className="absolute right-0 bottom-full mb-2 bg-slate-900 border border-slate-800 rounded-xl p-1.5 flex flex-col gap-1 shadow-2xl z-40">
                    {([0.5, 1, 1.5, 2] as const).map((s) => (
                      <button
                        id={`btn-video-speed-${s}`}
                        key={s}
                        onClick={() => {
                          setSpeed(s);
                          setShowSpeedControls(false);
                        }}
                        className={`px-3 py-1 text-xs font-mono rounded-lg text-left transition select-none cursor-pointer ${
                          speed === s ? "bg-green-500 text-white" : "text-gray-400 hover:bg-slate-800 hover:text-white"
                        }`}
                      >
                        {s}x {s === 1 && "(Mặc định)"}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Simulated maximize */}
              <button
                id="btn-video-maximize"
                onClick={() => showToast("Chế độ phóng to toàn màn hình được mô phỏng. Trên trình duyệt thực tế, video sẽ mở rộng tối đa.", "info")}
                className="p-1 text-gray-400 hover:text-white transition cursor-pointer"
                title="Toàn màn hình"
              >
                <Maximize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
