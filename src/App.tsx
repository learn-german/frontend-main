/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { AppState, Lesson, Module } from "./lib/appTypes";
import { useModules } from "./lib/hooks/useModules";
import { useLessonPositions } from "./lib/hooks/useLessonPositions";
import { useUserStats } from "./lib/hooks/useUserStats";
import { AppLoadingSkeleton } from "./components/Skeleton";
import { Navbar, Sidebar } from "./components/Navigation";
import { Button } from "./components/DesignSystem";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { RoadmapPage } from "./pages/RoadmapPage";
import { LessonDetailPage } from "./pages/LessonDetailPage";
import { QuizPage } from "./pages/QuizPage";
import { GrammarExercisePage } from "./pages/GrammarExercisePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Info, AlertTriangle, X } from "lucide-react";
import { showToast, ToastType } from "./lib/toast";
import { supabase } from "./lib/supabase";
import { signOut } from "./lib/auth";

export default function App() {
  // Authentication states
  const [user, setUser] = useState<{ id: string; email: string; fullName: string; role: string } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const { modules, loading: modulesLoading } = useModules(user?.id ?? null);
  const { positions } = useLessonPositions(user?.id ?? null);
  const flatLessons = useMemo(() => modules.flatMap((m) => m.lessons), [modules]);
  const { stats, applyLessonCompleteReward, applyQuizResult } = useUserStats(user?.id ?? null, flatLessons);

  // Router page state
  const [currentPage, setCurrentPage] = useState<AppState["currentPage"]>("landing");
  const [selectedLessonId, setSelectedLessonId] = useState<string>("a1-l1");
  const [activeExerciseCategory, setActiveExerciseCategory] = useState<"nguphap" | "nghe" | "doc">("nguphap");

  // Custom Toast state
  const [activeToast, setActiveToast] = useState<{ message: string; type: ToastType; id: number } | null>(null);

  // Set up event listener for the custom toast
  useEffect(() => {
    const handleAppToast = (e: Event) => {
      const customEvent = e as CustomEvent<{ message: string; type: ToastType }>;
      if (customEvent.detail) {
        const { message, type } = customEvent.detail;
        setActiveToast({
          message,
          type,
          id: Date.now()
        });
      }
    };

    window.addEventListener("app-toast", handleAppToast);
    return () => {
      window.removeEventListener("app-toast", handleAppToast);
    };
  }, []);

  // Auto-dismiss current active toast
  useEffect(() => {
    if (activeToast) {
      const timer = setTimeout(() => {
        setActiveToast(prev => prev && prev.id === activeToast.id ? null : prev);
      }, 4500);
      return () => clearTimeout(timer);
    }
  }, [activeToast]);

  // Supabase auth state — handles initial session + OAuth callback redirect
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: session.user.user_metadata?.full_name ?? session.user.email ?? "",
          role: (session.user.app_metadata?.role as string) ?? "user",
        });
        setCurrentPage("dashboard");
      }
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email ?? "",
          fullName: session.user.user_metadata?.full_name ?? session.user.email ?? "",
          role: (session.user.app_metadata?.role as string) ?? "user",
        });
        // Only redirect to dashboard on first login, not on token refresh
        setCurrentPage(prev => (prev === "landing" || prev === "login") ? "dashboard" : prev);
      } else {
        setUser(null);
        setCurrentPage("landing");
      }
    });

    return () => subscription.unsubscribe();
  }, []);


  const handleLogout = async () => {
    await signOut();
    // onAuthStateChange sẽ set user = null và chuyển về landing
  };

  const handleNavigate = (page: AppState["currentPage"]) => {
    // If not logged in and try to access restrict views, lock them and put them on login
    if (!user && (page === "dashboard" || page === "roadmap" || page === "lesson-detail" || page === "quiz" || page === "leaderboard")) {
      setCurrentPage("login");
    } else {
      setCurrentPage(page);
    }
  };

  // Select particular lesson to view
  const handleSelectLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setCurrentPage("lesson-detail");
  };

  // Awards the "mark complete" bonus via Edge Function (server-side XP + streak).
  // completedLessons itself is no longer set here — it's fully derived from
  // quiz scores in useUserStats, so this only fires once that's already true
  // (see LessonDetailPage's gating on stats.completedLessons).
  const handleMarkComplete = async (lessonId: string) => {
    const { data, error } = await supabase.functions.invoke(`lesson-complete/${lessonId}`, {
      method: "POST",
    });

    if (error) {
      showToast("Không thể lưu tiến độ. Vui lòng thử lại.", "warning");
      return;
    }

    if (data?.alreadyCompleted) return;

    applyLessonCompleteReward(data?.xpAwarded ?? 15, data?.newStreak ?? stats.streak);
  };

  // Triggers after completing a quiz (XP is awarded server-side by quiz-submit EF).
  // Records the category-specific score; completedLessons re-derives automatically.
  const handleQuizFinished = (scorePercentage: number, xpEarned: number) => {
    applyQuizResult(selectedLessonId, activeExerciseCategory, scorePercentage, xpEarned);
  };

  // Find active Lesson detail item — no fallback to flatLessons[0]: if the
  // selected id isn't found (deleted, or just reverted to draft while the
  // learner was on it), we must show a "not available" message, not a
  // different lesson silently swapped in.
  const activeLessonObject: Lesson | undefined = flatLessons.find(l => l.id === selectedLessonId);

  // Logic to proceed to NEXT lesson
  const handleNextLesson = () => {
    const activeIdx = flatLessons.findIndex(l => l.id === selectedLessonId);
    
    // Check if next lesson exists
    if (activeIdx !== -1 && activeIdx + 1 < flatLessons.length) {
      const nextLesson = flatLessons[activeIdx + 1];
      setSelectedLessonId(nextLesson.id);
      setCurrentPage("lesson-detail");
    } else {
      // Completed all available lessons
      showToast("Đỉnh quá! Bạn đã hoàn thành toàn bộ kho bài học của DeutschPath.", "success");
      setCurrentPage("dashboard");
    }
  };

  if (authLoading) {
    return <AppLoadingSkeleton />;
  }

  // Show loading overlay while fetching modules (only on authenticated pages)
  const showModulesLoader = user && modulesLoading && modules.length === 0 &&
    (currentPage === "dashboard" || currentPage === "roadmap" || currentPage === "lesson-detail");

  // Layout check selectors
  const showNav = currentPage !== "login";
  const showSidebar = user && (currentPage === "dashboard" || currentPage === "roadmap" || currentPage === "lesson-detail");

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-gray-800 antialiased selection:bg-green-150 selection:text-green-900">
      
      {/* 1. Global Navigation Navbar */}
      {showNav && (
        <Navbar
          currentPage={currentPage}
          onNavigate={handleNavigate}
          user={user}
          onLogout={handleLogout}
          streak={stats.streak}
          xp={stats.xp}
        />
      )}

      {/* 2. Responsive Side and Content Layout container */}
      <div className="flex-1 flex flex-col lg:flex-row w-full">
        
        {/* Sidebar on desktop portal pages */}
        {showSidebar && (
          <Sidebar
            currentPage={currentPage}
            onNavigate={handleNavigate}
            streak={stats.streak}
          />
        )}

        {/* Content canvas panel */}
        <main className={`flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden ${!showSidebar ? "w-full" : ""}`}>
          {showModulesLoader && (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-orange-600 border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          <AnimatePresence mode="wait">
            <motion.div
              key={currentPage + (currentPage === "lesson-detail" ? selectedLessonId : "")}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              className=""
            >
              {currentPage === "landing" && (
                <LandingPage
                  onStartLearning={() => handleNavigate("login")}
                  onViewRoadmap={() => {
                    if (user) {
                      setCurrentPage("roadmap");
                    } else {
                      setCurrentPage("login");
                    }
                  }}
                  onNavigateLogin={() => handleNavigate("login")}
                />
              )}

              {currentPage === "login" && (
                <LoginPage
                  onNavigateHome={() => handleNavigate("landing")}
                />
              )}

              {currentPage === "dashboard" && user && (
                <DashboardPage
                  user={user}
                  stats={stats}
                  modules={modules}
                  onNavigateLesson={handleSelectLesson}
                  onNavigateRoadmap={() => handleNavigate("roadmap")}
                />
              )}

              {currentPage === "roadmap" && user && (
                <RoadmapPage
                  stats={stats}
                  modules={modules}
                  positions={positions}
                  onSelectLesson={handleSelectLesson}
                />
              )}

              {currentPage === "lesson-detail" && user && activeLessonObject && (
                <LessonDetailPage
                  lesson={activeLessonObject}
                  stats={stats}
                  userId={user.id}
                  onBack={() => handleNavigate("roadmap")}
                  onMarkComplete={handleMarkComplete}
                  onStartQuiz={(lessonId, category = "nguphap") => {
                    setSelectedLessonId(lessonId);
                    setActiveExerciseCategory(category);
                    setCurrentPage("quiz");
                  }}
                />
              )}

              {currentPage === "lesson-detail" && user && !activeLessonObject && !modulesLoading && (
                <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
                  <p className="text-sm font-display font-bold text-slate-600">
                    Bài học không khả dụng, có thể đang được chỉnh sửa.
                  </p>
                  <p className="text-xs text-slate-400">Hãy quay lại sau.</p>
                  <Button variant="secondary" onClick={() => handleNavigate("roadmap")}>
                    Quay về Lộ trình học
                  </Button>
                </div>
              )}

              {currentPage === "quiz" && user && activeLessonObject && (
                activeExerciseCategory === "nguphap" ? (
                  <GrammarExercisePage
                    lesson={activeLessonObject}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
                ) : (
                  <QuizPage
                    lesson={activeLessonObject}
                    category={activeExerciseCategory}
                    onQuizFinished={handleQuizFinished}
                    onNavigateHome={() => handleNavigate("roadmap")}
                    onNextLesson={handleNextLesson}
                    onBackToLesson={() => setCurrentPage("lesson-detail")}
                  />
                )
              )}
              {currentPage === "leaderboard" && user && (
                <LeaderboardPage currentUserId={user.id} />
              )}
            </motion.div>
          </AnimatePresence>
        </main>

      </div>

      {/* Floating Global Custom Toast Notification popup */}
      <AnimatePresence>
        {activeToast && (
          <motion.div
            id="app-toast-container"
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 15, scale: 0.95 }}
            className="fixed bottom-6 right-6 z-[9999] max-w-sm w-[calc(100%-3rem)] bg-white rounded-2xl shadow-2xl border border-slate-100 p-4 flex items-start gap-3 select-none"
          >
            {activeToast.type === "success" && (
              <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
            )}
            {activeToast.type === "info" && (
              <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
            )}
            {activeToast.type === "warning" && (
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1">
              <p className="text-xs font-sans font-medium text-slate-700 leading-normal">
                {activeToast.message}
              </p>
            </div>
            <button
              id="btn-close-toast"
              onClick={() => setActiveToast(null)}
              className="p-1 rounded-lg text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
